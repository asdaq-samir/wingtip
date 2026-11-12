"""The model weather the map's flow layer draws (app.flow), read from the
NWS models' GRIB2 and put on one latitude-longitude grid, then written as
small PNGs the web's renderer reads as they are (weatherlayers-gl: a
value per channel, scaled between a stated least and most, alpha 0 where
there is none).

The grid is the GFS's own 0.25 degree (NCEP GFS, pgrb2.0p25) over North
America and the oceans either side, 5 to 75 N and 180 to 50 W: 521 by 281
points. Where the HRRR covers it (NOAA's High-Resolution Rapid Refresh,
3 km, the lower 48 and round it) the HRRR's mean over each cell takes the
GFS's place: the newer, hourly, convection-allowing model where it has
one, the GFS beyond it. At the map's zooms 3 to 8 a cell is 2 to 70
pixels, so the HRRR's 3 km would be lost in a finer picture's weight, not
seen.

The GRIB2 records read, each as NOMADS' grib filter names it
(filter_gfs_0p25.pl, filter_hrrr_2d.pl; NCEP's GRIB2 tables, 4.2):

- UGRD, VGRD at 10 m above ground: the wind's east and north parts, m/s.
  The HRRR's are along its Lambert grid, not east and north, and turned
  here (_earth_relative).
- GUST at the surface: the gust, m/s.
- PRATE at the surface: the precipitation rate, kg m-2 s-1 (mm/s of
  water). The HRRR's is instantaneous; the GFS's file has an instantaneous
  record and one averaged since the last bucket, and the instantaneous one
  is taken (_pick).
- TCDC for the entire atmosphere: total cloud cover, percent.
- TMP at 2 m above ground: the temperature, K.
- VIS at the surface: visibility, m.

This is model output, unedited, and every screen that shows it says so.
"""

from __future__ import annotations

import io
import math

import gribberish
import numpy as np
from PIL import Image

#: The output grid: the GFS 0.25-degree points from 5 to 75 N, 180 to 50 W
#: (the filter's box), north row first as a picture is.
STEP_DEG = 0.25
NORTH, SOUTH, WEST, EAST = 75.0, 5.0, -180.0, -50.0
ROWS = int(round((NORTH - SOUTH) / STEP_DEG)) + 1
COLS = int(round((EAST - WEST) / STEP_DEG)) + 1
#: The picture's edges, west, south, east, north: half a cell past the
#: outer points, since each pixel is drawn round its point.
BOUNDS = (WEST - STEP_DEG / 2, SOUTH - STEP_DEG / 2, EAST + STEP_DEG / 2, NORTH + STEP_DEG / 2)

#: The fewest HRRR points in a cell for their mean to stand for it: a
#: 0.25-degree cell holds about 60 of its 3 km points at 40 N, so fewer
#: is a cell on the HRRR's edge, left to the GFS.
HRRR_LEAST_POINTS = 30

#: The HRRR's Lambert conformal grid (its GRIB2 grid definition, "+proj=lcc
#: lon_0=262.5 lat_1=38.5 lat_2=38.5"): its winds are along the grid, and
#: turned to east and north by the angle the grid's north makes with true
#: north, cone * (lon - lon_0), the cone the sine of its one standard
#: parallel (NCAR's NCL wrf_uvmet; NCEP's wgrib2 -new_grid_winds earth).
HRRR_LON0 = -97.5
HRRR_CONE = math.sin(math.radians(38.5))

MS_TO_KT = 1.943844  # 1 kt = 1852 m per 3600 s (NIST Handbook 44, Appendix C)
M_PER_SM = 1609.344  # the statute mile, exactly (NIST Handbook 44, Appendix C)

