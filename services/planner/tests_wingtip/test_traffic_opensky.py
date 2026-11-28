"""wingtip.traffic.opensky: an airplane's past flights and a flight's path
from the OpenSky Network where adsb.lol's archive is closed to the planner."""

import datetime as dt
from unittest.mock import Mock

import pytest

from wingtip import airports, ratelimit
from wingtip.config import get_settings
from wingtip.traffic import opensky, opensky_api, opensky_prefetch

TODAY = dt.date(2026, 11, 27)


def _resp(code, body=None, headers=None):
    resp = Mock(status_code=code, headers=headers or {})
    resp.json = Mock(return_value=body)
    resp.raise_for_status = Mock(side_effect=opensky_api.requests.HTTPError(str(code)) if code >= 400 and code != 404 else None)
    return resp


@pytest.fixture
def sky(monkeypatch):
    """OpenSky set up, nothing kept (the live store is the test's own) or spent, its token given, every GET recorded."""
    monkeypatch.setenv("OPENSKY_CLIENT_ID", "id")
    monkeypatch.setenv("OPENSKY_CLIENT_SECRET", "secret")
    get_settings.cache_clear()
    gate = {"hold_most_s": opensky_api.REFUSED_MOST_S, "reserve": opensky_api.RESERVE}
    monkeypatch.setattr(opensky_api, "_BUDGET", {"flights": ratelimit.Gate(**gate), "tracks": ratelimit.Gate(**gate)})
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
    opensky_api._BUDGET["flights"].counted(opensky_api.RESERVE - 1, today)
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
    monkeypatch.setattr(opensky_prefetch, "_PREFETCHED", {"day": None})
    monkeypatch.setattr(opensky_prefetch, "PREFETCH_FROM_HOUR_UTC", 0)
    opensky_prefetch.prefetch()
    assert sum("flights" in u for u in sky) == 1 and sum("tracks" in u for u in sky) == 1
    opensky_prefetch.prefetch()
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
    assert len(asked) == 1 and opensky_api._BUDGET["tracks"].until - opensky_api._clock() <= opensky_api.REFUSED_MOST_S


def test_days_kept_one_by_one_in_the_store_so_a_next_page_and_ingests_prefetch_ask_for_none(sky, monkeypatch):
    from wingtip.traffic import store

    asked = []
    monkeypatch.setattr(opensky_api.requests, "get", lambda url, params, timeout, **k: asked.append(timeout) or _resp(200, []))
    opensky.flights("a74f08", [TODAY - dt.timedelta(days=n) for n in range(1, 5)], TODAY)
    # Four days, two pairs asked side by side, each held to the flight list's time.
    assert asked == [opensky_api.FLIGHTS_TIMEOUT_S] * 2
    # The next page, a day further back: the three days kept, the fifth asked alone.
    opensky.flights("a74f08", [TODAY - dt.timedelta(days=n) for n in range(2, 6)], TODAY)
    assert len(asked) == 3
    # A day ingest's prefetch kept is read, not asked.
    store.opensky_keep_day("a74f08", (TODAY - dt.timedelta(days=7)).isoformat(), [], opensky._wall())
    assert opensky.flights("a74f08", [TODAY - dt.timedelta(days=7)], TODAY) == ([], 0)
    # An airplane's base: what is kept alone, a day not kept unread, nothing asked.
    assert opensky.flights("a74f08", [TODAY - dt.timedelta(days=9)], TODAY, ask=False) == ([], 1)
    assert len(asked) == 3


def test_a_cards_newest_paths_asked_ahead_once_and_an_open_waits_for_the_one_being_asked(sky, monkeypatch):
    import threading

    from wingtip.traffic import store

    let_go, asked = threading.Event(), []

    def slow(url, params, timeout, **k):
        asked.append((params["time"], timeout))
        let_go.wait(5)
        return _resp(200, {"path": [[params["time"], 41.98, -87.90, 3000.0, 90.0, False]]})

    monkeypatch.setattr(opensky_api.requests, "get", slow)
    listed = [{"id": 1795600000 - n * 86400, "source": opensky.OPENSKY_SOURCE} for n in range(5)]
    now = 1795600000 + 3600
    opensky.warm("a74f08", listed, now)
    opensky.warm("a74f08", listed, now)
    # The pilot opens the newest while it is being asked: waited for, not asked again.
    opened = threading.Thread(target=lambda: asked.append(opensky.track("a74f08", 1795600000, now)))
    opened.start()
    let_go.set()
    opened.join(5)
    for f in listed[:3]:
        for _ in range(50):
            if store.opensky_path("a74f08", f["id"], 0) is not None:
                break
            threading.Event().wait(0.02)
    gets = [a for a in asked if isinstance(a, tuple)]
    # The newest three only, once each, with the background's longer time.
    assert sorted(t for t, _ in gets) == sorted(f["id"] for f in listed[:3])
    assert all(timeout == opensky_api.TIMEOUT_S for _, timeout in gets)
    assert [p["alt_ft"] for p in asked[-1]] == [9843]


