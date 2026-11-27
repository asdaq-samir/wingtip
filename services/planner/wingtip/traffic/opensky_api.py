"""The OpenSky Network's REST API as the planner asks it (wingtip.traffic.opensky):
its OAuth2 token, and each family's credits as OpenSky counts them, a
refusal waited out (openskynetwork.github.io/opensky-api/rest.html, read
2026-11-27)."""

from __future__ import annotations

import datetime as dt
import logging

import threading

import requests

from .. import outside, ratelimit
from ..config import get_settings
from .common import HEADERS, _LOCK, _clock, _number

log = logging.getLogger(__name__)

TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
API = "https://opensky-network.org/api"
#: A standard account's credits a day, each of the flights and the tracks
#: (the REST page's table). What is left is OpenSky's own count, its
#: X-Rate-Limit-Remaining on each answer: a count kept here began again at
#: each restart, and older days cost more than the table's 30 (1,120 of
#: 4,000 were left on 2026-11-27 where the planner had counted far fewer).
DAILY_CREDITS = 4000
#: Credits kept back from the pilots' own asks for the next of them.
RESERVE = 200
#: The longest it is left alone after a 429, s: a track older than this
#: account may have answered 429 with a wait of 292 years (N654FL's of
#: 4 Nov, 2026-11-27), so the family is asked again the next day.
REFUSED_MOST_S = 86400.0
#: How long one of its answers may take, s: a track took longer than the
#: 5 s the live feeds are given (N570GJ's, 2026-11-27).
TIMEOUT_S = 20.0
#: How long a flight list may take, s: a pilot's card waits on it, and
#: the days OpenSky does not answer in time are counted as not read.
FLIGHTS_TIMEOUT_S = 8.0
_TOKEN = {"value": None, "until": 0.0}
#: One token asked for at a time: the days asked side by side
#: (flights.history) all want one at once.
_TOKEN_LOCK = threading.Lock()
#: Each family's gate (wingtip.ratelimit): OpenSky's own count of what is
#: left, and a refusal's wait.
_BUDGET: dict[str, ratelimit.Gate] = {
    "flights": ratelimit.Gate(hold_most_s=REFUSED_MOST_S, reserve=RESERVE),
    "tracks": ratelimit.Gate(hold_most_s=REFUSED_MOST_S, reserve=RESERVE),
}


class _Unread(Exception):
    """OpenSky is off, out of the day's credits, or did not answer."""


def on() -> bool:
    settings = get_settings()
    return bool(settings.opensky_client_id and settings.opensky_client_secret)


def _token() -> str:
    """A bearer token, asked again a minute before the last runs out; one
    caller asks, the rest wait for it and are given it."""
    with _TOKEN_LOCK:
        with _LOCK:
            if _TOKEN["value"] and _clock() < _TOKEN["until"] - 60:
                return _TOKEN["value"]
        settings = get_settings()
        resp = outside.live_post(
            TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.opensky_client_id,
                "client_secret": settings.opensky_client_secret,
            },
            headers=HEADERS,
            timeout=TIMEOUT_S,
        )
        resp.raise_for_status()
        answer = resp.json()
        with _LOCK:
            _TOKEN["value"] = answer["access_token"]
            _TOKEN["until"] = _clock() + float(answer.get("expires_in") or 1800)
            return _TOKEN["value"]


def _today() -> dt.date:
    return dt.datetime.now(dt.timezone.utc).date()


def _left(family: str) -> int | None:
    """OpenSky's count of the family's credits left today, where it said one today."""
    return _BUDGET[family].remaining(_today())


def _get(path: str, params: dict, family: str, timeout: float = TIMEOUT_S):
    """OpenSky's answer, None for its 404 (nothing found); _Unread where it
    is off, refused it lately, has fewer than RESERVE credits left, or does
    not answer within `timeout`."""
    if not on():
        raise _Unread("OpenSky is not set up")
    gate = _BUDGET[family]
    if gate.held(_clock()):
        raise _Unread(f"OpenSky refused its {family} lately")
    if gate.spent(_today()):
        raise _Unread(f"OpenSky's {family} credits for the day are spent")
    try:
        token = _token()
        resp = outside.live_get(f"{API}{path}", params=params, headers={**HEADERS, "Authorization": f"Bearer {token}"}, timeout=timeout)
        gate.counted(_number(resp.headers.get("X-Rate-Limit-Remaining")), _today())
        if resp.status_code == 429:
            gate.hold(_number(resp.headers.get("X-Rate-Limit-Retry-After-Seconds")) or 60.0, _clock())
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()
    except (requests.RequestException, ValueError, KeyError) as err:
        log.info("OpenSky did not answer %s: %s", path, err)
        raise _Unread(str(err)) from err
