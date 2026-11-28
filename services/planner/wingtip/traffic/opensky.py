"""The OpenSky Network, an airplane's past flights where adsb.lol's archive
is closed to the planner (its globe's files refused since 2026-10-23):
its flights by address, a day at the most two at a time, and a flight's
path. The owner's word, 2026-11-27 ("yes", to OpenSky for past flights).

OpenSky's REST API (openskynetwork.github.io/opensky-api/rest.html, read
2026-11-27): OAuth2 client credentials only, a token good for 30 minutes;
`/flights/aircraft` gives the flights that departed and arrived within an
interval of 2 days at the most, built by a batch at night, so yesterday's
and before; `/tracks/all` a flight's path, experimental, 30 days back at
the most. Free for personal and non-profit use, commercial use with its
consent (its FAQ). Off unless OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET
are set."""

from __future__ import annotations

import datetime as dt
import logging
import threading
from concurrent.futures import Future, ThreadPoolExecutor, TimeoutError as FutureTimeout

from .. import airports
from ..geo import distance_nm
from ..units import M_TO_FT
from . import store
from .legs import FIELD_APPROACH_NM, _field_at
from .common import _number, _wall
from .opensky_api import FLIGHTS_TIMEOUT_S, TIMEOUT_S, TRACK_TIMEOUT_S, _get, _Unread, on

log = logging.getLogger(__name__)

#: Its credit, as the card says where a flight came from it.
OPENSKY_SOURCE = "OpenSky Network"
#: `/flights/aircraft`'s longest interval, days.
DAYS_PER_CALL = 2
#: How far back `/tracks/all` goes, days.
TRACK_DAYS = 30
#: A past day's flights and a past flight's path no longer change, s: a
#: day and a bit, so the night's prefetch lasts until the next. Kept in
#: the live store (store.opensky_*), which ingest's prefetch and the
#: planner both read and write, a day at a time: the next page of a card's
#: flights, whose pairs of days fall otherwise, asks again for none.
KEEP_S = 26 * 3600
#: Pairs of days asked side by side for one card, at most: each answer
#: took up to several seconds one after another (2026-11-27). Seven, so a
#: card's fourteen days (flights.HISTORY_DAYS_PER_ASK) go in one round:
#: two rounds of four were up to 16 s.
WORKERS = 7
#: The newest of a card's OpenSky flights whose paths are asked ahead in
#: the background once it lists them (`warm`), and how many at once: the
#: first open of one waited on OpenSky's /tracks/all, 7 s (2026-11-27).
WARM_FLIGHTS = 3
WARM_WORKERS = 3
#: The most paths asked ahead or waiting their turn at once, three cards'
#: worth: past it a card asks none ahead, as each queued 3 behind the rest.
WARM_MOST = 9
#: Paths being asked for in the background, by (address, flight).
_ASKING: dict[tuple[str, int], Future] = {}
_ASKING_LOCK = threading.Lock()
_WARM_POOL = ThreadPoolExecutor(max_workers=WARM_WORKERS, thread_name_prefix="opensky-path")


def _field(icao: str | None) -> dict | None:
    """A field OpenSky names by its ICAO ident, as `history` names its ends."""
    if not icao:
        return None
    place = airports.find_place(icao)
    if place is None:
        return {"ident": icao, "name": None, "city": None, "region": None}
    return {
        "ident": place["ident"],
        "name": place.get("name"),
        "city": place.get("municipality"),
        "region": place.get("region"),
        "_at": (place["lat"], place["lon"]) if place.get("lat") is not None and place.get("lon") is not None else None,
    }


def _public(field: dict | None) -> dict | None:
    return field and {k: v for k, v in field.items() if not k.startswith("_")}


def _checked(guess: dict | None, point: dict, landing: bool) -> dict | None:
    """A flight's end from its path where the path shows it at a field
    (legs' _field_at, as an archived flight's ends are named); else
    OpenSky's estimate only where the path's end is within
    FIELD_APPROACH_NM of it, a guess the path does not reach dropped: it
    named Y89 for N570GJ coming into O'Hare (2026-11-27)."""
    seen = _field_at(point, landing=landing)
    if seen is not None:
        return seen
    if guess is None or guess.get("_at") is None:
        return None
    return guess if distance_nm(point["lat"], point["lon"], *guess["_at"]) <= FIELD_APPROACH_NM else None


