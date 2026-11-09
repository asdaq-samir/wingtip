"""A plan with no airplane picked (aircraft=none, wingtip.planning.NO_AIRPLANE):
the route's own figures -- its course, miles, legs, checkpoints and
altitudes -- and none that needs an airplane, never a stock C172's. The
owner (2026-11-09): "If no airplane is entered, only show the distance and
the things you can without airplane profile, don't assume." The same
stubbed world as test_plan."""
from fastapi.testclient import TestClient

from app.main import app

from .test_plan import _stubbed_world  # noqa: F401 -- the stubbed chart, altitude and air, autouse

client = TestClient(app)

#: Every figure of a leg that needs an airplane.
AIRPLANES = ("wca_deg", "true_heading_deg", "magnetic_heading_deg", "groundspeed_kt", "ete_min", "fuel_gal", "tas_kt",
             "fuel_burn_gph", "power_pct", "density_altitude_ft")


def test_a_plan_with_no_airplane_has_its_miles_and_courses_and_no_airplanes_figures():
    flown = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH"}).json()
    resp = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "aircraft": "none"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["aircraft"] is None
    # The same legs, courses and miles as an airplane's plan.
    assert [(leg["from"], leg["to"]) for leg in body["legs"]] == [(leg["from"], leg["to"]) for leg in flown["legs"]]
    for leg, theirs in zip(body["legs"], flown["legs"]):
        assert (leg["distance_nm"], leg["magnetic_course_deg"], leg["altitude_ft"]) == (
            theirs["distance_nm"], theirs["magnetic_course_deg"], theirs["altitude_ft"])
        assert all(leg[k] is None for k in AIRPLANES), leg
        # No climb and no tops of climb or descent.
        assert leg["climb_min"] == 0 and leg["toc"] is None and leg["tod"] is None
    totals = body["totals"]
    assert totals["distance_nm"] == flown["totals"]["distance_nm"]
    assert totals["unflyable_legs"] == 0
    for k in ("ete_min", "fuel_gal", "reserve_gal", "taxi_gal", "fuel_required_gal", "usable_fuel_gal", "fuel_margin_gal"):
        assert totals[k] is None, k
    # 14 CFR 91.151(a)'s reserve is the rules', not the airplane's: its
    # minutes stand.
    assert totals["reserve_min"] in (30.0, 45.0)
    assert totals["fuel_stops"] == []
    # The band's plans alone, the lowest flown; no time or fuel on the wheel.
    assert [o["kind"] for o in body["altitude_options"]] == ["lowest", "highest"]
    assert body["altitude_choice"] == "lowest"
    assert all(o["ete_min"] is None and o["climb_penalty_min"] is None for o in body["altitude_options"])
    assert all(f["ete_min"] is None and f["fuel_gal"] is None for f in body["altitude_figures"])


def test_the_nav_log_with_no_airplane_streams_the_same(messages):
    lines = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "aircraft": "none"}))
    altitude = next(m for m in lines if m["type"] == "altitude")
    assert altitude["aircraft"] is None and altitude["flown"] == "lowest"
    legs = [m for m in lines if m["type"] == "leg"]
    assert legs and all(leg["ete_min"] is None and leg["groundspeed_kt"] is None for leg in legs)
    done = lines[-1]
    assert done["type"] == "done" and done["totals"]["fuel_gal"] is None and done["totals"]["distance_nm"] > 0


def test_a_local_flight_with_no_airplane_is_its_time_aloft_alone():
    body = client.get("/api/local-flight", params={"dep": "C81", "dest": "C81", "aircraft": "none", "duration_min": 60}).json()
    assert body["ete_min"] == 60 and body["fuel_gal"] is None and body["fuel_required_gal"] is None
    assert body["reserve_min"] in (30.0, 45.0)
