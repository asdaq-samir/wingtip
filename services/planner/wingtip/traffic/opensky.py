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

import requests
from cachetools import TTLCache

from .. import airports
from ..config import get_settings
from ..units import M_TO_FT
from .common import HEADERS, _LOCK, _clock, _number

log = logging.getLogger(__name__)

TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
API = "https://opensky-network.org/api"
#: Its credit, as the card says where a flight came from it.
OPENSKY_SOURCE = "OpenSky Network"
#: `/flights/aircraft`'s longest interval, days.
DAYS_PER_CALL = 2
#: How far back `/tracks/all` goes, days.
TRACK_DAYS = 30
#: Credits a day each of the flights and the tracks may spend, short of a
#: standard account's 4,000 a family: a 1-2 day flights call costs 30, a
#: track 4 (the REST page's table). Counted here from the UTC day's start.
DAILY_CREDITS = 3600
FLIGHTS_COST, TRACK_COST = 30, 4
#: How long one of its answers may take, s: a track took longer than the
#: 5 s the live feeds are given (N570GJ's, 2026-11-27).
TIMEOUT_S = 20.0
#: A past day's flights and a past flight's path no longer change, s.
KEEP_S = 12 * 3600

_TOKEN = {"value": None, "until": 0.0}
_SPENT: dict[str, list] = {"flights": [None, 0], "tracks": [None, 0]}
_FLIGHTS: TTLCache = TTLCache(maxsize=2048, ttl=KEEP_S)
_TRACKS: TTLCache = TTLCache(maxsize=512, ttl=KEEP_S)


class _Unread(Exception):
    """OpenSky is off, out of the day's credits, or did not answer."""


def on() -> bool:
    settings = get_settings()
    return bool(settings.opensky_client_id and settings.opensky_client_secret)


def _token() -> str:
    """A bearer token, asked again a minute before the last runs out."""
    with _LOCK:
        if _TOKEN["value"] and _clock() < _TOKEN["until"] - 60:
            return _TOKEN["value"]
    settings = get_settings()
    resp = requests.post(
        TOKEN_URL,
        data={"grant_type": "client_credentials", "client_id": settings.opensky_client_id, "client_secret": settings.opensky_client_secret},
        headers=HEADERS,
        timeout=TIMEOUT_S,
    )
    resp.raise_for_status()
    answer = resp.json()
    with _LOCK:
        _TOKEN["value"] = answer["access_token"]
        _TOKEN["until"] = _clock() + float(answer.get("expires_in") or 1800)
        return _TOKEN["value"]


def _spend(family: str, credits: int) -> None:
    """The day's credits of `family` counted, or _Unread past DAILY_CREDITS."""
    today = dt.datetime.now(dt.timezone.utc).date()
    with _LOCK:
        day, spent = _SPENT[family]
        spent = spent if day == today else 0
        if spent + credits > DAILY_CREDITS:
            raise _Unread(f"OpenSky's {family} credits for the day are spent")
        _SPENT[family] = [today, spent + credits]


def _get(path: str, params: dict, family: str, credits: int):
    """OpenSky's answer, None for its 404 (nothing found); _Unread where it
    is off, out of credits or does not answer."""
    if not on():
        raise _Unread("OpenSky is not set up")
    _spend(family, credits)
    try:
        resp = requests.get(f"{API}{path}", params=params, headers={**HEADERS, "Authorization": f"Bearer {_token()}"}, timeout=TIMEOUT_S)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()
    except (requests.RequestException, ValueError, KeyError) as err:
        log.info("OpenSky did not answer %s: %s", path, err)
        raise _Unread(str(err)) from err


def _field(icao: str | None) -> dict | None:
    """A field OpenSky names by its ICAO ident, as `history` names its ends."""
    if not icao:
        return None
    place = airports.find_place(icao)
    if place is None:
        return {"ident": icao, "name": None, "city": None, "region": None}
    return {"ident": place["ident"], "name": place.get("name"), "city": place.get("municipality"), "region": place.get("region")}


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
                answer = _get("/flights/aircraft", {"icao24": hex_id, "begin": begin, "end": end}, "flights", FLIGHTS_COST)
            except _Unread:
                unread += len(pair)
                continue
            _FLIGHTS[key] = [f for f in (_flight(e) for e in answer or [] if isinstance(e, dict)) if f is not None]
        found += _FLIGHTS[key]
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
            answer = _get("/tracks/all", {"icao24": hex_id, "time": flight_id}, "tracks", TRACK_COST)
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
