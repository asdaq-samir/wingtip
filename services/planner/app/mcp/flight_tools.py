"""The connector's flight tools: a route planned with its nav log, and the
flight's Go / No-Go findings, each from the planner's own endpoint (the
nav log's figures are the engine's, through it), flown with the pilot's
own airplane when they name one."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlencode

from mcp.server.mcpserver import MCPServer
from pydantic import Field

from ..settings import get_settings
from . import airplane
from .airport_tools import Ident
from ..generated.planner_calls import go_no_go, plan
from .calls import ENGINE_SOURCE, METAR_SOURCE, NOTAM_SOURCE, WINDS_SOURCE, editions, pick, pilot, rounded
from .tool_meta import READS, read_only

Stops = Annotated[list[str], Field(max_length=8, description="Airports or waypoints landed at or flown by, in order.")]
# Bounds on what a caller may type, not a rule: whether an altitude may be
# flown (91.119, 91.159, Class A) is the engine's, through /api/plan, which
# says so in the plan's cautions (warn, never limit, decision 0008).
Altitude = Annotated[
    int | None, Field(ge=500, le=45000, description="Cruise altitude, feet MSL; Wingtip picks the legal fastest when omitted.")
]
Tail = Annotated[
    str | None, Field(description="The pilot's own airplane by tail number (my_airplanes lists them). Without one, no times or fuel.")
]
Depart = Annotated[datetime | None, Field(description="Departure time, ISO 8601 (UTC when no offset); now when omitted.")]
Rules = Annotated[Literal["vfr", "ifr"], Field(description="VFR or IFR.")]

LEG = ("from", "to", "distance_nm", "altitude_ft", "true_course_deg", "magnetic_course_deg", "magnetic_heading_deg", "wind")
LEG += ("groundspeed_kt", "ete_min", "fuel_gal")
TOTALS = ("distance_nm", "ete_min", "fuel_gal", "reserve_min", "reserve_gal", "fuel_required_gal", "usable_fuel_gal")
TOTALS += ("fuel_margin_gal", "night", "rules", "unflyable_legs", "legs_without_wind")


async def route_fields(pilot_id: str, dep: str, dest: str, stops: list[str], altitude, tail, depart, rules) -> tuple:
    """The flight as /api/plan's query and /api/go-no-go's ask take it, and
    the airplane flown (None for none)."""
    fields: dict = {
        "dep": dep.strip().upper(),
        "dest": dest.strip().upper(),
        "stops": ",".join(s.strip().upper() for s in stops if s.strip()),
        "altitude_ft": altitude,
        "depart": depart.isoformat() if depart else None,
        "rules": rules,
    }
    flown = await airplane.find(pilot_id, tail) if tail else None
    if flown:
        fields |= airplane.plan_fields(flown)
    return fields, flown


def app_link(fields: dict) -> str | None:
    """The plan in Wingtip (the web's lib/flightLink planHrefOf address)."""
    base = get_settings().mcp_issuer
    if not base:
        return None
    query = {k: str(fields[k]) for k in ("dep", "dest", "stops", "altitude_ft") if fields.get(k) not in (None, "")}
    return f"{base}/app/plan?{urlencode(query)}"


async def planned(fields: dict) -> dict:
    return await plan(**fields)


def route_of(p: dict) -> str:
    return " ".join([p["departure"]["ident"], *(s["ident"] for s in p.get("stops", [])), p["destination"]["ident"]])


def register(server: MCPServer) -> None:
    @server.tool(
        name="plan_route",
        description="Plans a flight between US airports as Wingtip's nav log does: the cruise altitude (yours, or "
        "the legal fastest for the winds) and why, each leg's distance, true and magnetic course, magnetic heading, "
        "wind, ground speed, time and fuel, the totals with the reserve and the fuel margin, and the cautions. "
        "Times and fuel need one of the pilot's airplanes by tail number.",
        title="Plan a route",
        annotations=read_only("Plan a route"),
        meta=READS,
    )
    async def plan_route(
        departure: Ident,
        destination: Ident,
        stops: Stops = [],  # noqa: B006 -- pydantic copies a default
        cruise_altitude_ft: Altitude = None,
        airplane_tail: Tail = None,
        depart_at: Depart = None,
        rules: Rules = "vfr",
    ) -> dict[str, Any]:
        who = pilot()
        fields, flown = await route_fields(who, departure, destination, stops, cruise_altitude_ft, airplane_tail, depart_at, rules)
        p = await planned(fields)
        return {
            "route": route_of(p),
            "airplane": airplane.label(flown) if flown else None,
            "altitude_ft": p["altitude_ft"],
            "altitude_choice": p.get("altitude_choice"),
            "altitude_cautions": p.get("altitude_cautions", []),
            "legs": rounded([pick(leg, LEG) for leg in p["legs"]]),
            "totals": rounded(pick(p["totals"], TOTALS)),
            "open_in_wingtip": app_link(fields),
            "sources": [ENGINE_SOURCE, WINDS_SOURCE, *editions("nasr", "dof", "charts")],
        }

    @server.tool(
        name="flight_briefing",
        description="The Go / No-Go briefing for a planned flight, as Wingtip's Brief gives it: the line over the "
        "findings and each finding -- weather at the fields and along the route, TFRs and special-use airspace, the "
        "altitude, fuel, runways, weight and balance -- in words, and the risk assessment's score, level and factors.",
        title="Flight briefing",
        annotations=read_only("Flight briefing"),
        meta=READS,
    )
    async def flight_briefing(
        departure: Ident,
        destination: Ident,
        stops: Stops = [],  # noqa: B006 -- pydantic copies a default
        cruise_altitude_ft: Altitude = None,
        airplane_tail: Tail = None,
        depart_at: Depart = None,
        rules: Rules = "vfr",
    ) -> dict[str, Any]:
        who = pilot()
        fields, flown = await route_fields(who, departure, destination, stops, cruise_altitude_ft, airplane_tail, depart_at, rules)
        verdict = await go_no_go(body={k: v for k, v in fields.items() if v is not None})
        return {
            "airplane": airplane.label(flown) if flown else None,
            "line": verdict["line"],
            "findings": [pick(i, ("key", "label", "finding", "detail")) for i in verdict["items"]],
            "risk": verdict.get("risk"),
            "open_in_wingtip": app_link(fields),
            "sources": [METAR_SOURCE, NOTAM_SOURCE, ENGINE_SOURCE, *editions("nasr")],
        }
