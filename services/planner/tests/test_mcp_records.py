"""The pilot's records as the connector asks the gateway for them
(app.mcp.records): on its internal port, which nothing publishes, with the
planner's own secret and the pilot's id -- never on the public one."""

import anyio
import httpx2
import pytest

from app.mcp import records

ASKED: list[httpx2.Request] = []


@pytest.fixture
def gateway(monkeypatch):
    """The gateway's internal port, answering as it would for a pilot."""
    ASKED.clear()
    monkeypatch.setenv("MCP_INTERNAL_TOKEN", "planner-secret")

    def answer(request: httpx2.Request) -> httpx2.Response:
        ASKED.append(request)
        return httpx2.Response(200, json=[{"tailNumber": "N12345"}])

    real = httpx2.AsyncClient
    monkeypatch.setattr(
        records.httpx2, "AsyncClient", lambda **kw: real(transport=httpx2.MockTransport(answer), **kw)
    )
    return ASKED


def test_records_are_asked_on_the_gateways_internal_port(gateway):
    planes = anyio.run(records.airplanes, "42")
    assert planes == [{"tailNumber": "N12345"}]
    (asked,) = gateway
    assert str(asked.url) == "http://gateway:8081/internal/mcp/aircraft"
    assert asked.headers["X-Internal-Token"] == "planner-secret" and asked.headers["X-Pilot-Id"] == "42"
