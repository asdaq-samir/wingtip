"""The connector's tools for a field's weather and NOTAMs: the reports as
sent and as the app reads them, from the planner's own endpoints."""

from __future__ import annotations

from typing import Annotated, Any

from mcp.server.mcpserver import MCPServer
from pydantic import Field

from .airport_tools import Ident
from ..generated.planner_calls import airport_notams as notams_of, airport_place
from .calls import METAR_SOURCE, NOTAM_SOURCE, ident as ident_of, pick, pilot
from .tool_meta import READS, read_only

WEATHER = ("ident", "name", "elevation_ft", "metar", "nearby_metar", "modelled_weather", "taf", "weather_unavailable")


def register(server: MCPServer) -> None:
    @server.tool(
        name="airport_weather",
        description="The weather at a US airport now: its latest METAR and its TAF as sent, and the METAR read "
        "(flight category, ceiling, visibility, wind, altimeter, temperature). A field with no report of its own "
        "gets the nearest report within 30 nm, or the NWS's modelled weather for the hour, each marked as such.",
        title="Airport weather",
        annotations=read_only("Airport weather"),
        meta=READS,
    )
    async def airport_weather(ident: Ident) -> dict[str, Any]:
        pilot()
        card = await airport_place(ident=ident_of(ident))
        sources = [METAR_SOURCE]
        if card.get("modelled_weather"):
            sources.append({"source": "NWS Gridded LAMP (modelled, not observed)"})
        return {**pick(card, WEATHER), "sources": sources}

    @server.tool(
        name="airport_notams",
        # 5 nm, an hour back and three ahead: the planner's own reading of a
        # field's card (wingtip.tfr NEAR_NM; wingtip.notam_rank's MARGIN and
        # DEFAULT_ETE_MIN), said as the card says them.
        description="A US airport's NOTAMs and the TFRs within 5 nm of it, those in force from an hour ago to "
        "three hours ahead ranked first, each with its text as sent, what it closes or limits, its hours, and why "
        "it ranks where it does: part of the \"available information concerning that flight\" 14 CFR 91.103 has a "
        "pilot become familiar with.",
        title="Airport NOTAMs",
        annotations=read_only("Airport NOTAMs"),
        meta=READS,
    )
    async def airport_notams(
        ident: Ident, limit: Annotated[int, Field(ge=1, le=50, description="How many to answer, best first, 1 to 50.")] = 15
    ) -> dict[str, Any]:
        pilot()
        ranked = await notams_of(ident=ident_of(ident))
        return {
            "notams": ranked["notams"][:limit],
            "total": len(ranked["notams"]),
            "said_first": ranked["top"],
            "held_since": ranked.get("coverage_since"),
            "unchecked": ranked.get("unchecked", []),
            "sources": [NOTAM_SOURCE],
        }
