"""The connector's airport tools: find a field, read its card, and the
fields nearest a place, each from the planner's own endpoint, the figures
as the app shows them, with where they come from."""

from __future__ import annotations

from typing import Annotated, Any

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from ..generated.planner_calls import airport_place, airport_search, nearest_airports as nearest
from .calls import METAR_SOURCE, editions, ident as ident_of, pilot
from .tool_meta import READS, read_only

Ident = Annotated[str, Field(min_length=2, max_length=7, description="An airport's identifier: KDLH, DLH, C81.")]

#: The card's weather, which airport_weather answers instead.
WEATHER = ("metar", "nearby_metar", "modelled_weather", "taf", "weather_unavailable")


def register(server: MCPServer) -> None:
    @server.tool(
        name="search_airports",
        description="Finds US airports whose identifier or name starts with the text given (KDLH, Duluth, "
        "Chicago Exec), with each one's identifier, name, town and state. Use it to turn a place a pilot names "
        "into an identifier the other tools take.",
        title="Search airports",
        annotations=read_only("Search airports"),
        meta=READS,
    )
    async def search_airports(
        query: Annotated[str, Field(min_length=2, max_length=60, description="An identifier, an airport's name or its town.")],
        limit: Annotated[int, Field(ge=1, le=25, description="How many to answer, 1 to 25.")] = 10,
    ) -> dict[str, Any]:
        pilot()
        found = await airport_search(q=query)
        return {"airports": found["airports"][:limit], "sources": editions("nasr")}

    @server.tool(
        name="airport_info",
        description="One US airport's facts as Wingtip's airport card shows them: elevation, the class of airspace "
        "at its surface, whether it is towered, runways (length, width, surface, lighting), frequencies, traffic "
        "pattern, lighting remarks, contact, and links to the FAA airport diagram and Chart Supplement page.",
        title="Airport facts",
        annotations=read_only("Airport facts"),
        meta=READS,
    )
    async def airport_info(ident: Ident) -> dict[str, Any]:
        pilot()
        card = await airport_place(ident=ident_of(ident))
        facts = {k: v for k, v in card.items() if k not in WEATHER and v not in (None, [], "")}
        return {**facts, "sources": [*editions("nasr"), {"source": "FAA d-TPP and Chart Supplement, the cycle in force"}]}

    @server.tool(
        name="nearest_airports",
        description="The landing fields nearest a position or an airport, nearest first: distance (nm) and true "
        "bearing, longest open runway, a frequency to call inbound, flight category where it reports, and the class "
        "of airspace at the surface. Filter by runway length, towered fields, or public-use fields.",
        title="Nearest airports",
        annotations=read_only("Nearest airports"),
        meta=READS,
    )
    async def nearest_airports(
        near: Annotated[str | None, Field(description="An airport identifier to search around; or give lat and lon.")] = None,
        lat: Annotated[float | None, Field(ge=-90, le=90, description="Latitude, degrees north.")] = None,
        lon: Annotated[float | None, Field(ge=-180, le=180, description="Longitude, degrees east (negative west).")] = None,
        limit: Annotated[int, Field(ge=1, le=25, description="How many to answer, 1 to 25.")] = 10,
        min_runway_ft: Annotated[int | None, Field(ge=0, le=20000, description="Longest open runway at least this, feet.")] = None,
        towered_only: Annotated[bool, Field(description="Only fields with a control tower.")] = False,
        public_only: Annotated[bool, Field(description="Leave out private and military fields.")] = False,
    ) -> dict[str, Any]:
        pilot()
        own = None
        if near:
            card = await airport_place(ident=ident_of(near))
            lat, lon, own = card["lat"], card["lon"], card["ident"]
        if lat is None or lon is None:
            raise ToolError("Say where: give `near` (an airport identifier) or both `lat` and `lon`.")
        # The planner's most, filtered here: its list is nearest first.
        found = (await nearest(lat=lat, lon=lon, limit=25))["airports"]
        kept = [
            a
            for a in found
            if (min_runway_ft is None or (a.get("longest_runway_ft") or 0) >= min_runway_ft)
            # The nearest list's tower is its inbound radio's (its `towered`
            # is the map pin's, which this list leaves unset).
            and (not towered_only or a.get("towered") or (a.get("radio") or {}).get("kind") == "TWR")
            and (not public_only or (not a.get("private") and a.get("military") != "military"))
            # The field searched around is not its own alternative.
            and a.get("ident") != own
        ]
        return {
            "airports": [{k: v for k, v in a.items() if v is not None} for a in kept[:limit]],
            "searched": len(found),
            "sources": [*editions("nasr"), METAR_SOURCE],
        }
