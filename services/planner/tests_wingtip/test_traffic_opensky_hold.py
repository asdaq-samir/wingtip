"""An airplane's past flights from the OpenSky Network asked a few days at a
time, and a 429 held for the wait OpenSky names with nothing asked again,
with test_traffic_opensky's stubbed OpenSky."""

import datetime as dt

from wingtip.traffic import opensky, opensky_api

from .test_traffic_opensky import TODAY, _resp, sky  # noqa: F401 -- the stubbed OpenSky, asked by name


def test_a_cards_days_are_asked_two_pairs_at_once_at_the_most_the_newest_first(sky, monkeypatch):  # noqa: F811
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


def test_a_429_holds_opensky_for_its_wait_asks_nothing_more_and_keeps_what_was_answered(sky, monkeypatch):  # noqa: F811
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
