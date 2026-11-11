"""The connector as Claude or ChatGPT reaches it, for the tests: the MCP
SDK's own client over Streamable HTTP into the connector's app, its tools
answered by the planner's app in-process, and a token reader standing in
for the gateway's keys (test_mcp_connector checks the real one)."""

from __future__ import annotations

from contextlib import asynccontextmanager

import anyio
import httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.server.auth.provider import AccessToken

from app.main import app as planner_app
from app.mcp import calls
from app.mcp.server import asgi, build

ISSUER = "https://wingtip.test"
RESOURCE = f"{ISSUER}/mcp"
#: Tokens the stand-in reads: the pilot's id after the dash.
SCOPES = {"rw": [calls.READ, calls.WRITE], "read": [calls.READ]}


class Tokens:
    async def verify_token(self, token: str) -> AccessToken | None:
        kind, _, pilot = token.partition("-")
        if kind not in SCOPES or not pilot:
            return None
        return AccessToken(token=token, client_id="claude", scopes=SCOPES[kind], subject=pilot, resource=RESOURCE)


def connector():
    """The server and its app, the tools asking the planner's own app."""
    server = build(resource=RESOURCE, issuer=ISSUER, jwks_url="unused", verifier=Tokens())
    calls.PLANNER["app"] = planner_app
    return server, asgi(server, RESOURCE, ISSUER)


def http(app, token: str | None = None) -> httpx2.AsyncClient:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url=ISSUER, headers=headers)


@asynccontextmanager
async def session(token: str = "rw-7"):
    server, app = connector()
    async with server.session_manager.run():
        async with Client(streamable_http_client(RESOURCE, http_client=http(app, token))) as client:
            yield client


def call(tool: str, arguments: dict | None = None, token: str = "rw-7"):
    """One tool call's result, through the whole HTTP path."""

    async def ask():
        async with session(token) as client:
            return await client.call_tool(tool, arguments or {})

    return anyio.run(ask)


def listed():
    async def ask():
        async with session() as client:
            return (await client.list_tools()).tools

    return anyio.run(ask)
