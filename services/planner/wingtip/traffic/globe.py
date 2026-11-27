"""adsb.lol's globe (its tar1090): an airplane's trace today and its last
few minutes, static files read apart from the API's paced turns, so a
search or a card's track costs none of them (wingtip.traffic.adsb_lol)."""

from __future__ import annotations

import requests
from cachetools import TTLCache

from .. import outside, ratelimit
from ..single_flight import one_at_a_time
from .common import HEADERS, TIMEOUT_S, _LOCK, _aircraft, _clock, _number, _wall


#: The same open data's globe (adsb.lol's tar1090), where the traces are: adsb.lol itself, as globe.adsb.lol
#: answers every read with a redirect here (seen 2026-10-16), a hop that cost 0.4 s a file (1.1 s against 0.7 s).
GLOBE = "https://adsb.lol"
#: The day's track of an airplane, by its ICAO address: readsb's trace, on the globe, gzip JSON.
TRACE_URL = GLOBE + "/data/traces/{last2}/trace_full_{hex}.json"
#: A trace is read again after this long, s: the map adds the reports between (TrafficLayer).
TRACE_TTL_S = 60

_TRACES: TTLCache = TTLCache(maxsize=64, ttl=TRACE_TTL_S)
#: An airplane's last few minutes, on the same globe: the trace readsb
#: writes every few seconds (3 to 8 s old, measured 2026-10-12, where the
#: full trace was 4 to 7 minutes behind). A static file, not the API, so
#: a search by registration or address costs none of the API's turns.
RECENT_URL = GLOBE + "/data/traces/{last2}/trace_recent_{hex}.json"
#: A recent trace is read again after this long, s.
RECENT_TTL_S = 5
#: Each airplane's recent trace as read (None for a 404), for its search's answer and its alerts' state (`status`).
_RECENT: TTLCache = TTLCache(maxsize=256, ttl=RECENT_TTL_S)


def _recent_trace(hex_id: str):
    """An airplane's recent trace (RECENT_URL), kept RECENT_TTL_S: a dict,
    None where it has none (a 404), UNREAD where it cannot be read now."""
    with _LOCK:
        if hex_id in _RECENT:
            return _RECENT[hex_id]
    try:
        resp = _globe_get(RECENT_URL.format(last2=hex_id[-2:], hex=hex_id), TIMEOUT_S)
        if resp.status_code == 404:
            trace = None
        elif resp.status_code == 200:
            trace = resp.json()
            if not isinstance(trace, dict):
                trace = None
        else:
            return UNREAD
    except (requests.RequestException, ValueError, _GlobeRefused):
        return UNREAD
    with _LOCK:
        _RECENT[hex_id] = trace
    return trace


def _recent(hex_id: str) -> list[dict] | None:
    """The airplane with this address as its recent trace last has it, as
    `_aircraft` gives it: [it] in the air and heard within STALE_S, [] on
    the ground, not heard that recently or with no recent trace (a 404),
    None where the trace cannot be read now (the API is asked instead)."""
    trace = _recent_trace(hex_id)
    if trace is UNREAD:
        return None
    plane = _last_heard(trace) if trace else None
    return [plane] if plane is not None else []


def _last_heard(trace: dict) -> dict | None:
    """A trace's last point as the API's answer has an airplane, read by
    `_aircraft`: readsb's trace point is [seconds after the trace's
    timestamp, lat, lon, altitude or "ground", ground speed, track, flags,
    vertical rate, details, source, GNSS altitude, GNSS rate, ...], the
    callsign and squawk in the last point that carries details."""
    points = [p for p in trace.get("trace") or [] if isinstance(p, list) and len(p) >= 8]
    base = _number(trace.get("timestamp"))
    if not points or base is None:
        return None
    last = points[-1]
    details = next((p[8] for p in reversed(points) if len(p) > 8 and isinstance(p[8], dict)), {})
    return _aircraft(
        {
            "hex": trace.get("icao"),
            "flight": details.get("flight"),
            "r": trace.get("r"),
            "t": trace.get("t"),
            "lat": last[1],
            "lon": last[2],
            "alt_baro": last[3],
            "alt_geom": last[10] if len(last) > 10 else None,
            "gs": last[4],
            "track": last[5],
            "baro_rate": last[7],
            "geom_rate": last[11] if len(last) > 11 else None,
            "seen_pos": round(max(0.0, _wall() - base - float(last[0])), 1),
            "squawk": details.get("squawk"),
            "emergency": details.get("emergency"),
        }
    )


#: How long the globe's files are not asked for after it turns the planner
#: away, s. Since 2026-10-23 adsb.lol answers the planner's requests for
#: its trace files with a "Verification" page and a 403, a browser check
#: the planner cannot pass; asked again on every card, each refusal took
#: 0.7 to 4 s, and a card's past flights asked for fourteen days of them,
#: 5 to 13 s, before showing what it had anyway (the recorded track).
GLOBE_BACKOFF_S = 600.0
_GLOBE = ratelimit.Gate()


class _GlobeRefused(Exception):
    """The globe turned the planner away, now or within GLOBE_BACKOFF_S."""


def _globe_get(url: str, timeout: float):
    """A file off adsb.lol's globe, or _GlobeRefused where it is turning
    the planner away: a 403 or a 429, or a page in place of the file (its
    verification wall answers 200 to some), starts GLOBE_BACKOFF_S without
    asking."""
    if _GLOBE.held(_clock()):
        raise _GlobeRefused("adsb.lol's globe turned the planner away a moment ago")
    resp = outside.live_get(url, headers=HEADERS, timeout=timeout)
    page = "html" in str(resp.headers.get("content-type") or "").lower()
    if resp.status_code in (403, 429) or (resp.status_code == 200 and page):
        _GLOBE.hold(GLOBE_BACKOFF_S, _clock())
        raise _GlobeRefused(f"adsb.lol's globe answered {resp.status_code}")
    return resp


def _trace(hex_id: str) -> dict | None:
    """An airplane's trace today, read once a minute; None where there is
    none or it cannot be had (the flight is then drawn without its past).
    Only an answer is kept -- a 404 is the airplane having no trace today
    -- never a timeout or a refusal, which is asked again at the next
    read. One read per airplane at a time: a second asker waits for it
    and is given what it kept."""
    with _LOCK:
        if hex_id in _TRACES:
            return _TRACES[hex_id]
    # One gate per airplane while it is read, let go after (single_flight):
    # the gates were cleared whole at 256, one another thread still held.
    with one_at_a_time(("adsb.lol trace", hex_id)):
        with _LOCK:
            if hex_id in _TRACES:
                return _TRACES[hex_id]
        try:
            resp = _globe_get(TRACE_URL.format(last2=hex_id[-2:], hex=hex_id), TIMEOUT_S)
            if resp.status_code == 200:
                trace = resp.json()
                # Anything but an object is not a trace: no past, not a 500.
                if not isinstance(trace, dict):
                    trace = None
            elif resp.status_code == 404:
                trace = None
            else:
                return None
        except (requests.RequestException, ValueError, _GlobeRefused):
            return None
        with _LOCK:
            _TRACES[hex_id] = trace
    return trace


class _Unread:
    """What `_day_trace` gives for a day it could not read now (refused or not answered), as against None, no trace."""


UNREAD = _Unread()
