"""A plan with no airplane picked (no `aircraft` asked, PlanQuery's):
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
    flown = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "aircraft": "c172"}).json()
    resp = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH"})
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
    lines = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH"}))
    altitude = next(m for m in lines if m["type"] == "altitude")
    assert altitude["aircraft"] is None and altitude["flown"] == "lowest"
    legs = [m for m in lines if m["type"] == "leg"]
    assert legs and all(leg["ete_min"] is None and leg["groundspeed_kt"] is None for leg in legs)
    done = lines[-1]
    assert done["type"] == "done" and done["totals"]["fuel_gal"] is None and done["totals"]["distance_nm"] > 0


def test_a_local_flight_with_no_airplane_is_its_time_aloft_alone():
    body = client.get("/api/local-flight", params={"dep": "C81", "dest": "C81", "duration_min": 60}).json()
    assert body["ete_min"] == 60 and body["fuel_gal"] is None and body["fuel_required_gal"] is None
    assert body["reserve_min"] in (30.0, 45.0)


def test_none_is_no_airplanes_name():
    # The absence of an airplane is no `aircraft` at all: "none" is a name
    # no stock profile has, said as such (the iPhone's Brief once sent it).
    resp = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "aircraft": "none"})
    assert resp.status_code == 422


def test_the_route_options_with_no_airplane_are_asked_with_none(monkeypatch):
    from app.routers import route_options

    asked = []

    def options(dep, dest, profile, **given):
        asked.append(profile)
        return {"options": [], "own": None, "current_path": [], "direct": [], "ends": [], "current": [],
                "current_marginal": [], "current_along": None, "hazards": [], "unchecked": []}

    monkeypatch.setattr(route_options.wingtip_route_options, "options", options)
    monkeypatch.setattr(route_options.prefetch, "route", lambda *a, **k: None)
    monkeypatch.setattr(route_options, "resolve", lambda *idents: tuple({"lat": 1.0 + i, "lon": 2.0} for i, _ in enumerate(idents)))
    monkeypatch.setattr(route_options, "load_route", lambda dep, dest, stops="": type("R", (), {
        "airports": ({"lat": 1.0, "lon": 2.0}, {"lat": 2.0, "lon": 2.0}), "idents": (dep.upper(), dest.upper())})())
    resp = client.get("/api/route-options", params={"dep": "C81", "dest": "KDLH", "stops": "KMSP"})
    assert resp.status_code == 200, resp.text
    assert asked == [None]
    client.get("/api/route-options", params={"dep": "C81", "dest": "KDLH", "stops": "KMSP", "aircraft": "c172"})
    assert asked[1]["cruise_tas_kt"] > 0


def test_a_go_no_go_with_no_airplane_is_answered(monkeypatch):
    from app.gonogo import flight
    from app.routers import gonogo

    from .test_gonogo_api import briefing, legs

    route = type("R", (), {"idents": ["C81", "KDLH"], "airports": [{"elevation_ft": 900.0}, {"elevation_ft": 1400.0}]})()
    monkeypatch.setattr(gonogo, "load_route", lambda dep, dest, stops: route)
    seen = []

    def plan_for(q, r):
        seen.append(q.profile())
        nav = {"flown": "lowest", "altitude_ft": 5500.0, "selection": {"special_use": []}, "aircraft": None, "cautions": [],
               "options": [{"kind": "lowest", "steps": [{"altitude_ft": 5500.0, "to": "KDLH"}]}]}
        return flight.Planned(nav=nav, legs=legs(), totals={"ete_min": None, "fuel_gal": None, "night": False, "hops": []})

    monkeypatch.setattr(flight, "plan_for", plan_for)
    monkeypatch.setattr(flight, "brief_for", lambda q, ete_min: briefing())
    resp = client.post("/api/go-no-go", json={"dep": "C81", "dest": "KDLH", "day": "2026-10-06",
                                              "depart": "2026-10-06T14:00:00+00:00"})
    assert resp.status_code == 200, resp.text
    assert seen == [None]
    # No loading is balanced with no airplane to load.
    assert resp.json()["balance"] is None
