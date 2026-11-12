"""The Aviation Weather Center's own grids for the map's flow layer (the
owner, 2026-11-12: "the other reason I have given you AWC as resource is
so that we don't have to mention that weather is not from aviation
sources"): the wind at each of the map's levels and its gusts at the
surface, the cloud cover and the cloud tops, from aviationweather.gov's
Graphical Forecasts for Aviation (GFA), as its own Winds and Clouds maps
read them.

The source: the GFA's gridded points, the same answers AWC's map draws
its wind barbs and cloud text from (its map's code, read 2026-11-12):

- /api/data/wind?model=gfaak&level=<level>&dref&tref&fhr&zoom&bbox:
  GeoJSON points, "wdir" (degrees the wind blows from, true, as a model
  grid's wind is; 999 under the ground), "wspd" and at the surface "wgst", knots, whole numbers.
- /api/data/cldlayer?model=gfaak&level=sfc&...: GeoJSON points,
  "cldlayers" (the GFA's layers, "OVC035/TOP 050", heights hundreds of
  feet MSL) and "cldcov" (CLR to OVC, clouds below FL180).

Each answers "mtime" (the cycle and forecast hour, "20261112_12_F03") and
"validTime". The GFA runs a cycle every hour, forecast hours 0 to 18
(measured 2026-11-12: cycle 12Z posted by 12:22Z). Zoom 7 is a point
every half degree: 23,431 over the box, about 145 KB gzipped a level.
The points cover AWC's GFA domain; outside it the map shows the GFS's
world wind zoomed out (app.flow_aloft).

These two answers are what aviationweather.gov's own map asks, not among
the Data API's documented products (aviationweather.gov/data/api, which
lists no gridded field): the risk is that AWC changes them without
notice, when the frames stored are served until they age out and the
fetch says what failed (app.flow). The Data API's
rules are kept all the same (aviationweather.gov/data/api, "Using the
API"): a custom User-Agent, at most 100 requests a minute (one every
REQUEST_GAP_S here), and a frame's answers fetched again only for a newer
cycle (app.flow).

What the levels are and what the cloud text says are the engine's
(wingtip_weather::aviation_grids: flow_levels, gfa_cloud_layers).
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta

import numpy as np
import requests
from wingtip.config import REQUEST_HEADERS
from wingtip.engine import ask

from . import flow_grid

log = logging.getLogger(__name__)

BASE = "https://aviationweather.gov/api/data"
#: The GFA's model name in AWC's map ("gfaak": the GFA's whole domain,
#: Alaska and the oceans with the lower 48).
MODEL = "gfaak"
#: AWC's map's zoom for a point every half degree (its grid is
#: 2^(9 - zoom) x 0.125 degrees).
ZOOM = 7
#: The box asked for, south, west, north, east: the layer's own.
BBOX = f"{flow_grid.SOUTH:g},{flow_grid.WEST:g},{flow_grid.NORTH:g},{flow_grid.EAST:g}"
#: The GFA's forecast hours (AWC: "18 hours in the future").
LAST_STEP = 18
#: Seconds between two requests: well inside AWC's 100 a minute.
REQUEST_GAP_S = 0.7
#: The latest cycle is looked for this many hours back from now.
CYCLES_TRIED = 4
#: AWC's wind direction for a level under the ground.
BELOW_GROUND = 999

HEADERS = {**REQUEST_HEADERS, "Accept-Encoding": "gzip"}
_last_asked = [0.0]


class AwcUnavailable(RuntimeError):
    """aviationweather.gov did not answer as it does."""


def _get(path: str, params: dict) -> dict | None:
    """One answer, spaced from the last; None for 204, nothing then."""
    wait = _last_asked[0] + REQUEST_GAP_S - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_asked[0] = time.monotonic()
    try:
        resp = requests.get(f"{BASE}/{path}", params=params, headers=HEADERS, timeout=60)
    except requests.RequestException as err:
        raise AwcUnavailable(f"aviationweather.gov did not answer: {err}") from err
    if resp.status_code == 204:
        return None
    if not resp.ok:
        raise AwcUnavailable(f"aviationweather.gov answered {resp.status_code} for {path}")
    try:
        return resp.json()
    except ValueError as err:
        raise AwcUnavailable(f"aviationweather.gov's {path} was not JSON") from err


def _cycle_params(cycle: datetime, step: int) -> dict:
    return {"dref": f"{cycle:%Y%m%d}", "tref": f"{cycle:%H}", "fhr": f"{step:02d}"}


def latest_cycle(now: datetime) -> datetime | None:
    """The newest GFA cycle AWC answers for: its hour's analysis asked for
    a point's wind, from this hour back. None where none answers."""
    hour = now.replace(minute=0, second=0, microsecond=0)
    for back in range(CYCLES_TRIED):
        cycle = hour - timedelta(hours=back)
        probe = {"model": MODEL, "level": "sfc", "zoom": 3, "density": 0, "bbox": "39,-100,41,-98", **_cycle_params(cycle, 0)}
        if _get("wind", probe):
            return cycle
    return None


