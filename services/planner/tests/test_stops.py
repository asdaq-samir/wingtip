"""A route that lands on the way (`stops`): each flight between two
landings -- a hop -- planned as a route of its own, and the course, the
checkpoints, the legs and the totals running on through each stop. The
same stubbed world as test_plan (stops_world): every hop is read off the
same two candidates, flies at the one legal altitude, and each leg is 10 nm."""

from types import SimpleNamespace

import pytest
from wingtip import airports
from wingtip import altitude as altitude_module
from wingtip import planning
from wingtip import flight_hops
from app.router_basics import load_route
from app.main import app

from .conftest import AirplaneClient, airport, select_cruise_altitude_stub
from .stops_world import VIA_MADISON, _stubbed_world, hop_nm  # noqa: F401 -- the stubbed world, autouse

client = AirplaneClient(app)


def test_the_course_lands_at_each_stop_and_is_as_long_as_its_hops():
    body = client.get("/api/course", params=VIA_MADISON).json()

    assert [s["ident"] for s in body["stops"]] == ["KMSN"]
    assert body["distance_nm"] == pytest.approx(hop_nm("C81", "KMSN") + hop_nm("KMSN", "KDLH"), abs=0.1)
    madison = airport("KMSN")
    assert [madison["lat"], madison["lon"]] in body["course_line"]


def test_the_checkpoints_are_each_hops_own_along_the_whole_route():
    body = client.get("/api/checkpoints", params=VIA_MADISON).json()

    first = hop_nm("C81", "KMSN")
    hops = [c["hop"] for c in body["selected"]]
    assert set(hops) == {0, 1} and hops == sorted(hops)
    # The second hop's run on from the stop.
    assert all(c["along_track_nm"] >= first for c in body["selected"] if c["hop"] == 1)
    assert [c["along_track_nm"] for c in body["selected"]] == sorted(c["along_track_nm"] for c in body["selected"])


def test_the_legs_land_at_the_stop_and_each_hop_has_its_own_fuel_check():
    body = client.get("/api/plan", params=VIA_MADISON).json()

    legs = body["legs"]
    assert [leg["to"] for leg in legs].count("KMSN") == 1
    assert [leg["from"] for leg in legs].count("KMSN") == 1
    assert len(legs) == len(body["selected"]) + 2
    totals = body["totals"]
    assert [(h["departure"], h["destination"]) for h in totals["hops"]] == [("C81", "KMSN"), ("KMSN", "KDLH")]
    # The tanks are filled at the stop: no fuel check over the whole trip.
    assert totals["fuel_required_gal"] is None
    assert all(h["totals"]["fuel_required_gal"] is not None for h in totals["hops"])
    assert totals["fuel_gal"] == pytest.approx(sum(h["totals"]["fuel_gal"] for h in totals["hops"]), abs=0.15)
    # One breakdown for the route, a segment per leg.
    assert len(body["altitude_selection"]["segments"]) == len(legs)


def test_the_flight_after_a_stop_leaves_after_its_time_on_the_ground(monkeypatch):
    """Thirty minutes at a stop the pilot gave no time for, the owner's
    pick (2026-10-20), or the pilot's own (`ground`): the next flight is
    planned to leave that much later, its winds and night read for then,
    and the totals carry the time for the arrival. None had been counted."""
    from datetime import datetime, timedelta, timezone

    starts = []
    real = flight_hops.flight_window

    def window(when, length_nm, tas):
        starts.append(when)
        return real(when, length_nm, tas)

    monkeypatch.setattr(flight_hops, "flight_window", window)
    depart = datetime(2026, 9, 22, 15, 0, tzinfo=timezone.utc)
    by_default = client.get("/api/plan", params={**VIA_MADISON, "depart": depart.isoformat()}).json()["totals"]
    first, after = starts[0], starts[1]
    starts.clear()
    own = client.get("/api/plan", params={**VIA_MADISON, "depart": depart.isoformat(), "ground": "KMSN:75"}).json()["totals"]
    assert starts[1] - after == timedelta(minutes=45)
    assert after - first > timedelta(minutes=30)
    assert (by_default["ground_min"], own["ground_min"]) == (30.0, 75.0)
    assert client.get("/api/plan", params={**VIA_MADISON, "ground": "KMSN:soon"}).status_code == 422


