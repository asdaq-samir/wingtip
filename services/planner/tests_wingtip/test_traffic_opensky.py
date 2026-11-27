"""wingtip.traffic.opensky: an airplane's past flights and a flight's path
from the OpenSky Network where adsb.lol's archive is closed to the planner."""

import datetime as dt
from unittest.mock import Mock

import pytest
from cachetools import TTLCache

from wingtip import airports
from wingtip.config import get_settings
from wingtip.traffic import opensky, opensky_api

TODAY = dt.date(2026, 11, 27)


def _resp(code, body=None, headers=None):
    resp = Mock(status_code=code, headers=headers or {})
    resp.json = Mock(return_value=body)
    resp.raise_for_status = Mock(side_effect=opensky_api.requests.HTTPError(str(code)) if code >= 400 and code != 404 else None)
    return resp


@pytest.fixture
def sky(monkeypatch):
    """OpenSky set up, nothing kept or spent, its token given, every GET recorded."""
    monkeypatch.setenv("OPENSKY_CLIENT_ID", "id")
    monkeypatch.setenv("OPENSKY_CLIENT_SECRET", "secret")
    get_settings.cache_clear()
    monkeypatch.setattr(opensky, "_FLIGHTS", TTLCache(maxsize=16, ttl=60))
    monkeypatch.setattr(opensky, "_TRACKS", TTLCache(maxsize=16, ttl=60))
    monkeypatch.setattr(opensky_api, "_BUDGET", {"flights": {"left": None, "until": 0.0}, "tracks": {"left": None, "until": 0.0}})
    monkeypatch.setattr(opensky_api, "_TOKEN", {"value": None, "until": 0.0})
    monkeypatch.setattr(opensky_api.requests, "post", lambda *a, **k: _resp(200, {"access_token": "t", "expires_in": 1800}))
    places = {
        "KORD": {
            "ident": "KORD",
            "name": "Chicago O'Hare Intl",
            "municipality": "Chicago",
            "region": "US-IL",
            "lat": 41.9786,
            "lon": -87.9048,
        },
        "Y89": {"ident": "Y89", "name": "Kalkaska City", "municipality": "Kalkaska", "region": "US-MI", "lat": 44.7255, "lon": -85.2034},
    }
    monkeypatch.setattr(airports, "find_place", lambda ident: places.get(ident))
    asked = []
    yield asked
    get_settings.cache_clear()


def test_an_airplanes_flights_two_days_to_a_call_never_today_named_by_their_fields(sky, monkeypatch):
    flight = {
        "icao24": "a74f08",
        "firstSeen": 1795600000,
        "lastSeen": 1795606000,
        "estDepartureAirport": "KDEN",
        "estArrivalAirport": "KORD",
    }
    monkeypatch.setattr(opensky_api.requests, "get", lambda url, params, **k: sky.append(params) or _resp(200, [flight]))
    days = [TODAY - dt.timedelta(days=n) for n in range(0, 4)]
    found, unread = opensky.flights("a74f08", days, TODAY)
    # Three past days, today left to its batch at night: two calls, each of two days at the most.
    assert len(sky) == 2 and all(p["end"] - p["begin"] < 2 * 86400 for p in sky)
    assert unread == 0
    assert found[0]["destination"] == {"ident": "KORD", "name": "Chicago O'Hare Intl", "city": "Chicago", "region": "US-IL"}
    assert found[0]["origin"]["ident"] == "KDEN" and found[0]["max_alt_ft"] is None and found[0]["source"] == "OpenSky Network"
    # Kept: asked again, nothing asked of OpenSky.
    opensky.flights("a74f08", days, TODAY)
    assert len(sky) == 2


def test_off_unanswered_or_out_of_credits_its_days_are_unread(sky, monkeypatch):
    def refused(*a, **k):
        raise opensky_api.requests.ConnectionError("down")

    monkeypatch.setattr(opensky_api.requests, "get", refused)
    assert opensky.flights("a74f08", [TODAY - dt.timedelta(days=1)], TODAY) == ([], 1)
    # OpenSky's own count under the reserve: not asked.
    today = dt.datetime.now(dt.timezone.utc).date()
    opensky_api._BUDGET["flights"]["left"] = (opensky_api.RESERVE - 1, today)
    monkeypatch.setattr(opensky_api.requests, "get", lambda *a, **k: pytest.fail("asked past the day's credits"))
    assert opensky.flights("a74f08", [TODAY - dt.timedelta(days=3)], TODAY) == ([], 1)
    monkeypatch.delenv("OPENSKY_CLIENT_ID")
    get_settings.cache_clear()
    assert not opensky.on()


