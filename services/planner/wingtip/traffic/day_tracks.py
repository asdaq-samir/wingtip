"""An airplane's whole day, for the Studio's replay (app.routers.studio):
adsb.lol's history of the globe's traces, a UTC day a file, kept here
once read, and the reports watched here that day.

adsb.lol keeps every day's traces at
``adsb.lol/globe_history/{yyyy}/{mm}/{dd}/traces/{last2}/trace_full_{hex}.json``
(the same readsb trace as today's, gzip JSON), about six weeks back
(flights.ARCHIVE_DAYS), and the whole archive as a day's tarball on GitHub
(github.com/adsblol/globe_history_2026, 3.6 GB a day on 2026-11-11), too
large to read one airplane from. The data is the Open Database License
1.0's (adsb.lol/docs/open-data/historical, checked 2026-11-12), which asks
that a use say where it came from (ODbL 4.3): the answer carries its
`source` and `license`, which the Studio shows beside the replay.

A past day no longer changes, so it is read once and kept in its own
SQLite file beside the live store (``day_tracks.sqlite``), for good:
a pilot's request reads the file, and only a day not there yet is
fetched, once, a day with no trace kept as none. A refusal or a timeout is
not kept and is asked again. Today's day is the recent trace (flights'
``_trace``), not kept, as it is still being written.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import sqlite3
import threading
import time
from pathlib import Path

import requests

from .. import registry
from ..config import get_settings
from .adsb_lol import ADSB_LOL_SOURCE, _GlobeRefused, _globe_get, _trace
from .common import TrafficUnavailable, _number
from .flights import HISTORY_TIMEOUT_S, HISTORY_URL
from .recorded import _recorded, followed

_HEX = re.compile(r"^~?[0-9a-f]{6}$")
_N_NUMBER = re.compile(r"^N[1-9][0-9A-Z]{0,4}$")

_LOCK = threading.Lock()
_db: sqlite3.Connection | None = None
#: One fetch of a day at a time: a second asker waits and reads the file.
_GATES: dict[tuple[str, str], threading.Lock] = {}


class NotAnAirplane(ValueError):
    """The text names no airplane this can look up: not an ICAO address,
    and not an N-number the FAA's registry has."""


def _store_path() -> Path:
    """The kept days' file, beside the live store on the data volume."""
    return get_settings().live_store.parent / "day_tracks.sqlite"


def _connection() -> sqlite3.Connection:
    global _db
    if _db is None:
        path = _store_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(path, check_same_thread=False, timeout=10.0, isolation_level=None)
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("CREATE TABLE IF NOT EXISTS days (hex TEXT, day TEXT, fetched_at REAL, trace TEXT, PRIMARY KEY (hex, day))")
        _db = db
    return _db


def reset() -> None:
    """Forgets the connection (the tests' store is a new file each)."""
    global _db
    with _LOCK:
        if _db is not None:
            _db.close()
        _db = None


def _kept(hex_id: str, day: str) -> tuple[bool, dict | None]:
    with _LOCK:
        row = _connection().execute("SELECT trace FROM days WHERE hex = ? AND day = ?", (hex_id, day)).fetchone()
    if row is None:
        return False, None
    return True, json.loads(row[0]) if row[0] else None


def _keep(hex_id: str, day: str, trace: dict | None) -> None:
    with _LOCK:
        _connection().execute(
            "INSERT OR REPLACE INTO days VALUES (?, ?, ?, ?)", (hex_id, day, time.time(), json.dumps(trace) if trace else None)
        )


def resolve(query: str) -> tuple[str, str | None]:
    """The ICAO address and the N-number of the airplane named, by either:
    an address as it is, an N-number through the FAA's registry."""
    text = re.sub(r"[\s-]+", "", query).upper()
    if _HEX.fullmatch(text.lower()):
        hex_id = text.lower()
        found = registry.lookup(hex_id=hex_id)
        return hex_id, (found or {}).get("n_number")
    if _N_NUMBER.fullmatch(text):
        found = registry.lookup(n_number=text)
        if found and found.get("mode_s_hex"):
            return str(found["mode_s_hex"]).lower(), text
    raise NotAnAirplane(f"{query!r} is not an ICAO address or an N-number the FAA's registry has")


def _day_trace(hex_id: str, day: dt.date) -> dict | None:
    """A past day's trace: the file's, or fetched once and kept; None where
    the airplane has none that day. TrafficUnavailable where adsb.lol cannot
    be read now."""
    key = (hex_id, day.isoformat())
    have, trace = _kept(*key)
    if have:
        return trace
    with _LOCK:
        gate = _GATES.setdefault(key, threading.Lock())
    with gate:
        have, trace = _kept(*key)
        if have:
            return trace
        try:
            resp = _globe_get(HISTORY_URL.format(day=day, last2=hex_id[-2:], hex=hex_id), HISTORY_TIMEOUT_S)
            if resp.status_code == 404:
                trace = None
            else:
                resp.raise_for_status()
                trace = resp.json()
                if not isinstance(trace, dict):
                    trace = None
        except (requests.RequestException, ValueError, _GlobeRefused) as err:
            raise TrafficUnavailable(f"adsb.lol's history could not be read: {err}") from err
        _keep(*key, trace)
    with _LOCK:
        _GATES.pop(key, None)
    return trace