def test_the_leg_into_a_stop_says_its_time_on_the_ground(messages):
    """The planner owns the stops' minutes on the ground: the leg that
    lands at each carries them (Leg.ground_min), the pilot's own or the
    thirty-minute turnaround, for the web to time the rows after it by,
    and no other leg does -- the destination is not left again."""
    legs = client.get("/api/plan", params=VIA_MADISON).json()["legs"]
    assert [(leg["to"], leg["ground_min"]) for leg in legs if leg["ground_min"] is not None] == [("KMSN", 30.0)]
    assert legs[-1]["ground_min"] is None

    streamed = [m for m in messages(client.get("/api/navlog", params={**VIA_MADISON, "ground": "KMSN:75"})) if m["type"] == "leg"]
    assert [(leg["to"], leg["ground_min"]) for leg in streamed if leg.get("ground_min") is not None] == [("KMSN", 75.0)]


def test_each_flight_climbs_from_its_field_and_comes_down_to_its_own_pattern():
    # The legs at 4,500 ft, the fields at 900: each flight climbs from its
    # own field and tops out once -- C81's on its second leg, past the lake
    # the stub puts 2 nm out, KMSN's on its first -- and each comes down to
    # 1,900, 7.8 nm at three to one plus the 45's 1.7 (AC 90-66C 11.3): 9.5.
    legs = client.get("/api/plan", params=VIA_MADISON).json()["legs"]

    assert [leg["from"] for leg in legs if leg["toc"]] == ["Lake", "KMSN"]
    assert legs[0]["from"] == "C81" and legs[0]["climb_min"] == pytest.approx(legs[0]["ete_min"], abs=0.1)
    tods = [(leg, leg["tod"]) for leg in legs if leg["tod"]]
    assert [leg["to"] for leg, _ in tods] == ["KMSN", "KDLH"]
    assert all(tod["to_ft"] == 1900.0 and tod["pattern"] for _, tod in tods)
    assert all(leg["distance_nm"] - tod["along_nm"] == pytest.approx(9.5, abs=0.1) for leg, tod in tods)


def test_the_stream_runs_through_the_stop_and_ends_on_the_hops_totals(messages):
    lines = messages(client.get("/api/navlog", params=VIA_MADISON))

    legs = [m for m in lines if m["type"] == "leg"]
    assert legs[0]["from"] == "C81" and legs[-1]["to"] == "KDLH"
    assert any(leg["to"] == "KMSN" for leg in legs)
    assert len(lines[-1]["totals"]["hops"]) == 2


def test_a_hop_with_no_legal_altitude_is_flown_anyway(monkeypatch, altitude, messages):
    madison = airport("KMSN")
    flyable = select_cruise_altitude_stub(altitude)
    stuck = select_cruise_altitude_stub({**altitude, "recommended_ft": None})

    def select(start, end, profile, **kw):
        north = start == (madison["lat"], madison["lon"])
        return (stuck if north else flyable)(start, end, profile, **kw)

    monkeypatch.setattr(altitude_module, "select_cruise_altitude", select)
    last = messages(client.get("/api/navlog", params=VIA_MADISON))[-1]

    assert last["type"] == "done"
    legs = client.get("/api/plan", params=VIA_MADISON).json()["legs"]
    assert legs[0]["from"] == "C81" and legs[-1]["to"] == "KDLH"


def test_a_route_without_stops_is_planned_as_it_always_was():
    body = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH"}).json()
    assert body["stops"] == []
    assert body["totals"]["hops"] == [] and body["totals"]["fuel_required_gal"] is not None


@pytest.mark.parametrize("stops", ["C81", "KMSN,KMSN"])
def test_a_stop_that_is_the_airport_before_it_is_refused(stops):
    assert client.get("/api/course", params={"dep": "C81", "dest": "KDLH", "stops": stops}).status_code == 422


def test_a_stop_at_the_same_place_as_the_point_before_it_is_refused(monkeypatch):
    # MSN is KMSN's own FAA identifier: the same airport written two ways,
    # a hop of no length.
    monkeypatch.setattr(airports, "get_airport", lambda ident, **kw: airport({"MSN": "KMSN"}.get(ident.upper(), ident.upper())))
    response = client.get("/api/course", params={"dep": "C81", "dest": "KMSN", "stops": "MSN"})
    assert response.status_code == 422
    assert "MSN and KMSN are the same place" in response.json()["detail"]


