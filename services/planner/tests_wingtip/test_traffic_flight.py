"""wingtip.traffic: a tracked flight, what it is, where it took off and its
track since, with its number's route and its FAA record."""

from unittest.mock import Mock, patch

import requests

from wingtip import airports, registry, traffic
from wingtip.traffic import store

from .traffic_world import CESSNA, _answer, stand_in
from .traffic_world import adsbx_fixture, clock_fixture  # noqa: F401 -- the fixtures, by the names the runner gives them


TRACE = {
    "icao": "a0b7d8",
    "r": "N14511",
    "t": "A21N",
    "desc": "AIRBUS A-321neo",
    "ownOp": "UNITED AIRLINES INC",
    "year": "2024",
    "timestamp": 1791656000.0,
    "trace": [
        # Yesterday's leg into the field, then this one: on the ground at
        # O'Hare, off, and climbing out west.
        [0.0, 20.17, -67.03, 33600, 466.7, 127.9, 2, -3136, None, "adsb_icao", 35825],
        [600.0, 41.97, -87.90, "ground", 12.0, 270.0, 0, 0, None, "adsb_icao", None],
        [660.0, 41.976, -87.93, 400, 150.0, 270.0, 0, 2000, None, "adsb_icao", 525],
        [720.0, 41.98, -88.00, 2500, 220.0, 270.0, 0, 2000, None, "adsb_icao", 2650],
    ],
}


def test_a_tracked_flight_is_what_it_is_where_it_took_off_and_its_track_since(clock, monkeypatch):
    stand_in(monkeypatch, "_TRACES", {})
    monkeypatch.setattr(
        airports,
        "nearest",
        lambda lat, lon, limit=1: [{"ident": "KORD", "name": "Chicago O'Hare International Airport", "distance_nm": 0.4}],
    )
    with patch("requests.get", return_value=Mock(status_code=200, json=Mock(return_value=TRACE))) as get:
        found = traffic.flight("A0B7D8")
        traffic.flight("a0b7d8")
    assert get.call_args.args[0] == "https://adsb.lol/data/traces/d8/trace_full_a0b7d8.json"
    assert get.call_count == 1
    assert {k: found[k] for k in ("registration", "type", "description", "operator", "year")} == {
        "registration": "N14511",
        "type": "A21N",
        "description": "AIRBUS A-321neo",
        "operator": "UNITED AIRLINES INC",
        "year": "2024",
    }
    # Off the ground at its first point in the air, 660 s in.
    assert found["departed"] == {"ident": "KORD", "name": "Chicago O'Hare International Airport", "at": 1791656660}
    # This leg alone, from the ground; GNSS heights as the live reports'.
    assert [(p["lat"], p["alt_ft"]) for p in found["trail"]] == [(41.97, None), (41.976, 525.0), (41.98, 2650.0)]


def test_a_flight_whose_track_begins_in_the_air_or_away_from_a_field_says_no_departure(clock, monkeypatch):
    stand_in(monkeypatch, "_TRACES", {})
    monkeypatch.setattr(airports, "nearest", lambda lat, lon, limit=1: [{"ident": "C81", "distance_nm": 7.0}])
    airborne = {**TRACE, "trace": [TRACE["trace"][0], TRACE["trace"][3]]}
    with patch("requests.get", return_value=Mock(status_code=200, json=Mock(return_value=airborne))):
        assert traffic.flight("a0b7d8")["departed"] is None
    stand_in(monkeypatch, "_TRACES", {})
    with patch("requests.get", return_value=Mock(status_code=200, json=Mock(return_value=TRACE))):
        # On the ground seven miles from the nearest field: no airport.
        assert traffic.flight("a0b7d8")["departed"] is None


def test_a_flight_with_no_trace_is_drawn_without_its_past_and_named_by_its_faa_record(clock, monkeypatch):
    stand_in(monkeypatch, "_TRACES", {})
    monkeypatch.setattr(registry, "lookup", lambda **kw: {"n_number": "N654FL", "year": 1971})  # N654FL's card read "Registration –"
    with patch("requests.get", return_value=Mock(status_code=404)):
        found = traffic.flight("a89c1e")
    assert (found["trail"], found["departed"], found["type"], found["registration"], found["year"]) == ([], None, None, "N654FL", "1971")


def test_a_flight_that_has_landed_is_its_flight_to_the_landing_not_the_parked_tail(clock, monkeypatch):
    stand_in(monkeypatch, "_TRACES", {})
    monkeypatch.setattr(
        airports,
        "nearest",
        lambda lat, lon, limit=1: [{"ident": "KORD", "name": "Chicago O'Hare International Airport", "distance_nm": 0.4}],
    )
    parked = {
        **TRACE,
        "trace": TRACE["trace"]
        + [
            [800.0, 41.97, -87.90, "ground", 10.0, 90.0, 0, 0, None, "adsb_icao", None],
            [900.0, 41.97, -87.90, "ground", 0.0, 90.0, 0, 0, None, "adsb_icao", None],
        ],
    }
    with patch("requests.get", return_value=Mock(status_code=200, json=Mock(return_value=parked))):
        found = traffic.flight("a0b7d8")
    # Departed when it left the ground, 660 s in; the trail ends at its landing.
    assert found["departed"]["at"] == 1791656660
    assert [p["t"] for p in found["trail"]] == [1791656600.0, 1791656660.0, 1791656720.0, 1791656800.0]


