"""The model weather under the map's flow layer (the owner, 2026-11-11:
"Can we overlay weather and wind like this?", Windy's and Apple
Weather's wind map): the surface wind, its gusts, the precipitation, the
cloud cover, the ceiling, the thunderstorm energy (CAPE), the
temperature and the visibility, from the HRRR where it
covers and the GFS beyond it (app.flow_grid), for a timeline of hours --
the last hour, now, and every second hour on to twelve ahead -- each
hour a small PNG per field in the weather store and one record ("flow")
listing them, which the planner serves (wingtip.weather_flow).

Sources, NOAA's NOMADS grib filter, each cut to the variables and levels
the layer draws (flow_grid.FILTER_GROUPS, three requests a file):

- GFS 0.25 degree (filter_gfs_0p25.pl, gfs.tHHz.pgrb2.0p25.fFFF), runs at
  00, 06, 12 and 18Z, hourly forecast hours to 120; boxed to the grid,
  about 2.6 MB an hour of forecast (2.3 MB before the ceiling and CAPE;
  measured 2026-11-12).
- HRRR CONUS (filter_hrrr_2d.pl, hrrr.tHHz.wrfsfcfFF.grib2), a run every
  hour, forecast hours to 18 (48 at 00, 06, 12, 18Z), about 10.8 MB an
  hour of forecast for the whole grid (10.7 MB before): the filter cannot
  box a Lambert grid. Only the hours up to WEATHER_FLOW_HRRR_AHEAD_H ahead are taken
  from it (now and the last hour by default), the rest from the GFS.

The ground's height under each model's points, which the ceiling is
measured above, is the same every hour: fetched once a model (0.3 MB the
GFS's, 2.2 MB the HRRR's) and kept in the store (_terrain).

A frame already stored from the same runs and forecast hours is kept as
it is, so a fetch downloads only the hours that are new: the timeline's
forecast hours fall on even hours (FRAMES), so the next hour's timeline
shares most of them with this one's.

The record is served while its newest frame is within an hour of now:
model guidance with no validity of its own, so this is the feed's
health, as GLMP's is, not an aviation rule.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

import requests
from wingtip import weather_store
from wingtip.config import REQUEST_HEADERS as HEADERS

from . import flow_grid
from .settings import get_settings

log = logging.getLogger(__name__)

GFS_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
HRRR_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_hrrr_2d.pl"
#: A GFS run is on NOMADS about three and a half hours after its hour
#: (app.gfs); an HRRR run's first hours about 50 minutes after its own.
GFS_POSTED_AFTER = timedelta(hours=4)
HRRR_POSTED_AFTER = timedelta(minutes=55)
#: The HRRR's every-hour runs go to 18 hours (NOAA GSL, HRRR v4).
HRRR_LAST_STEP = 18
RUNS_TRIED = 3
#: The timeline: the hour before, now, then each even UTC hour to twelve ahead.
AHEAD_H = 12


class FlowUnavailable(RuntimeError):
    """NOMADS gave no run of the model asked for."""


def frame_times(now: datetime) -> list[datetime]:
    """The timeline's hours, oldest first: the last hour, the current one,
    and every even UTC hour after it to AHEAD_H, which the next hour's
    timeline shares."""
    hour = now.replace(minute=0, second=0, microsecond=0)
    ahead = [hour + timedelta(hours=h) for h in range(1, AHEAD_H + 1) if (hour.hour + h) % 2 == 0]
    return [hour - timedelta(hours=1), hour, *ahead]


def _gfs_run(now: datetime) -> datetime:
    latest = (now - GFS_POSTED_AFTER).replace(minute=0, second=0, microsecond=0)
    return latest - timedelta(hours=latest.hour % 6)


def _hrrr_run(now: datetime) -> datetime:
    return (now - HRRR_POSTED_AFTER).replace(minute=0, second=0, microsecond=0)


def _download(url: str, params: dict) -> bytes | None:
    try:
        resp = requests.get(url, params=params, headers=HEADERS, timeout=60)
    except requests.RequestException as err:
        raise FlowUnavailable(f"NOMADS did not answer: {err}") from err
    # A run not posted yet is a 404, or an HTML page saying so.
    if resp.status_code == 404 or not resp.content.startswith(b"GRIB"):
        return None
    if not resp.ok:
        raise FlowUnavailable(f"NOMADS answered {resp.status_code}")
    return resp.content


def _grouped(url: str, params: dict, groups) -> bytes | None:
    """A file's records, one request a group of variables and levels
    (flow_grid.FILTER_GROUPS), joined; None where any is not posted yet."""
    bodies = []
    for names, levels in groups:
        asked = {**{f"var_{v}": "on" for v in names}, **{f"lev_{lev}": "on" for lev in levels}}
        body = _download(url, {**params, **asked})
        if body is None:
            return None
        bodies.append(body)
    return b"".join(bodies)


def _gfs(run: datetime, step: int, groups=flow_grid.FILTER_GROUPS) -> bytes | None:
    box = {"toplat": flow_grid.NORTH, "bottomlat": flow_grid.SOUTH, "leftlon": flow_grid.WEST, "rightlon": flow_grid.EAST}
    params = {"dir": f"/gfs.{run:%Y%m%d}/{run:%H}/atmos", "file": f"gfs.t{run:%H}z.pgrb2.0p25.f{step:03d}", "subregion": "", **box}
    return _grouped(GFS_URL, params, groups)


def _hrrr(run: datetime, step: int, groups=flow_grid.FILTER_GROUPS) -> bytes | None:
    params = {"dir": f"/hrrr.{run:%Y%m%d}/conus", "file": f"hrrr.t{run:%H}z.wrfsfcf{step:02d}.grib2"}
    return _grouped(HRRR_URL, params, groups)


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
    body = _GET[model](*_back(source), flow_grid.TERRAIN_GROUPS)
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
    ground under each point before the points are put in cells."""
    values, where = flow_grid.read(body)
    if "ceiling" in values:
        terrain = _terrain(model, source, values["ceiling"].size)
        ceiling = values.pop("ceiling")
        if terrain is not None:
            values["ceiling"] = flow_grid.ceiling_agl_ft(ceiling, terrain)
    return flow_grid.on_grid(values, where, hrrr=model == "hrrr")


