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

from ..router_basics import MAX_STOPS
from ..settings import get_settings
from . import airplane
from .airport_tools import Ident
from ..generated.planner_calls import go_no_go, plan
from .calls import ENGINE_SOURCE, METAR_SOURCE, NOTAM_SOURCE, editions, pick, pilot, rounded, winds_source
from .tool_meta import READS, read_only

Stops = Annotated[list[str], Field(max_length=MAX_STOPS, description="Airports or waypoints landed at or flown by, in order.")]
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
Rules = Annotated[
    Literal["vfr", "ifr"],
    Field(description="VFR or IFR: the cruising altitudes (14 CFR 91.159 or 91.179) and the reserve (91.151 or 91.167)."),
]
StationsLb = Annotated[
    list[float] | None,
    Field(max_length=12, description="Pounds at each loading station, in the POH's order (airplane_performance names them)."),
]
FuelGal = Annotated[float | None, Field(ge=0, le=2000, description="Fuel at engine start, gal; full usable when omitted.")]

LEG = ("from", "to", "distance_nm", "altitude_ft", "true_course_deg", "magnetic_course_deg", "magnetic_heading_deg", "wind")
LEG += ("groundspeed_kt", "ete_min", "fuel_gal")
TOTALS = ("distance_nm", "ete_min", "fuel_gal", "reserve_min", "reserve_gal", "fuel_required_gal", "usable_fuel_gal")
TOTALS += ("fuel_margin_gal", "night", "rules", "unflyable_legs", "legs_without_wind")


HOP = ("fuel_required_gal", "reserve_gal", "usable_fuel_gal", "fuel_margin_gal")


def totals_of(totals: dict) -> dict:
    """The plan's totals for the model, with each flight's fuel check where
    the route lands on the way: its tanks are filled at every stop, so the
    route's own totals carry no check and `hops` holds each one's
    (wingtip.route_join.route_totals), and the flights with no field with
    fuel in reach (`no_fuel_stop`)."""
    out = pick(totals, TOTALS)
    if totals.get("hops"):
        ends = ("departure", "destination")
        out["hops"] = [{**{k: h[k] for k in ends}, **pick(h.get("totals") or {}, HOP)} for h in totals["hops"]]
    if totals.get("no_fuel_stop"):
        out["no_fuel_stop"] = [{k: s.get(k) for k in ("departure", "destination")} for s in totals["no_fuel_stop"]]
    return out


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
    """The plan in Wingtip (the web's lib/flightLink planHrefOf address):
    its route, altitude, time and rules (lib/address PICK_KEYS' `rules`, so
    an IFR plan opens as IFR; VFR is the default and not written). The
    address has no key for the airplane flown, the pilot's own setting."""
    base = get_settings().mcp_issuer
    if not base:
        return None
    query = {k: str(fields[k]) for k in ("dep", "dest", "stops", "altitude_ft", "depart") if fields.get(k) not in (None, "")}
    if fields.get("rules") == "ifr":
        query["rules"] = "ifr"
    return f"{base}/app/plan?{urlencode(query)}"


#: What flight_briefing says in place of a finding it could not work out
#: for the pilot's own load, by the finding's key.
NOT_WORKED = {
    "balance": "Not worked: the pilot's load is not known. Give stations_lb (airplane_performance names the stations) "
    "and fuel_gal; Wingtip never reports the POH's sample airplane as theirs.",
    "runways": "Distances read at the POH's sample load, not the pilot's: give stations_lb for their own.",
}


async def _briefing_load(flown: dict | None, stations_lb, fuel_gal) -> tuple[dict | None, list[str]]:
    """The pilot's own load for /api/go-no-go, or what is missing for it
    (with no airplane, or none with a POH loading, nothing is balanced)."""
    profile = airplane.profile(flown) if flown else {}
    loading = profile.get("loading")
    if not loading:
        return None, []
    fuel = fuel_gal if fuel_gal is not None else profile.get("usable_fuel_gal")
    if fuel is None:
        return None, ["fuel_gal, the fuel at engine start: the airplane has no usable fuel on record"]
    return airplane.load(flown, loading, stations_lb, fuel)


def _finding(item: dict, sampled: bool) -> dict:
    """A finding as the model reads it. Where the airplane has a loading
    but the pilot's load is not known (`sampled`), /api/go-no-go balanced
    its default, the POH's sample airplane with a 170 lb pilot
    (gonogo.schemas.GoNoGoAsk.load): that is never said as the pilot's."""
    found = pick(item, ("key", "label", "finding", "detail"))
    if sampled and item["key"] in NOT_WORKED:
        if item["key"] == "balance":
            return {**found, "finding": "unknown", "detail": NOT_WORKED["balance"]}
        return {**found, "detail": f"{found.get('detail', '')} {NOT_WORKED[item['key']]}".strip()}
    return found


async def planned(fields: dict) -> dict:
    return await plan(**fields)


def route_of(p: dict) -> str:
    return " ".join([p["departure"]["ident"], *(s["ident"] for s in p.get("stops", [])), p["destination"]["ident"]])


def register(server: MCPServer) -> None:
    @server.tool(
        name="plan_route",
        description="Plans a flight between US airports as Wingtip's nav log does: the cruise altitude (yours, or "
        "the legal fastest for the winds) and why, each leg's distance, true and magnetic course, magnetic heading, "
        "wind, ground speed, time and fuel, the totals with the reserve and the fuel margin (each flight's in hops "
        "where it lands on the way), and the cautions. "
        "Times and fuel need one of the pilot's airplanes by tail number. Answers the nav log as data; "
        "show_flight plans the same route in Wingtip's live view, where the edit tools change it.",
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
            "totals": rounded(totals_of(p["totals"])),
            "open_in_wingtip": app_link(fields),
            "sources": [ENGINE_SOURCE, winds_source(p.get("winds")), *editions("nasr", "dof", "charts")],
        }

    @server.tool(
        name="flight_briefing",
        description="The Go / No-Go briefing for a planned flight, as Wingtip's Brief gives it: the line over the "
        "findings and each finding -- weather at the fields and along the route, TFRs and special-use airspace, the "
        "altitude, fuel, runways, weight and balance -- in words, and the risk assessment's score, level and factors, "
        "with the airplane's inspections, VOR check and open squawks. Weight and balance is the pilot's own load: "
        "give stations_lb (and fuel_gal), else it is said not worked.",
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
        stations_lb: StationsLb = None,
        fuel_gal: FuelGal = None,
    ) -> dict[str, Any]:
        who = pilot()
        fields, flown = await route_fields(who, departure, destination, stops, cruise_altitude_ft, airplane_tail, depart_at, rules)
        load, missing = await _briefing_load(flown, stations_lb, fuel_gal)
        ask = {k: v for k, v in fields.items() if v is not None}
        if load:
            ask["load"] = load
        if flown:
            ask["own_airplane"] = airplane.own_airplane(flown)
        verdict = await go_no_go(body=ask)
        return {
            "airplane": airplane.label(flown) if flown else None,
            "line": verdict["line"],
            "findings": [_finding(i, bool(missing)) for i in verdict["items"]],
            "missing": missing,
            "risk": verdict.get("risk"),
            "open_in_wingtip": app_link(fields),
            "sources": [METAR_SOURCE, NOTAM_SOURCE, ENGINE_SOURCE, *editions("nasr")],
        }
