"""The connector's tools over the pilot's saved flights, beside the live
view: one opened to edit, the flight being planned saved as a new one or
over the one it came from, and one deleted. Opening reads (the read
scope); saving, replacing and deleting write the pilot's account (the
write scope the pilot may leave out when they connect), and the host asks
the pilot before each: replacing and deleting are destructive, saving a
new flight only adds (tool_meta)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from mcp.server.apps import Apps
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.mcpserver import MCPServer
from mcp_types import CallToolResult
from pydantic import Field

from . import records
from .calls import WRITE, pilot
from .edit_tools import FlightIn
from .flight_state import Flight, from_saved, picks_of
from . import flight_view
from .flight_view import VIEW_URI, answer
from .pilot_tools import ACCOUNT_SOURCE, save_request
from .tool_meta import READS, WRITES, additive, destructive, read_only

FlightId = Annotated[int, Field(ge=1, description="The saved flight's id, as my_flights lists it.")]


async def _theirs(who: str, flight_id: int) -> dict:
    """The pilot's saved flight by its id, or a tool error naming theirs."""
    flights = await records.flights(who)
    for f in flights:
        if f.get("id") == flight_id:
            return f
    named = ", ".join(f"{f['id']} ({f['departureIdent']}-{f['destinationIdent']})" for f in flights[:10]) or "none yet"
    raise ToolError(f"No saved flight {flight_id} in this pilot's Wingtip. Their flights: {named}.")


async def _request(flight: Flight, who: str) -> dict:
    p, flown = await flight_view.planned(flight, who)
    return save_request(p, flown, flight.depart_at.isoformat() if flight.depart_at else None, picks_of(flight))


def _past(flight: Flight) -> str:
    """Said where the time it was planned for has gone: it is planned then
    still, with that time's winds, until the pilot moves it."""
    at = flight.depart_at
    if at is None or (at if at.tzinfo else at.replace(tzinfo=timezone.utc)) >= datetime.now(timezone.utc):
        return ""
    return f" It was planned for {at.isoformat()}, which has passed: set_departure_time to fly it now."


def register_view(apps: Apps) -> None:
    """The tools whose answers the live view draws."""

    @apps.tool(
        resource_uri=VIEW_URI,
        name="open_saved_flight",
        title="Open a saved flight",
        description="Opens one of the pilot's saved flights in Wingtip's live view, to read or change it: its route, "
        "altitude, procedures, fuel stops, fuel on board, VFR or IFR, airplane and time, as the flight the edit "
        "tools take.",
        annotations=read_only("Open a saved flight"),
        meta=READS,
    )
    async def open_saved_flight(flight_id: FlightId) -> CallToolResult:
        who = pilot()
        saved = await _theirs(who, flight_id)
        flight = from_saved(saved)
        return await answer(flight, who, f"Opened saved flight {flight_id}.{_past(flight)}")

    @apps.tool(
        resource_uri=VIEW_URI,
        name="save_flight_plan",
        title="Save flight plan to Wingtip",
        description="Saves the flight being planned (the flight the last show_flight or edit answer gave) to the "
        "pilot's Wingtip account as a new saved flight, planned as the live view shows it. Adds a flight; changes "
        "nothing already saved. To save over the saved flight it came from, update_saved_flight.",
        annotations=additive("Save flight plan to Wingtip"),
        meta=WRITES,
    )
    async def save_flight_plan(flight: FlightIn) -> CallToolResult:
        who = pilot(WRITE)
        saved = await records.save_flight(who, await _request(flight, who))
        kept = flight.model_copy(update={"saved_flight_id": saved["id"]})
        return await answer(kept, who, f"Saved as flight {saved['id']} in Wingtip's Flights.")

    async def _replace(flight: Flight, replace_route: bool) -> CallToolResult:
        who = pilot(WRITE)
        if flight.saved_flight_id is None:
            raise ToolError("This flight is not from a saved flight: save it with save_flight_plan, or open one with open_saved_flight.")
        saved = await _theirs(who, flight.saved_flight_id)
        await records.replan_flight(who, flight.saved_flight_id, await _request(flight, who), replace_route)
        # The share link follows the row (Flight.replanned keeps it), so
        # the pilot is told whoever holds it now sees this route.
        shared = " Its share link now shows this route to whoever holds it." if saved.get("share") else ""
        return await answer(flight, who, f"Saved flight {flight.saved_flight_id} replaced with this plan.{shared}")

    @apps.tool(
        resource_uri=VIEW_URI,
        name="update_saved_flight",
        title="Replace a saved flight",
        description="Replaces the saved flight this flight came from (its saved_flight_id) with the flight as now "
        "planned: its route, altitude, procedures, fuel stops, fuel on board, VFR or IFR, airplane, time and nav log. "
        "Its name, notes and share link are kept, "
        "so whoever holds the link sees the new plan. A plan between other airports than the saved flight's is refused "
        "unless replace_route is true, which is for when the pilot has said to put this route over that flight.",
        annotations=destructive("Replace a saved flight"),
        # The model's alone: replace_route is a choice the pilot makes
        # through the host's ask, which a call from the view would skip
        # (the security review of 2026-11-22, L5); the view's button is
        # update_saved_flight_from_view, which cannot set it.
        visibility=["model"],
        meta=WRITES,
    )
    async def update_saved_flight(
        flight: FlightIn,
        replace_route: Annotated[
            bool, Field(description="True only when the pilot asked to put a route between other airports over the saved flight.")
        ] = False,
    ) -> CallToolResult:
        return await _replace(flight, replace_route)

    @apps.tool(
        resource_uri=VIEW_URI,
        name="update_saved_flight_from_view",
        title="Update a saved flight from the view",
        description="The live view's Update button: replaces the saved flight this flight came from with it, between "
        "the same airports only.",
        annotations=destructive("Update a saved flight from the view"),
        # The view's alone: the model has update_saved_flight.
        visibility=["app"],
        meta=WRITES,
    )
    async def update_saved_flight_from_view(flight: FlightIn) -> CallToolResult:
        return await _replace(flight, False)


def register(server: MCPServer) -> None:
    """Deleting, which leaves no flight for the view to draw."""

    @server.tool(
        name="delete_saved_flight",
        title="Delete a saved flight",
        description="Deletes one of the pilot's saved flights from their Wingtip account, with its nav log and any "
        "track. It cannot be undone from here.",
        annotations=destructive("Delete a saved flight"),
        # The model's alone, never the live view's (MCP Apps 2026-01-26,
        # `_meta.ui.visibility`; both by default): the view offers no
        # delete, and a call it made would reach the account without the
        # host's ask, which a destructive tool is promised (the security
        # review of 2026-11-22, L1).
        meta={**WRITES, "ui": {"visibility": ["model"]}},
    )
    async def delete_saved_flight(flight_id: FlightId) -> dict[str, Any]:
        who = pilot(WRITE)
        saved = await _theirs(who, flight_id)
        await records.delete_flight(who, flight_id)
        route = f"{saved['departureIdent']} to {saved['destinationIdent']}"
        return {"deleted": {"id": flight_id, "route": route}, "sources": [ACCOUNT_SOURCE]}
