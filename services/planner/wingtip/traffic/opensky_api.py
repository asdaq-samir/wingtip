"""The OpenSky Network's REST API as the planner asks it (wingtip.traffic.opensky):
its OAuth2 token, and each family's credits as OpenSky counts them, a
refusal waited out (openskynetwork.github.io/opensky-api/rest.html, read
2026-11-27)."""

from __future__ import annotations

import datetime as dt
import logging

import requests

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
_TOKEN = {"value": None, "until": 0.0}
#: Each family's {"left": OpenSky's remaining count and when it said it,
#: "until": when a refusal's wait ends}.
_BUDGET: dict[str, dict] = {"flights": {"left": None, "until": 0.0}, "tracks": {"left": None, "until": 0.0}}


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


def _left(family: str) -> int | None:
    """OpenSky's count of the family's credits left today, where it said one today."""
    today = dt.datetime.now(dt.timezone.utc).date()
    with _LOCK:
        left = _BUDGET[family]["left"]
    return left[0] if left and left[1] == today else None


def _get(path: str, params: dict, family: str):
    """OpenSky's answer, None for its 404 (nothing found); _Unread where it
    is off, refused it lately, has fewer than RESERVE credits left, or does
    not answer."""
    if not on():
        raise _Unread("OpenSky is not set up")
    with _LOCK:
        if _clock() < _BUDGET[family]["until"]:
            raise _Unread(f"OpenSky refused its {family} lately")
    left = _left(family)
    if left is not None and left < RESERVE:
        raise _Unread(f"OpenSky's {family} credits for the day are spent")
    try:
        resp = requests.get(f"{API}{path}", params=params, headers={**HEADERS, "Authorization": f"Bearer {_token()}"}, timeout=TIMEOUT_S)
        remaining = _number(resp.headers.get("X-Rate-Limit-Remaining"))
        if remaining is not None:
            with _LOCK:
                _BUDGET[family]["left"] = (int(remaining), dt.datetime.now(dt.timezone.utc).date())
        if resp.status_code == 429:
            wait = _number(resp.headers.get("X-Rate-Limit-Retry-After-Seconds")) or 60.0
            with _LOCK:
                _BUDGET[family]["until"] = _clock() + min(wait, REFUSED_MOST_S)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()
    except (requests.RequestException, ValueError, KeyError) as err:
        log.info("OpenSky did not answer %s: %s", path, err)
        raise _Unread(str(err)) from err
