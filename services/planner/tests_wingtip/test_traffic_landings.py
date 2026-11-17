"""wingtip.traffic: whether an airplane has landed, from its recent trace and
how long it has been unheard, by the field it was low over."""

from unittest.mock import patch

import pytest

from wingtip import airports, traffic

from .traffic_world import _routed, _status, stand_in
from .traffic_world import adsbx_fixture, clock_fixture  # noqa: F401 -- the fixtures, by the names the runner gives them


#: Galt Field, where a school's 172s fly the pattern, as the airports'
#: index answers a point near it.
GALT = {"ident": "10C", "name": "Galt Field Airport", "municipality": "Greenwood/Wonder Lake", "region": "US-IL", "elevation_ft": 875.0}


def _near_galt(distance_nm, bearing_deg=270.0):
    return lambda lat, lon, limit=3: [{**GALT, "distance_nm": distance_nm, "bearing_deg": bearing_deg}]


#: A 172's recent trace: on the ground at Galt, off, and climbing out west
#: in the pattern, its last report 4 s old at 1791800120.
CLIMBING_OUT = {
    "icao": "a06d40",
    "r": "N12661",
    "t": "C172",
    "timestamp": 1791800000.0,
    "trace": [
        [60.0, 42.4027, -88.3751, "ground", 8.0, 270.0, 0, 0, {"flight": "N12661  ", "squawk": "1200"}, "adsr_icao", None],
        [80.0, 42.4029, -88.3830, 1300, 62.0, 270.0, 0, 700, None, "adsr_icao", 1225],
        [116.0, 42.4031, -88.3990, 1700, 74.0, 271.0, 0, 640, None, "adsr_icao", 1625],
    ],
}


def test_an_airplane_in_the_air_is_airborne_from_where_it_took_off(clock, monkeypatch):
    """Its alerts' state, from the recent trace: in the air as the map draws
    it, and the field its stretch on the ground before it was at."""
    stand_in(monkeypatch, "_wall", lambda: 1791800120.0)
    monkeypatch.setattr(airports, "nearest", _near_galt(0.1))
    get, asked = _routed({"trace_recent_a06d40": _status(200, CLIMBING_OUT)})
    with patch("requests.get", side_effect=get):
        state = traffic.status("A06D40")
        traffic.status("a06d40")
    assert state["airborne"] is True and state["heard_s"] == 4.0 and state["arrived"] is None
    assert state["aircraft"]["hex"] == "a06d40" and state["aircraft"]["altitude_ft"] == 1625
    assert state["departed"] == {"ident": "10C", "name": "Galt Field Airport", "city": "Greenwood/Wonder Lake", "region": "US-IL"}
    # Read once in its five seconds: a second ask is given the same.
    assert asked == ["https://adsb.lol/data/traces/40/trace_recent_a06d40.json"]


def test_an_airplane_on_the_ground_at_a_field_has_landed_there_at_once(clock, monkeypatch):
    stand_in(monkeypatch, "_wall", lambda: 1791800120.0)
    monkeypatch.setattr(airports, "nearest", _near_galt(0.2))
    landed = {
        **CLIMBING_OUT,
        "trace": [
            [100.0, 42.4030, -88.3600, 1100, 60.0, 270.0, 0, -500, None, "adsr_icao", 1025],
            [116.0, 42.4027, -88.3740, "ground", 40.0, 270.0, 0, 0, None, "adsr_icao", None],
        ],
    }
    with patch("requests.get", return_value=_status(200, landed)):
        state = traffic.status("a06d40")
    assert state["airborne"] is False and state["aircraft"] is None and state["departed"] is None
    assert state["arrived"] == {
        "ident": "10C",
        "name": "Galt Field Airport",
        "city": "Greenwood/Wonder Lake",
        "region": "US-IL",
        "at": 1791800116.0,
    }


@pytest.mark.parametrize(("unheard_s", "arrived"), [(60.0, None), (130.0, "10C")])
def test_one_last_heard_low_by_a_field_has_landed_only_once_unheard_for_two_minutes(clock, monkeypatch, unheard_s, arrived):
    """In the pattern a small airplane drops out of the receivers' hearing
    for half a minute and comes back: gone a minute, it has not landed yet
    (nor is it in the air, as the map would draw it); gone over two, it has."""
    stand_in(monkeypatch, "_wall", lambda: 1791800116.0 + unheard_s)
    monkeypatch.setattr(airports, "nearest", _near_galt(1.2, bearing_deg=90.0))
    low = {**CLIMBING_OUT, "trace": [[116.0, 42.4027, -88.4000, 1300, 65.0, 90.0, 0, -500, None, "adsr_icao", 1250]]}
    with patch("requests.get", return_value=_status(200, low)):
        state = traffic.status("a06d40")
    assert state["airborne"] is False and state["aircraft"] is None
    assert (state["arrived"] or {}).get("ident") == arrived


def test_one_last_heard_high_far_from_any_field_has_not_landed(clock, monkeypatch):
    stand_in(monkeypatch, "_wall", lambda: 1791800116.0 + 600)
    monkeypatch.setattr(airports, "nearest", _near_galt(40.0))
    away = {**CLIMBING_OUT, "trace": [[116.0, 43.0, -89.0, 5500, 110.0, 300.0, 0, 0, None, "adsr_icao", 5600]]}
    with patch("requests.get", return_value=_status(200, away)):
        state = traffic.status("a06d40")
    assert state["airborne"] is False and state["arrived"] is None and state["heard_s"] == 600.0


def test_with_no_recent_trace_today_s_trace_says_where_it_landed(clock, monkeypatch):
    stand_in(monkeypatch, "_TRACES", {})
    stand_in(monkeypatch, "_wall", lambda: 1791800116.0 + 3600)
    monkeypatch.setattr(airports, "nearest", _near_galt(0.2))
    today = {**CLIMBING_OUT, "trace": [[116.0, 42.4027, -88.3740, "ground", 5.0, 270.0, 0, 0, None, "adsr_icao", None]]}
    get, asked = _routed({"trace_recent_a06d40": _status(404), "trace_full_a06d40": _status(200, today)})
    with patch("requests.get", side_effect=get):
        state = traffic.status("a06d40")
    assert state["arrived"]["ident"] == "10C" and state["airborne"] is False
    # Neither trace: nothing known, and nothing made up.
    get, _ = _routed({"trace_recent_a12345": _status(404), "trace_full_a12345": _status(404)})
    with patch("requests.get", side_effect=get):
        assert traffic.status("a12345") == {
            "hex": "a12345",
            "heard_s": None,
            "airborne": False,
            "aircraft": None,
            "departed": None,
            "arrived": None,
        }


def test_a_recent_trace_that_cannot_be_read_is_unavailable_not_landed(clock):
    with patch("requests.get", return_value=_status(503)), pytest.raises(traffic.TrafficUnavailable):
        traffic.status("a06d40")
