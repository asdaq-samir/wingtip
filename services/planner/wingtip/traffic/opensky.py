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

from cachetools import TTLCache

from .. import airports
from ..geo import distance_nm
from ..units import M_TO_FT
from .legs import FIELD_APPROACH_NM, _field_at
from .common import _number, _wall
from .opensky_api import DAILY_CREDITS, _get, _left, _Unread, on

log = logging.getLogger(__name__)

#: Its credit, as the card says where a flight came from it.
OPENSKY_SOURCE = "OpenSky Network"
#: `/flights/aircraft`'s longest interval, days.
DAYS_PER_CALL = 2
#: How far back `/tracks/all` goes, days.
TRACK_DAYS = 30
#: A past day's flights and a past flight's path no longer change, s: a
#: day and a bit, so the night's prefetch lasts until the next.
KEEP_S = 26 * 3600
#: The followed airplanes' yesterday asked for once a UTC day from this
#: hour, after OpenSky's batch at night has built it, and their paths with
#: it (prefetch): their flights then open at once. At most this share of
#: the day's credits, the rest left to the pilots' own asks.
PREFETCH_FROM_HOUR_UTC = 6
PREFETCH_SHARE = 0.5
PREFETCH_EVERY_S = 3600.0
_PREFETCHED: dict[str, dt.date | None] = {"day": None}

_FLIGHTS: TTLCache = TTLCache(maxsize=2048, ttl=KEEP_S)
_TRACKS: TTLCache = TTLCache(maxsize=512, ttl=KEEP_S)


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


def flights(hex_id: str, days: list[dt.date], today: dt.date) -> tuple[list[dict], int]:
    """An airplane's flights on these UTC days, from OpenSky, oldest first,
    and how many of the days could not be had: today's never (its batch
    runs at night), two days to a call, each pair kept KEEP_S."""
    wanted = sorted(d for d in set(days) if d < today)
    found: list[dict] = []
    unread = 0
    while wanted:
        pair = [d for d in wanted[:DAYS_PER_CALL] if (d - wanted[0]).days < DAYS_PER_CALL]
        wanted = wanted[len(pair) :]
        key = (hex_id, pair[0], pair[-1])
        if key not in _FLIGHTS:
            begin = int(dt.datetime.combine(pair[0], dt.time(), dt.timezone.utc).timestamp())
            end = int(dt.datetime.combine(pair[-1] + dt.timedelta(days=1), dt.time(), dt.timezone.utc).timestamp()) - 1
            try:
                answer = _get("/flights/aircraft", {"icao24": hex_id, "begin": begin, "end": end}, "flights")
            except _Unread:
                unread += len(pair)
                continue
            _FLIGHTS[key] = _once([f for f in (_flight(e) for e in answer or [] if isinstance(e, dict)) if f is not None])
        found += [_with_path(f, _TRACKS.get((hex_id, f["id"]))) for f in _FLIGHTS[key]]
    return sorted(found, key=lambda f: f["id"]), unread


def track(hex_id: str, flight_id: int, now: float) -> list[dict] | None:
    """A flight's path from OpenSky as a past flight's points ({"t", "lat",
    "lon", "alt_ft" (None on the ground), "gs_kt", "track_deg",
    "vrate_fpm"}), where it is TRACK_DAYS old at the most; None where it
    cannot be had."""
    if now - flight_id > TRACK_DAYS * 86400 or not on():
        return None
    key = (hex_id, flight_id)
    if key not in _TRACKS:
        try:
            answer = _get("/tracks/all", {"icao24": hex_id, "time": flight_id}, "tracks")
        except _Unread:
            return None
        path = (answer or {}).get("path") or []
        _TRACKS[key] = [
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
            for p in path
            if isinstance(p, list) and len(p) >= 6 and _number(p[1]) is not None and _number(p[2]) is not None
        ]
    return _TRACKS[key] or None


def prefetch() -> int:
    """The followed airplanes' flights of yesterday and their paths asked
    for once a UTC day, from PREFETCH_FROM_HOUR_UTC, within PREFETCH_SHARE
    of the day's credits, so their cards' flights open at once: the planner's
    job every PREFETCH_EVERY_S (app.main). How many paths were read."""
    from .recorded import followed

    now = dt.datetime.now(dt.timezone.utc)
    today = now.date()
    if not on() or now.hour < PREFETCH_FROM_HOUR_UTC or _PREFETCHED["day"] == today:
        return 0
    _PREFETCHED["day"] = today
    yesterday = today - dt.timedelta(days=1)
    read = 0
    for hex_id in followed():
        if _spent_share("flights") >= PREFETCH_SHARE or _spent_share("tracks") >= PREFETCH_SHARE:  # OpenSky's own count
            break
        found, _ = flights(hex_id, [yesterday], today)
        for flight in found:
            read += track(hex_id, flight["id"], _wall()) is not None
    log.info("OpenSky prefetch: %d paths of %d followed airplanes", read, len(followed()))
    return read


def _spent_share(family: str) -> float:
    """The share of the family's day spent, by OpenSky's own count; none known, none spent."""
    left = _left(family)
    return 0.0 if left is None else 1 - left / DAILY_CREDITS