def _with_path(flight: dict, path: list[dict] | None) -> dict:
    """A flight as `history` lists it, its highest altitude and its ends
    from its path where that has been read (`track`), else as estimated."""
    if not path:
        return {**flight, "origin": _public(flight["origin"]), "destination": _public(flight["destination"])}
    heights = [p["alt_ft"] for p in path if p["alt_ft"] is not None]
    origin = _public(_checked(flight["origin"], path[0], landing=False))
    destination = _public(_checked(flight["destination"], path[-1], landing=True))
    return {
        **flight,
        "origin": origin,
        "destination": destination,
        "landed": destination is not None,
        "max_alt_ft": max(heights) if heights else None,
    }


def _flight(entry: dict) -> dict | None:
    """One of `/flights/aircraft`'s flights as `history` lists them: its
    ends OpenSky's estimate, no highest altitude (it gives none)."""
    off, on_ = _number(entry.get("firstSeen")), _number(entry.get("lastSeen"))
    if off is None or on_ is None:
        return None
    destination = _field(entry.get("estArrivalAirport"))
    return {
        "id": int(off),
        "origin": _field(entry.get("estDepartureAirport")),
        "destination": destination,
        "off": off,
        "on": on_,
        "landed": destination is not None,
        "in_air": False,
        "max_alt_ft": None,
        "source": OPENSKY_SOURCE,
    }


def _once(listed: list[dict]) -> list[dict]:
    """Each flight once: OpenSky can list one twice, seconds apart, one of
    them with no arrival (N654FL's of 4 Nov, 21:12Z, 2026-11-27); of two
    whose times overlap the one with an arrival is kept, else the first."""
    kept: list[dict] = []
    for flight in sorted(listed, key=lambda f: (f["destination"] is None, f["id"])):
        if not any(k["off"] <= flight["on"] and flight["off"] <= k["on"] for k in kept):
            kept.append(flight)
    return sorted(kept, key=lambda f: f["id"])


def _ask_pair(hex_id: str, pair: list[dt.date]) -> list[dict] | None:
    """OpenSky's flights of one or two days in a row, each day kept in the
    store, the flight under the day it took off (one before the first day
    under the first); None where they could not be had."""
    begin = int(dt.datetime.combine(pair[0], dt.time(), dt.timezone.utc).timestamp())
    end = int(dt.datetime.combine(pair[-1] + dt.timedelta(days=1), dt.time(), dt.timezone.utc).timestamp()) - 1
    try:
        answer = _get("/flights/aircraft", {"icao24": hex_id, "begin": begin, "end": end}, "flights", FLIGHTS_TIMEOUT_S)
    except _Unread:
        return None
    listed = _once([f for f in (_flight(e) for e in answer or [] if isinstance(e, dict)) if f is not None])
    by_day: dict[dt.date, list[dict]] = {d: [] for d in pair}
    for flight in listed:
        day = dt.datetime.fromtimestamp(flight["off"], dt.timezone.utc).date()
        by_day[min(max(day, pair[0]), pair[-1])].append(flight)
    now = _wall()
    for day, kept in by_day.items():
        store.opensky_keep_day(hex_id, day.isoformat(), kept, now)
    return listed