def test_a_round_trip_lands_where_it_left():
    r = load_route("C81", "C81", "KMSN")
    assert [(hop.dep_ident, hop.dest_ident) for hop in r.hops] == [("C81", "KMSN"), ("KMSN", "C81")]


def test_too_many_stops_are_refused():
    from app.router_basics import MAX_STOPS

    many = ",".join(["KMSN", "KDLH"] * (MAX_STOPS // 2 + 1))
    assert client.get("/api/course", params={"dep": "C81", "dest": "KMSN", "stops": many}).status_code == 422


def test_the_joined_breakdown_is_the_most_limiting_of_the_hops():
    a = {
        "floor_ft": 2000.0,
        "band_ceiling_ft": 9000.0,
        "candidates_ft": [4500.0, 6500.0],
        "segments": [{"from_nm": 0.0, "to_nm": 40.0}],
        "special_use": [],
        "airspace_transits": [],
        "hazards": [],
        "weather_unavailable": [],
        "icing_possible": False,
        "low_ceiling_or_visibility": False,
    }
    b = {
        **a,
        "floor_ft": 5000.0,
        "band_ceiling_ft": 7000.0,
        "candidates_ft": [6500.0],
        "segments": [{"from_nm": 0.0, "to_nm": 60.0}],
        "icing_possible": None,
    }

    joined = planning.join_selections([a, b], [0.0, 40.0])

    assert joined["floor_ft"] == 5000.0 and joined["band_ceiling_ft"] == 7000.0
    assert joined["candidates_ft"] == [6500.0] and joined["recommended_ft"] == 6500.0
    assert [(s["from_nm"], s["to_nm"]) for s in joined["segments"]] == [(0.0, 40.0), (40.0, 100.0)]
    # A hop that could not be checked: unknown, not "no icing".
    assert joined["icing_possible"] is None


def test_a_route_with_stops_figures_at_each_altitude_join_its_hops():
    """A hop that does not offer an altitude flies its nearest, the lower
    on a tie; times and fuel summed, the wind weighed by length."""
    from wingtip.flight_plan import join_figures

    def f(alt, ete, fuel, wind, everywhere=True):
        return {"altitude_ft": alt, "ete_min": ete, "fuel_gal": fuel, "tailwind_kt": wind, "everywhere": everywhere}

    west = (f(4500.0, 30.0, 4.0, 10.0), f(6500.0, 28.0, 4.1, 20.0))
    east = (f(5500.0, 20.0, 3.0, -10.0),)
    joined = {j["altitude_ft"]: SimpleNamespace(**j) for j in join_figures([west, east], [100.0, 50.0])}
    assert sorted(joined) == [4500.0, 5500.0, 6500.0]
    assert (joined[4500.0].ete_min, joined[4500.0].fuel_gal, joined[4500.0].everywhere) == (50.0, 7.0, False)
    # 5,500 is 1,000 ft from both of the west hop's: the lower, 4,500.
    assert joined[5500.0].ete_min == 50.0
    assert joined[6500.0].tailwind_kt == pytest.approx((20.0 * 100 + -10.0 * 50) / 150, abs=0.05)
    assert join_figures([west], [100.0]) == west
    # A hop with none to offer: the others' altitudes kept for the ruler,
    # their times, fuel and "everywhere" unknown; none at all, none.
    gapped = {j["altitude_ft"]: SimpleNamespace(**j) for j in join_figures([west, ()], [100.0, 50.0])}
    assert sorted(gapped) == [4500.0, 6500.0]
    assert (gapped[4500.0].ete_min, gapped[4500.0].fuel_gal, gapped[4500.0].everywhere) == (None, None, False)
    assert gapped[6500.0].tailwind_kt == 20.0
    assert join_figures([(), ()], [100.0, 50.0]) == ()


def test_an_altitude_picked_on_the_wheel_flies_each_leg_at_its_nearest_legal_altitude():
    # The wheel's figures are each leg at its nearest legal altitude; its
    # pick is flown so (altitude_nearest), where a typed one is flown on
    # every leg, legal or not. Here 4,500 is every leg's one legal altitude.
    typed = client.get("/api/plan", params={**VIA_MADISON, "altitude_ft": 6500}).json()
    wheel = client.get("/api/plan", params={**VIA_MADISON, "altitude_ft": 6500, "altitude_nearest": True}).json()
    assert {leg["altitude_ft"] for leg in typed["legs"]} == {6500.0}
    assert {leg["altitude_ft"] for leg in wheel["legs"]} == {4500.0}
