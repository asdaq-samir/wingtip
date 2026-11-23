"""The connector's flight tools (app.mcp.flight_tools, pilot_tools'
save_flight) through the MCP SDK's client: the nav log /api/plan works
out -- the engine's legs in test_plan's stubbed world -- flown on the
pilot's own airplane by its tail number or on none, the Go / No-Go
/api/go-no-go gives in test_gonogo_api's, and a planned flight saved to
the gateway as the app saves one."""

import pytest
from mcp.types import TextContent

from app.mcp import calls, flight_tools, records
from app.settings import get_settings

from .mcp_harness import call
from .test_gonogo_api import stubbed  # noqa: F401 -- the route, plan and briefing of a quiet flight
from .plan_world import _stubbed_world  # noqa: F401 -- the stubbed chart, altitude and air, autouse
from .test_mcp_tools import AIRPLANE, answer


@pytest.fixture(autouse=True)
def _theirs(monkeypatch):
    """The pilot's one airplane and what the gateway was asked to save."""
    calls._WINDOW.storage.reset()
    saved = []

    async def airplanes(pilot_id):
        return [AIRPLANE]

    async def save(pilot_id, request):
        saved.append((pilot_id, request))
        return {"id": 77, "departureIdent": request["departureIdent"], "destinationIdent": request["destinationIdent"]}

    monkeypatch.setattr(records, "airplanes", airplanes)
    monkeypatch.setattr(records, "save_flight", save)
    return saved


def test_a_route_with_the_pilots_airplane_has_times_and_fuel():
    plan = answer(call("plan_route", {"departure": "C81", "destination": "KDLH", "airplane_tail": "123AB"}))
    assert plan["route"] == "C81 KDLH" and plan["airplane"] == "N123AB (C172)"
    assert plan["legs"] and all(leg["ete_min"] > 0 and leg["fuel_gal"] > 0 for leg in plan["legs"])
    assert {"from", "to", "magnetic_heading_deg", "groundspeed_kt"} <= set(plan["legs"][0])
    assert plan["totals"]["distance_nm"] > 0 and plan["totals"]["usable_fuel_gal"] == 53.0
    assert plan["sources"][0]["source"].startswith("Wingtip engine")


def test_a_route_with_no_airplane_has_its_miles_and_no_times():
    """No airplane named is none assumed (the owner, 2026-11-09)."""
    plan = answer(call("plan_route", {"departure": "C81", "destination": "KDLH"}))
    assert plan["airplane"] is None
    assert all("ete_min" not in leg and "fuel_gal" not in leg for leg in plan["legs"])
    assert "ete_min" not in plan["totals"] and plan["totals"]["distance_nm"] > 0


def test_an_airplane_the_pilot_does_not_have_is_named_with_theirs():
    result = call("plan_route", {"departure": "C81", "destination": "KDLH", "airplane_tail": "N999ZZ"})
    said = " ".join(c.text for c in result.content if isinstance(c, TextContent))
    assert result.is_error and "No airplane N999ZZ" in said and "N123AB" in said


def test_the_briefing_is_the_go_no_go_line_and_its_findings(stubbed):  # noqa: F811
    brief = answer(call("flight_briefing", {"departure": "C81", "destination": "KDLH", "depart_at": "2026-10-06T14:00:00Z"}))
    assert brief["line"] == {"finding": "ok", "words": "Nothing found against this flight"}
    assert {f["key"] for f in brief["findings"]} >= {"weather", "fuel", "altitude"}
    assert brief["risk"]["line"] == "Low · 0 points"


def test_saving_a_flight_files_the_planned_route_for_the_pilot(_theirs):
    saved = answer(call("save_flight", {"departure": "C81", "destination": "KDLH", "airplane_tail": "N123AB", "cruise_altitude_ft": 5500}))
    assert saved["saved"]["id"] == 77
    pilot_id, request = _theirs[0]
    assert pilot_id == "7" and request["aircraftId"] == 3
    assert (request["departureIdent"], request["destinationIdent"]) == ("C81", "KDLH")
    assert request["picks"] == "altitude_ft=5500"
    rows = request["checkpoints"]
    assert [r["category"] for r in rows] == ["departure", "destination"] and rows[0]["alongTrackNm"] == 0.0
    assert rows[-1]["alongTrackNm"] == round(request["totalDistanceNm"], 1)


