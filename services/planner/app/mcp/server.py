"""The connector's MCP server, from the official MCP Python SDK: its tools
(one module per group), the Streamable HTTP transport at /mcp, and the
protected resource metadata (RFC 9728) that names the gateway as the
authorization server. Off where MCP_ISSUER is unset: then /mcp is a 404.

Stateless and answered as JSON, not a stream: every tool answers once,
nothing is pushed to the client, and so no session has to live in this
process or be streamed through the gateway's proxy."""

from __future__ import annotations

from contextlib import asynccontextmanager
from urllib.parse import urlparse

from mcp.server.auth.routes import build_resource_metadata_url, create_protected_resource_routes
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from fastapi import APIRouter
from pydantic import AnyHttpUrl
from starlette.applications import Starlette
from starlette.routing import Route

from ..settings import get_settings
from . import airport_tools, flight_tools, pilot_tools, weather_tools
from .auth import GatewayTokens
from .calls import PLANNER, READ, SCOPES

INSTRUCTIONS = (
    "Wingtip Maps is a US flight planner for VFR and IFR pilots. Its tools read FAA airport data, the weather and "
    "NOTAMs at a field, plan a route with the nav log on the pilot's own airplane, give the flight's Go / No-Go "
    "briefing, list the pilot's saved airplanes and flights, and save a planned flight to their account. Each "
    "answer names its sources. Airport identifiers are US ones (KDLH, C81)."
)


def build(*, resource: str, issuer: str, jwks_url: str, verifier=None) -> MCPServer:
    """The server and its tools; `verifier` replaces the gateway's keys in tests."""
    server = MCPServer(
        "wingtip",
        title="Wingtip Maps",
        instructions=INSTRUCTIONS,
        website_url=issuer,
        token_verifier=verifier or GatewayTokens(jwks_url=jwks_url, issuer=issuer, resource=resource),
        # The verifier checks the audience itself (RFC 8707), so the SDK's
        # own comparison is left off rather than done twice.
        auth=AuthSettings(issuer_url=issuer, resource_server_url=resource, required_scopes=[READ], validate_token_resource=False),
    )
    for group in (airport_tools, weather_tools, flight_tools, pilot_tools):
        group.register(server)
    return server


def asgi(server: MCPServer, resource: str, issuer: str) -> Starlette:
    """The SDK's Starlette app for the server, its resource metadata
    advertising both scopes: the SDK would list only the scope every call
    needs, and a client asks for what the metadata lists, so the pilot
    approves saving flights once, when they connect, rather than later."""
    app = server.streamable_http_app(
        stateless_http=True,
        json_response=True,
        # DNS rebinding protection is for a server on the pilot's own
        # machine; this one is behind the gateway and every call carries a
        # signed token, and the Host it sees is the gateway's choosing.
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    path = urlparse(str(build_resource_metadata_url(AnyHttpUrl(resource)))).path
    app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) != path]
    app.router.routes += create_protected_resource_routes(
        # As strings, for the metadata model to read: it keeps an issuer's
        # empty path empty (RFC 8414 compares issuers as strings), where
        # AnyHttpUrl alone would add a slash.
        resource_url=resource,  # type: ignore[arg-type]
        authorization_servers=[issuer],  # type: ignore[list-item]
        scopes_supported=SCOPES,
        resource_name="Wingtip Maps",
    )
    return app


class Answered:
    """The SDK's app, as an ASGI app a Route passes requests to whole (an
    instance, not a function, which Starlette would take for an endpoint).
    The tools ask the app the request came in on, the planner's own
    (Starlette's scope["app"]), for their answers (app.mcp.calls)."""

    def __init__(self, app: Starlette) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        PLANNER["app"] = scope["app"]
        await self.app(scope, receive, send)


def connector_router() -> APIRouter:
    """What app.main includes: /mcp and its resource metadata, each a plain
    route the SDK's own app answers (so neither is in openapi.json; the
    gateway proxies them by name), and the SDK's session manager run in
    the planner's lifespan. Empty where MCP_ISSUER is unset."""
    s = get_settings()
    if not s.mcp_issuer:
        return APIRouter()
    # The gateway serves it at its own /mcp unless told otherwise (its
    # app.mcp.resource has the same default).
    resource = s.mcp_resource_url or f"{s.mcp_issuer}/mcp"
    server = build(resource=resource, issuer=s.mcp_issuer, jwks_url=f"{s.gateway_url}/oauth2/jwks")
    app = asgi(server, resource, s.mcp_issuer)

    @asynccontextmanager
    async def running(_):
        async with server.session_manager.run():
            yield

    router = APIRouter(lifespan=running)
    # A Route to an ASGI app passes the request on whole, so the SDK's own
    # routes and its auth middleware see the paths they were made for.
    router.routes.extend(Route(getattr(r, "path"), endpoint=Answered(app)) for r in app.router.routes)
    return router


#: Included by app.main with the routers.
router = connector_router()