def test_an_open_whose_path_is_still_queued_is_asked_at_once_and_the_queue_is_capped(sky, monkeypatch):
    """Round 4's audit: a pilot's tap waited up to TRACK_TIMEOUT_S on a path
    queued behind other cards' (3 workers, every card adding 3)."""
    import threading
    from concurrent.futures import ThreadPoolExecutor

    let_go, asked = threading.Event(), []

    def get(url, params, timeout, **k):
        asked.append((params["icao24"], params["time"], timeout))
        if params["icao24"] != "a00001":
            let_go.wait(5)
        return _resp(200, {"path": [[params["time"], 41.98, -87.90, 3000.0, 90.0, False]]})

    monkeypatch.setattr(opensky_api.requests, "get", get)
    monkeypatch.setattr(opensky, "_WARM_POOL", ThreadPoolExecutor(max_workers=opensky.WARM_WORKERS))
    monkeypatch.setattr(opensky, "_ASKING", {})
    now = 1795600000 + 3600
    for card in range(5):
        hex_id = f"a0000{card}"
        opensky.warm(hex_id, [{"id": 1795600000 - n * 86400, "source": opensky.OPENSKY_SOURCE} for n in range(3)], now)
    # The first card's three hold the workers; the second's wait, the third's
    # fill the queue to WARM_MOST and the last two cards' ask none ahead.
    assert len(opensky._ASKING) == opensky.WARM_MOST
    assert not any(key[0] in ("a00003", "a00004") for key in opensky._ASKING)
    path = opensky.track("a00001", 1795600000, now)
    assert path and path[0]["alt_ft"] == 9843
    # Asked directly with a pilot's time, never by the cancelled background ask.
    assert [a for a in asked if a[0] == "a00001"] == [("a00001", 1795600000, opensky_api.TRACK_TIMEOUT_S)]
    let_go.set()
    opensky._WARM_POOL.shutdown(wait=True)


def test_a_prefetch_that_could_not_read_a_path_leaves_the_day_for_the_next_run(sky, monkeypatch):
    from wingtip.traffic import recorded

    flight = {"firstSeen": 1795600000, "lastSeen": 1795606000, "estDepartureAirport": "KORD", "estArrivalAirport": "KORD"}

    def tracks_down(url, params, **k):
        sky.append(url)
        if "tracks" in url:
            raise opensky_api.requests.ConnectionError("down")
        return _resp(200, [flight])

    monkeypatch.setattr(opensky_api.requests, "get", tracks_down)
    monkeypatch.setattr(recorded, "followed", lambda: ["a74f08"])
    monkeypatch.setattr(opensky_prefetch, "_PREFETCHED", {"day": None})
    monkeypatch.setattr(opensky_prefetch, "PREFETCH_FROM_HOUR_UTC", 0)
    assert opensky_prefetch.prefetch() == 0 and opensky_prefetch._PREFETCHED["day"] is None
    # The next run: the day's flights read from the store, the path asked again, the day done.
    monkeypatch.setattr(opensky_api.requests, "get", lambda url, params, **k: sky.append(url) or _resp(200, {"path": []}))
    assert opensky_prefetch.prefetch() == 1 and opensky_prefetch._PREFETCHED["day"] is not None
    assert sum("flights" in u for u in sky) == 1 and sum("tracks" in u for u in sky) == 2


def test_a_cards_days_are_asked_two_pairs_at_once_at_the_most_the_newest_first(sky, monkeypatch):
    import threading
    import time

    lock = threading.Lock()
    flying = {"now": 0, "most": 0}

    def get(url, params, **k):
        with lock:
            sky.append(params["begin"])
            flying["now"] += 1
            flying["most"] = max(flying["most"], flying["now"])
        time.sleep(0.05)
        with lock:
            flying["now"] -= 1
        return _resp(200, [])

    monkeypatch.setattr(opensky_api.requests, "get", get)
    # A card's fourteen days, seven pairs: seven at once were all refused.
    found, unread = opensky.flights("a74f08", [TODAY - dt.timedelta(days=n) for n in range(1, 15)], TODAY)
    assert (found, unread) == ([], 0) and len(sky) == 7
    assert flying["most"] <= opensky.WORKERS == 2
    assert sky[0] == max(sky)


def test_a_429_holds_opensky_for_its_wait_asks_nothing_more_and_keeps_what_was_answered(sky, monkeypatch):
    from wingtip.traffic import store

    newest = {"firstSeen": 1795600000, "lastSeen": 1795606000, "estDepartureAirport": "KORD", "estArrivalAirport": "KORD"}
    monkeypatch.setattr(opensky, "WORKERS", 1)

    def get(url, params, **k):
        sky.append(params["begin"])
        # The newest pair answered, the next refused with HTTP's own wait.
        return _resp(200, [newest]) if len(sky) == 1 else _resp(429, None, {"Retry-After": "120"})

    monkeypatch.setattr(opensky_api.requests, "get", get)
    days = [TODAY - dt.timedelta(days=n) for n in range(1, 9)]
    found, unread = opensky.flights("a74f08", days, TODAY)
    # Two asked, the two pairs after the refusal not sent: their six days unread.
    assert len(sky) == 2 and unread == 6
    assert [f["id"] for f in found] == [1795600000]
    held = opensky_api._BUDGET["flights"].until - opensky_api._clock()
    assert 110 < held <= 120
    # The answered days are kept; asked again inside the hold, OpenSky is asked nothing.
    assert store.opensky_day("a74f08", (TODAY - dt.timedelta(days=1)).isoformat(), 0) is not None
    found, unread = opensky.flights("a74f08", days, TODAY)
    assert len(sky) == 2 and unread == 6 and [f["id"] for f in found] == [1795600000]


def test_a_429_with_no_wait_named_holds_a_minute():
    assert opensky_api._refused_s({}) == opensky_api.REFUSED_S
    assert opensky_api._refused_s({"Retry-After": "Fri, 27 Nov 2026 12:00:00 GMT"}) == opensky_api.REFUSED_S
    assert opensky_api._refused_s({"X-Rate-Limit-Retry-After-Seconds": "30", "Retry-After": "90"}) == 30
