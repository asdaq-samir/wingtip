"""What the map's flow layer reads from NOMADS' GFS beside AWC's grids,
where AWC publishes no grid of its own:

- The temperature at each of the wind's levels (and, while AWC's GFA is
  down past its margin, the wind there in its place, app.flow), for the value bubble
  ("the bubble at a level shows wind and temperature there"): AWC's GFA
  temperature is a picture in 10-degree bands, not values (its map's
  colour table, read 2026-11-12). From the GFS at 0.5 degree
  (filter_gfs_0p50.pl, gfs.tHHz.pgrb2full.0p50.fFFF), its temperature and
  geopotential height at the isobaric levels round the map's levels (the
  engine's flow_levels, "temperature_hpa"), boxed to the layer: about
  about 2 MB an hour (measured 2026-11-12), at the nearest of its 3-hourly
  forecast hours (nearest_step). A level under FL180 is an
  altitude MSL and read at its height in each point's own column; from
  FL180 a flight level, a pressure altitude, read at its standard-
  atmosphere pressure (the engine's "isa_hpa"; 14 CFR 1.1, "flight
  level": "a level of constant atmospheric pressure related to a
  reference datum of 29.92 inches of mercury"). Linear in height, or in
  the logarithm of pressure, between the two levels round it.
- The wind over the whole world at 10 m (filter_gfs_1p00.pl,
  gfs.tHHz.pgrb2.1p00.fFFF), 1 degree, about 156 KB an hour: the map
  shows it zoomed out, past AWC's GFA domain, so the streaks run across
  the oceans as Apple Weather's do (the owner, 2026-11-12).

The download itself is app.flow's (its NOMADS filter requests), passed in.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

import gribberish
import numpy as np
from wingtip.units import K_AT_0C, M_PER_FT, MS_TO_KT

from . import flow_grid

#: The GFS's 0.5- and 1-degree files come every third forecast hour
#: (NOMADS' gfs.tHHz.pgrb2full.0p50.f000, f003 ...; 0.25 degree, hourly,
#: would be 7.8 MB an hour for the same levels, measured 2026-11-12).
STEP_EVERY_H = 3


def nearest_step(hourly: int) -> int:
    """The 3-hourly forecast hour nearest an hourly one: at most an hour
    off, which the temperature aloft and the world's wind zoomed out
    change little in."""
    return max(0, int(round(hourly / STEP_EVERY_H)) * STEP_EVERY_H)


GFS_HALF_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p50.pl"
GFS_WORLD_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl"
#: The world picture's edges, west, south, east, north: half a degree
#: past the outer points, as flow_grid.BOUNDS.
WORLD_BOUNDS = (-180.5, -90.5, 179.5, 90.5)

Download = Callable[[str, dict, tuple], "bytes | None"]


def _messages(body: bytes):
    offset = 0
    while offset < len(body):
        message = gribberish.parse_grib_message(body, offset)
        offset += message.metadata.message_size
        yield message


def _dir(run: datetime) -> str:
    return f"/gfs.{run:%Y%m%d}/{run:%H}/atmos"


def column_body(download: Download, run: datetime, step: int, hpa: list[float], wind: bool = False) -> bytes | None:
    """The GFS's TMP and HGT at `hpa`, boxed to the layer; with `wind`,
    its UGRD and VGRD there too (AWC's levels' fallback, app.flow)."""
    box = {"toplat": flow_grid.NORTH, "bottomlat": flow_grid.SOUTH, "leftlon": flow_grid.WEST, "rightlon": flow_grid.EAST}
    params = {"dir": _dir(run), "file": f"gfs.t{run:%H}z.pgrb2full.0p50.f{step:03d}", "subregion": "", **box}
    names = ("TMP", "HGT", "UGRD", "VGRD") if wind else ("TMP", "HGT")
    return download(GFS_HALF_URL, params, ((names, tuple(f"{int(p)}_mb" for p in hpa)),))


def read_columns(body: bytes) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    """The file's columns on the half-degree grid: pressures (hPa, high
    first), and by name ("HGT" gpm, "TMP" C, "UGRD" and "VGRD" kt where
    given) each levels x rows x cols."""
    found: dict[str, dict[float, np.ndarray]] = {}
    for message in _messages(body):
        meta = message.metadata
        if meta.level_type != "isobaric surface" or meta.var_abbrev not in ("TMP", "HGT", "UGRD", "VGRD"):
            continue
        values = np.asarray(message.data(), dtype=np.float64).reshape(meta.grid_shape)
        # NOMADS' boxed 0.5-degree file runs south to north (its first row
        # 5 N, read 2026-11-12); the layer's grids run north row first.
        lats = np.asarray(meta.latlng()[0], dtype=np.float64).ravel()
        if lats.size > 1 and lats[0] < lats[-1]:
            values = values[::-1]
        if meta.var_abbrev == "TMP":
            values = values - K_AT_0C
        elif meta.var_abbrev in ("UGRD", "VGRD"):
            values = values * MS_TO_KT
        found.setdefault(meta.var_abbrev, {})[float(meta.level_value) / 100.0] = values
    if "TMP" not in found or "HGT" not in found:
        raise ValueError("the GFS's file has no temperatures and heights")
    levels = sorted(set(found["TMP"]) & set(found["HGT"]), reverse=True)
    if len(levels) < 2:
        raise ValueError("the GFS's file has too few levels")
    columns = {k: np.stack([v[p] for p in levels]) for k, v in found.items() if all(p in v for p in levels)}
    return np.array(levels), columns


def _between(x: np.ndarray, y: np.ndarray, at: np.ndarray) -> np.ndarray:
    """y at `at` in each column, linear between the two of x round it, x
    rising up the column; NaN outside the column's span."""
    out = np.full(at.shape, np.nan)
    for k in range(x.shape[0] - 1):
        low, high = x[k], x[k + 1]
        inside = (at >= low) & (at <= high) & np.isnan(out) & (high > low)
        share = np.where(inside, (at - low) / np.where(high > low, high - low, 1.0), 0.0)
        out = np.where(inside, y[k] + share * (y[k + 1] - y[k]), out)
    return out


