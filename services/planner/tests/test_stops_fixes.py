"""A stop that is not an airport: a navaid flown over, or a VFR waypoint flown
through, and the stops search that finds them. The stubbed world is
stops_world's."""

import pytest
from wingtip import airports, fixes
from app import checkpoint_scoring
from app.router_basics import load_hop, load_route
from app.main import app

from .conftest import AirplaneClient, airport
from .plan_world import CANDIDATES
from .stops_world import REAL_FIND_NAVAID, VIA_MADISON, _stubbed_world  # noqa: F401 -- the stubbed world, autouse

client = AirplaneClient(app)


# The Rockford DME as NASR files it, and the airport RFD also names.
RFD_DME = {
    "ident": "RFD",
    "lat": 42.2256,
    "lon": -89.1993,
    "kind": "DME",
    "vfr": False,
    "navaid": True,
    "name": "Rockford",
    "freq": "110.8",
    "state": "IL",
}


@pytest.fixture
def the_rockford_dme(monkeypatch):
    """RFD both a navaid and an airport's own identifier, as Rockford's is."""
    monkeypatch.setattr(fixes, "find_navaid", lambda ident, near=(): RFD_DME if ident.upper() == "RFD" else None)
    monkeypatch.setattr(fixes, "search_fixes", lambda q, limit=5: [RFD_DME] if "RFD".startswith(q.upper()) else [])
    monkeypatch.setattr(airports, "get_airport", lambda ident, **kw: airport({"RFD": "KMSN"}.get(ident.upper(), ident.upper())))


def test_a_stop_named_for_a_navaid_flies_over_the_navaid_not_to_the_airport(the_rockford_dme):
    course = client.get("/api/course", params={"dep": "C81", "dest": "KDLH", "stops": "RFD"}).json()
    stop = course["stops"][0]
    assert (stop["ident"], stop["kind"], stop["name"]) == ("RFD", "fix", "Rockford DME 110.8")
    assert (stop["lat"], stop["lon"]) == (RFD_DME["lat"], RFD_DME["lon"])


def test_of_two_navaids_by_one_ident_a_route_flies_over_the_one_by_it(monkeypatch):
    # "AB" a beacon in Wisconsin and another in Georgia, as NASR has some
    # two-letter idents twice: from C81 to Duluth, Wisconsin's.
    beacon = {"ident": "AB", "kind": "NDB", "vfr": False, "navaid": True, "name": "Beacon", "freq": "350", "state": None}
    navaids = {"AB": [{**beacon, "lat": 33.5, "lon": -82.6, "state": "GA"}, {**beacon, "lat": 44.5, "lon": -90.5, "state": "WI"}]}
    monkeypatch.setattr(fixes, "_TABLE", fixes._Table({}, navaids))
    monkeypatch.setattr(fixes, "find_navaid", REAL_FIND_NAVAID)
    stop = client.get("/api/course", params={"dep": "C81", "dest": "KDLH", "stops": "AB"}).json()["stops"][0]
    assert (stop["lat"], stop["lon"]) == (44.5, -90.5)
    # And a hop's own ends choose it the same way, for its checkpoints.
    assert load_route("C81", "KDLH", "AB").hops[1].airports[0]["lat"] == 44.5
    assert load_hop("AB", "KDLH").airports[0]["lat"] == 44.5


def test_a_stops_search_names_the_navaid_by_the_route_of_an_ident_in_two_places(monkeypatch):
    beacon = {"ident": "AB", "kind": "NDB", "vfr": False, "navaid": True, "freq": "350"}
    navaids = {
        "AB": [
            {**beacon, "name": "Georgia", "lat": 33.5, "lon": -82.6, "state": "GA"},
            {**beacon, "name": "Wisconsin", "lat": 44.5, "lon": -90.5, "state": "WI"},
        ]
    }
    monkeypatch.setattr(fixes, "_TABLE", fixes._Table({}, navaids))
    monkeypatch.setattr(fixes, "find_navaid", REAL_FIND_NAVAID)
    monkeypatch.setattr(airports, "search_airports", lambda q, near=None: [])
    search = lambda **near: client.get("/api/airports/search", params={"q": "AB", "fixes": True, **near}).json()["airports"]  # noqa: E731
    assert search(near="42.3,-88.1;46.8,-92.2")[0]["name"] == "Wisconsin NDB 350"
    assert search(near="33.6,-84.4;32.1,-81.2")[0]["name"] == "Georgia NDB 350"


def test_a_stops_search_puts_the_navaid_typed_whole_first(the_rockford_dme, monkeypatch):
    monkeypatch.setattr(airports, "search_airports", lambda q, near=None: [{**airport("KMSN"), "ident": "KRFD"}])
    found = client.get("/api/airports/search", params={"q": "rfd", "fixes": True}).json()["airports"]
    assert [(a["ident"], a.get("kind")) for a in found][:2] == [("RFD", "fix"), ("KRFD", "airport")]
    assert found[0]["name"] == "Rockford DME 110.8"


def test_no_checkpoint_is_kept_just_off_a_stop(monkeypatch):
    # The field is the fix there: a river a few cables past it is no use.
    near = {**CANDIDATES[0], "id": "river@near", "along_track_nm": 0.4, "predicted_score": 4.9}
    monkeypatch.setattr(checkpoint_scoring, "score", lambda dep, dest: [{**c, "id": f"{dep}:{c['id']}"} for c in [near, *CANDIDATES]])
    body = client.get("/api/checkpoints", params=VIA_MADISON).json()
    assert all(not c["id"].endswith("river@near") for c in body["selected"])
    assert all(not c["selected"] for c in body["candidates"] if c["id"].endswith("river@near"))