def _setting(details) -> float | None:
    """The altimeter setting the crew had set, hPa, where the report's
    details carry one (readsb's `nav_qnh`, ADS-B version 2's barometric
    pressure setting): what the simulator export sets the pressure
    altitude on (the engine's sim_flight), 14 CFR 91.121(a) making it the
    local station's below 18,000 ft."""
    if not isinstance(details, dict):
        return None
    return _number(details.get("nav_qnh"))


def _reports(trace: dict | None, start: float, end: float) -> list[dict]:
    """A readsb trace's reports within [start, end): its pressure altitude
    (readsb's alt_baro, the transponder's own, DO-260B), not the GNSS
    height, for the altimeter's figure; None and `ground` on the ground;
    and the altimeter setting where the report carries one (_setting)."""
    if not trace:
        return []
    base = _number(trace.get("timestamp")) or 0.0
    out = []
    for p in trace.get("trace") or []:
        if not isinstance(p, list) or len(p) < 7 or _number(p[1]) is None or _number(p[2]) is None:
            continue
        t = round(base + float(p[0]), 1)
        if not start <= t < end:
            continue
        ground = p[3] == "ground"
        out.append(
            {
                "t": t,
                "lat": round(float(p[1]), 5),
                "lon": round(float(p[2]), 5),
                "alt_ft": None if ground else _number(p[3]),
                "gs_kt": _number(p[4]),
                "track_deg": _number(p[5]),
                "ground": ground,
                "qnh_hpa": _setting(p[8] if len(p) > 8 else None),
            }
        )
    return out


def _model(hex_id: str) -> str | None:
    """The airplane's maker and model as the FAA's registry has them
    ("Airbus S A S A321-271NX"), which a simulator export names it by."""
    found = registry.lookup(hex_id=hex_id) or {}
    words = " ".join(str(found[k]).strip() for k in ("manufacturer", "model") if found.get(k))
    return words or None


def day_track(query: str, day: dt.date, today: dt.date | None = None) -> dict:
    """The airplane named's reports on a UTC day: {"hex", "registration",
    "type", "day", "points" ([{"t", "lat", "lon", "alt_ft", "gs_kt",
    "track_deg", "ground"}], time order), "altitude" ("pressure" for
    adsb.lol's, "reported" for reports watched here: GNSS or set on an
    altimeter), "source", "license"}. The archive's day where it has one;
    else the reports watched here that day (wingtip.traffic.recorded), which
    say so in `source`. NotAnAirplane, or ValueError for a day to come."""
    hex_id, registration = resolve(query)
    today = today or dt.datetime.now(dt.timezone.utc).date()
    if day > today:
        raise ValueError("That day has not happened yet")
    start = dt.datetime.combine(day, dt.time(), dt.timezone.utc).timestamp()
    end = start + 86400
    trace = _trace(hex_id) if day == today else _day_trace(hex_id, day)
    points = _reports(trace, start, end)
    named = trace if isinstance(trace, dict) else {}
    answer = {
        "hex": hex_id,
        "registration": registration or named.get("r") or None,
        "type": named.get("t") or None,
        "model": _model(hex_id),
        "day": day.isoformat(),
        "altitude": "pressure",
        **ADSB_LOL_SOURCE,
    }
    if points:
        return {**answer, "points": points}
    watched = [
        {k: p.get(k) for k in ("t", "lat", "lon", "alt_ft", "gs_kt", "track_deg")} | {"ground": p.get("alt_ft") is None}
        for p in _recorded(hex_id)
        if start <= p["t"] < end
    ]
    return {**answer, "points": watched, "altitude": "reported", "source": "Watched here" if watched else answer["source"]}


def watched_days() -> list[dict]:
    """The airplanes followed here whose reports are recorded
    (wingtip.traffic.recorded), each {"hex", "registration", "days" (the UTC
    days its reports fall on, ISO, newest first)}: those the Studio can
    replay without asking adsb.lol."""
    out = []
    for hex_id in sorted(followed()):
        days = {dt.datetime.fromtimestamp(p["t"], dt.timezone.utc).date().isoformat() for p in _recorded(hex_id)}
        if days:
            found = registry.lookup(hex_id=hex_id) or {}
            out.append({"hex": hex_id, "registration": found.get("n_number"), "days": sorted(days, reverse=True)})
    return out


__all__ = ["NotAnAirplane", "day_track", "reset", "resolve", "watched_days"]
