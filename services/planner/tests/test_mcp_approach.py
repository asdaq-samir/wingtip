"""change_approach (app.mcp.procedure_picks) through the MCP SDK's client:
an approach loaded at one of the route's fields, activated, deactivated,
its missed approach unsuspended and suspended, and removed, each written
by the engine's procedures_write and read back by its procedures_read, as
the web's FPL keeps it ("KDLH:I27:::L" loaded, ":::M" into the missed
approach). The field's approaches are the CIFP's, stubbed here; the plan
of the route is test_mcp_edits' points alone."""

import pytest

from app.mcp import calls, flight_view, procedure_picks

from .mcp_harness import call
from .test_mcp_edits import fake_plan
from .test_mcp_tools import answer, refusal

ROUTE = {"departure": "C81", "destination": "KDLH"}
ILS = {"id": "I27", "name": "ILS OR LOC RWY 27", "kind": "approach", "transitions": ["ANDOE"], "runway_transitions": []}


@pytest.fixture(autouse=True)
def _field(monkeypatch):
    calls._WINDOW.storage.reset()

    async def approaches_at(ident):
        return {"I27": ILS} if ident == "KDLH" else {}

    async def planned(flight, pilot_id):
        return fake_plan(flight), None

    monkeypatch.setattr(procedure_picks, "_approaches_at", approaches_at)
    monkeypatch.setattr(flight_view, "planned", planned)


def step(flight: dict, action: str, **more) -> dict:
    return answer(call("change_approach", {"flight": flight, "airport": "KDLH", "action": action, **more}))


def test_an_approach_loads_then_activates_and_its_missed_approach_is_suspended_till_asked():
    loaded = step(ROUTE, "load", approach="i27", transition="ANDOE")
    assert loaded["flight"]["procedures"] == "KDLH:I27:ANDOE::L"
    assert loaded["view"]["approaches"][0] | {} == {
        "airport": "KDLH",
        "id": "I27",
        "name": "ILS OR LOC RWY 27",
        "transition": "ANDOE",
        "state": "loaded",
        "loaded": True,
        "missed": False,
    }
    active = step(loaded["flight"], "activate")
    assert active["flight"]["procedures"] == "KDLH:I27:ANDOE"
    assert active["view"]["approaches"][0]["state"] == "active, missed approach suspended"
    missed = step(active["flight"], "unsuspend_missed")
    assert missed["flight"]["procedures"] == "KDLH:I27:ANDOE::M"
    assert step(missed["flight"], "suspend_missed")["flight"]["procedures"] == "KDLH:I27:ANDOE"
    back = step(missed["flight"], "deactivate")
    assert back["flight"]["procedures"] == "KDLH:I27:ANDOE::L"
    assert step(back["flight"], "remove")["flight"]["procedures"] == ""


def test_an_approach_the_field_has_not_is_named_with_those_it_has():
    said = refusal(call("change_approach", {"flight": ROUTE, "airport": "KDLH", "action": "load", "approach": "R09"}))
    assert "KDLH has no approach R09. Its approaches: I27 (ILS OR LOC RWY 27)." in said


def test_a_loaded_approach_flies_no_missed_approach_and_a_field_off_the_route_has_none():
    loaded = step(ROUTE, "load", approach="I27")
    assert "activate it before its missed approach" in refusal(
        call("change_approach", {"flight": loaded["flight"], "airport": "KDLH", "action": "unsuspend_missed"})
    )
    assert "KOSH is not on this route" in refusal(
        call("change_approach", {"flight": ROUTE, "airport": "KOSH", "action": "load", "approach": "I27"})
    )
    assert "No approach is loaded at KDLH" in refusal(call("change_approach", {"flight": ROUTE, "airport": "KDLH", "action": "activate"}))