def flights(hex_id: str, days: list[dt.date], today: dt.date, ask: bool = True) -> tuple[list[dict], int]:
    """An airplane's flights on these UTC days, from OpenSky, oldest first,
    and how many of the days could not be had: today's never (its batch
    runs at night), each day kept KEEP_S, those not kept asked two days to
    a call, WORKERS calls side by side. Where `ask` is False only what is
    kept is given (an airplane's base, bases.py, spends no credits)."""
    since = _wall() - KEEP_S
    found: list[dict] = []
    missing = []
    for day in sorted(d for d in set(days) if d < today):
        kept = store.opensky_day(hex_id, day.isoformat(), since)
        if kept is None:
            missing.append(day)
        else:
            found += kept
    pairs = []
    while missing:
        pair = [d for d in missing[:DAYS_PER_CALL] if (d - missing[0]).days < DAYS_PER_CALL]
        missing = missing[len(pair) :]
        pairs.append(pair)
    unread = 0
    if pairs and ask:
        with ThreadPoolExecutor(max_workers=min(WORKERS, len(pairs))) as pool:
            for pair, listed in zip(pairs, pool.map(lambda p: _ask_pair(hex_id, p), pairs)):
                if listed is None:
                    unread += len(pair)
                else:
                    found += listed
    else:
        unread = sum(len(p) for p in pairs)
    return [_with_path(f, store.opensky_path(hex_id, f["id"], since)) for f in _once(found)], unread


def _path(hex_id: str, flight_id: int, timeout: float) -> list[dict] | None:
    """A flight's path, kept KEEP_S in the store (an empty one too), else
    asked of OpenSky within `timeout`; None where it could not be had."""
    path = store.opensky_path(hex_id, flight_id, _wall() - KEEP_S)
    if path is not None:
        return path
    try:
        answer = _get("/tracks/all", {"icao24": hex_id, "time": flight_id}, "tracks", timeout)
    except _Unread:
        return None
    path = [
        {
            "t": float(p[0]),
            "lat": float(p[1]),
            "lon": float(p[2]),
            # Its barometric altitude, metres; none on the ground.
            "alt_ft": None if p[5] or p[3] is None else round(float(p[3]) * M_TO_FT),
            "gs_kt": None,
            "track_deg": _number(p[4]),
            "vrate_fpm": None,
        }
        for p in (answer or {}).get("path") or []
        if isinstance(p, list) and len(p) >= 6 and _number(p[1]) is not None and _number(p[2]) is not None
    ]
    store.opensky_keep_path(hex_id, flight_id, path, _wall())
    return path


def track(hex_id: str, flight_id: int, now: float) -> list[dict] | None:
    """A flight's path from OpenSky as a past flight's points ({"t", "lat",
    "lon", "alt_ft" (None on the ground), "gs_kt", "track_deg",
    "vrate_fpm"}), where it is TRACK_DAYS old at the most; None where it
    cannot be had within TRACK_TIMEOUT_S. One being asked ahead (`warm`) is
    waited for, not asked twice; one still queued behind other cards' is
    taken out of the queue and asked now, as the pilot's tap waited up to
    TRACK_TIMEOUT_S on a request that had not started."""
    if now - flight_id > TRACK_DAYS * 86400 or not on():
        return None
    with _ASKING_LOCK:
        asking = _ASKING.get((hex_id, flight_id))
    if asking is not None and not asking.cancel():
        try:
            return asking.result(timeout=TRACK_TIMEOUT_S) or None
        except FutureTimeout:
            return None
    return _path(hex_id, flight_id, TRACK_TIMEOUT_S) or None


def warm(hex_id: str, flights: list[dict], now: float) -> None:
    """The paths of the newest WARM_FLIGHTS of these (a card's list, newest
    first) that OpenSky gave and none is kept for, asked in the background,
    WARM_WORKERS at a time, so the one a pilot opens is mostly kept by then."""
    since = _wall() - KEEP_S
    for flight in [f for f in flights if f.get("source") == OPENSKY_SOURCE][:WARM_FLIGHTS]:
        key = (hex_id, flight["id"])
        if now - flight["id"] > TRACK_DAYS * 86400 or store.opensky_path(hex_id, flight["id"], since) is not None:
            continue
        with _ASKING_LOCK:
            if key in _ASKING:
                continue
            if len(_ASKING) >= WARM_MOST:
                return
            _ASKING[key] = asking = _WARM_POOL.submit(_path, hex_id, flight["id"], TIMEOUT_S)
        # Outside the lock: a callback on a future already done runs at once.
        asking.add_done_callback(lambda _done, key=key: _forget(key))


def _forget(key: tuple[str, int]) -> None:
    with _ASKING_LOCK:
        _ASKING.pop(key, None)