def _verdict_asked(monkeypatch) -> list:
    """/api/go-no-go as flight_briefing asks it, answered with a balance
    and a runways finding as the endpoint words them for its sample load."""
    asked = []

    async def go_no_go(body):
        asked.append(body)
        items = [
            {"key": "balance", "label": "Weight and balance", "finding": "ok", "detail": "2,407 lb at 41.2 in, within limits"},
            {"key": "runways", "label": "Runways", "finding": "ok", "detail": "Takeoff 1,200 ft of 10,162"},
        ]
        return {"line": {"finding": "ok", "words": "Nothing found against this flight"}, "items": items, "risk": None}

    monkeypatch.setattr(flight_tools, "go_no_go", go_no_go)
    return asked


def test_the_briefing_never_says_the_poh_sample_load_is_the_pilots(monkeypatch):
    """The mcp audit of 2026-11-23, H2: without the pilot's load the
    endpoint balances the POH's sample airplane with a 170 lb pilot; that
    is said not worked, never "within limits", and the runway distances
    are said to be at the sample load."""
    asked = _verdict_asked(monkeypatch)
    brief = answer(call("flight_briefing", {"departure": "C81", "destination": "KDLH", "airplane_tail": "N123AB"}))
    found = {f["key"]: f for f in brief["findings"]}
    assert found["balance"]["finding"] == "unknown" and "within limits" not in found["balance"]["detail"]
    assert "stations_lb" in found["balance"]["detail"] and "sample load" in found["runways"]["detail"]
    assert "load" not in asked[0] and any("stations_lb" in m or "empty_weight_lb" in m for m in brief["missing"])


def test_the_briefing_balances_the_pilots_own_load_and_weighs_the_airplanes_records(monkeypatch):
    asked = _verdict_asked(monkeypatch)
    vor = {"goodThrough": "2026-11-30", "withinLimit": True, "checkedOn": "2026-11-01"}
    inspections = {"annualGoodThrough": "2027-03-31", "hundredHourDueAtHours": 1500.0, "hoursNow": 1490.0, "forHire": False}
    squawk = {"text": "Nav light out", "inoperative": True, "deferredFor": "VFR_DAY"}
    weighed = {
        **AIRPLANE,
        "figures": {"emptyWeightLb": 1642.0, "emptyMomentLbIn": 62600.0},
        "vorCheck": vor,
        "inspections": inspections,
        "openSquawks": [squawk],
    }

    async def airplanes(pilot_id):
        return [weighed]

    monkeypatch.setattr(records, "airplanes", airplanes)
    ask = {"departure": "C81", "destination": "KDLH", "airplane_tail": "N123AB", "stations_lb": [190, 170, 0, 40], "fuel_gal": 40}
    brief = answer(call("flight_briefing", ask))
    load = asked[0]["load"]
    assert load["stations_lb"] == [190, 170, 0, 40] and load["fuel_gal"] == 40 and load["empty_weight_lb"] == 1642.0
    assert brief["missing"] == [] and brief["findings"][0]["detail"].endswith("within limits")
    own = asked[0]["own_airplane"]
    assert own["vor_check"] == {"good_through": "2026-11-30", "within_limit": True}
    # Not flown for hire: the 100-hour is not owed (14 CFR 91.409(b)).
    assert own["inspections"]["annual_good_through"] == "2027-03-31" and own["inspections"]["hundred_hour_due_at_hours"] is None
    assert own["squawks"] == [{"text": "Nav light out", "inoperative": True, "deferred_for": "VFR_DAY"}]


def test_an_ifr_route_saved_keeps_its_rules(_theirs):
    answer(call("save_flight", {"departure": "C81", "destination": "KDLH", "cruise_altitude_ft": 7000, "rules": "ifr"}))
    assert _theirs[0][1]["picks"] == "altitude_ft=7000&rules=ifr"


def test_the_plan_names_the_winds_it_flew_and_its_link_keeps_the_time(monkeypatch):
    """The mcp audit of 2026-11-23: one source for the winds in every tool
    (M4), and the link opens the plan at the time it was read for (L8)."""
    monkeypatch.setenv("MCP_ISSUER", "https://wingtip.test")
    get_settings.cache_clear()
    plan = answer(call("plan_route", {"departure": "C81", "destination": "KDLH", "depart_at": "2026-12-01T15:00:00Z"}))
    assert plan["sources"][1]["source"].startswith("Aviation Weather Center GFA winds aloft and NOAA GFS temperatures")
    assert "depart=2026-12-01T15%3A00%3A00%2B00%3A00" in plan["open_in_wingtip"]
