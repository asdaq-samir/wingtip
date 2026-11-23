"""The pilot's own records -- airplanes and saved flights -- which the
gateway keeps (it owns accounts and what a pilot saves; the planner holds
none). Asked of its /internal/mcp routes, on the gateway's internal port
that only the compose network reaches, with the planner's own secret
and the pilot's id from a checked token, never with the pilot's token:
the MCP authorization spec forbids passing a token on to another service
("MCP servers MUST NOT accept or transit any other tokens")."""

from __future__ import annotations

import logging

import httpx2
from mcp.server.mcpserver.exceptions import ToolError

from ..settings import get_settings

log = logging.getLogger(__name__)

TIMEOUT_S = 10


def _detail(resp: httpx2.Response) -> str:
    try:
        return str(resp.json().get("detail") or resp.text[:300])
    except ValueError:
        return resp.text[:300]


async def _ask(method: str, path: str, pilot_id: str, body: dict | None = None):
    settings = get_settings()
    if not settings.mcp_internal_token:
        raise ToolError("This Wingtip server cannot read saved records: its MCP_INTERNAL_TOKEN is not set.")
    headers = {"X-Internal-Token": settings.mcp_internal_token, "X-Pilot-Id": pilot_id}
    try:
        async with httpx2.AsyncClient(base_url=settings.gateway_internal_url, timeout=TIMEOUT_S) as client:
            resp = await client.request(method, f"/internal/mcp{path}", json=body, headers=headers)
    except httpx2.HTTPError as err:
        raise ToolError(f"Wingtip's account service did not answer ({type(err).__name__}); try again in a minute.") from err
    if resp.status_code == 404 and path.startswith("/flights/"):
        # One flight gone (deleted since my_flights listed it), not the
        # account: reconnecting would not bring it back.
        raise ToolError("That saved flight is no longer in the pilot's Wingtip: my_flights lists theirs, or save it as a new one.")
    if resp.status_code == 404:
        raise ToolError("Wingtip has no account for this sign-in any more: disconnect Wingtip and connect it again.")
    if resp.status_code == 400:
        raise ToolError(f"Wingtip refused the flight: {_detail(resp)}. Change what it names and try again.")
    if resp.status_code == 409:
        # The gateway's refusal in its words (an RFC 9457 problem's
        # detail): a flight put to an instructor keeps its route.
        raise ToolError(f"Wingtip kept the flight as it was: {_detail(resp)}")
    if resp.status_code >= 400:
        raise ToolError(f"Wingtip's account service answered {resp.status_code}; try again in a minute.")
    return resp.json() if resp.content else None


async def airplanes(pilot_id: str) -> list[dict]:
    """The pilot's airplanes, as the gateway's AircraftDto."""
    return await _ask("GET", "/aircraft", pilot_id)


async def flights(pilot_id: str) -> list[dict]:
    """The pilot's saved flights, newest first, as FlightSummaryDto."""
    return await _ask("GET", "/flights", pilot_id)


async def save_flight(pilot_id: str, request: dict) -> dict:
    """Saves a flight (the gateway's SaveFlightRequest) and answers its row."""
    return await _ask("POST", "/flights", pilot_id, request)


async def replan_flight(pilot_id: str, flight_id: int, request: dict, replace_route: bool = False) -> dict:
    """Replaces a saved flight's route and nav log with a new plan (the
    gateway's SaveFlightRequest), keeping its name, notes and share link.
    The gateway refuses a plan between other airports than the saved
    flight's unless `replace_route` (FlightService.replan)."""
    path = f"/flights/{flight_id}" + ("?replaceRoute=true" if replace_route else "")
    return await _ask("PUT", path, pilot_id, request)


async def delete_flight(pilot_id: str, flight_id: int) -> None:
    """Deletes one of the pilot's saved flights; a 404 where it is not theirs."""
    await _ask("DELETE", f"/flights/{flight_id}", pilot_id)


async def connection_live(pilot_id: str, client_id: str, token: str) -> bool:
    """Whether this access token still stands: issued to the pilot through
    this client, not revoked, its connection not removed, the account not
    deleted. The gateway's JWTs are checked here by signature alone and last
    15 minutes, which would outlive all of these (the security audit's L4);
    so every call asks, on the internal port, a 204 or a 404. The token
    itself goes back to the gateway that issued it, as an introspection
    (RFC 7662) would: asking only whether the pilot had any live connection
    through the client let a revoked token of a still-live connection go on
    working (the deep security review of 2026-11-21). False, refusing the
    call, wherever the gateway cannot say: no secret set, or no answer."""
    settings = get_settings()
    if not settings.mcp_internal_token:
        log.error("connector: MCP_INTERNAL_TOKEN is not set, so no connection can be checked; every call is refused")
        return False
    headers = {
        "X-Internal-Token": settings.mcp_internal_token,
        "X-Pilot-Id": pilot_id,
        "X-Client-Id": client_id,
        "X-Connector-Token": token,
    }
    try:
        async with httpx2.AsyncClient(base_url=settings.gateway_internal_url, timeout=TIMEOUT_S) as client:
            resp = await client.get("/internal/mcp/connection", headers=headers)
    except httpx2.HTTPError as err:
        log.warning("connector: the gateway did not say whether a connection stands (%s)", type(err).__name__)
        return False
    return resp.status_code == 204