def test_a_point_beside_a_stop_is_counted_once(monkeypatch):
    # The same place read on both hops: the first hop's.
    monkeypatch.setattr(checkpoint_scoring, "score", lambda dep, dest: [dict(c) for c in CANDIDATES])
    body = client.get("/api/checkpoints", params=VIA_MADISON).json()
    ids = [c["id"] for c in body["candidates"]]
    assert len(ids) == len(set(ids))


VPBNG = {"ident": "VPBNG", "lat": 42.2673, "lon": -88.1311, "kind": "VFR waypoint", "vfr": True, "state": "IL"}


@pytest.fixture
def a_vfr_waypoint(monkeypatch):
    """VPBNG, a VFR waypoint, and no airport by its name."""

    def get_airport(ident, **kw):
        if ident.upper() not in ("C81", "KDLH", "KMSN"):
            raise ValueError(f"Airport identifier {ident.upper()!r} not found")
        return airport(ident.upper())

    monkeypatch.setattr(airports, "get_airport", get_airport)
    monkeypatch.setattr(fixes, "find_fix", lambda ident: VPBNG if ident.upper() == "VPBNG" else None)
    monkeypatch.setattr(fixes, "search_fixes", lambda q, limit=5: [VPBNG] if "VPBNG".startswith(q.upper()) else [])


def test_a_waypoint_is_flown_through_not_landed_at(a_vfr_waypoint):
    params = {"dep": "C81", "dest": "KDLH", "stops": "VPBNG"}
    course = client.get("/api/course", params=params).json()
    assert course["stops"][0] == {**course["stops"][0], "ident": "VPBNG", "kind": "fix", "elevation_ft": None}

    body = client.get("/api/plan", params=params).json()
    legs = body["legs"]
    out_of_it = next(i for i, leg in enumerate(legs) if leg["from"] == "VPBNG")
    assert legs[0]["climb_min"] > 0 and legs[out_of_it]["climb_min"] == 0  # a climb out of the field, none out of the waypoint
    # One flight, one fuel check: nothing is landed at on the way.
    assert body["totals"]["hops"] == [] and body["totals"]["fuel_required_gal"] is not None


def test_a_waypoint_between_two_landings_is_in_the_one_flights_fuel_check(a_vfr_waypoint):
    body = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "stops": "VPBNG,KMSN"}).json()
    assert [(h["departure"], h["destination"]) for h in body["totals"]["hops"]] == [("C81", "KMSN"), ("KMSN", "KDLH")]


def test_neither_an_airport_nor_a_waypoint_is_a_404(a_vfr_waypoint):
    resp = client.get("/api/course", params={"dep": "C81", "dest": "KDLH", "stops": "VPZZZ"})
    assert resp.status_code == 404 and "VPZZZ" in resp.json()["detail"]


def test_a_stops_search_finds_the_waypoints_after_the_airports(a_vfr_waypoint, monkeypatch):
    monkeypatch.setattr(airports, "search_airports", lambda q, near=None: [])
    found = client.get("/api/airports/search", params={"q": "VPB", "fixes": True}).json()["airports"]
    row = dict.fromkeys(("municipality", "closed", "use"))
    assert found == [{"ident": "VPBNG", "name": "VFR waypoint", "region": "IL", "kind": "fix", **row}]
    assert client.get("/api/airports/search", params={"q": "VPB"}).json()["airports"] == []


def test_a_waypoints_own_altitude_flies_the_hop_into_it_and_the_rest_as_planned(a_vfr_waypoint):
    body = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "stops": "VPBNG", "altitudes": "VPBNG:6500"}).json()
    legs = body["legs"]
    into = next(i for i, leg in enumerate(legs) if leg["to"] == "VPBNG")
    assert {leg["altitude_ft"] for leg in legs[: into + 1]} == {6500.0}
    # Down to the plan's 4,500 on the way out of it, the plan still the one flown.
    assert {leg["altitude_ft"] for leg in legs[into + 1 :]} == {4500.0}
    assert body["altitude_choice"] == "fastest"


def test_the_course_says_each_airports_pattern_and_no_waypoints(a_vfr_waypoint):
    course = client.get("/api/course", params={"dep": "C81", "dest": "KDLH", "stops": "VPBNG"}).json()
    assert course["departure"]["pattern_altitude_ft"] == course["destination"]["pattern_altitude_ft"] == 1900.0
    assert course["stops"][0].get("pattern_altitude_ft") is None


@pytest.mark.parametrize("altitudes", ["VPBNG", "VPBNG:", "VPBNG:18000", "VPBNG:0", "V:4500", "VPBNG:4500;KMSN:1900"])
def test_a_points_altitude_that_is_not_one_is_refused(altitudes):
    params = {**VIA_MADISON, "altitudes": altitudes}
    assert client.get("/api/plan", params=params).status_code == 422
    assert client.get("/api/navlog", params=params).status_code == 422


def test_a_waypoints_own_altitude_under_the_floor_is_flown_and_warned(a_vfr_waypoint):
    # The stub's floor is 2,200 ft: 2,000 to VPBNG is under it.
    body = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "stops": "VPBNG", "altitudes": "VPBNG:2000"}).json()
    assert {leg["altitude_ft"] for leg in body["legs"] if leg["to"] == "VPBNG"} == {2000.0}
    assert body["altitude_cautions"] == [
        {
            "from_ident": "C81",
            "to_ident": "VPBNG",
            "altitude_ft": 2000.0,
            "reasons": ["Under the 2,200 ft the terrain and obstacles need (14 CFR 91.119)"],
        }
    ]
    # The planner's own plans: nothing to say.
    assert client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "stops": "VPBNG"}).json()["altitude_cautions"] == []
