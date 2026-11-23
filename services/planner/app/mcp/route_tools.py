"""The connector's route tools beside the nav log: the winds and
temperatures aloft, the hazards along a route, and the airspace it
crosses. Each is the planner's own answer -- its plan and briefing
endpoints, the winds-aloft store the nav log flies (wingtip.winds_aloft)
-- and the engine's rules where the app asks the engine itself (the
Brief's Adverse Conditions, part 99's ADIZ, 91.157's special VFR, NASR's
field status); nothing here works out a figure of its own."""

from __future__ import annotations

from typing import Annotated, Any

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field
from wingtip import winds_aloft
from wingtip.engine import ask as engine_ask

from ..generated.planner_calls import airport_place, briefing
from ..gonogo.verdict import fields_of
from ..gonogo.words import gairmet_title, sigmet_hazard
from ..route_briefing import DEFAULT_ETE_MIN
from . import airplane
from .airport_tools import Ident
from .calls import ENGINE_SOURCE, NOTAM_SOURCE, editions, ident as ident_of, paged, pick, pilot, rounded
from .flight_tools import Altitude, Depart, Rules, Stops, Tail, planned, route_fields, route_of
from .tool_meta import READS, read_only

Limit = Annotated[int, Field(ge=1, le=50, description="How many to answer, 1 to 50.")]
Offset = Annotated[int, Field(ge=0, description="How many to skip, for the next page: the last answer's next_offset.")]
Departure = Annotated[str | None, Field(max_length=7, description="For a route: its departure airport (KDLH, C81).")]
Destination = Annotated[str | None, Field(max_length=7, description="For a route: its destination airport.")]

AIR_SOURCE = {
    "source": "Aviation Weather Center GFA winds aloft and NOAA GFS temperatures (the map's Model Weather), "
    "as Wingtip's nav log flies them; the GFS's FB stations past the grid's twelve hours"
}
HAZARD_SOURCE = {
    "source": "NWS Aviation Weather Center SIGMETs, Convective SIGMETs, AIRMETs (Alaska), G-AIRMETs and PIREPs, as sent; "
    "where and when the flight meets each, Wingtip's"
}
ADVERSE_SOURCE = {"source": "Wingtip engine: the Brief's Adverse Conditions (AIM 7-1-5(b)(1), 7-1-6, 7-1-18; 14 CFR 91.137-91.145)"}
#: The briefing's sources a CWA would be among, which it does not hold yet
#: (the web's features/brief/adverse.ts says the same).
NO_CWAS = "Center Weather Advisories: Wingtip does not hold them yet; ask Flight Service (1-800-WX-BRIEF) for any"


async def _route(departure, destination, stops, altitude, tail, depart, rules) -> tuple[dict, dict, dict | None]:
    """The route's /api/plan fields, its plan, and the airplane flown."""
    if not departure or not destination:
        raise ToolError("Give both departure and destination for a route.")
    fields, flown = await route_fields(pilot(), departure, destination, stops, altitude, tail, depart, rules)
    return fields, await planned(fields), flown


async def _briefing(fields: dict, p: dict) -> dict:
    """The route's /api/briefing for the flight's hours: the nav log's
    time where an airplane gives one, else the briefing's own window."""
    ete = (p.get("totals") or {}).get("ete_min")
    return await briefing(dep=fields["dep"], dest=fields["dest"], stops=fields["stops"] or None, depart=fields["depart"], ete_min=ete)


def _when(fields: dict, p: dict) -> str:
    if (p.get("totals") or {}).get("ete_min") is not None:
        return "Placed on the nav log's legs at its times."
    return f"No airplane, so no times: the flight is taken as {DEFAULT_ETE_MIN} minutes, shared out by distance (pick one for its own)."


def _met(o: dict | None) -> dict:
    o = o or {}
    return {k: o.get(k) for k in ("when", "enter", "valid_to", "from_nm")} | {"legs": o.get("legs") or []}


def adverse_input(b: dict) -> list[dict]:
    """What the briefing holds, as the engine's gonogo_adverse_rows takes
    it: the web's features/brief/adverse.ts adverseRows, in Python."""
    quiet = {"issued": None, "crosses": False, "urgent": False}
    rows = [
        {**quiet, **_met(h.get("on_route")), "source": (h.get("on_route") or {}).get("source") or h.get("type") or "SIGMET"}
        | {"name": sigmet_hazard(h.get("hazard"), h.get("type"))}
        for h in b.get("hazards") or []
    ]
    rows += [{**quiet, **_met(g.get("on_route")), "source": "G-AIRMET", "name": gairmet_title(g)} for g in b.get("gairmets") or []]
    rows += [
        {**quiet, **_met(t.get("on_route")), "source": "TFR", "name": " ".join(filter(None, (t["notam_id"], t.get("title"))))}
        | {"crosses": t.get("crosses", False)}
        for t in b.get("tfrs") or []
    ]
    rows += [
        {**quiet, **_met(r.get("on_route")), "source": "PIREP", "name": r.get("raw"), "urgent": r.get("urgent", False)}
        | {"issued": (r.get("on_route") or {}).get("issued") or r.get("observed_at")}
        for r in b.get("pireps") or []
    ]
    return rows


