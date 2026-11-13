"""The flow layer's NOMADS part (app.flow): what the Aviation Weather
Center publishes no grid of -- precipitation, ceiling, temperature,
visibility, CAPE and the freezing level -- from NOAA's HRRR where it
covers and the GFS beyond it, through NOMADS' grib filter, each file cut
to the variables and levels drawn (flow_grid.FILTER_GROUPS); and, while
AWC's GFA is down past its margin (app.flow), the surface wind, its gusts
and the cloud cover in AWC's place, said so on the legend.

- GFS 0.25 degree (filter_gfs_0p25.pl, gfs.tHHz.pgrb2.0p25.fFFF), runs at
  00, 06, 12 and 18Z, hourly forecast hours to 120; boxed to the grid,
  about 1.9 MB an hour of forecast with the freezing level (2.6 MB with
  the wind, gusts and cloud it gave before AWC's; measured 2026-11-12).
- HRRR CONUS (filter_hrrr_2d.pl, hrrr.tHHz.wrfsfcfFF.grib2), a run every
  hour, forecast hours to 18 (48 at 00, 06, 12, 18Z), its whole grid, as
  the filter cannot box a Lambert grid: about 4.6 MB an hour without the
  wind, gusts and cloud (10.8 MB with them). Only the hours up to
  WEATHER_FLOW_HRRR_AHEAD_H ahead are taken from it.

The ground's height under each model's points, which the ceiling is
measured above and the freezing level found at, is the same every hour:
fetched once a model (0.3 MB the GFS's, 2.2 MB the HRRR's) and kept in
the store (_terrain).
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta

import requests
from wingtip import outside, weather_store
from wingtip.config import REQUEST_HEADERS as HEADERS

from . import flow_grid, flow_store
from .settings import get_settings

GFS_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
HRRR_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_hrrr_2d.pl"
#: A GFS run is on NOMADS about three and a half hours after its hour
#: (app.gfs); an HRRR run's first hours about 50 minutes after its own.
GFS_POSTED_AFTER = timedelta(hours=4)
HRRR_POSTED_AFTER = timedelta(minutes=55)
#: The HRRR's every-hour runs go to 18 hours (NOAA GSL, HRRR v4).
HRRR_LAST_STEP = 18
RUNS_TRIED = 3
#: The fields this part draws: those AWC publishes no grid of; with
#: FALLBACK_FIELDS while AWC's are past their margin.
FIELDS = ("precip", "ceiling", "temp", "vis", "cape", "frzlvl")
FALLBACK_FIELDS = ("wind", "gust", "cloud")
#: (model, run, step) -> when NOMADS last said it was not posted yet: not
#: asked again for NOT_UP_RETRY_S.
NOT_UP: dict = {}
NOT_UP_RETRY_S = 300


class NomadsUnavailable(RuntimeError):
    """NOMADS gave no run of the model asked for."""


def gfs_run(now: datetime) -> datetime:
    latest = (now - GFS_POSTED_AFTER).replace(minute=0, second=0, microsecond=0)
    return latest - timedelta(hours=latest.hour % 6)


def hrrr_run(now: datetime) -> datetime:
    return (now - HRRR_POSTED_AFTER).replace(minute=0, second=0, microsecond=0)


def download(url: str, params: dict) -> bytes | None:
    try:
        resp = outside.get(url, params=params, headers=HEADERS, timeout=60)
    except requests.RequestException as err:
        raise NomadsUnavailable(f"NOMADS did not answer: {err}") from err
    # A run not posted yet is a 404, or an HTML page saying so.
    if resp.status_code == 404 or not resp.content.startswith(b"GRIB"):
        return None
    if not resp.ok:
        raise NomadsUnavailable(f"NOMADS answered {resp.status_code}")
    return resp.content


def grouped(url: str, params: dict, groups) -> bytes | None:
    """A file's records, one request a group of variables and levels
    (flow_grid.FILTER_GROUPS), joined; None where any is not posted yet."""
    bodies = []
    for names, levels in groups:
        asked = {**{f"var_{v}": "on" for v in names}, **{f"lev_{lev}": "on" for lev in levels}}
        body = download(url, {**params, **asked})
        if body is None:
            return None
        bodies.append(body)
    return b"".join(bodies)


def gfs(run: datetime, step: int, groups=flow_grid.GFS_GROUPS) -> bytes | None:
    box = {"toplat": flow_grid.NORTH, "bottomlat": flow_grid.SOUTH, "leftlon": flow_grid.WEST, "rightlon": flow_grid.EAST}
    params = {"dir": f"/gfs.{run:%Y%m%d}/{run:%H}/atmos", "file": f"gfs.t{run:%H}z.pgrb2.0p25.f{step:03d}", "subregion": "", **box}
    return grouped(GFS_URL, params, groups)


def hrrr(run: datetime, step: int, groups=flow_grid.FILTER_GROUPS) -> bytes | None:
    params = {"dir": f"/hrrr.{run:%Y%m%d}/conus", "file": f"hrrr.t{run:%H}z.wrfsfcf{step:02d}.grib2"}
    return grouped(HRRR_URL, params, groups)


GET = {"gfs": gfs, "hrrr": hrrr}


def _groups(model: str, fallback: bool):
    base = flow_grid.GFS_GROUPS if model == "gfs" else flow_grid.FILTER_GROUPS
    return (*base, *flow_grid.FALLBACK_GROUPS) if fallback else base


def _terrain(model: str, source: dict, size: int):
    """The ground's height under the model's points, m MSL, flat: the
    store's, else fetched from the run at hand and kept. None where it
    cannot be had, and the ceiling is then left out."""
    name = f"flow-terrain-{model}"
    try:
        held = weather_store.read_array(name)
        if held.size == size:
            return held
    except (OSError, ValueError):
        pass
    body = GET[model](*back(source), flow_grid.TERRAIN_GROUPS)
    if body is None:
        return None
    values, _ = flow_grid.read(body)
    terrain = values.get("terrain")
    if terrain is None or terrain.size != size:
        return None
    weather_store.write_array(name, terrain)
    return terrain


def _model_grid(model: str, source: dict, body: bytes) -> dict:
    """A model's file on the output grid, its ceiling made feet above the
    ground under each point and its freezing level feet MSL, 0 at the
    surface, before the points are put in cells."""
    values, where = flow_grid.read(body)
    size = next(iter(values.values())).size if values else 0
    terrain = _terrain(model, source, size) if "ceiling" in values or "frzlvl" in values else None
    if "ceiling" in values:
        ceiling = values.pop("ceiling")
        if terrain is not None:
            values["ceiling"] = flow_grid.ceiling_agl_ft(ceiling, terrain)
    if "frzlvl" in values:
        values["frzlvl"] = flow_grid.freezing_level_ft(values["frzlvl"], terrain)
    return flow_grid.on_grid(values, where, hrrr=model == "hrrr")


def tries(valid: datetime, now: datetime) -> dict[str, list[tuple[datetime, int]]]:
    """The runs and forecast hours each model is tried at for a frame, the
    latest run posted first and the ones before it after; no HRRR for an
    hour past WEATHER_FLOW_HRRR_AHEAD_H."""
    out: dict[str, list[tuple[datetime, int]]] = {"hrrr": [], "gfs": []}
    if valid <= now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=get_settings().flow_hrrr_ahead_h):
        latest = hrrr_run(now)
        for n in range(RUNS_TRIED):
            run = latest - timedelta(hours=n)
            step = int((valid - run).total_seconds() // 3600)
            if 0 <= step <= HRRR_LAST_STEP:
                out["hrrr"].append((run, step))
    latest = gfs_run(now)
    for n in range(RUNS_TRIED):
        run = latest - timedelta(hours=6 * n)
        # Hour 0 has no precipitation rate or cloud cover of its own (the
        # GFS's are averaged from it), so never it.
        out["gfs"].append((run, max(1, int((valid - run).total_seconds() // 3600))))
    return out


def _first(model: str, runs: list[tuple[datetime, int]], held: dict | None, fallback: bool) -> tuple[dict | None, bytes | None]:
    """The newest run of `model` posted for a frame, as {"run",
    "forecast_hour"}, and its file -- None for the file where the part
    held already came from that run, which is not downloaded again."""
    for run, step in runs:
        source = {"run": iso(run), "forecast_hour": step}
        if held == source:
            return source, None
        if time.time() - NOT_UP.get((model, run, step), 0) < NOT_UP_RETRY_S:
            continue
        body = GET[model](run, step, _groups(model, fallback))
        if body is None:
            NOT_UP[(model, run, step)] = time.time()
            continue
        return source, body
    return None, None


def part(valid: datetime, now: datetime, held: dict | None, fallback: bool = False) -> dict | None:
    """One hour's NOMADS part ({"key", "files"}): the GFS's grid, the
    HRRR's over it where taken, each field's PNG stored; the part held
    kept as it is where it came from the same runs (and, with `fallback`,
    holds the wind too). None where NOMADS has no GFS for it."""
    runs = tries(valid, now)
    held_key = (held or {}).get("key") or {}
    if held and (not flow_store.stored(held) or bool(held_key.get("fallback")) != fallback):
        held, held_key = None, {}
    gfs_source, gfs_body = _first("gfs", runs["gfs"], held_key.get("gfs"), fallback)
    if gfs_source is None:
        return None
    hrrr_source, hrrr_body = _first("hrrr", runs["hrrr"], held_key.get("hrrr"), fallback)
    key = {"gfs": gfs_source, "hrrr": hrrr_source, "fallback": fallback}
    if held and key == held_key:
        return held
    # One model new, the other as held: the held one's file again.
    gfs_body = gfs_body or GET["gfs"](*back(gfs_source), _groups("gfs", fallback))
    hrrr_body = hrrr_body or (GET["hrrr"](*back(hrrr_source), _groups("hrrr", fallback)) if hrrr_source else None)
    if gfs_body is None:
        return None
    grid = _model_grid("gfs", gfs_source, gfs_body)
    if hrrr_body is not None:
        grid = flow_grid.blend(grid, _model_grid("hrrr", hrrr_source, hrrr_body))
    else:
        key["hrrr"] = None
    kept = flow_grid.in_units(grid)
    tag = flow_store.tag(gfs_source["run"], gfs_source["forecast_hour"], hrrr_source["run"] if key["hrrr"] else None)
    files = {}
    for field in (*FIELDS, *(FALLBACK_FIELDS if fallback else ())):
        body = flow_grid.png(field, kept)
        if body is not None:
            files[field] = flow_store.store(valid, field, tag, body)
    return {"key": key, "files": files, "tag": tag}


def back(source: dict) -> tuple[datetime, int]:
    return datetime.fromisoformat(source["run"].replace("Z", "+00:00")), int(source["forecast_hour"])


def iso(at: datetime) -> str:
    return at.strftime("%Y-%m-%dT%H:%M:%SZ")