#: Each field as the picture holds it: its unit, and the values channel 0
#: and 255 stand for (weatherlayers-gl's imageUnscale), a step of a
#: 255th between. Wind in its east and north parts, -100 to 100 kt (0.8 kt
#: a step); precipitation as the reflectivity a radar would see for that
#: rate (precip_dbz), so the same words read the model and the radar.
FIELDS = {
    "wind": {"unit": "kt", "unscale": (-100.0, 100.0), "vector": True},
    "gust": {"unit": "kt", "unscale": (0.0, 100.0), "vector": False},
    "precip": {"unit": "dBZ", "unscale": (0.0, 75.0), "vector": False},
    "cloud": {"unit": "%", "unscale": (0.0, 100.0), "vector": False},
    "temp": {"unit": "°C", "unscale": (-50.0, 50.0), "vector": False},
    "vis": {"unit": "SM", "unscale": (0.0, 10.0), "vector": False},
}

#: (GRIB2 variable, level value) the filter is asked for and each field reads.
RECORDS = {
    ("UGRD", 10.0): "u",
    ("VGRD", 10.0): "v",
    ("GUST", 0.0): "gust",
    ("PRATE", 0.0): "prate",
    ("TCDC", 0.0): "cloud",
    ("TMP", 2.0): "temp",
    ("VIS", 0.0): "vis",
}
FILTER_VARS = ("UGRD", "VGRD", "GUST", "PRATE", "TCDC", "TMP", "VIS")
FILTER_LEVELS = ("10_m_above_ground", "surface", "entire_atmosphere", "2_m_above_ground")


def read(body: bytes) -> tuple[dict[str, np.ndarray], tuple[np.ndarray, np.ndarray]]:
    """A filtered file's records, {name: values, flat}, and its points'
    latitudes and longitudes, flat, longitudes -180 to 180. Raises
    ValueError where the wind is missing."""
    found: dict[str, tuple[bool, np.ndarray]] = {}
    where = None
    offset = 0
    while offset < len(body):
        message = gribberish.parse_grib_message(body, offset)
        meta = message.metadata
        offset += meta.message_size
        name = RECORDS.get((meta.var_abbrev, float(meta.level_value)))
        if name is None:
            continue
        instant = meta.statistical_process is None
        if name in found and (found[name][0] or not instant):
            continue  # _pick: the instantaneous record over an average
        found[name] = (instant, np.asarray(message.data(), dtype=np.float32).ravel())
        if where is None:
            where = _points(meta)
    if "u" not in found or "v" not in found or where is None:
        raise ValueError("no 10 m wind in the file")
    return {name: values for name, (_, values) in found.items()}, where


def _points(meta) -> tuple[np.ndarray, np.ndarray]:
    lats, lons = (np.asarray(a, dtype=np.float64) for a in meta.latlng())
    ny, nx = meta.grid_shape
    if lats.size == ny and lons.size == nx:  # a regular grid's two axes
        lons, lats = np.meshgrid(lons, lats)
    lons = ((lons.ravel() + 180.0) % 360.0) - 180.0
    return lats.ravel(), lons