def value_at(levels: np.ndarray, columns: dict[str, np.ndarray], name: str, ft: float, isa_hpa: float, flight_level: bool) -> np.ndarray:
    """A column's value at a level on the half-degree grid: at its height
    MSL, or for a flight level at its standard pressure."""
    values = columns[name]
    if flight_level:
        x = -np.log(levels)[:, None, None] * np.ones_like(values)
        return _between(x, values, np.full(values.shape[1:], -np.log(isa_hpa)))
    return _between(columns["HGT"], values, np.full(values.shape[1:], ft * M_PER_FT))


def at_levels_half(body: bytes, wind_levels: list[dict], flight_levels_from_ft: float) -> dict[str, np.ndarray]:
    """Each wind level's temperature on the half-degree grid ("temp-060")
    and, where the file has the wind, its east and north parts ("u-060",
    "v-060"); the surface's are the NOMADS part's and AWC's."""
    levels, columns = read_columns(body)
    out = {}
    for level in wind_levels:
        ft, hpa = level.get("ft"), level.get("isa_hpa")
        if ft is None or hpa is None:
            continue
        for name, field in (("TMP", "temp"), ("UGRD", "u"), ("VGRD", "v")):
            if name not in columns:
                continue
            half = value_at(levels, columns, name, ft, hpa, ft >= flight_levels_from_ft)
            if half.shape == (flow_grid.HALF_ROWS, flow_grid.HALF_COLS):
                out[f"{field}-{level['id']}"] = half.astype(np.float32)
    return out


def world_body(download: Download, run: datetime, step: int) -> bytes | None:
    params = {"dir": _dir(run), "file": f"gfs.t{run:%H}z.pgrb2.1p00.f{step:03d}"}
    return download(GFS_WORLD_URL, params, ((("UGRD", "VGRD"), ("10_m_above_ground",)),))


def world_wind(body: bytes) -> tuple[np.ndarray, np.ndarray]:
    """The world's 10 m wind, knots, east and north, 181 x 360, north row
    first, its columns from 180 W east (the file's run from 0 E), none
    inside the layer's box."""
    found = {}
    for message in _messages(body):
        meta = message.metadata
        if meta.var_abbrev in ("UGRD", "VGRD"):
            found[meta.var_abbrev] = np.asarray(message.data(), dtype=np.float64).reshape(meta.grid_shape)
    if "UGRD" not in found or "VGRD" not in found:
        raise ValueError("no 10 m wind in the world file")
    u, v = (np.roll(found[k], found[k].shape[1] // 2, axis=1) * MS_TO_KT for k in ("UGRD", "VGRD"))
    # Cleared inside the layer's own box, where AWC's wind is drawn: the
    # two pictures never draw streaks over each other.
    lats = np.linspace(90.0, -90.0, u.shape[0])[:, None]
    lons = np.linspace(-180.0, 179.0, u.shape[1])[None, :]
    inside = (lats >= flow_grid.SOUTH) & (lats <= flow_grid.NORTH) & (lons >= flow_grid.WEST) & (lons <= flow_grid.EAST)
    u, v = np.where(inside, np.nan, u), np.where(inside, np.nan, v)
    return u.astype(np.float32), v.astype(np.float32)
