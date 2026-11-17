"""A route's start and its way: the present position, a direct-to, an airway
flown fix by fix, and the way round a Class B. The stubbed world is
stops_world's."""

from types import SimpleNamespace

import pytest
from wingtip import elevation, flight_detours
from wingtip import flight_plan as fp
from app.router_basics import load_route
from app.main import app

from .conftest import AirplaneClient
from .stops_world import _stubbed_world  # noqa: F401 -- the stubbed world, autouse

client = AirplaneClient(app)


def test_a_route_may_start_at_the_present_position_flown_from_not_taken_off_from():
    """Fly Here's Direct-To in the air: from wherever the airplane is."""

    r = load_route("@42.3246,-88.0741", "KDLH")
    assert r.departure["kind"] == "fix" and r.departure["name"] == "Present position"
    assert (r.departure["lat"], r.departure["lon"]) == (42.3246, -88.0741)
    assert not r.takes_off and r.lands
    body = client.get("/api/course", params={"dep": "@42.3246,-88.0741", "dest": "KDLH"}).json()
    assert body["departure"]["ident"] == "@42.3246,-88.0741"
    assert body["destination"]["ident"] == "KDLH"


def test_a_position_off_the_globe_is_no_position():
    from app.router_basics import position_of

    assert position_of("@91.0,-88.0") is None
    assert position_of("KDLH") is None
    assert position_of("@42.3,-88.1") == {
        "name": "Present position",
        "lat": 42.3,
        "lon": -88.1,
        "elevation_ft": None,
        "fix": True,
        "altitude_ft": None,
    }
    assert position_of("@42.3,-88.1,3500")["altitude_ft"] == 3500.0


def test_a_direct_to_climbs_from_the_gps_altitude_and_with_none_starts_level(altitude, monkeypatch):
    """In the air the climb to the cruise starts where the airplane is:
    from 1,000 ft, a climb on the first leg; with no altitude from the
    GPS, level at the first leg's, as before. Never from under the ground
    there: a GPS's 0 ft over ground 1,000 ft up climbs from the ground."""
    from wingtip.units import M_TO_FT

    monkeypatch.setattr(elevation, "get_elevations_m", lambda points: {p: 1000 / M_TO_FT for p in points})
    legs = lambda dep: client.get("/api/plan", params={"dep": dep, "dest": "KDLH"}).json()["legs"]  # noqa: E731
    assert altitude["recommended_ft"] > 1000
    assert legs("@42.3246,-88.0741,1000")[0]["climb_min"] > 0
    assert legs("@42.3246,-88.0741")[0]["climb_min"] == 0
    assert legs("@42.3246,-88.0741,0")[0] == legs("@42.3246,-88.0741,1000")[0]


def test_an_airway_among_the_stops_is_flown_fix_by_fix_with_its_altitudes(monkeypatch):
    """ "BAE V900 DDD" is BAE, the fixes V900 passes, DDD (wingtip.airways): each
    one a waypoint, each hop into one carrying its segment's MEA."""
    from wingtip import airways

    from app import router_basics

    segments = [
        airways.Segment("V900", "BAE", "CCC", 4000.0, None, 2600.0, 17500.0),
        airways.Segment("V900", "CCC", "DDD", 5000.0, None, None, 17500.0),
    ]
    monkeypatch.setattr(airways, "is_airway", lambda token: token == "V900")
    monkeypatch.setattr(airways, "along", lambda airway, a, b: segments)
    idents, flown = router_basics.with_airways(["C81", "BAE", "V900", "DDD", "KDLH"])
    assert idents == ["C81", "BAE", "CCC", "DDD", "KDLH"]
    assert flown == {2: segments[0], 3: segments[1]}


def test_each_leg_along_an_airway_carries_its_segment_for_the_nav_log():
    """A hop flown along an airway ends at a point holding the segment
    flown into it (router_basics.with_airways): each of its legs carries it, for
    the nav log's route column; a hop off an airway's legs carry none."""
    from wingtip.flight_plan import on_airway

    segment = {"id": "V191", "from": "BAE", "mea_ft": 4000.0, "gnss_mea_ft": None, "moca_ft": 2600.0, "maa_ft": 17500.0}
    legs = [{"from": "BAE", "to": "X"}, {"from": "X", "to": "CORIR"}]
    assert on_airway(legs, {"ident": "CORIR", "airway": segment}) == [{**leg, "airway": segment} for leg in legs]
    assert on_airway(legs, {"ident": "KDLH"}) == legs


def test_an_airway_that_cannot_be_flown_as_written_is_a_422_that_says_why(monkeypatch):
    from fastapi import HTTPException
    from wingtip import airways

    from app import router_basics

    def nowhere(airway, a, b):
        raise airways.AirwayError(f"{a} is not on {airway}: an airway is joined at one of its own fixes.")

    monkeypatch.setattr(airways, "is_airway", lambda token: token in ("V900", "V901"))
    monkeypatch.setattr(airways, "along", nowhere)
    monkeypatch.setattr(router_basics, "_is_place", lambda ident: False)
    with pytest.raises(HTTPException) as err:
        router_basics.with_airways(["C81", "V900", "DDD", "KDLH"])
    assert err.value.status_code == 422 and err.value.detail == "C81 is not on V900: an airway is joined at one of its own fixes."
    with pytest.raises(HTTPException, match="follow each other"):
        router_basics.with_airways(["C81", "BAE", "V900", "V901", "DDD", "KDLH"])
    # An airport whose identifier reads as an airway is a place.
    monkeypatch.setattr(router_basics, "_is_place", lambda ident: True)
    assert router_basics.with_airways(["C81", "V900", "KDLH"])[0] == ["C81", "V900", "KDLH"]


def test_with_the_class_b_clearance_each_hop_through_it_is_offered_a_way_round(monkeypatch):
    """The owner's pick (2026-10-20): Class B accepted by default, and
    "Avoid Class B" a waypoint round it, asked for each hop at its
    highest cruise altitude. None without the clearance or a Class B."""

    asked = []

    def ways(start, end, cruise_ft):
        asked.append((start, cruise_ft))
        return [{"ident": "VPBNG", "kind": "VFR waypoint", "added_nm": 6.2}] if start == (1.0, 1.0) else []

    monkeypatch.setattr(flight_detours, "class_b_ways", ways)
    monkeypatch.setattr(flight_detours, "_where", lambda ident: "by Campbell")
    hop = lambda start: SimpleNamespace(hop=SimpleNamespace(start=start, end=(9.0, 9.0)))  # noqa: E731
    runs = [hop((0.0, 0.0)), hop((1.0, 1.0))]
    outcome = SimpleNamespace(
        selection={"airspace_transits": [{"class": "B", "name": "CHICAGO CLASS B"}]},
        hop_legs=([{"altitude_ft": 3500.0}], [{"altitude_ft": 3500.0}, {"altitude_ft": 4500.0}]),
    )
    cleared = SimpleNamespace(class_b_clearance=True, altitude_ft=None)
    assert fp.class_b_detours_of(runs, outcome, cleared) == [
        {"ident": "VPBNG", "kind": "VFR waypoint", "added_nm": 6.2, "stop_index": 1, "description": "by Campbell"}
    ]
    assert asked == [((0.0, 0.0), 3500.0), ((1.0, 1.0), 4500.0)]
    assert fp.class_b_detours_of(runs, outcome, SimpleNamespace(class_b_clearance=False, altitude_ft=None)) == []
    no_b = SimpleNamespace(selection={"airspace_transits": [{"class": "C"}]}, hop_legs=outcome.hop_legs)
    assert fp.class_b_detours_of(runs, no_b, cleared) == []
