"""The Gridded LAMP's forecast hours (GLMP, NWS MDL), ceiling and
visibility, fetched and stored for the planner's forecast dry run to read
(wingtip.glmp.forecast_at): the weather the run's airplane meets is the
weather forecast for the hour it gets there.

Each issue posts every field's forecast hours as one GRIB2 file of about
ten megabytes (nomads .../glmp.YYYYMMDD/glmp.tHH30z.fcsts_{cig,vis}.g.co.grib2,
a message per hour, up at about HH:48 in the listing, 2026-11-09), after
the analysis hour app.glmp reads. The messages are read one at a time
(gribberish, from each one's offset) and the first FORECAST_HOURS kept,
each grid as float16 -- six megabytes, not float32's twelve: a ceiling of
3,000 m is held to two metres, a visibility of 16 km to eight, finer than
the categories it is read against -- beside the record "glmp-forecast",
which the planner maps rather than reads in.
"""

from __future__ import annotations

import struct
import time
from datetime import datetime, timedelta, timezone

import numpy as np
from wingtip import weather_store

from .glmp import ISSUES_TRIED, NOT_UP_RETRY, GlmpUnavailable, _download_url, _issues, read_grid

#: The forecast files are up later than the analysis hour's (about HH:48).
POSTED_AFTER = timedelta(minutes=25)
#: How many forecast hours are kept: the flights a pilot plans for today.
#: The run's later hours are read from the TAFs alone.
FORECAST_HOURS = 12

URL = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/glmp/prod/glmp.{day}/glmp.t{hour}30z.fcsts_{field}.g.co.grib2"

#: When each issue was last found not up yet.
_NOT_UP: dict = {}


def messages(body: bytes) -> list[int]:
    """The offset of each GRIB2 message in a file of them: each starts
    "GRIB" and carries its whole length in octets 9 to 16 (WMO No. 306,
    FM 92 GRIB edition 2, section 0)."""
    offsets, at = [], 0
    while at + 16 <= len(body) and body[at : at + 4] == b"GRIB":
        offsets.append(at)
        (length,) = struct.unpack(">Q", body[at + 8 : at + 16])
        if length < 16:
            break
        at += length
    return offsets


def hours_of(body: bytes, issued: datetime) -> dict[str, tuple[dict, np.ndarray]]:
    """Each forecast hour's grid in a file, by its valid time (ISO), the
    first FORECAST_HOURS after the issue."""
    last = issued + timedelta(hours=FORECAST_HOURS, minutes=30)
    out = {}
    for offset in messages(body):
        grid, values = read_grid(body[offset:])
        valid = datetime.fromisoformat(grid["valid"].replace("Z", "+00:00"))
        if issued < valid <= last:
            out[grid["valid"]] = (grid, values.astype(np.float16))
    return out


def fetch_latest(now: datetime | None = None) -> bool:
    """The latest issue's forecast hours fetched and stored, where newer
    than the one stored; True if one was. Raises GlmpUnavailable where
    NOMADS does not answer or has none of the last ISSUES_TRIED, the
    stored issue left in place."""
    now = now or datetime.now(timezone.utc)
    issues = _issues(now - POSTED_AFTER)
    for gone in [i for i in _NOT_UP if i not in issues]:
        del _NOT_UP[gone]
    held = weather_store.read("glmp-forecast")
    held_issue = held.meta.get("issued") if held else None
    for issued in issues:
        stamp = issued.strftime("%Y-%m-%dT%H:%MZ")
        if stamp == held_issue:
            return False
        if now - _NOT_UP.get(issued, datetime.min.replace(tzinfo=timezone.utc)) < NOT_UP_RETRY:
            continue
        bodies = {field: _download_url(URL, issued, field) for field in ("cig", "vis")}
        if any(b is None for b in bodies.values()):
            _NOT_UP[issued] = now
            continue
        try:
            read = {field: hours_of(body, issued) for field, body in bodies.items()}
        except (ValueError, RuntimeError, AttributeError) as err:
            raise GlmpUnavailable(f"GLMP's {issued:%H%M}Z forecast could not be read: {err}") from err
        hours, names = [], set()
        for valid in sorted(set(read["cig"]) & set(read["vis"])):
            hour = {"valid": valid}
            for field in ("cig", "vis"):
                grid, values = read[field][valid]
                name = f"glmpf-{field}-{issued:%Y%m%d%H}-{valid[11:13]}"
                weather_store.write_array(name, values)
                hour[field] = {**grid, "array": name}
                names.add(name)
            hours.append(hour)
        if not hours:
            raise GlmpUnavailable(f"GLMP's {issued:%H%M}Z forecast has no hours")
        # Served to the end of its last hour: a forecast past that is not read.
        until = datetime.fromisoformat(hours[-1]["valid"].replace("Z", "+00:00")).timestamp() + 1800
        weather_store.write("glmp-forecast", {"hours": hours}, fetched_at=time.time(), until=until, meta={"issued": stamp})
        # The issue before stays a while for a planner that has it mapped; older go.
        previous = f"{issued - timedelta(hours=1):%Y%m%d%H}"
        keep = names | {p.stem for p in weather_store.store_dir().glob(f"glmpf-*-{previous}-*.npy")}
        weather_store.remove_arrays("glmpf-", keep)
        return True
    if held is not None and weather_store.servable(held, now.timestamp()):
        return False
    raise GlmpUnavailable(f"no GLMP forecast in the last {ISSUES_TRIED} hours")
