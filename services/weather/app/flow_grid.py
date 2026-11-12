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

- UGRD, VGRD at 10 m above ground: the wind's east and north parts, m/s,
  read now only from the GFS's 1-degree world file (app.flow_aloft). The
  HRRR's are along its Lambert grid, not east and north, and turned here
  (_earth_relative).
- PRATE at the surface: the precipitation rate, kg m-2 s-1 (mm/s of
  water). The HRRR's is instantaneous; the GFS's file has an instantaneous
  record and one averaged since the last bucket, and the instantaneous one
  is taken (_pick).
- GUST at the surface and TCDC for the entire atmosphere (the gust, m/s,
  and total cloud cover, percent): only while AWC's are down
  (FALLBACK_GROUPS).
- HGT at the 0C isotherm (the GFS's only): the lowest freezing level,
  geopotential metres MSL (freezing_level_ft).
- TMP at 2 m above ground: the temperature, K.
- VIS at the surface: visibility, m.
- HGT at the cloud ceiling: the ceiling's height, geopotential metres
  above mean sea level (measured 2026-11-12: over high ground no ceiling
  is under the ground's height, in either model). No ceiling is the GFS's
  20,000 m and the HRRR's missing value; taken here as clear. A model's
  ceiling is its own diagnosis from its cloud, not an observer's.
- HGT at the surface: the ground's height, m MSL, for the ceiling above
  it (14 CFR 1.1: "the height above the earth's surface"); the same every
  hour, so fetched once a model (app.flow's terrain).
- CAPE at the surface: the surface-based convective available potential
  energy, J/kg.

What these values mean -- precipitation's intensity, the sky's cover,
CAPE's categories, the ceiling's bands -- is the engine's
(wingtip_weather::model_weather); the rate-to-reflectivity relation too,
asked here by name (precip_dbz).

The wind, the gusts and the cloud cover are the Aviation Weather
Center's (app.flow_awc), the icing and turbulence its IFI and GTG
(app.flow_dafs); these are what NOMADS still gives, where AWC publishes
no grid of its own (the legend names each field's source).
"""

from __future__ import annotations

import io
import math

import gribberish
import numpy as np
from PIL import Image
from wingtip.engine import ask

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
FT_PER_M = 1 / 0.3048  # the international foot, exactly 0.3048 m (NIST Handbook 44, Appendix C)
#: A ceiling at or over this many metres MSL is the GFS's "none" (it
#: writes 20,000 m where there is no ceiling, measured 2026-11-12).
NO_CEILING_M = 19_999.0

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
    # -75 to 52.5 C, half a degree a step: FL300's cold as well as the
    # surface's heat, as the temperature is kept at every level.
    "temp": {"unit": "°C", "unscale": (-75.0, 52.5), "vector": False},
    "vis": {"unit": "SM", "unscale": (0.0, 10.0), "vector": False},
    # The ceiling, ft above the ground: 50 ft a step to 12,750, well past
    # AIM 7-1-7's 3,000 ft; a ceiling over it, and none, at the top, clear.
    "ceiling": {"unit": "ft", "unscale": (0.0, 12_750.0), "vector": False},
    # Surface CAPE: 20 J/kg a step to 5,100, past the NWS's extreme (4,000).
    "cape": {"unit": "J/kg", "unscale": (0.0, 5_100.0), "vector": False},
    # The lowest freezing level, ft MSL, 100 ft a step; 0 where it is at
    # the surface (app.flow_grid.freezing_level_ft).
    "frzlvl": {"unit": "ft", "unscale": (0.0, 25_500.0), "vector": False},
    # AWC's GFA cloud tops, ft MSL, 200 ft a step to FL510 (app.flow_awc).
    "tops": {"unit": "ft", "unscale": (0.0, 51_000.0), "vector": False},
    # AWC's icing severity category, 0 none to 4 heavy (app.flow_dafs; the
    # engine's icing_severity); a 50th a step, so each category is exact.
    "icing": {"unit": "category", "unscale": (0.0, 5.1), "vector": False},
    # AWC's turbulence, EDR (m^2/s^3)^1/3, 0.004 a step (app.flow_dafs).
    "turb": {"unit": "EDR", "unscale": (0.0, 1.02), "vector": False},
}

#: The fields kept as the worst in a cell rather than its mean: a hazard
#: somewhere in a 25 km cell is shown, not averaged away with the calm
#: air round it (as the ceiling is kept as its lowest).
WORST = ("icing", "turb")

#: (GRIB2 variable, level type, level value) each field reads.
RECORDS = {
    ("UGRD", "specific height level above ground", 10.0): "u",
    ("VGRD", "specific height level above ground", 10.0): "v",
    ("GUST", "ground or water surface", 0.0): "gust",
    ("PRATE", "ground or water surface", 0.0): "prate",
    ("TCDC", "entire atmosphere", 0.0): "cloud",
    ("HGT", "level of 0oc isotherm", 0.0): "frzlvl",
    ("TMP", "specific height level above ground", 2.0): "temp",
    ("VIS", "ground or water surface", 0.0): "vis",
    ("CAPE", "ground or water surface", 0.0): "cape",
    ("HGT", "cloud ceiling", 0.0): "ceiling",
    ("HGT", "ground or water surface", 0.0): "terrain",
}
#: The filter's requests, each its variables at each of its levels: the
#: filter takes every variable at every level asked, so grouped to ask
#: nothing not read (one request for all took TMP at the surface and the
#: ground's height every hour, 1.3 MB of the HRRR's 10.7; measured
#: 2026-11-12). Their files are joined, GRIB2 being a run of messages.
FILTER_GROUPS = ((("TMP",), ("2_m_above_ground",)), (("PRATE", "VIS", "CAPE"), ("surface",)), (("HGT",), ("cloud_ceiling",)))
#: The GFS's file also gives the freezing level: 0.3 MB an hour boxed,
#: where the HRRR's would be 2.3 MB of its whole grid (measured
#: 2026-11-12), for a field 25 km cells show as well.
GFS_GROUPS = (*FILTER_GROUPS, (("HGT",), ("0C_isotherm",)))
#: The surface wind, its gusts and the cloud cover, asked only while
#: AWC's GFA is past its margin (app.flow's fallback).
FALLBACK_GROUPS = ((("UGRD", "VGRD"), ("10_m_above_ground",)), (("GUST",), ("surface",)), (("TCDC",), ("entire_atmosphere",)))
#: The ground's height, asked once a model (app.flow's terrain).
TERRAIN_GROUPS = ((("HGT",), ("surface",)),)


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
        name = RECORDS.get((meta.var_abbrev, meta.level_type, float(meta.level_value)))
        if name is None:
            continue
        instant = meta.statistical_process is None
        if name in found and (found[name][0] or not instant):
            continue  # _pick: the instantaneous record over an average
        found[name] = (instant, np.asarray(message.data(), dtype=np.float32).ravel())
        if where is None:
            where = _points(meta)
    if where is None:
        raise ValueError("no record read in the file")
    return {name: values for name, (_, values) in found.items()}, where


def ceiling_agl_ft(ceiling_msl_m: np.ndarray, terrain_m: np.ndarray) -> np.ndarray:
    """A model's ceiling, metres MSL, as feet above the ground under it
    (14 CFR 1.1's ceiling is "the height above the earth's surface"):
    infinity where there is none (the GFS's 20,000 m, the HRRR's missing
    value), so it reads as clear; a ceiling the model puts under the
    ground's height, at the ground."""
    none = np.isnan(ceiling_msl_m) | (ceiling_msl_m >= NO_CEILING_M)
    above = np.maximum(ceiling_msl_m - terrain_m, 0.0) * FT_PER_M
    return np.where(none, np.inf, above)


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
    GFS's, whose points are the grid's). The ceiling is the lowest in the
    cell rather than its mean, toward the safer answer: a low ceiling
    somewhere in a 25 km cell is shown, not averaged away with the clear
    sky round it (infinity, none, in a mean would hide every ceiling)."""
    lats, lons = where
    if hrrr and "u" in values and "v" in values:
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
        n = np.bincount(cells[good], minlength=ROWS * COLS)
        if name == "ceiling":
            each = np.full(ROWS * COLS, np.nan)
            np.fmin.at(each, cells[good], field[good])
        elif name.startswith(WORST):
            each = np.full(ROWS * COLS, np.nan)
            np.fmax.at(each, cells[good], field[good])
        else:
            each = np.bincount(cells[good], weights=field[good], minlength=ROWS * COLS) / np.maximum(n, 1)
        mean = np.where((n >= least) & (counts >= least), each, np.nan)
        out[name] = mean.reshape(ROWS, COLS).astype(np.float32)
    return out


def blend(gfs: dict[str, np.ndarray], hrrr: dict[str, np.ndarray] | None) -> dict[str, np.ndarray]:
    """The HRRR's cells over the GFS's, field by field, where it has them."""
    if hrrr is None:
        return gfs
    return {name: np.where(np.isnan(hrrr[name]), field, hrrr[name]) if name in hrrr else field for name, field in gfs.items()}


def precip_dbz(rate_mm_h: np.ndarray) -> np.ndarray:
    """A precipitation rate as the reflectivity a radar would see for it,
    dBZ: the engine's precip_dbz (the WSR-88D's Z-R relation), so a model's
    rate and the radar's echo are read against the same intensity words.
    Only the cells where some falls are asked; none is 0, nothing NaN."""
    rate = np.asarray(rate_mm_h, dtype=np.float64)
    out = np.where(np.isnan(rate), np.nan, 0.0)
    wet = np.isfinite(rate) & (rate > 0)
    if wet.any():
        out[wet] = ask("precip_dbz", rates_mm_h=np.round(rate[wet], 4).tolist())["dbz"]
    return out.astype(np.float32)


def in_units(grid: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """The grid's records as the fields are kept (FIELDS' units)."""
    out = {}
    if "u" in grid and "v" in grid:
        out["u"], out["v"] = grid["u"] * MS_TO_KT, grid["v"] * MS_TO_KT
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
    if "ceiling" in grid:
        out["ceiling"] = grid["ceiling"]  # ft above the ground already (ceiling_agl_ft)
    if "cape" in grid:
        out["cape"] = grid["cape"]
    if "frzlvl" in grid:
        out["frzlvl"] = grid["frzlvl"]  # ft MSL already (freezing_level_ft)
    return out


def freezing_level_ft(height_m: np.ndarray, terrain_m: np.ndarray | None) -> np.ndarray:
    """The GFS's lowest freezing level, geopotential metres MSL, as feet
    MSL, 0 where it is at the surface. NCEP's post-processor writes it
    as "the first ... layer where the temperature is less than 273.16K",
    moving "up from the surface", MSL, and "freezing height to surface
    when T2m is below freezing" (UPP's FRZLVL.f, read 2026-11-12): the
    G-AIRMET's "lowest freezing level above the ground or at the surface
    as appropriate" (aviationweather.gov GFA help), its heights MSL (AIM
    7-1-14). At the ground's height to within a metre is at the surface."""
    feet = np.asarray(height_m, dtype=np.float64) * FT_PER_M
    if terrain_m is None or terrain_m.size != height_m.size:
        return feet
    return np.where(height_m <= terrain_m + 1.0, 0.0, feet)


def upsample(half: np.ndarray) -> np.ndarray:
    """A grid at 0.5 degree over the box (HALF_ROWS x HALF_COLS, north
    row first) on the output's 0.25: the points between two of its points
    their mean, between four the mean of the four; NaN only where all of
    them are."""
    out = np.full((ROWS, COLS), np.nan, dtype=np.float32)
    out[::2, ::2] = half

    def mean(*parts):
        stack = np.stack(parts)
        n = np.sum(~np.isnan(stack), axis=0)
        total = np.nansum(stack, axis=0)
        return np.where(n > 0, total / np.maximum(n, 1), np.nan)

    out[1::2, ::2] = mean(half[:-1, :], half[1:, :])
    out[::2, 1::2] = mean(half[:, :-1], half[:, 1:])
    out[1::2, 1::2] = mean(half[:-1, :-1], half[1:, :-1], half[:-1, 1:], half[1:, 1:])
    return out


#: The 0.5-degree grid AWC's and the GFS's coarser files are read on: the
#: output's every other point.
HALF_STEP_DEG = 0.5
HALF_ROWS = (ROWS + 1) // 2
HALF_COLS = (COLS + 1) // 2


def png_values(base: str, values: np.ndarray) -> bytes:
    """A scalar's PNG at `base`'s encoding (FIELDS)."""
    return png(base, {base: values})


def png_wind(u_kt: np.ndarray, v_kt: np.ndarray) -> bytes:
    """A wind's PNG, east part in red, north in green (FIELDS["wind"])."""
    return png("wind", {"u": u_kt, "v": v_kt})


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
        if "u" not in kept or "v" not in kept:
            return None
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
