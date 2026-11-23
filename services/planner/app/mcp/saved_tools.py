"""The connector's tools over the pilot's saved flights, beside the live
view: one opened to edit, the flight being planned saved as a new one or
over the one it came from, and one deleted. Opening reads (the read
scope); saving, replacing and deleting write the pilot's account (the
write scope the pilot may leave out when they connect), and the host asks
the pilot before each: replacing and deleting are destructive, saving a
new flight only adds (tool_meta)."""

from __future__ import annotations

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


def register_view(apps: Apps) -> None:
    """The tools whose answers the live view draws."""

    @apps.tool(
        resource_uri=VIEW_URI,
        name="open_saved_flight",
        title="Open a saved flight",
        description="Opens one of the pilot's saved flights in Wingtip's live view, to read or change it: its route, "
        "altitude, procedures, airplane and time, as the flight the edit tools take.",
        annotations=read_only("Open a saved flight"),
        meta=READS,
    )
    async def open_saved_flight(flight_id: FlightId) -> CallToolResult:
        who = pilot()
        saved = await _theirs(who, flight_id)
        return await answer(from_saved(saved), who, f"Opened saved flight {flight_id}.")

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

    @apps.tool(
        resource_uri=VIEW_URI,
        name="update_saved_flight",
        title="Replace a saved flight",
        description="Replaces the saved flight this flight came from (its saved_flight_id) with the flight as now "
        "planned: its route, altitude, procedures, airplane, time and nav log. Its name and notes are kept.",
        annotations=destructive("Replace a saved flight"),
        meta=WRITES,
    )
    async def update_saved_flight(flight: FlightIn) -> CallToolResult:
        who = pilot(WRITE)
        if flight.saved_flight_id is None:
            raise ToolError("This flight is not from a saved flight: save it with save_flight_plan, or open one with open_saved_flight.")
        await _theirs(who, flight.saved_flight_id)
        await records.replan_flight(who, flight.saved_flight_id, await _request(flight, who))
        return await answer(flight, who, f"Saved flight {flight.saved_flight_id} replaced with this plan.")


def register(server: MCPServer) -> None:
    """Deleting, which leaves no flight for the view to draw."""

    @server.tool(
        name="delete_saved_flight",
        title="Delete a saved flight",
        description="Deletes one of the pilot's saved flights from their Wingtip account, with its nav log and any "
        "track. It cannot be undone from here.",
        annotations=destructive("Delete a saved flight"),
        meta=WRITES,
    )
    async def delete_saved_flight(flight_id: FlightId) -> dict[str, Any]:
        who = pilot(WRITE)
        saved = await _theirs(who, flight_id)
        await records.delete_flight(who, flight_id)
        route = f"{saved['departureIdent']} to {saved['destinationIdent']}"
        return {"deleted": {"id": flight_id, "route": route}, "sources": [ACCOUNT_SOURCE]}