def test_a_trace_that_could_not_be_had_is_asked_again_not_kept(clock, monkeypatch):
    stand_in(monkeypatch, "_TRACES", {})
    # The trace's reads alone: a card with no trail also asks for the
    # airplane itself (`_watch`, its own test below).
    stand_in(monkeypatch, "_watch", lambda hex_id: None)
    with patch("requests.get", side_effect=requests.Timeout("slow")) as get:
        assert traffic.flight("a0b7d8")["trail"] == []
        assert traffic.flight("a0b7d8")["trail"] == []
    assert get.call_count == 2
    # A refusal is not kept either, but the globe is let be a while after
    # one (GLOBE_BACKOFF_S): the card shows what it has without asking.
    with patch("requests.get", return_value=Mock(status_code=429)) as get:
        traffic.flight("a0b7d8")
        traffic.flight("a0b7d8")
    assert get.call_count == 1


def test_a_trace_that_is_not_an_object_or_has_short_points_is_drawn_without_its_past(clock, monkeypatch):
    stand_in(monkeypatch, "_TRACES", {})
    with patch("requests.get", return_value=Mock(status_code=200, json=Mock(return_value=[1, 2]))):
        assert traffic.flight("a0b7d8")["trail"] == []
    stand_in(monkeypatch, "_TRACES", {})
    monkeypatch.setattr(airports, "nearest", lambda lat, lon, limit=1: [])
    short = {**TRACE, "trace": [[0.0, 41.9, -87.9], *TRACE["trace"]]}
    with patch("requests.get", return_value=Mock(status_code=200, json=Mock(return_value=short))):
        assert len(traffic.flight("a0b7d8")["trail"]) == 3


UAL2088_ROUTE = {
    "callsign": "UAL2088",
    "airport_codes": "TJSJ-KORD",
    "_airports": [
        {
            "name": "Luis Munoz Marin International Airport",
            "icao": "TJSJ",
            "iata": "SJU",
            "location": "San Juan",
            "lat": 18.4394,
            "lon": -66.001801,
        },
        {
            "name": "Chicago O'Hare International Airport",
            "icao": "KORD",
            "iata": "ORD",
            "location": "Chicago",
            "lat": 41.9786,
            "lon": -87.9048,
        },
    ],
}


def test_a_flight_numbers_route_and_whether_the_airplane_is_on_it(clock, monkeypatch):
    asked = []

    def get(url, *args, **kwargs):
        asked.append(url.rsplit("/routes/", 1)[1])
        resp = Mock(status_code=404 if "DAL1" in url else 200)
        resp.raise_for_status = Mock()
        resp.json = Mock(return_value=UAL2088_ROUTE)
        return resp

    with patch("requests.get", side_effect=get):
        # Over Kentucky, near the great circle from San Juan to O'Hare.
        on = traffic.route("ual 2088", 37.5, -84.9)
        assert [a["ident"] for a in on["airports"]] == ["TJSJ", "KORD"] and on["plausible"] is True
        # Over Denver it is not flying that route today.
        assert traffic.route("UAL2088", 39.86, -104.67)["plausible"] is False
        assert traffic.route("UAL2088")["plausible"] is None
        # Not an airline's flight number, or one the database does not know.
        assert traffic.route("N174HA", 42.3, -88.1) is None
        assert traffic.route("DAL1") is None
        assert traffic.route("DAL1") is None
        # Kept in the live store, a restart asks again for none.
        store.reset()
        assert traffic.route("DAL1") is None and traffic.route("UAL2088")["plausible"] is None
    # Each asked once: the route kept, and a 404 too.
    assert asked == ["UA/UAL2088.json", "DA/DAL1.json"]


def test_the_faa_record_of_an_airplane_named_by_its_n_number_or_address(clock, monkeypatch):
    asked = []
    monkeypatch.setattr(registry, "lookup", lambda **kw: asked.append(kw) or {"n_number": "N654FL"})
    assert traffic.registered("n654fl") == {"n_number": "N654FL"}
    assert traffic.registered("A89C1E") == {"n_number": "N654FL"}
    # Not an N-number or an address: a callsign has no registration to look up.
    assert traffic.registered("UAL2088") is None
    # adsb.lol's "~" pseudo-address goes on unstripped, for registry.lookup to refuse.
    traffic.registered("~a89c1e")
    assert asked == [{"n_number": "N654FL"}, {"hex_id": "a89c1e"}, {"hex_id": "~a89c1e"}]


def test_a_view_zoomed_out_further_than_sixty_nm_is_asked_of_a_wide_region(clock):
    """The traffic wherever the map is panned, the owner's ask: a view of
    a state, out to 165 nm, from a region two degrees square asked for out
    to 250 nm, adsb.lol's furthest; and kept apart from the near regions'."""
    far = {**CESSNA, "hex": "far", "lat": 44.3}  # 120 nm north of 42.3
    with patch("requests.get", return_value=_answer([CESSNA, far])) as get:
        wide = traffic.near(42.3, -88.1, 150)["aircraft"]
        widest = traffic.near(42.3, -88.1, 400)["aircraft"]
    assert get.call_args_list[0].args[0] == "https://api.adsb.lol/v2/point/42.00/-88.00/250"
    assert [a["hex"] for a in wide] == ["a128b9", "far"] and [a["hex"] for a in widest] == ["a128b9", "far"]
    # The same wide region for both, within five seconds: one request.
    assert get.call_count == 1
    clock.now += traffic.MIN_GAP_S
    with patch("requests.get", return_value=_answer([CESSNA])) as get:
        traffic.near(42.3, -88.1, 40)
    assert get.call_args.args[0] == "https://api.adsb.lol/v2/point/42.50/-88.00/80"
