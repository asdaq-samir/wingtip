"""The connector's door (app.mcp): no tool without a token the gateway
signed for this connector, the resource metadata that sends Claude and
ChatGPT to the gateway to sign in, the rate limit per pilot, and the
tool list itself held to a snapshot -- the contract the directories
review, so a change to a name, a schema or a hint is a reviewed one."""

import json
import os
import time
from pathlib import Path

import anyio
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from mcp.types import TextContent

from app.mcp import calls
from app.mcp.auth import GatewayTokens
from wingtip.config import get_settings

from .mcp_harness import ISSUER, RESOURCE, call, connector, http, listed
from .test_airports import stub_place

SNAPSHOT = Path(__file__).parent / "mcp_tools.snapshot.json"


@pytest.fixture(autouse=True)
def _fresh_counts():
    calls._WINDOW.storage.reset()
    yield
    calls._WINDOW.storage.reset()


def text(result) -> str:
    return " ".join(c.text for c in result.content if isinstance(c, TextContent))


def test_a_call_with_no_token_is_a_401_that_names_the_resource_metadata():
    _, app = connector()

    async def ask():
        async with http(app) as client:
            return await client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})

    resp = anyio.run(ask)
    assert resp.status_code == 401
    challenge = resp.headers["www-authenticate"]
    assert challenge.startswith("Bearer ")
    assert f'resource_metadata="{ISSUER}/.well-known/oauth-protected-resource/mcp"' in challenge


def test_the_resource_metadata_names_the_gateway_and_both_scopes():
    _, app = connector()

    async def ask():
        async with http(app) as client:
            return await client.get("/.well-known/oauth-protected-resource/mcp")

    body = anyio.run(ask).json()
    assert body["resource"] == RESOURCE
    assert body["authorization_servers"] == [ISSUER]
    # Both asked for at once, so saving a flight is approved when connecting.
    assert body["scopes_supported"] == ["wingtip:read", "wingtip:write"]
    assert body["bearer_methods_supported"] == ["header"]


def test_a_connection_allowed_only_to_read_cannot_save_a_flight():
    result = call("save_flight", {"departure": "C81", "destination": "KDLH"}, token="read-7")
    assert result.is_error
    assert "not allowed wingtip:write" in text(result)


def test_a_pilot_past_the_limit_is_told_so_and_another_pilot_is_not(monkeypatch):
    monkeypatch.setenv("MCP_CALLS_PER_MINUTE", "2")
    get_settings.cache_clear()
    stub_place(monkeypatch)
    for _ in range(2):
        assert not call("airport_info", {"ident": "KDLH"}).is_error
    third = call("airport_info", {"ident": "KDLH"})
    assert third.is_error and "2 questions a minute" in text(third)
    assert not call("airport_info", {"ident": "KDLH"}, token="rw-8").is_error


def test_every_tool_says_whether_it_writes_and_needs_the_scope_it_says():
    tools = {t.name: t for t in listed()}
    for name, tool in tools.items():
        hints = tool.annotations
        # Both directories want each hint set, not left to its default.
        assert hints.title and hints.read_only_hint is not None and hints.destructive_hint is not None, name
        assert hints.open_world_hint is False, name
        assert len(name) <= 64
    writes = {name for name, t in tools.items() if not t.annotations.read_only_hint}
    assert writes == {"save_flight"}
    assert tools["save_flight"].annotations.destructive_hint is False
    assert tools["save_flight"].meta["securitySchemes"][0]["scopes"] == ["wingtip:read", "wingtip:write"]


def test_the_tool_list_is_the_snapshot():
    """WRITE_MCP_SNAPSHOT=1 writes it again, for a change made on purpose."""
    tools = [t.model_dump(mode="json", by_alias=True, exclude_none=True) for t in listed()]
    tools.sort(key=lambda t: t["name"])
    if os.environ.get("WRITE_MCP_SNAPSHOT"):
        SNAPSHOT.write_text(json.dumps(tools, indent=2, sort_keys=True) + "\n")
    assert tools == json.loads(SNAPSHOT.read_text()), "the tools changed: WRITE_MCP_SNAPSHOT=1 pytest tests/test_mcp_connector.py"


