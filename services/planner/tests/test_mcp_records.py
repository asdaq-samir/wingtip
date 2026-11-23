"""The pilot's records as the connector asks the gateway for them
(app.mcp.records): on its internal port, which nothing publishes, with the
planner's own secret and the pilot's id -- never on the public one."""

import anyio
import httpx2
import pytest

from mcp.server.mcpserver.exceptions import ToolError

from app.mcp import records
from wingtip.config import get_settings

ASKED: list[httpx2.Request] = []


@pytest.fixture
def gateway(monkeypatch):
    """The gateway's internal port, answering as it would for a pilot."""
    ASKED.clear()
    monkeypatch.setenv("MCP_INTERNAL_TOKEN", "planner-secret-0123456789abcdef0123")

    def answer(request: httpx2.Request) -> httpx2.Response:
        ASKED.append(request)
        if request.url.path == "/internal/mcp/connection":
            live = (
                request.headers["X-Pilot-Id"] == "42"
                and request.headers["X-Client-Id"] == "claude"
                and request.headers["X-Connector-Token"] == "the-token"
            )
            return httpx2.Response(204 if live else 404)
        if request.method == "DELETE":
            return httpx2.Response(204)
        if request.method == "PUT":
            return httpx2.Response(200, json={"id": 12})
        return httpx2.Response(200, json=[{"tailNumber": "N12345"}])

    real = httpx2.AsyncClient
    monkeypatch.setattr(records.httpx2, "AsyncClient", lambda **kw: real(transport=httpx2.MockTransport(answer), **kw))
    return ASKED


def test_records_are_asked_on_the_gateways_internal_port(gateway):
    planes = anyio.run(records.airplanes, "42")
    assert planes == [{"tailNumber": "N12345"}]
    (asked,) = gateway
    assert str(asked.url) == "http://gateway:8081/internal/mcp/aircraft"
    assert asked.headers["X-Internal-Token"] == "planner-secret-0123456789abcdef0123" and asked.headers["X-Pilot-Id"] == "42"


def test_a_saved_flight_is_replanned_and_deleted_by_its_id(gateway):
    assert anyio.run(records.replan_flight, "42", 12, {"departureIdent": "C81"}) == {"id": 12}
    assert anyio.run(records.delete_flight, "42", 12) is None
    put, delete = gateway
    assert (put.method, str(put.url)) == ("PUT", "http://gateway:8081/internal/mcp/flights/12")
    assert (delete.method, str(delete.url)) == ("DELETE", "http://gateway:8081/internal/mcp/flights/12")
    assert delete.headers["X-Pilot-Id"] == "42"


def test_a_connection_stands_while_the_gateway_says_so(gateway):
    assert anyio.run(records.connection_live, "42", "claude", "the-token") is True
    assert anyio.run(records.connection_live, "42", "chatgpt", "the-token") is False
    assert anyio.run(records.connection_live, "7", "claude", "the-token") is False
    # The token itself is asked about (the deep review of 2026-11-21).
    assert anyio.run(records.connection_live, "42", "claude", "another-token") is False
    assert str(gateway[0].url) == "http://gateway:8081/internal/mcp/connection"


def test_without_the_secret_or_an_answer_no_connection_stands(monkeypatch):
    monkeypatch.delenv("MCP_INTERNAL_TOKEN", raising=False)
    assert anyio.run(records.connection_live, "42", "claude", "the-token") is False
    monkeypatch.setenv("MCP_INTERNAL_TOKEN", "planner-secret-0123456789abcdef0123")
    get_settings.cache_clear()

    def unreachable(request):
        raise httpx2.ConnectError("refused", request=request)

    real = httpx2.AsyncClient
    monkeypatch.setattr(records.httpx2, "AsyncClient", lambda **kw: real(transport=httpx2.MockTransport(unreachable), **kw))
    assert anyio.run(records.connection_live, "42", "claude", "the-token") is False


def test_a_flight_the_gateway_keeps_as_reviewed_is_said_in_its_words(monkeypatch):
    """A 409 from the gateway (a flight put to an instructor keeps its
    route, FlightService.replan) reaches the pilot as the gateway said it,
    not as "try again in a minute"."""
    monkeypatch.setenv("MCP_INTERNAL_TOKEN", "planner-secret-0123456789abcdef0123")
    said = {"status": 409, "detail": "its route stays as reviewed: save the new plan as a new flight."}
    real = httpx2.AsyncClient
    answer = httpx2.MockTransport(lambda request: httpx2.Response(409, json=said))
    monkeypatch.setattr(records.httpx2, "AsyncClient", lambda **kw: real(transport=answer, **kw))
    with pytest.raises(ToolError, match="kept the flight as it was: its route stays as reviewed"):
        anyio.run(records.replan_flight, "42", 12, {"departureIdent": "C81"})


def test_a_saved_flight_gone_since_it_was_listed_is_not_said_as_the_account(monkeypatch):
    """The mcp audit of 2026-11-23, L6: a 404 on one flight is that flight
    gone, which reconnecting would not bring back; a 400 is the gateway's
    own words with what to do."""
    monkeypatch.setenv("MCP_INTERNAL_TOKEN", "planner-secret-0123456789abcdef0123")
    real = httpx2.AsyncClient

    def answering(status, body):
        transport = httpx2.MockTransport(lambda request: httpx2.Response(status, json=body))
        monkeypatch.setattr(records.httpx2, "AsyncClient", lambda **kw: real(transport=transport, **kw))

    answering(404, {"detail": "not found"})
    with pytest.raises(ToolError, match="no longer in the pilot's Wingtip: my_flights lists theirs"):
        anyio.run(records.delete_flight, "42", 12)
    with pytest.raises(ToolError, match="disconnect Wingtip and connect it again"):
        anyio.run(records.airplanes, "42")
    answering(400, {"detail": "stops must be identifiers"})
    with pytest.raises(ToolError, match="refused the flight: stops must be identifiers. Change what it names"):
        anyio.run(records.save_flight, "42", {})
