"""The connector's saved-flight tools (app.mcp.saved_tools) and the live
view's page (app.mcp.view_resource), through the MCP SDK's client: a
saved flight opened as the flight to edit, the flight saved new, put over
the one it came from, and deleted, each asked of the gateway as the app's
own records are (stubbed here, test_mcp_records checks the real calls);
and the view's page, the web's build read from the gateway, served as an
MCP App with its Content-Security-Policy."""

import anyio
import httpx2
import pytest

from app.mcp import calls, flight_view, records, view_resource
from app.settings import get_settings

from .mcp_harness import call, session
from .test_mcp_edits import fake_plan
from .test_mcp_tools import answer, refusal

SAVED = {
    "id": 12,
    "departureIdent": "C81",
    "destinationIdent": "KDLH",
    "stops": ["KMSN"],
    "aircraftTailNumber": None,
    "cruiseAltitudeFt": 5500,
    "picks": "altitude_ft=5500&procs=KDLH%3AI27%3A%3A%3AL",
}
FLIGHT = {"departure": "C81", "destination": "KDLH", "stops": ["KMSN"], "saved_flight_id": 12}


@pytest.fixture(autouse=True)
def _account(monkeypatch):
    calls._WINDOW.storage.reset()
    asked: list = []

    async def flights(pilot_id):
        return [SAVED]

    async def save(pilot_id, request):
        asked.append(("save", pilot_id, request))
        return {"id": 99}

    async def replan(pilot_id, flight_id, request):
        asked.append(("replan", flight_id, request))
        return {"id": flight_id}

    async def delete(pilot_id, flight_id):
        asked.append(("delete", flight_id))

    async def planned(flight, pilot_id):
        return fake_plan(flight), None

    async def approaches_of(text):
        return []

    for name, fn in {"flights": flights, "save_flight": save, "replan_flight": replan, "delete_flight": delete}.items():
        monkeypatch.setattr(records, name, fn)
    monkeypatch.setattr(flight_view, "planned", planned)
    monkeypatch.setattr(flight_view, "approaches_of", approaches_of)
    return asked


def test_a_saved_flight_opens_as_the_flight_to_edit():
    got = answer(call("open_saved_flight", {"flight_id": 12}))
    wanted = {"stops": ["KMSN"], "cruise_altitude_ft": 5500, "procedures": "KDLH:I27:::L", "saved_flight_id": 12}
    assert {k: got["flight"][k] for k in wanted} == wanted
    assert "No saved flight 13" in refusal(call("open_saved_flight", {"flight_id": 13}))


def test_the_flight_is_saved_new_with_its_procedures(_account):
    got = answer(call("save_flight_plan", {"flight": {**FLIGHT, "saved_flight_id": None, "procedures": "KDLH:I27:::L"}}))
    assert got["flight"]["saved_flight_id"] == 99
    kind, pilot_id, request = _account[0]
    assert (kind, pilot_id) == ("save", "7") and request["stops"] == ["KMSN"]
    assert request["picks"] == "procs=KDLH%3AI27%3A%3A%3AL"


def test_the_saved_flight_is_replaced_and_one_from_nowhere_is_refused(_account):
    answer(call("update_saved_flight", {"flight": {**FLIGHT, "cruise_altitude_ft": 7500}}))
    kind, flight_id, request = _account[0]
    assert (kind, flight_id) == ("replan", 12) and request["picks"] == "altitude_ft=7500"
    assert "not from a saved flight" in refusal(call("update_saved_flight", {"flight": {**FLIGHT, "saved_flight_id": None}}))


def test_a_saved_flight_is_deleted_only_if_it_is_theirs(_account):
    assert answer(call("delete_saved_flight", {"flight_id": 12}))["deleted"] == {"id": 12, "route": "C81 to KDLH"}
    assert _account == [("delete", 12)]
    assert "No saved flight 5" in refusal(call("delete_saved_flight", {"flight_id": 5}))


def test_saving_replacing_and_deleting_need_the_write_scope():
    for tool, args in (
        ("save_flight_plan", {"flight": FLIGHT}),
        ("update_saved_flight", {"flight": FLIGHT}),
        ("delete_saved_flight", {"flight_id": 12}),
    ):
        assert "not allowed wingtip:write" in refusal(call(tool, args, token="read-7")), tool


def _read_view() -> tuple:
    async def ask():
        async with session() as client:
            listed = (await client.list_resources()).resources
            read = await client.read_resource(view_resource.VIEW_URI)
            return listed, read

    return anyio.run(ask)


@pytest.fixture
def gateway(monkeypatch):
    """The gateway's /app/claude-view.html, as a test's handler answers it."""
    view_resource._KEPT.clear()
    monkeypatch.setenv("MCP_ISSUER", "https://wingtip.test")
    get_settings.cache_clear()
    pages: dict = {}

    async def fetched():
        return httpx2.Response(pages.get("status", 200), text=pages.get("text", ""))

    monkeypatch.setattr(view_resource, "_fetched", fetched)
    return pages


def test_the_view_is_the_web_s_build_served_as_an_mcp_app(gateway):
    gateway["text"] = '<!doctype html><html><head><meta name="wingtip-view" content="1"></head><body></body></html>'
    listed, read = _read_view()
    assert [r.uri for r in listed] == [view_resource.VIEW_URI]
    content = read.contents[0]
    assert content.mime_type == "text/html;profile=mcp-app" and 'name="wingtip-view"' in content.text
    ui = content.meta["ui"]
    assert ui["csp"] == {"resourceDomains": ["https://wingtip.test"], "connectDomains": ["https://wingtip.test"]}
    assert ui["preferredDisplayMode"] == "fullscreen"


def test_the_app_s_own_page_in_its_place_is_said_as_the_view_not_built(gateway):
    gateway["text"] = "<!doctype html><html><head></head><body>the app</body></html>"
    _, read = _read_view()
    assert "not built on this server" in read.contents[0].text


def test_every_flight_tool_opens_the_view_and_deleting_does_not():
    from .mcp_harness import listed

    tools = {t.name: t for t in listed()}
    drawn = {name for name, t in tools.items() if (t.meta or {}).get("ui", {}).get("resourceUri") == view_resource.VIEW_URI}
    assert drawn >= {"show_flight", "add_stop", "change_approach", "save_flight_plan", "open_saved_flight"}
    assert "delete_saved_flight" not in drawn and "plan_route" not in drawn