def hazards_of(b: dict) -> list[dict]:
    """The briefing's weather hazards on the route as one list, in the
    order the route meets them, each with its altitudes, as sent."""
    found = [
        {"kind": h.get("type") or "SIGMET", "hazard": sigmet_hazard(h.get("hazard"), h.get("type"))}
        | pick(h, ("altitude_low_ft", "altitude_high_ft", "raw", "on_route"))
        for h in b.get("hazards") or []
    ]
    found += [
        {"kind": "G-AIRMET", "hazard": gairmet_title(g)}
        | pick(g, ("severity", "due_to", "altitude_low_ft"))
        | pick(g, ("from_freezing_level", "altitude_high_ft", "valid_at", "issued", "on_route"))
        for g in b.get("gairmets") or []
    ]
    found += [
        {"kind": "UUA PIREP" if r.get("urgent") else "PIREP"}
        | pick(r, ("altitude_ft", "aircraft", "turbulence", "icing"))
        | pick(r, ("observed_at", "raw", "on_route"))
        for r in b.get("pireps") or []
    ]
    return sorted(found, key=lambda h: (h.get("on_route") or {}).get("from_nm", float("inf")))


def register(server: MCPServer) -> None:
    @server.tool(
        name="winds_aloft",
        description="The wind and temperature aloft, from the forecast Wingtip's nav log flies, with its valid time: "
        "at a place (an airport, or lat and lon) and altitude, or along a route at its cruise (give departure and "
        "destination instead), each leg at the time the airplane flies it. Not observed winds.",
        title="Winds aloft",
        annotations=read_only("Winds aloft"),
        meta=READS,
    )
    async def winds_aloft_tool(
        airport: Annotated[str | None, Field(max_length=7, description="A place by airport: KDLH, C81.")] = None,
        lat: Annotated[float | None, Field(ge=-90, le=90, description="Or a place by latitude, degrees north.")] = None,
        lon: Annotated[float | None, Field(ge=-180, le=180, description="And longitude, degrees east (west negative).")] = None,
        altitude_ft: Altitude = None,
        departure: Departure = None,
        destination: Destination = None,
        stops: Stops = [],  # noqa: B006 -- pydantic copies a default
        airplane_tail: Tail = None,
        at_time: Depart = None,
    ) -> dict[str, Any]:
        if departure or destination:
            _, p, flown = await _route(departure, destination, stops, altitude_ft, airplane_tail, at_time, "vfr")
            legs = [pick(leg, ("from", "to", "altitude_ft", "wind", "oat_c", "density_altitude_ft")) for leg in p["legs"]]
            return {
                "route": route_of(p),
                "airplane": airplane.label(flown) if flown else None,
                "legs": rounded(legs),
                "legs_without_wind": p["totals"].get("legs_without_wind"),
                "forecast": p.get("winds"),
                "sources": [AIR_SOURCE],
            }
        pilot()
        if airport:
            card = await airport_place(ident=ident_of(airport))
            lat, lon, where = card["lat"], card["lon"], card["ident"]
        elif lat is None or lon is None:
            raise ToolError("Give an airport, lat and lon, or a route's departure and destination.")
        else:
            where = None
        if altitude_ft is None:
            raise ToolError("Give altitude_ft, feet MSL, for the wind at a place.")
        key = winds_aloft.winds_key_for(at_time)
        period = winds_aloft.winds_period(key)
        if period is None:
            raise ToolError("Wingtip holds no winds aloft forecast for that time: ask for a time within the next day.")
        air = winds_aloft.air_at(lat, lon, [float(altitude_ft)], key)[0]
        return {
            "airport": where,
            "lat": lat,
            "lon": lon,
            "altitude_ft": altitude_ft,
            "wind": rounded(air["wind"]),
            "temp_c": rounded(air["temp_c"]),
            # None: the forecast has no wind there (under the ground, or off
            # its grid), never a calm.
            "no_wind_known": air["wind"] is None,
            "forecast": period,
            "sources": [AIR_SOURCE],
        }

    @server.tool(
        name="route_hazards",
        description="The weather hazards along a route for the flight's time: SIGMETs and Convective SIGMETs, "
        "AIRMETs (Alaska's) and G-AIRMETs, and pilot reports, each with its altitudes beside the cruise flown, "
        "where along the route and when the flight meets it, and its text as sent; and the Brief's Adverse "
        "Conditions rows over them (AIM 7-1-5(b)(1)), TFRs crossed among them. Route_airspace lists the TFRs in full.",
        title="Hazards on a route",
        annotations=read_only("Hazards on a route"),
        meta=READS,
    )
    async def route_hazards(
        departure: Ident,
        destination: Ident,
        stops: Stops = [],  # noqa: B006 -- pydantic copies a default
        cruise_altitude_ft: Altitude = None,
        airplane_tail: Tail = None,
        depart_at: Depart = None,
        rules: Rules = "vfr",
        limit: Limit = 20,
        offset: Offset = 0,
    ) -> dict[str, Any]:
        fields, p, _ = await _route(departure, destination, stops, cruise_altitude_ft, airplane_tail, depart_at, rules)
        b = await _briefing(fields, p)
        advisories = adverse_input(b)
        adverse = engine_ask("gonogo_adverse_rows", advisories=advisories) if advisories else {"rows": [], "more": 0}
        found = hazards_of(b)
        unchecked = [w for w in b.get("weather_unavailable") or [] if w in ("hazards", "pireps", "gairmets")]
        return {
            "route": route_of(p),
            "cruise_altitude_ft": p["altitude_ft"],
            "times": _when(fields, p),
            "adverse_conditions": adverse,
            "hazards": rounded(found[offset : offset + limit]),
            **paged(found, offset, limit),
            "unavailable": [f"{w}: the source did not answer; ask again in a few minutes" for w in unchecked] + [NO_CWAS],
            "sources": [HAZARD_SOURCE, ADVERSE_SOURCE],
        }

    @server.tool(
        name="route_airspace",
        description="The airspace a route crosses at its cruise: Class B, C and D with each one's floor and its "
        "entry rules (14 CFR 91.129-91.131), prohibited and restricted areas, MOAs and the like with their altitudes "
        "and times of use, and the TFRs near it (whether it goes through each, its altitudes and hours); the ADIZs "
        "it meets (14 CFR part 99), special VFR at each field in a surface area (91.157), and any field on it that "
        "is closed, private or military.",
        title="Airspace on a route",
        annotations=read_only("Airspace on a route"),
        meta=READS,
    )
    async def route_airspace(
        departure: Ident,
        destination: Ident,
        stops: Stops = [],  # noqa: B006 -- pydantic copies a default
        cruise_altitude_ft: Altitude = None,
        airplane_tail: Tail = None,
        depart_at: Depart = None,
        rules: Rules = "vfr",
        limit: Limit = 20,
        offset: Offset = 0,
    ) -> dict[str, Any]:
        fields, p, _ = await _route(departure, destination, stops, cruise_altitude_ft, airplane_tail, depart_at, rules)
        b = await _briefing(fields, p)
        selection = p.get("altitude_selection") or {}
        points = [p["departure"], *p.get("stops", []), p["destination"]]
        classes = sorted({t["class"] for t in selection.get("airspace_transits") or [] if t["class"] in ("B", "C", "D")})
        tfrs = [
            pick(t, ("notam_id", "title", "kind", "crosses", "along_track_nm", "floor_ft", "floor_ref", "ceiling_ft"))
            | pick(t, ("ceiling_ref", "effective", "expires", "active_now", "on_route"))
            for t in b.get("tfrs") or []
        ]
        return {
            "route": route_of(p),
            "cruise_altitude_ft": p["altitude_ft"],
            "controlled": selection.get("airspace_transits") or [],
            "entry_rules": {c: engine_ask("airspace_entry_rules", **{"class": c}) for c in classes},
            "special_use": selection.get("special_use") or [],
            "tfrs": rounded(tfrs[offset : offset + limit]),
            **paged(tfrs, offset, limit),
            "tfrs_unchecked": "tfrs" in (b.get("weather_unavailable") or []),
            "adiz": engine_ask("route_adiz", points=[{"lat": q["lat"], "lon": q["lon"]} for q in points]),
            "special_vfr": {
                q["ident"]: engine_ask("special_vfr", surface_area=q["airspace_class"], airport=q["ident"])
                for q in points
                if q.get("kind") != "fix" and q.get("airspace_class") in ("B", "C", "D", "E")
            },
            "fields": [
                {"ident": f["ident"], "role": f["role"], "private": f["private"], "military": f["military"]}
                | engine_ask("field_status", status=f["status"])
                for f in fields_of(tuple(q["ident"] for q in points))
            ],
            "sources": [ENGINE_SOURCE, NOTAM_SOURCE, *editions("nasr")],
        }
