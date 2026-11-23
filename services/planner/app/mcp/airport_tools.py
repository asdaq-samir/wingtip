"""The connector's airport tools: find a field, read its card, and the
fields nearest a place, each from the planner's own endpoint, the figures
as the app shows them, with where they come from."""

from __future__ import annotations

from typing import Annotated, Any, Literal

import anyio
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field
from wingtip import airports

from ..schemas.devml import AirportSuggestion
from ..generated.planner_calls import airport_place, airport_procedures as procedures_at, nearest_airports as nearest
from .calls import METAR_SOURCE, as_data, editions, ident as ident_of, paged, pilot
from .tool_meta import READS, read_only

Ident = Annotated[str, Field(min_length=2, max_length=7, description="An airport's identifier: KDLH, DLH, C81.")]
#: The fuels a field sells, as the nearest list names them (NASR APT_BASE's FUEL_TYPES).
Fuel = Literal["100LL", "Jet A", "UL94"]
#: The most fields the planner's nearest list answers (routers/airports).
NEAREST_MOST = 25

#: The card's weather, which airport_weather answers instead.
WEATHER = ("metar", "nearby_metar", "modelled_weather", "taf", "weather_unavailable")


#: The furthest search_airports pages, its offset's most.
SEARCH_REACH = 500


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
        offset: Annotated[
            int, Field(ge=0, le=SEARCH_REACH, description="How many to skip, for the next page: the last answer's next_offset.")
        ] = 0,
    ) -> dict[str, Any]:
        pilot()
        # The search the app's own box runs (/api/airports/search's), asked
        # for one more than this page: that endpoint answers its first 8,
        # which made `total` and `has_more` say 8 was all (mcp audit
        # 2026-11-23, M2). The total is said only once the last page is
        # in sight; before it, there are more.
        rows = await anyio.to_thread.run_sync(lambda: airports.search_airports(query, limit=offset + limit + 1))
        # Each in the endpoint's own shape (its response model), closed
        # fields labelled (decision 0043).
        found = as_data([AirportSuggestion.model_validate(r).model_dump(exclude_none=True) for r in rows])
        page = paged(found, offset, limit)
        if page["has_more"]:
            page["total"] = None
        # The search pages no further than SEARCH_REACH: past it the last
        # page says so, never a next_offset the tool would refuse (the
        # round 6 audit, P4; MCP's pagination, a null next page at the end).
        # Its total is then the matches paged, as every last page's is,
        # never null beside a has_more of false (the round 7 audit, P-L2).
        if page["next_offset"] is not None and page["next_offset"] > SEARCH_REACH:
            reach = page["next_offset"]
            page |= {
                "has_more": False,
                "next_offset": None,
                "total": reach,
                "note": f"Only the first {reach} matches are paged: give more of the name.",
            }
        return {"airports": found[offset : offset + limit], **page, "sources": editions("nasr")}

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
        name="airport_procedures",
        description="A US airport's instrument procedures from the FAA's CIFP: each approach, arrival (STAR) and "
        "departure (DP) with its id, its chart name, its runway and its transitions. change_approach takes an "
        "approach by this id (I27, R09-Y).",
        title="Airport procedures",
        annotations=read_only("Airport procedures"),
        meta=READS,
    )
    async def airport_procedures(
        ident: Ident,
        kind: Annotated[
            Literal["approach", "arrival", "departure"] | None,
            Field(description="Only approaches, arrivals or departures; all when omitted."),
        ] = None,
    ) -> dict[str, Any]:
        pilot()
        found = await procedures_at(ident=ident_of(ident))
        keys = ("kind", "id", "name", "runway", "transitions")
        return {
            "airport": found["airport"],
            "procedures": [{k: p[k] for k in keys if p.get(k) not in (None, [])} for p in found["procedures"] if kind in (None, p["kind"])],
            # True when the FAA's file for the cycle in force could not be read
            # and an older one's procedures are given (schemas.ProcedureList).
            "stale": found.get("stale", False),
            "sources": editions("cifp"),
        }

    @server.tool(
        name="nearest_airports",
        description="The landing fields nearest a position or an airport, nearest first: distance (nm) and true "
        "bearing, longest open runway, a frequency to call inbound, flight category where it reports, and the class "
        "of airspace at the surface, the fuels sold and whether it has an instrument approach. Filter by runway "
        "length, fuel, an instrument approach, towered fields, or public-use fields. Only the nearest 25 are "
        "searched: `searched_nm` says how far that reached.",
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
        fuel: Annotated[Fuel | None, Field(description="Only fields that sell this fuel: 100LL, Jet A, UL94.")] = None,
        instrument_approach_only: Annotated[bool, Field(description="Only fields with an instrument approach (CIFP).")] = False,
    ) -> dict[str, Any]:
        pilot()
        own = None
        if near:
            card = await airport_place(ident=ident_of(near))
            lat, lon, own = card["lat"], card["lon"], card["ident"]
        if lat is None or lon is None:
            raise ToolError("Say where: give `near` (an airport identifier) or both `lat` and `lon`.")
        # The planner's most, filtered here: its list is nearest first.
        found = (await nearest(lat=lat, lon=lon, limit=NEAREST_MOST))["airports"]
        kept = [
            a
            for a in found
            if (min_runway_ft is None or (a.get("longest_runway_ft") or 0) >= min_runway_ft)
            # Towered by the nearest list's `towered` (the field in the FAA's
            # list of towers, routers/airports.py) or its inbound radio's kind.
            and (not towered_only or a.get("towered") or (a.get("radio") or {}).get("kind") == "TWR")
            and (not public_only or (not a.get("private") and a.get("military") != "military"))
            and (fuel is None or fuel in (a.get("fuel") or []))
            and (not instrument_approach_only or a.get("instrument_approach") is True)
            # The field searched around is not its own alternative.
            and a.get("ident") != own
        ]
        reach = max((a.get("distance_nm") or 0 for a in found), default=0)
        few = len(kept) < limit and len(found) >= NEAREST_MOST
        return {
            "airports": [{k: v for k, v in a.items() if v is not None} for a in kept[:limit]],
            "searched": len(found),
            "searched_nm": round(reach, 1),
            # A filter that leaves few of the nearest 25 says so, so the
            # model does not take them for every field round there.
            "note": f"Only the {len(found)} nearest fields, out to {reach:.0f} nm, were searched: a farther one may match; "
            "search near another airport to widen it."
            if few
            else None,
            "sources": [*editions("nasr"), METAR_SOURCE],
        }
