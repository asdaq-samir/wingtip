"""The plan endpoints through their response models, with every live
dependency stubbed (plan_world): the chart read and its scores, the airports
table, the altitude selection and the per-leg wind lookup. What this proves
is the contract -- that a real leg dict validates as a Leg (including the
`from` alias), that /api/plan and /api/checkpoints serialise, and that a
plan without winds or scores is refused or bounded as it should be."""

import pytest

from app import checkpoint_scoring
from app.main import app

from .conftest import AirplaneClient
from .plan_world import _stubbed_world, no_winds  # noqa: F401 -- the stubbed world, autouse

client = AirplaneClient(app)


def test_checkpoints_marks_the_selected_candidates():
    resp = client.get("/api/checkpoints", params={"dep": "c81", "dest": "kdlh"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["departure"]["ident"] == "C81"
    assert {c["id"] for c in body["selected"]} <= {c["id"] for c in body["candidates"]}
    assert all("selected" in c for c in body["candidates"])


def test_plan_returns_legs_with_from_and_to_and_totals():
    resp = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "checkpoints": True})

    assert resp.status_code == 200
    body = resp.json()
    legs = body["legs"]
    assert legs[0]["from"] == "C81" and legs[-1]["to"] == "KDLH"
    assert len(legs) == len(body["selected"]) + 1
    assert body["totals"]["unflyable_legs"] == 0
    assert body["altitude_ft"] == 4500.0
    assert body["aircraft"]["name"] == "c172" and body["aircraft"]["cruise_tas_kt"] > 0
    # The four plans, the fastest flown unless asked otherwise. One
    # legal altitude here, so all four are the same plan.
    assert [o["kind"] for o in body["altitude_options"]] == ["lowest", "highest", "fastest", "economical"]
    assert body["altitude_choice"] == "fastest"
    (step,) = body["altitude_options"][0]["steps"]
    assert (step["from"], step["to"], step["altitude_ft"]) == ("C81", "KDLH", 4500.0)
    assert step["distance_nm"] == pytest.approx(sum(leg["distance_nm"] for leg in legs), abs=0.2)
    assert "total_min" not in body["altitude_options"][2]  # it only ever repeated ete_min


def test_plan_flies_the_plan_the_pilot_chose():
    resp = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "altitude_choice": "fastest"})

    assert resp.status_code == 200
    assert resp.json()["altitude_choice"] == "fastest"


def test_plan_without_winds_is_a_502(monkeypatch):
    no_winds(monkeypatch)
    resp = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH"})

    assert resp.status_code == 502
    assert "winds-06 unavailable" in resp.json()["detail"]


def test_a_plan_whose_scoring_hangs_answers_within_the_bound(monkeypatch):
    """Scoring ran before the bounded wait, so a slow scorer put the plan
    past its callers' timeout -- model-service then, the chart's first
    read now."""
    import threading

    from wingtip import flight_plan

    release = threading.Event()

    def slow_read(dep, dest):
        release.wait(timeout=5)
        return []

    monkeypatch.setattr(checkpoint_scoring, "score", slow_read)
    monkeypatch.setattr(flight_plan, "COMPUTE_LIMIT_S", 0.3)
    try:
        resp = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "checkpoints": True})
    finally:
        release.set()

    assert resp.status_code == 504
    assert "the chart reader" in resp.json()["detail"]


@pytest.mark.parametrize("path", ["/api/plan", "/api/navlog"])
@pytest.mark.parametrize("speed", ["cruise_tas_kt", "climb_tas_kt"])
def test_a_speed_of_zero_is_refused_not_divided_by(path, speed):
    resp = client.get(path, params={"dep": "C81", "dest": "KDLH", speed: 0})
    assert resp.status_code == 422


def test_the_chart_alone_is_there_for_a_map_with_no_route():
    resp = client.get("/api/chart")

    assert resp.status_code == 200
    body = resp.json()
    assert body["chart_cycle"] and body["max_zoom"] >= body["min_zoom"]
    assert any(layer["kind"] == "sec" for layer in body["chart_layers"])
    # The map waits on it for its first tile, so the edge may keep it a minute.
    assert resp.headers["cache-control"] == "public, max-age=60"


def test_a_local_flight_is_its_time_aloft_at_cruise_burn_with_the_fuel_check(monkeypatch):
    """C81 to C81, the pattern for an hour and a half: no legs, the fuel
    the burn gives, the day reserve with no departure time at noon."""
    from datetime import datetime, timezone

    from wingtip import planning

    monkeypatch.setattr(planning, "now", lambda: datetime(2026, 9, 22, 17, 0, tzinfo=timezone.utc))
    resp = client.get("/api/local-flight", params={"dep": "C81", "dest": "C81", "duration_min": 90})

    assert resp.status_code == 200
    totals = resp.json()
    assert totals["distance_nm"] == 0 and totals["ete_min"] == 90
    assert totals["fuel_gal"] > 0
    assert totals["reserve_min"] == 30 and totals["night"] is False
    assert totals["fuel_required_gal"] == round(totals["fuel_gal"] + totals["taxi_gal"] + totals["reserve_gal"], 1)


def test_a_local_flight_is_one_airport_to_itself():
    assert client.get("/api/local-flight", params={"dep": "C81", "dest": "KDLH"}).status_code == 422


@pytest.mark.parametrize("asked", [{}, {"checkpoints": False}])
def test_without_checkpoints_the_legs_run_point_to_point_and_nothing_is_found(monkeypatch, messages, asked):
    """Not asked for, none found: finding checkpoints is the pilot's to
    ask for once the route is drawn (the owner, 2026-11-18), so neither
    the plan nor the nav log reads the chart or scores for them."""

    def none_found(*args, **kwargs):
        raise AssertionError("checkpoints found with none asked for")

    from app import plan_query
    from app.routers import navlog

    for module, name in ((checkpoint_scoring, "score"), (plan_query, "route_checkpoints"), (navlog, "route_checkpoints")):
        monkeypatch.setattr(module, name, none_found)
    monkeypatch.setattr(checkpoint_scoring.chart_model, "corridor", none_found)
    params = {"dep": "C81", "dest": "KDLH", **asked}
    body = client.get("/api/plan", params=params).json()
    assert body["selected"] == []
    assert [(leg["from"], leg["to"]) for leg in body["legs"]] == [("C81", "KDLH")]
    legs = [m for m in messages(client.get("/api/navlog", params=params)) if m["type"] == "leg"]
    assert [(leg["from"], leg["to"]) for leg in legs] == [("C81", "KDLH")]