def _earth_relative(u: np.ndarray, v: np.ndarray, lons: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """The HRRR's grid-relative wind turned to east and north (HRRR_CONE)."""
    angle = np.radians(HRRR_CONE * (lons - HRRR_LON0))
    cos, sin = np.cos(angle), np.sin(angle)
    return u * cos + v * sin, v * cos - u * sin


def _cells(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Each point's cell on the output grid, row * COLS + col; -1 outside."""
    rows = np.rint((NORTH - lats) / STEP_DEG).astype(np.int64)
    cols = np.rint((lons - WEST) / STEP_DEG).astype(np.int64)
    inside = (rows >= 0) & (rows < ROWS) & (cols >= 0) & (cols < COLS)
    return np.where(inside, rows * COLS + cols, -1)


def on_grid(values: dict[str, np.ndarray], where: tuple[np.ndarray, np.ndarray], hrrr: bool = False) -> dict[str, np.ndarray]:
    """A model's records on the output grid, {name: ROWS x COLS, NaN where
    it has nothing}: each cell the mean of the points in it (the HRRR's,
    where at least HRRR_LEAST_POINTS fall in it) or the point on it (the
    GFS's, whose points are the grid's)."""
    lats, lons = where
    if hrrr:
        u, v = _earth_relative(values["u"], values["v"], lons)
        values = {**values, "u": u, "v": v}
    cells = _cells(lats, lons)
    keep = cells >= 0
    cells = cells[keep]
    counts = np.bincount(cells, minlength=ROWS * COLS)
    least = HRRR_LEAST_POINTS if hrrr else 1
    out = {}
    for name, field in values.items():
        field = field[keep].astype(np.float64)
        good = ~np.isnan(field)
        sums = np.bincount(cells[good], weights=field[good], minlength=ROWS * COLS)
        n = np.bincount(cells[good], minlength=ROWS * COLS)
        mean = np.where((n >= least) & (counts >= least), sums / np.maximum(n, 1), np.nan)
        out[name] = mean.reshape(ROWS, COLS).astype(np.float32)
    return out


def blend(gfs: dict[str, np.ndarray], hrrr: dict[str, np.ndarray] | None) -> dict[str, np.ndarray]:
    """The HRRR's cells over the GFS's, field by field, where it has them."""
    if hrrr is None:
        return gfs
    return {name: np.where(np.isnan(hrrr[name]), field, hrrr[name]) if name in hrrr else field for name, field in gfs.items()}


def precip_dbz(rate_mm_h: np.ndarray) -> np.ndarray:
    """A precipitation rate as the reflectivity a radar would see for it,
    dBZ, by the WSR-88D's default Z-R relation for rain, Z = 300 R^1.4
    (NWS Radar Operations Center, WSR-88D precipitation processing; Fulton
    et al. 1998, Weather and Forecasting 13): so a model's rate and the
    radar's echo are read against the same intensity words. No rain, NaN."""
    with np.errstate(divide="ignore", invalid="ignore"):
        dbz = 10.0 * np.log10(300.0 * np.power(rate_mm_h, 1.4))
    return np.where(rate_mm_h > 0, dbz, 0.0).astype(np.float32)


def in_units(grid: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """The grid's records as the fields are kept (FIELDS' units)."""
    out = {"u": grid["u"] * MS_TO_KT, "v": grid["v"] * MS_TO_KT}
    if "gust" in grid:
        out["gust"] = grid["gust"] * MS_TO_KT
    if "prate" in grid:
        out["precip"] = precip_dbz(grid["prate"] * 3600.0)  # kg m-2 s-1 is mm of water a second
    if "cloud" in grid:
        out["cloud"] = grid["cloud"]
    if "temp" in grid:
        out["temp"] = grid["temp"] - 273.15
    if "vis" in grid:
        out["vis"] = grid["vis"] / M_PER_SM
    return out


def _channel(values: np.ndarray, unscale: tuple[float, float]) -> np.ndarray:
    low, high = unscale
    scaled = np.clip((np.nan_to_num(values, nan=low) - low) / (high - low), 0.0, 1.0)
    return np.rint(scaled * 255).astype(np.uint8)


def png(field: str, kept: dict[str, np.ndarray]) -> bytes | None:
    """One field of a frame as its PNG, RGBA: the value in red (the wind's
    east part in red, north in green), alpha 0 where there is none. None
    where the model gave nothing of it."""
    spec = FIELDS[field]
    if spec["vector"]:
        u, v = kept["u"], kept["v"]
        red, green, missing = _channel(u, spec["unscale"]), _channel(v, spec["unscale"]), np.isnan(u) | np.isnan(v)
    else:
        if field not in kept:
            return None
        values = kept[field]
        red = _channel(values, spec["unscale"])
        green, missing = red, np.isnan(values)
    alpha = np.where(missing, 0, 255).astype(np.uint8)
    pixels = np.dstack([red, green, np.zeros_like(red), alpha])
    buffer = io.BytesIO()
    Image.fromarray(pixels, "RGBA").save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