# The real reader of the gateway's tokens, against a key of the test's own.
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def signed(**over) -> str:
    now = int(time.time())
    claims = {"iss": ISSUER, "aud": RESOURCE, "sub": "42", "scope": "wingtip:read wingtip:write", "client_id": "c1"}
    claims |= {"iat": now, "exp": now + 900, **over}
    return jwt.encode(claims, KEY, algorithm="RS256", headers={"kid": "k1"})


#: The connections that still stand, as the gateway would say (pilot, client).
LIVE = {("42", "c1")}


async def _live(pilot: str, client: str) -> bool:
    return (pilot, client) in LIVE


@pytest.fixture
def tokens(monkeypatch):
    reader = GatewayTokens(jwks_url="http://gateway.test/oauth2/jwks", issuer=ISSUER, resource=RESOURCE, live=_live)
    monkeypatch.setattr(reader._keys, "get_signing_key_from_jwt", lambda token: jwt.PyJWK.from_dict(_jwk()))
    return reader


def _jwk() -> dict:
    return {**json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(KEY.public_key())), "kid": "k1", "alg": "RS256"}


def test_a_gateway_token_for_this_connector_is_read_as_its_pilot(tokens):
    read = anyio.run(tokens.verify_token, signed())
    assert read.subject == "42" and read.scopes == ["wingtip:read", "wingtip:write"] and read.client_id == "c1"
    assert read.resource == RESOURCE


@pytest.mark.parametrize(
    "over",
    [
        {"aud": "https://elsewhere.test/mcp"},  # issued for another resource (RFC 8707)
        {"iss": "https://elsewhere.test"},  # another issuer's
        {"exp": int(time.time()) - 60},  # expired
    ],
)
def test_a_token_not_for_this_connector_is_refused(tokens, over):
    assert anyio.run(tokens.verify_token, signed(**over)) is None


def test_a_token_whose_connection_is_gone_is_refused_at_once(tokens):
    """Disconnected, or the account deleted: the gateway says so, and the
    token is refused though it has not run out (L4)."""
    assert anyio.run(tokens.verify_token, signed(sub="43")) is None
    assert anyio.run(tokens.verify_token, signed(client_id="another")) is None


def test_a_token_signed_by_another_key_is_refused(tokens):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode({"iss": ISSUER, "aud": RESOURCE, "sub": "42", "iat": 0, "exp": 2**31}, other, algorithm="RS256")
    assert anyio.run(tokens.verify_token, forged) is None


def test_the_planner_serves_mcp_where_an_issuer_is_set(monkeypatch):
    """app.main's wiring: the router app.mcp makes from the environment,
    off without MCP_ISSUER, and with it /mcp and its metadata outside the
    OpenAPI document (the gateway proxies them by name)."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.mcp.server import connector_router

    assert connector_router().routes == []
    monkeypatch.setenv("MCP_ISSUER", "https://wingtip.test")
    get_settings.cache_clear()
    planner = FastAPI()
    planner.include_router(connector_router())
    with TestClient(planner) as client:
        assert client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).status_code == 401
        metadata = client.get("/.well-known/oauth-protected-resource/mcp").json()
    assert metadata["resource"] == "https://wingtip.test/mcp"
    assert "/mcp" not in planner.openapi()["paths"]


def test_junk_key_ids_do_not_make_the_planner_fetch_the_gateways_keys_each_time(monkeypatch):
    """L7: a token with a made-up key id is refused; the gateway's key set
    is fetched again for one at most once a minute, not for each of twenty."""
    reader = GatewayTokens(jwks_url="http://gateway.test/oauth2/jwks", issuer=ISSUER, resource=RESOURCE, live=_live)
    fetched = []

    def fetch():
        fetched.append(1)
        return {"keys": [_jwk()]}

    monkeypatch.setattr(reader._keys, "fetch_data", fetch)
    assert anyio.run(reader.verify_token, signed()) is not None
    for i in range(20):
        junk = jwt.encode({"sub": "1"}, KEY, algorithm="RS256", headers={"kid": f"junk-{i}"})
        assert anyio.run(reader.verify_token, junk) is None
    # The first fetch, and one more for the first unknown id; none after.
    assert len(fetched) == 2
