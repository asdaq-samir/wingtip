"""The connector's flight tools (app.mcp.flight_tools, pilot_tools'
save_flight) through the MCP SDK's client: the nav log /api/plan works
out -- the engine's legs in test_plan's stubbed world -- flown on the
pilot's own airplane by its tail number or on none, the Go / No-Go
/api/go-no-go gives in test_gonogo_api's, and a planned flight saved to
the gateway as the app saves one."""

import pytest
from mcp.types import TextContent

from app.mcp import calls, records

from .mcp_harness import call
from .test_gonogo_api import stubbed  # noqa: F401 -- the route, plan and briefing of a quiet flight
from .test_plan import _stubbed_world  # noqa: F401 -- the stubbed chart, altitude and air, autouse
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