def cycle_for(valid: datetime, latest: datetime) -> tuple[datetime, int] | None:
    """The cycle and forecast hour a frame is read from: the latest
    cycle's, or for an hour before it that hour's own analysis; None past
    the GFA's 18 hours."""
    cycle = min(latest, valid)
    step = int((valid - cycle).total_seconds() // 3600)
    return (cycle, step) if 0 <= step <= LAST_STEP else None


def _cells(features: list) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Each point's place on the half-degree grid (rows, cols) and which
    points fall in it."""
    coords = np.array([f["geometry"]["coordinates"][:2] for f in features], dtype=np.float64).reshape(-1, 2)
    lons = ((coords[:, 0] + 180.0) % 360.0) - 180.0
    rows = np.rint((flow_grid.NORTH - coords[:, 1]) / flow_grid.HALF_STEP_DEG).astype(np.int64)
    cols = np.rint((lons - flow_grid.WEST) / flow_grid.HALF_STEP_DEG).astype(np.int64)
    inside = (rows >= 0) & (rows < flow_grid.HALF_ROWS) & (cols >= 0) & (cols < flow_grid.HALF_COLS)
    return rows, cols, inside


def _blank() -> np.ndarray:
    return np.full((flow_grid.HALF_ROWS, flow_grid.HALF_COLS), np.nan, dtype=np.float32)


def wind_half(answer: dict) -> dict[str, np.ndarray]:
    """AWC's wind points on its own half-degree grid, knots: {"u", "v"}
    (east and north parts, toward where it blows: a wind from 270 at 10 kt
    is u = 10) and "gust" where it gave gusts; NaN where it gave nothing
    or the level is under the ground."""
    features = answer.get("features") or []
    u, v, gust = _blank(), _blank(), _blank()
    if not features:
        return {}
    rows, cols, inside = _cells(features)
    props = [f.get("properties") or {} for f in features]
    direction = np.array([p.get("wdir", np.nan) if p.get("wdir") is not None else np.nan for p in props], dtype=np.float64)
    speed = np.array([p.get("wspd", np.nan) if p.get("wspd") is not None else np.nan for p in props], dtype=np.float64)
    gusts = np.array([p.get("wgst", np.nan) if p.get("wgst") is not None else np.nan for p in props], dtype=np.float64)
    direction[direction == BELOW_GROUND] = np.nan
    rad = np.radians(direction)
    # The direction is where it blows from: toward the opposite way.
    u[rows[inside], cols[inside]] = (-speed * np.sin(rad))[inside]
    v[rows[inside], cols[inside]] = (-speed * np.cos(rad))[inside]
    out = {"u": u, "v": v}
    if np.isfinite(gusts).any():
        # A point with no gust given gusts no more than its wind.
        gust[rows[inside], cols[inside]] = np.where(np.isfinite(gusts), gusts, speed)[inside]
        out["gust"] = gust
    return out


def wind_grids(answer: dict) -> dict[str, np.ndarray]:
    """wind_half's grids on the output's quarter degree, as drawn."""
    return {k: flow_grid.upsample(v) for k, v in wind_half(answer).items()}


def cloud_grids(answer: dict) -> dict[str, np.ndarray]:
    """AWC's cloud points on the output grid: "cloud", the cover as a
    percent the engine's cloud_cover reads back as AWC's word, and
    "tops", the highest top, ft MSL, NaN where the text gives none."""
    features = answer.get("features") or []
    if not features:
        return {}
    rows, cols, inside = _cells(features)
    props = [f.get("properties") or {} for f in features]
    read = ask(
        "gfa_cloud_layers", layers=[str(p.get("cldlayers") or "") for p in props], covers=[str(p.get("cldcov") or "") for p in props]
    )
    cover, tops = _blank(), _blank()
    percent = np.array(read["percent"], dtype=np.float64)
    top = np.array([t if t is not None else np.nan for t in read["top_ft"]], dtype=np.float64)
    cover[rows[inside], cols[inside]] = percent[inside]
    tops[rows[inside], cols[inside]] = top[inside]
    return {"cloud": flow_grid.upsample(cover), "tops": flow_grid.upsample(tops)}


def frame(valid: datetime, latest: datetime, levels: list[dict]) -> tuple[dict, dict[str, bytes], dict] | None:
    """One hour's AWC part: its key ({"cycle", "forecast_hour"}), its PNGs
    by file name ("wind" the surface's, "wind-060" a level's, "gust",
    "cloud", "tops"), and the wind at each level of an altitude (the
    flow levels with "ft") as numbers on the half-degree grid, {"levels":
    [{"id", "ft"}], "u", "v"} (u and v levels x rows x cols, kt), which the
    planner reads a route's winds aloft from (wingtip.winds_aloft). None
    where the GFA has no answer for the hour; a level it has none of is
    left out of the pictures and NaN in the numbers."""
    picked = cycle_for(valid, latest)
    if picked is None:
        return None
    cycle, step = picked
    common = {"model": MODEL, "zoom": ZOOM, "density": 0, "bbox": BBOX, "wrap": "true", **_cycle_params(cycle, step)}
    files: dict[str, bytes] = {}
    numbers: dict = {"levels": [], "u": [], "v": []}
    for level in levels:
        level_id = level["id"]
        answer = _get("wind", {**common, "level": level_id})
        half = wind_half(answer) if answer else {}
        if level.get("ft") is not None:
            numbers["levels"].append({"id": level_id, "ft": level["ft"]})
            numbers["u"].append(half.get("u", _blank()))
            numbers["v"].append(half.get("v", _blank()))
        if "u" not in half:
            continue
        files["wind" if level_id == "sfc" else f"wind-{level_id}"] = flow_grid.png_wind(
            flow_grid.upsample(half["u"]), flow_grid.upsample(half["v"])
        )
        if level_id == "sfc" and "gust" in half:
            files["gust"] = flow_grid.png_values("gust", flow_grid.upsample(half["gust"]))
    if not files:
        return None
    clouds = _get("cldlayer", {**common, "level": "sfc"})
    for name, values in (cloud_grids(clouds) if clouds else {}).items():
        files[name] = flow_grid.png_values(name, values)
    return {"cycle": f"{cycle:%Y-%m-%dT%H:%M:%SZ}", "forecast_hour": step}, files, numbers