def test_a_flights_path_in_feet_none_on_the_ground_within_thirty_days(sky, monkeypatch):
    path = [[1795600000, 39.86, -104.67, None, 0.0, True], [1795600600, 40.5, -100.0, 10000.0, 80.0, False]]
    monkeypatch.setattr(opensky_api.requests, "get", lambda url, params, **k: _resp(200, {"path": path}))
    points = opensky.track("a74f08", 1795600000, 1795600000 + 3600)
    assert [p["alt_ft"] for p in points] == [None, 32808]
    assert opensky.track("a74f08", 1795600000, 1795600000 + 31 * 86400) is None


def test_a_flights_ends_and_highest_from_its_path_once_read_a_guess_it_does_not_reach_dropped(sky, monkeypatch):
    # OpenSky guessed Y89 for a flight whose path ends at O'Hare (N570GJ, 2026-11-27).
    flight = {
        "icao24": "a74f08",
        "firstSeen": 1795600000,
        "lastSeen": 1795606000,
        "estDepartureAirport": "KORD",
        "estArrivalAirport": "Y89",
    }
    path = [
        [1795600000, 41.98, -87.90, None, 90.0, True],
        [1795603000, 43.0, -86.5, 9000.0, 45.0, False],
        [1795606000, 41.6, -87.4, 3000.0, 270.0, False],
    ]
    monkeypatch.setattr(opensky_api.requests, "get", lambda url, params, **k: _resp(200, {"path": path} if "tracks" in url else [flight]))
    monkeypatch.setattr(opensky, "_field_at", lambda point, landing: None)
    before, _ = opensky.flights("a74f08", [TODAY - dt.timedelta(days=1)], TODAY)
    # Before its path is read: the estimate, no highest, nothing private sent.
    assert before[0]["destination"]["ident"] == "Y89" and before[0]["max_alt_ft"] is None and "_at" not in before[0]["origin"]
    opensky.track("a74f08", 1795600000, 1795600000 + 86400)
    after, _ = opensky.flights("a74f08", [TODAY - dt.timedelta(days=1)], TODAY)
    # Its path starts at O'Hare, the guess kept; it ends far from Y89, the guess dropped.
    assert after[0]["origin"]["ident"] == "KORD" and after[0]["destination"] is None and not after[0]["landed"]
    assert after[0]["max_alt_ft"] == 29528


def test_the_followed_airplanes_yesterday_prefetched_once_a_day_after_the_batch(sky, monkeypatch):
    from wingtip.traffic import recorded

    flight = {
        "icao24": "a74f08",
        "firstSeen": 1795600000,
        "lastSeen": 1795606000,
        "estDepartureAirport": "KORD",
        "estArrivalAirport": "KORD",
    }
    monkeypatch.setattr(
        opensky_api.requests, "get", lambda url, params, **k: sky.append(url) or _resp(200, {"path": []} if "tracks" in url else [flight])
    )
    monkeypatch.setattr(recorded, "followed", lambda: ["a74f08"])
    monkeypatch.setattr(opensky, "_PREFETCHED", {"day": None})
    monkeypatch.setattr(opensky, "PREFETCH_FROM_HOUR_UTC", 0)
    opensky.prefetch()
    assert sum("flights" in u for u in sky) == 1 and sum("tracks" in u for u in sky) == 1
    opensky.prefetch()
    assert len(sky) == 2


def test_a_flight_listed_twice_is_listed_once_and_a_refusal_waits_a_day_at_the_most(sky, monkeypatch):
    twice = [
        {"firstSeen": 1793826721, "lastSeen": 1793832400, "estDepartureAirport": "KORD", "estArrivalAirport": "KORD"},
        {"firstSeen": 1793826729, "lastSeen": 1793832400, "estDepartureAirport": "KORD", "estArrivalAirport": None},
    ]
    monkeypatch.setattr(opensky_api.requests, "get", lambda url, params, **k: _resp(200, twice, {"X-Rate-Limit-Remaining": "3970"}))
    found, _ = opensky.flights("a89c1e", [TODAY - dt.timedelta(days=1)], TODAY)
    assert [f["id"] for f in found] == [1793826721] and opensky_api._left("flights") == 3970
    # A track refused with a wait of 292 years: not asked again for a day.
    asked = []
    refused = {"X-Rate-Limit-Retry-After-Seconds": "9223372036"}
    monkeypatch.setattr(opensky_api.requests, "get", lambda url, params, **k: asked.append(url) or _resp(429, None, refused))
    assert opensky.track("a89c1e", 1793826721, 1793826721 + 86400) is None
    assert opensky.track("a89c1e", 1793826721 + 1, 1793826721 + 86400) is None
    assert len(asked) == 1 and opensky_api._BUDGET["tracks"]["until"] - opensky_api._clock() <= opensky_api.REFUSED_MOST_S
