"""The pilot's own points on a route with stops, and the holds flown at them:
what a hold adds to the times and the fuel, and the way over high ground.
The stubbed world is stops_world's."""

import pytest
from wingtip import airports, fixes
from wingtip import flight_hops
from app.router_basics import load_hop
from app.main import app

from .conftest import AirplaneClient
from .stops_world import REAL_FIND_NAVAID, VIA_MADISON, _stubbed_world  # noqa: F401 -- the stubbed world, autouse

client = AirplaneClient(app)


def test_a_stop_may_be_the_pilots_own_point_off_a_fix(monkeypatch):
    # "VPBNG/090/30", at the owner's ask: flown over where it is, named for
    # how it was made; a point off a fix NASR has none of is a 404.
    vpbng = {"ident": "VPBNG", "lat": 42.27, "lon": -88.13, "kind": "VFR waypoint", "vfr": True}
    monkeypatch.setattr(fixes, "_TABLE", fixes._Table({"VPBNG": vpbng}, {}))
    monkeypatch.setattr(fixes, "find_navaid", REAL_FIND_NAVAID)
    stop = client.get("/api/course", params={"dep": "C81", "dest": "KDLH", "stops": "VPBNG/090/30"}).json()["stops"][0]
    assert (stop["ident"], stop["kind"], stop["name"]) == ("VPBNG/090/30", "fix", "30 nm on 090° from VPBNG")
    assert stop["lon"] > vpbng["lon"] + 0.6
    # NOPE no airport either, as the airports' own reader says one is not.
    stubbed = airports.get_airport

    def get_airport(ident, **kw):
        if ident.upper() == "NOPE":
            raise ValueError("No airport NOPE.")
        return stubbed(ident, **kw)

    monkeypatch.setattr(airports, "get_airport", get_airport)
    missing = client.get("/api/course", params={"dep": "C81", "dest": "KDLH", "stops": "NOPE/090/30"})
    assert missing.status_code == 404


def test_a_hold_at_a_stop_is_flown_on_the_leg_leaving_it_and_its_minutes_are_in_the_times_and_fuel():
    # Two turns of a one-minute hold at Madison, the owner's "create a
    # left/right hold": two four-minute laps on the leg out of it.
    plain = client.get("/api/plan", params=VIA_MADISON).json()
    held = client.get("/api/plan", params={**VIA_MADISON, "holds": "KMSN:180:L:1M:2T"}).json()
    i = next(k for k, leg in enumerate(held["legs"]) if leg["from"] == "KMSN")
    before, after = plain["legs"][i], held["legs"][i]
    hold = after["hold"]
    assert (hold["fix"], hold["inbound_deg"], hold["right"], hold["turns"]) == ("KMSN", 180, False, 2)
    assert hold["minutes"] == pytest.approx(8.0)
    assert hold["entry"] in ("direct", "teardrop", "parallel")
    assert hold["path"][0] == hold["path"][-1]
    assert after["ete_min"] == pytest.approx(before["ete_min"] + 8.0, abs=0.1)
    assert after["fuel_gal"] == pytest.approx(before["fuel_gal"] + 8.0 / 60 * before["fuel_burn_gph"], abs=0.02)
    assert held["totals"]["fuel_gal"] == pytest.approx(plain["totals"]["fuel_gal"] + hold["gal"], abs=0.1)
    # One that is not a hold is refused.
    assert client.get("/api/plan", params={**VIA_MADISON, "holds": "KMSN:999:L:1M:2T"}).status_code == 422


def test_an_altitude_on_the_pilots_own_point_off_a_fix_is_flown_to_it(monkeypatch):
    # Set altitude… on "VPBNG/090/30" was a 422 for the whole log: the
    # planner took an ident of 2 to 5 letters and digits alone. Packed, or
    # as the route writes it, the hop into the point is flown at it.
    vpbng = {"ident": "VPBNG", "lat": 42.27, "lon": -88.13, "kind": "VFR waypoint", "vfr": True}
    monkeypatch.setattr(fixes, "_TABLE", fixes._Table({"VPBNG": vpbng}, {}))
    monkeypatch.setattr(fixes, "find_navaid", REAL_FIND_NAVAID)
    for written in ("VPBNG/090/30", "VPBNG090030"):
        got = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "stops": "VPBNG/090/30", "altitudes": f"{written}:5500"})
        assert got.status_code == 200, (written, got.text)
        into = [leg for leg in got.json()["legs"] if leg["to"] == "VPBNG/090/30"]
        assert into and into[-1]["altitude_ft"] == 5500.0, written


def test_a_round_trips_hold_at_its_field_is_the_arrivals():
    # C81 to Madison and back: a hold set at C81 is flown before landing
    # there, its fuel on the last flight; matched as the departure, it was
    # on the first flight out, and the last flight's fuel came up short.
    held = client.get("/api/plan", params={"dep": "C81", "dest": "C81", "stops": "KMSN", "holds": "C81:180:L:1M:2T"}).json()
    legs = held["legs"]
    assert [k for k, leg in enumerate(legs) if leg.get("hold")] == [len(legs) - 1]


def test_a_hold_makes_the_flights_after_it_leave_later(monkeypatch):
    # Two one-minute turns at the departure (eight minutes) are flown on the
    # first flight, so the second leaves eight minutes later: its winds and
    # night are read for then, as the time on the ground is.
    from datetime import datetime, timedelta, timezone

    starts = []
    real = flight_hops.flight_window

    def window(when, length_nm, tas):
        starts.append(when)
        return real(when, length_nm, tas)

    monkeypatch.setattr(flight_hops, "flight_window", window)
    depart = datetime(2026, 9, 22, 15, 0, tzinfo=timezone.utc).isoformat()
    client.get("/api/plan", params={**VIA_MADISON, "depart": depart})
    plain = starts[1]
    starts.clear()
    client.get("/api/plan", params={**VIA_MADISON, "depart": depart, "holds": "C81:180:L:1M:2T"})
    assert starts[1] - plain == timedelta(minutes=8)


def test_where_the_ceiling_stops_it_over_high_ground_the_way_round_is_offered(monkeypatch):
    """No legal altitude because the ground needs more than the airplane's
    service ceiling: the points round it (wingtip.terrain_detour), in order, as
    one detour, with the miles it adds."""
    from wingtip import terrain_detour

    from wingtip.flight_plan import terrain_way

    hop = load_hop("C81", "KDLH")
    selection = {"segments": [{"candidates_ft": [], "service_ceiling_ft": 10950.0}]}
    monkeypatch.setattr(
        terrain_detour,
        "way_round",
        lambda start, end, ceiling: [
            {"ident": "KMSN", "name": "MADISON", "lat": 43.14, "lon": -89.34},
            {"ident": "KEAU", "name": "EAU CLAIRE", "lat": 44.87, "lon": -91.48},
        ],
    )
    way = terrain_way(selection, hop)
    assert way["via"] == ["KMSN", "KEAU"] and way["ident"] == "KMSN"
    assert way["added_nm"] > 0
    # Clouds, not the ceiling, stopping it: no way round offered.
    assert terrain_way({"segments": [{"candidates_ft": []}]}, hop) is None
