"""The connector's edit tools: the flight a pilot plans with their AI app,
changed one step at a time as FPL changes it -- a stop added, taken out or
moved, the cruise altitude, the departure time, an approach, the fuel
stops, the fuel on board, the airplane -- each answered with the flight
planned again by /api/plan and drawn in the live view (flight_view).

They change nothing kept: the flight is handed in and back (flight_state),
so each is read-only to the host (no prompt each time) and asks only the
read scope. Saving it is saved_tools', with the write scope."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from mcp.server.apps import Apps
from mcp.server.mcpserver.exceptions import ToolError
from mcp_types import CallToolResult
from pydantic import Field
from wingtip.fuel_rounds import with_fuel_stops

from ..router_basics import MAX_STOPS
from .calls import pilot
from .flight_state import Flight, same
from . import flight_view
from .flight_view import VIEW_URI, answer, keep_fuel_stops
from .procedure_picks import Action, changed
from .tool_meta import READS, read_only

FlightIn = Annotated[Flight, Field(description="The flight as the last Wingtip answer gave it.")]
PointIn = Annotated[str, Field(min_length=2, max_length=16, description="An airport or waypoint identifier.")]
Place = Annotated[int | None, Field(ge=1, le=MAX_STOPS, description="Its place among the stops, 1 the first; none is last.")]
NewPlace = Annotated[int, Field(ge=1, le=MAX_STOPS, description="Its new place among the stops, 1 the first; past the last is last.")]

SHOW = (
    "Opens the flight in Wingtip's live view beside the chat -- the chart with the route, the route's points with "
    "their times and fuel, and the figures -- planned by Wingtip's nav log. Give at least the departure and "
    "destination. Every edit tool answers the flight changed, to pass to the next one. plan_route answers the "
    "same plan as data, without the view."
)


def _index(flight: Flight, ident: str) -> int:
    for i, stop in enumerate(flight.stops):
        if same(stop, ident):
            return i
    raise ToolError(f"{ident.upper()} is not a stop of this route. Its stops: {', '.join(flight.stops) or 'none'}.")


def _no_fuel_stop_said(totals: dict, suggested: bool, full: bool) -> str:
    """Why no fuel stop went in: the plan's fuel check passes, or it fails
    with no field in reach (`no_fuel_stop`), or with no room left in the
    route or the fields offered already on it."""
    short = totals.get("no_fuel_stop") or []
    if short:
        why = [
            f"{s['departure']} to {s['destination']}: "
            + ("the fuel on board leaving is under its start, taxi and reserve" if s.get("on_board") else "no field with fuel in reach")
            for s in short
        ]
        return f"No fuel stop put in, and the flight is short of fuel: {'; '.join(why)}. Change the route or the fuel on board."
    if suggested and full:
        return f"No fuel stop put in: the route has its {MAX_STOPS} stops. Take a stop out, then add fuel stops again."
    if suggested:
        return (
            "No fuel stop put in: the fields offered for fuel are on the route already, and it is still short: "
            "change the route or the fuel on board."
        )
    return "No fuel stops are needed: the tanks reach each landing with the reserve."


def register(apps: Apps) -> None:
    def tool(name: str, title: str, description: str):
        return apps.tool(resource_uri=VIEW_URI, name=name, title=title, description=description, annotations=read_only(title), meta=READS)

    @tool("show_flight", "Show flight in Wingtip", SHOW)
    async def show_flight(flight: FlightIn) -> CallToolResult:
        return await answer(flight, pilot())

    @tool("add_stop", "Add a stop", "Adds an airport or waypoint to the flight's route, at a place among its stops.")
    async def add_stop(flight: FlightIn, ident: PointIn, place: Place = None) -> CallToolResult:
        who = pilot()
        if len(flight.stops) >= MAX_STOPS:
            raise ToolError(f"A route takes {MAX_STOPS} stops at most; take one out first.")
        at = len(flight.stops) if place is None else min(place - 1, len(flight.stops))
        stops = [*flight.stops[:at], ident.strip().upper(), *flight.stops[at:]]
        return await answer(flight.model_copy(update={"stops": stops}), who, f"Added {ident.upper()}.")

    @tool("remove_stop", "Remove a stop", "Takes a stop out of the flight's route.")
    async def remove_stop(flight: FlightIn, ident: PointIn) -> CallToolResult:
        who = pilot()
        i = _index(flight, ident)
        changed_flight = keep_fuel_stops(flight.model_copy(update={"stops": flight.stops[:i] + flight.stops[i + 1 :]}))
        return await answer(changed_flight, who, f"Removed {flight.stops[i]}.")

    @tool("move_stop", "Move a stop", "Moves one of the flight's stops to another place among its stops.")
    async def move_stop(flight: FlightIn, ident: PointIn, place: NewPlace) -> CallToolResult:
        who = pilot()
        i = _index(flight, ident)
        stops = flight.stops[:i] + flight.stops[i + 1 :]
        stops.insert(min(place - 1, len(stops)), flight.stops[i])
        return await answer(flight.model_copy(update={"stops": stops}), who, f"Moved {flight.stops[i]} to stop {place}.")

    @tool(
        "set_cruise_altitude",
        "Set cruise altitude",
        "Sets the flight's cruise altitude in feet MSL, or none for the legal fastest for the winds. An altitude "
        "that is not legal on a leg is flown anyway and said in the altitude cautions.",
    )
    async def set_cruise_altitude(
        flight: FlightIn, altitude_ft: Annotated[int | None, Field(ge=500, le=45000, description="Feet MSL, or none.")]
    ) -> CallToolResult:
        who = pilot()
        said = f"Cruise at {altitude_ft} ft." if altitude_ft else "Cruise at the legal fastest altitude."
        return await answer(flight.model_copy(update={"cruise_altitude_ft": altitude_ft}), who, said)

    @tool("set_departure_time", "Set departure time", "Sets when the flight leaves (ISO 8601, UTC without an offset), or none for now.")
    async def set_departure_time(
        flight: FlightIn,
        depart_at: Annotated[
            datetime | None, Field(description="ISO 8601 (2026-11-22T15:30:00Z; UTC without an offset), or none for now.")
        ],
    ) -> CallToolResult:
        who = pilot()
        updated = flight.model_copy(update={"depart_at": depart_at})
        return await answer(updated, who, f"Leaving {depart_at.isoformat()}." if depart_at else "Leaving now.")

    @tool(
        "change_approach",
        "Change an approach",
        "Loads an approach at one of the route's airports (load, with its id from airport_procedures), "
        "activates it onto the route, deactivates it back to loaded, removes it, or unsuspends "
        "or suspends its missed approach at the MAP, as a GPS navigator does.",
    )
    async def change_approach(
        flight: FlightIn,
        airport: PointIn,
        action: Action,
        approach: Annotated[str | None, Field(max_length=12, description="The approach's id, for load: I27, R09-Y.")] = None,
        transition: Annotated[str | None, Field(max_length=12, description="Its transition, for load; none is vectors.")] = None,
    ) -> CallToolResult:
        who = pilot()
        updated, said = await changed(flight, airport, action, approach, transition)
        return await answer(updated, who, said)

    @tool(
        "add_fuel_stops",
        "Add fuel stops",
        "Puts in the fuel stops the flight needs where it is short of fuel, each landing with the reserve "
        "(14 CFR 91.151, 91.167), as FPL's Add Fuel Stops does. Needs an airplane (pick_airplane).",
    )
    async def add_fuel_stops(flight: FlightIn) -> CallToolResult:
        who = pilot()
        # With no airplane the plan has no fuel figures at all (decision
        # 0011), so it cannot say the tanks reach: never "none needed".
        if not flight.airplane_tail:
            raise ToolError("Fuel stops need the airplane's fuel figures: pick one with pick_airplane (my_airplanes lists them).")
        p, _ = await flight_view.planned(flight, who)
        totals = p["totals"]
        suggested = [f for f in totals.get("fuel_stops", []) if f.get("reason", "fuel") == "fuel" and f.get("stops")]
        made = with_fuel_stops(flight.departure, flight.stops, suggested, MAX_STOPS)
        if not made:
            return await answer(flight, who, _no_fuel_stop_said(totals, bool(suggested), len(flight.stops) >= MAX_STOPS))
        stops, added = made
        updated = flight.model_copy(update={"stops": stops, "fuel_stops": [*flight.fuel_stops, *added]})
        return await answer(updated, who, f"Added fuel stops {', '.join(added)}.")

    @tool("remove_fuel_stops", "Remove fuel stops", "Takes the fuel stops out of the route, leaving the pilot's other stops.")
    async def remove_fuel_stops(flight: FlightIn) -> CallToolResult:
        who = pilot()
        stops = [s for s in flight.stops if not any(same(s, f) for f in flight.fuel_stops)]
        return await answer(flight.model_copy(update={"stops": stops, "fuel_stops": []}), who, "Removed the fuel stops.")

    @tool(
        "set_fuel_on_board",
        "Set fuel on board",
        "Sets the gallons in the tanks leaving one of the route's airports (the departure when none is named): "
        "at a stop, what it is fuelled to, 0 for none bought.",
    )
    async def set_fuel_on_board(
        flight: FlightIn,
        gallons: Annotated[float, Field(ge=0, le=2000, description="US gallons in the tanks leaving there; 0 for none bought.")],
        airport: Annotated[str | None, Field(max_length=16, description="Where; the departure when none.")] = None,
    ) -> CallToolResult:
        who = pilot()
        at = (airport or flight.departure).strip().upper()
        if not any(same(at, p) for p in (flight.departure, *flight.stops)):
            raise ToolError(f"{at} is not the departure or a stop of this route.")
        on_board = {**flight.fuel_on_board, at: gallons}
        return await answer(flight.model_copy(update={"fuel_on_board": on_board}), who, f"{gallons:g} gal on board leaving {at}.")

    @tool(
        "pick_airplane",
        "Pick airplane",
        "Flies the flight on one of the pilot's own airplanes by tail number (my_airplanes lists them), or on none, "
        "which plans only the miles, courses and altitudes, never a stock airplane's times or fuel.",
    )
    async def pick_airplane(
        flight: FlightIn, tail: Annotated[str | None, Field(max_length=8, description="A tail number, or none.")]
    ) -> CallToolResult:
        who = pilot()
        updated = flight.model_copy(update={"airplane_tail": tail.strip().upper() if tail else None})
        return await answer(updated, who, f"Flown on {updated.airplane_tail}." if tail else "No airplane picked.")
