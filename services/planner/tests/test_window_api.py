"""POST /api/departure-window through its models, the planner's plan, its
briefing and the TAFs' reach stubbed: each hour is judged by the Go /
No-Go's own findings for a flight leaving then, an hour hours off on the
forecast rather than the METAR of now, and the go hours joined into
windows (the engine's departure_window, apps/web/src/lib/fixtures/
departureWindow.json)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from wingtip import planning

from app.main import app
from app.routers import gonogo
from app.window import hours as window_hours
from .test_gonogo_api import briefing, legs, nav, totals

client = TestClient(app)
NOW = datetime(2026, 10, 6, 10, 30, tzinfo=timezone.utc)
C81, KDLH = (42.3244, -88.0741), (46.8421, -92.1936)


@pytest.fixture
def stubbed(monkeypatch):
    world = {"reach": NOW + timedelta(hours=10), "asked": [], "plans": 0}
    route = SimpleNamespace(idents=["C81", "KDLH"], start=C81, end=KDLH,
                            airports=[{"elevation_ft": 900.0, "lat": C81[0], "lon": C81[1]},
                                      {"elevation_ft": 1400.0, "lat": KDLH[0], "lon": KDLH[1]}])
    monkeypatch.setattr(planning, "now", lambda: NOW)
    monkeypatch.setattr(window_hours, "load_route", lambda dep, dest, stops: route)
    monkeypatch.setattr(window_hours.forecast, "taf_reach", lambda path: world["reach"].timestamp())
    monkeypatch.setattr(window_hours.forecast, "forecast_report", lambda lat, lon, ident, at, latest: {
        "temp_c": 15, "altimeter_in_hg": 29.92, "wind_dir_true_deg": 270, "wind_speed_kt": 8, "wind_gust_kt": None})

    def plan(q, r):
        world["plans"] += 1
        return gonogo.Planned(nav=nav(), legs=legs(), totals=totals())

    monkeypatch.setattr(window_hours, "plan_for", plan)

    def brief(q, ete_min):
        world["asked"].append((q.depart, ete_min))
        hour = q.depart.hour
        if hour == 11:
            # About to leave: the METAR of now says IFR at the departure.
            return briefing(vfr_not_recommended=["C81 reporting IFR"])
        if hour == 12:
            # An hour and a half off: the TAF along the route says 900 ft.
            return briefing(forecast={"min_ceiling_ft": 900, "min_visibility_sm": 4, "stations": []},
                            vfr_not_recommended=["C81 reporting IFR"])
        return briefing()

    monkeypatch.setattr(gonogo, "brief_for", brief)
    return world


def ask(**over) -> dict:
    return {"dep": "C81", "dest": "KDLH", "day": "2026-10-06", "hours": 4, **over}


def test_each_hour_is_the_go_no_go_for_a_flight_leaving_then_and_the_go_hours_a_window(stubbed):
    resp = client.post("/api/departure-window", json=ask())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    got = [(h["depart"][11:16], h["verdict"]) for h in body["hours"]]
    assert got == [("11:00", "no-go"), ("12:00", "no-go"), ("13:00", "go"), ("14:00", "go")]
    first, second = body["hours"][0], body["hours"][1]
    # Now: the report of now. Hours off: the forecast, read afresh.
    assert first["reasons"][0]["detail"] == "VFR not recommended: C81 reporting IFR"
    assert second["reasons"][0]["detail"].startswith("VFR not recommended: ")
    assert "C81 reporting" not in second["reasons"][0]["detail"]
    # Leaving at 06:00 CDT, before sunrise: at night (14 CFR 1.1).
    assert first["night"] is True and body["hours"][2]["night"] is False
    assert [(w["start"][11:16], w["last"][11:16], w["hours"]) for w in body["windows"]] == [("13:00", "14:00", 2)]
    assert body["windows"][0]["ete_min"] == 150.0
    assert body["hours"][2]["ete_min"] == 150.0 and body["hours"][2]["fuel_gal"] == 24.0
    # Each hour briefed for its own flight.
    assert sorted(d.hour for d, _ in stubbed["asked"]) == [11, 12, 13, 14]
    assert {e for _, e in stubbed["asked"]} == {150.0}


def test_no_airplane_judges_the_weather_and_daylight_and_says_no_time_or_fuel(stubbed):
    body = client.post("/api/departure-window", json=ask(airplane=False)).json()
    assert body["airplane"] is False
    assert all(h["ete_min"] is None and h["fuel_gal"] is None for h in body["hours"])
    assert all(r["key"] not in ("fuel", "runways", "balance") for h in body["hours"] for r in h["reasons"])
    # The briefing is asked for its own default window, not an airplane's ETE.
    assert {e for _, e in stubbed["asked"]} == {None}


def test_the_hours_stop_where_the_tafs_do_and_a_flight_past_them_is_not_known(stubbed):
    stubbed["reach"] = NOW + timedelta(hours=2, minutes=30)
    body = client.post("/api/departure-window", json=ask()).json()
    assert [h["depart"][11:16] for h in body["hours"]] == ["11:00", "12:00"]
    # Leaving at 12:00 for 150 minutes lands past 13:00, where the TAFs end.
    assert body["hours"][1]["verdict"] == "unknown"
    assert body["hours"][1]["reasons"][0]["detail"] == "The forecasts do not reach this flight"


def test_no_taf_near_the_route_is_no_hours(stubbed, monkeypatch):
    monkeypatch.setattr(window_hours.forecast, "taf_reach", lambda path: None)
    body = client.post("/api/departure-window", json=ask()).json()
    assert body["hours"] == [] and body["windows"] == [] and body["forecast_until"] is None
