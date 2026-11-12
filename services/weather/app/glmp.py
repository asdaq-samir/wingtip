"""The National Weather Service's Gridded LAMP (GLMP), its analysis hour
("hr00"), ceiling and visibility on the National Blend of Models' 2.5 km
CONUS grid, fetched and stored for the planner to read (wingtip.glmp).
Moved from the planner's wingtip.glmp (#535), which fetched it on a card's
way.

GLMP is issued every hour at half past, from NOMADS
(nomads.ncep.noaa.gov/pub/data/nccf/com/glmp/prod), each field a GRIB2 file
of about half a megabyte (MDL's GLMP v2.7 file names). The two grids are
read here (gribberish, a GRIB2 reader of two megabytes: ECMWF's eccodes is
a hundred, with a PROJ of its own that crashed the interpreter at exit
beside pyproj's) and stored as float32 arrays, twelve megabytes each,
with the grid's projection and spacing in the record ("glmp"), which the
planner maps rather than reads in.

An issue is stored with the time it may be served to: while it is one of
the last ISSUES_TRIED posted -- the age a late issue may reach on a normal
day. GLMP is hourly guidance with no period of validity of its own (NWS
MDL, Gridded LAMP), so that, not longer, is how old a model run is shown
as now, its "valid_at" saying how old.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

import gribberish
import numpy as np
import requests
from wingtip import outside, weather_store
from wingtip.config import REQUEST_HEADERS as HEADERS

log = logging.getLogger(__name__)

URL = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/glmp/prod/glmp.{day}/glmp.t{hour}30z.hr00_{field}.g.co.grib2"
#: An issue is up on NOMADS a few minutes after its half past (the hr00
#: files at about HH:32 in the listing, 2026-10-10); looked for from then.
POSTED_AFTER = timedelta(minutes=5)
#: An issue not up yet is asked for again after this, not at every look.
NOT_UP_RETRY = timedelta(minutes=2)
#: How many issues back are tried before saying there is none: one late
#: issue is common, three missing is NOMADS out.
ISSUES_TRIED = 3


class GlmpUnavailable(RuntimeError):
    """NOMADS did not give a recent issue."""


#: When each issue was last found not up yet.
_NOT_UP: dict = {}


def _issues(now: datetime) -> list[datetime]:
    """The issues to try, the newest first: the half past most recently
    posted, and the ones before it."""
    latest = (now - POSTED_AFTER).replace(minute=30, second=0, microsecond=0)
    if latest > now - POSTED_AFTER:
        latest -= timedelta(hours=1)
    return [latest - timedelta(hours=n) for n in range(ISSUES_TRIED)]


def _download(issued: datetime, field: str) -> bytes | None:
    """An issue's file for `field` ("cig" or "vis"); None where it is not
    up (yet). Raises GlmpUnavailable where NOMADS does not answer."""
    return _download_url(URL, issued, field)


def _download_url(template: str, issued: datetime, field: str) -> bytes | None:
    """An issue's file of a URL `template` (its {day}, {hour} and {field})
    -- the analysis hour's or the forecast hours' (app.glmp_forecast)."""
    url = template.format(day=issued.strftime("%Y%m%d"), hour=issued.strftime("%H"), field=field)
    try:
        resp = outside.get(url, headers=HEADERS, timeout=20)
    except requests.RequestException as err:
        raise GlmpUnavailable(f"NOMADS did not answer: {err}") from err
    if resp.status_code == 404:
        return None
    if not resp.ok:
        raise GlmpUnavailable(f"NOMADS answered {resp.status_code} for {url}")
    return resp.content


def read_grid(message: bytes) -> tuple[dict, np.ndarray]:
    """One field's grid as stored: {"x0", "dx", "y0", "dy", "nx", "ny",
    "proj", "valid"} -- the cells' centres along each axis in the
    projection's metres, south and west first as GLMP's are, found from the
    first and the spacing -- and its values (missing points NaN)."""
    parsed = gribberish.parse_grib_message(message, 0)
    meta = parsed.metadata
    x, y = meta.xy()
    ny, nx = meta.grid_shape
    if len(x) != nx or len(y) != ny or nx < 2 or ny < 2:
        raise ValueError("not a regular projected grid")
    grid = {
        "x0": float(x[0]),
        "dx": float(x[1] - x[0]),
        "y0": float(y[0]),
        "dy": float(y[1] - y[0]),
        "nx": int(nx),
        "ny": int(ny),
        "proj": str(meta.proj),
        "valid": meta.forecast_date.isoformat().replace("+00:00", "Z"),
    }
    return grid, np.asarray(parsed.data(), dtype=np.float32).reshape(ny, nx)


def fetch_latest(now: datetime | None = None) -> bool:
    """The latest issue posted fetched and stored, where it is newer than
    the one stored; True if one was stored. An issue not up yet falls back
    to the one before, and is not asked for again for NOT_UP_RETRY. Raises
    GlmpUnavailable where NOMADS does not answer or has none of the last
    ISSUES_TRIED, the stored issue left in place."""
    now = now or datetime.now(timezone.utc)
    issues = _issues(now)
    for gone in [issued for issued in _NOT_UP if issued not in issues]:
        del _NOT_UP[gone]
    held = weather_store.read("glmp")
    held_issue = held.meta.get("issued") if held else None
    for issued in issues:
        stamp = issued.strftime("%Y-%m-%dT%H:%MZ")
        if stamp == held_issue:
            return False
        if now - _NOT_UP.get(issued, datetime.min.replace(tzinfo=timezone.utc)) < NOT_UP_RETRY:
            continue
        try:
            ceiling, visibility = _download(issued, "cig"), _download(issued, "vis")
        except GlmpUnavailable:
            # NOMADS not answering: not asked again, for any issue, for NOT_UP_RETRY.
            for each in issues:
                _NOT_UP[each] = now
            raise
        if ceiling is None or visibility is None:
            _NOT_UP[issued] = now
            continue
        try:
            grids = {field: read_grid(body) for field, body in (("cig", ceiling), ("vis", visibility))}
        except (ValueError, RuntimeError, AttributeError) as err:
            raise GlmpUnavailable(f"GLMP's {issued:%H%M}Z issue could not be read: {err}") from err
        record = {}
        names = set()
        for field, (grid, values) in grids.items():
            name = f"glmp-{field}-{issued:%Y%m%d%H}"
            weather_store.write_array(name, values)
            record[field] = {**grid, "array": name}
            names.add(name)
        until = (issued + timedelta(hours=ISSUES_TRIED) + POSTED_AFTER).timestamp()
        weather_store.write("glmp", record, fetched_at=time.time(), until=until, meta={"issued": stamp})
        # The issue before stays a while for a planner that has it open; older go.
        previous = issued - timedelta(hours=1)
        weather_store.remove_arrays("glmp-", names | {f"glmp-{f}-{previous:%Y%m%d%H}" for f in ("cig", "vis")})
        return True
    if held is not None and weather_store.servable(held, now.timestamp()):
        return False
    raise GlmpUnavailable(f"no GLMP issue in the last {ISSUES_TRIED} hours")