def _tries(valid: datetime, now: datetime) -> dict[str, list[tuple[datetime, int]]]:
    """The runs and forecast hours each model is tried at for a frame, the
    latest run posted first and the ones before it after; no HRRR for an
    hour past WEATHER_FLOW_HRRR_AHEAD_H."""
    tries: dict[str, list[tuple[datetime, int]]] = {"hrrr": [], "gfs": []}
    if valid <= now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=get_settings().flow_hrrr_ahead_h):
        latest = _hrrr_run(now)
        for n in range(RUNS_TRIED):
            run = latest - timedelta(hours=n)
            step = int((valid - run).total_seconds() // 3600)
            if 0 <= step <= HRRR_LAST_STEP:
                tries["hrrr"].append((run, step))
    latest = _gfs_run(now)
    for n in range(RUNS_TRIED):
        run = latest - timedelta(hours=6 * n)
        # Hour 0 has no precipitation rate or cloud cover of its own (the
        # GFS's are averaged from it), so never it.
        tries["gfs"].append((run, max(1, int((valid - run).total_seconds() // 3600))))
    return tries


#: (model, run, step) -> when NOMADS last said it was not posted yet: not
#: asked again for NOT_UP_RETRY_S.
_NOT_UP: dict = {}
NOT_UP_RETRY_S = 300
_GET = {"gfs": _gfs, "hrrr": _hrrr}


def _first(model: str, tries: list[tuple[datetime, int]], held: dict | None) -> tuple[dict | None, bytes | None]:
    """The newest run of `model` posted for a frame, as {"run",
    "forecast_hour"}, and its file -- None for the file where the frame
    held already came from that run, which is not downloaded again."""
    for run, step in tries:
        source = {"run": _iso(run), "forecast_hour": step}
        if held == source:
            return source, None
        if time.time() - _NOT_UP.get((model, run, step), 0) < NOT_UP_RETRY_S:
            continue
        body = _GET[model](run, step)
        if body is None:
            _NOT_UP[(model, run, step)] = time.time()
            continue
        return source, body
    return None, None


def _frame(valid: datetime, now: datetime, held: dict | None) -> dict | None:
    """One hour's frame: the GFS's grid, the HRRR's over it where taken,
    each field's PNG stored; the frame held kept as it is where it came
    from the same runs. None where NOMADS has no GFS for it."""
    tries = _tries(valid, now)
    held_key = (held or {}).get("key") or {}
    if held and not all(weather_store.blob_exists(n, ".png") for n in held.get("files", {}).values()):
        held, held_key = None, {}
    gfs, gfs_body = _first("gfs", tries["gfs"], held_key.get("gfs"))
    if gfs is None:
        return None
    hrrr, hrrr_body = _first("hrrr", tries["hrrr"], held_key.get("hrrr"))
    key = {"gfs": gfs, "hrrr": hrrr}
    if held and key == held_key:
        return held
    # One model new, the other as held: the held one's file again.
    gfs_body = gfs_body or _GET["gfs"](*_back(gfs))
    hrrr_body = hrrr_body or (_GET["hrrr"](*_back(hrrr)) if hrrr else None)
    if gfs_body is None:
        return None
    grid = _model_grid("gfs", gfs, gfs_body)
    if hrrr_body is not None:
        grid = flow_grid.blend(grid, _model_grid("hrrr", hrrr, hrrr_body))
    else:
        key["hrrr"] = None
    kept = flow_grid.in_units(grid)
    files = {}
    for field in flow_grid.FIELDS:
        body = flow_grid.png(field, kept)
        if body is None:
            continue
        name = f"flow-{valid:%Y%m%d%H}-{field}"
        weather_store.write_blob(name, body, ".png")
        files[field] = name
    return {"valid": _iso(valid), "key": key, "files": files, "model": "HRRR and GFS" if key["hrrr"] else "GFS"}


def _back(source: dict) -> tuple[datetime, int]:
    return datetime.fromisoformat(source["run"].replace("Z", "+00:00")), int(source["forecast_hour"])


def fetch(now: datetime | None = None) -> None:
    """The timeline's frames fetched where new and stored, with the record
    ("flow") that lists them. Raises FlowUnavailable where not one frame
    could be had, the stored record left in place."""
    now = now or datetime.now(timezone.utc)
    held = weather_store.read("flow")
    held_frames = {f["valid"]: f for f in (held.data or {}).get("frames", [])} if held else {}
    frames = []
    for valid in frame_times(now):
        try:
            frame = _frame(valid, now, held_frames.get(_iso(valid)))
        except FlowUnavailable:
            raise
        except (ValueError, RuntimeError, AttributeError) as err:
            # One hour's file unreadable leaves the rest of the timeline.
            log.warning("the %s frame could not be read: %s", _iso(valid), err)
            frame = None
        if frame is not None:
            frames.append(frame)
    if not frames:
        raise FlowUnavailable("no GFS run on NOMADS for the timeline")
    names = {name for f in frames for name in f["files"].values()}
    record = {
        "frames": frames,
        "bounds": list(flow_grid.BOUNDS),
        "fields": {k: {"unit": v["unit"], "unscale": list(v["unscale"]), "vector": v["vector"]} for k, v in flow_grid.FIELDS.items()},
    }
    newest = max(datetime.fromisoformat(f["valid"].replace("Z", "+00:00")) for f in frames)
    weather_store.write("flow", record, fetched_at=time.time(), until=(newest + timedelta(hours=1)).timestamp())
    weather_store.remove_blobs("flow-", names, ".png")


def _iso(at: datetime) -> str:
    return at.strftime("%Y-%m-%dT%H:%M:%SZ")
