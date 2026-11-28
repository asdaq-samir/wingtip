"""The followed airplanes' past flights from the OpenSky Network asked
ahead each night, so their cards' flights open at once: ingest's job
(ingest.main), into the live store the planner reads
(wingtip.traffic.opensky). Its own module so opensky.py keeps to the 300
lines a new file may have."""

from __future__ import annotations

import datetime as dt
import logging
import time
from concurrent.futures import ThreadPoolExecutor

from .opensky import _path, flights
from .opensky_api import DAILY_CREDITS, TIMEOUT_S, _left, on

log = logging.getLogger(__name__)

#: The followed airplanes' yesterday asked for once a UTC day from this
#: hour, after OpenSky's batch at night has built it, and their paths with
#: it (prefetch, ingest's job): their flights then open at once. At most
#: this share of the day's credits, the rest left to the pilots' own asks.
PREFETCH_FROM_HOUR_UTC = 6
PREFETCH_SHARE = 0.5
PREFETCH_EVERY_S = 3600.0
#: A run stops starting airplanes after this long, s, the day left undone
#: for the next run (what it read is kept); and reads this many paths at once.
PREFETCH_MOST_S = 600.0
PREFETCH_WORKERS = 4
_PREFETCHED: dict[str, dt.date | None] = {"day": None}


def prefetch() -> int:
    """The followed airplanes' flights of yesterday and their paths asked
    for once a UTC day, from PREFETCH_FROM_HOUR_UTC, within PREFETCH_SHARE
    of the day's credits, so their cards' flights open at once: ingest's
    job every PREFETCH_EVERY_S (ingest.main), into the live store the
    planner reads. PREFETCH_WORKERS paths at a time, each given TIMEOUT_S;
    the day is marked done only once every airplane's were had (or the
    share was spent), a run cut at PREFETCH_MOST_S or a day or path not
    had leaving it for the next, which reads what this one kept from the
    store. It was marked before it ran, so one failure lost the day, and
    asked its paths one after another. How many paths were read."""
    from .recorded import followed

    now = dt.datetime.now(dt.timezone.utc)
    today = now.date()
    if not on() or now.hour < PREFETCH_FROM_HOUR_UTC or _PREFETCHED["day"] == today:
        return 0
    yesterday = today - dt.timedelta(days=1)
    started, read, whole = time.monotonic(), 0, True
    airplanes = followed()
    with ThreadPoolExecutor(max_workers=PREFETCH_WORKERS) as pool:
        for hex_id in airplanes:
            if _spent_share("flights") >= PREFETCH_SHARE or _spent_share("tracks") >= PREFETCH_SHARE:  # OpenSky's own count
                break
            if time.monotonic() - started > PREFETCH_MOST_S:
                whole = False
                break
            found, unread = flights(hex_id, [yesterday], today)
            paths = list(pool.map(lambda f: _path(hex_id, f["id"], TIMEOUT_S), found))
            read += sum(p is not None for p in paths)
            whole = whole and not unread and all(p is not None for p in paths)
    if whole:
        _PREFETCHED["day"] = today
    log.info("OpenSky prefetch: %d paths of %d followed airplanes%s", read, len(airplanes), "" if whole else ", the rest next run")
    return read


def _spent_share(family: str) -> float:
    """The share of the family's day spent, by OpenSky's own count; none known, none spent."""
    left = _left(family)
    return 0.0 if left is None else 1 - left / DAILY_CREDITS
