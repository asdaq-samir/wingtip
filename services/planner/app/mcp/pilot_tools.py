"""The connector's tools over the pilot's own account: their airplanes and
saved flights (read), and saving a route so it is in the app (save_flight:
additive, asked of the pilot by the AI app before each call; the other
writes, over the live view's flight, are saved_tools',
docs/design/mcp-connector.md)."""

from __future__ import annotations

from typing import Annotated, Any
from urllib.parse import urlencode

from mcp.server.mcpserver import MCPServer
from pydantic import Field

from . import records
from .calls import WRITE, paged, pilot
from .airport_tools import Ident
from .flight_tools import Altitude, Depart, Rules, Stops, Tail, app_link, planned, route_fields
from .tool_meta import READS, WRITES, additive, read_only

AIRPLANE_FIELDS = (
    "id",
    "tailNumber",
    "typeDesignator",
    "cruiseTasKt",
    "fuelBurnGph",
    "cruisePowerPct",
    "climbTasKt",
    "climbFuelBurnGph",
    "descentIasKt",
    "descentFuelBurnGph",
    "usableFuelGal",
    "equipment",
    "surveillance",
    "inspections",
    "openSquawks",
    "figures",
)
#: What my_flights gives of a saved flight: the route summary a pilot
#: expects an AI app to read, and no more. The flight's notes, its risk
#: assessment, its share link and the picks it was planned with stay in
#: the app: notes are free text the pilot wrote for themself, and the risk
#: factors can name their health or currency, which connecting an app to
#: read "saved flights" did not agree to (docs/privacy-inventory.md, "AI
#: apps"). An allowlist, so a field the gateway adds later is not given.
FLIGHT_FIELDS = (
    "id",
    "name",
    "departureIdent",
    "destinationIdent",
    "stops",
    "aircraftTailNumber",
    "cruiseAltitudeFt",
    "totalDistanceNm",
    "totalEteMin",
    "totalFuelGal",
    "plannedFor",
    "createdAt",
)
ACCOUNT_SOURCE = {"source": "The pilot's own Wingtip account, as they entered it"}


def checkpoints(p, distance_nm: float) -> list[dict]:
    """The route's airports as the saved flight's rows (the gateway's
    SaveFlightCheckpointRequest): the departure, each stop where the legs
    reach it, and the destination; the app plans the legs again on open."""
    ends = [("departure", p["departure"], 0.0)]
    flown, at = 0.0, {}
    for leg in p["legs"]:
        flown += leg["distance_nm"]
        at.setdefault(leg["to"], round(flown, 1))
    for stop in p.get("stops", []):
        ends.append(("waypoint" if stop.get("kind") == "fix" else "stop", stop, at.get(stop["ident"], 0.0)))
    ends.append(("destination", p["destination"], round(distance_nm, 1)))
    return [
        {"sequenceNo": n, "name": end["ident"], "category": kind, "lat": end["lat"], "lon": end["lon"], "alongTrackNm": along}
        for n, (kind, end, along) in enumerate(ends)
    ]


def save_request(p: dict, flown: dict | None, planned_for: str | None, picks: str | None) -> dict:
    """A planned flight (/api/plan's answer) as the gateway's SaveFlightRequest."""
    totals = p["totals"]
    return {
        "aircraftId": flown["id"] if flown else None,
        "departureIdent": p["departure"]["ident"],
        "destinationIdent": p["destination"]["ident"],
        "stops": [s["ident"] for s in p.get("stops", [])],
        "cruiseAltitudeFt": round(p["altitude_ft"]),
        "totalDistanceNm": totals["distance_nm"],
        "totalEteMin": totals.get("ete_min"),
        "totalFuelGal": totals.get("fuel_gal"),
        "plannedFor": planned_for,
        "checkpoints": checkpoints(p, totals["distance_nm"]),
        "picks": picks,
    }


def register(server: MCPServer) -> None:
    @server.tool(
        name="my_airplanes",
        description="The airplanes the signed-in pilot saved in Wingtip: tail number, type, cruise speed and fuel "
        "burn, usable fuel, equipment codes, inspections with the day each is good through, and open squawks.",
        title="My airplanes",
        annotations=read_only("My airplanes"),
        meta=READS,
    )
    async def my_airplanes() -> dict[str, Any]:
        who = pilot()
        theirs = await records.airplanes(who)
        return {"airplanes": [{k: a.get(k) for k in AIRPLANE_FIELDS if a.get(k) is not None} for a in theirs], "sources": [ACCOUNT_SOURCE]}

    @server.tool(
        name="my_flights",
        description="The flights the signed-in pilot saved in Wingtip, newest first, as a route summary: its name, "
        "route, airplane, cruise altitude, distance, time and fuel, and when planned for. Not its notes or risk assessment.",
        title="My saved flights",
        annotations=read_only("My saved flights"),
        meta=READS,
    )
    async def my_flights(
        limit: Annotated[int, Field(ge=1, le=50, description="How many, newest first, 1 to 50.")] = 10,
        offset: Annotated[int, Field(ge=0, description="How many to skip, for the next page: the last answer's next_offset.")] = 0,
    ) -> dict[str, Any]:
        who = pilot()
        theirs = await records.flights(who)
        flights = [{k: f[k] for k in FLIGHT_FIELDS if f.get(k) is not None} for f in theirs[offset : offset + limit]]
        return {"flights": flights, **paged(theirs, offset, limit), "sources": [ACCOUNT_SOURCE]}

    @server.tool(
        name="save_flight",
        description="Saves a route, given by its airports, altitude, airplane and time, to the signed-in pilot's "
        "Wingtip account, so it is in the app's Flights to open, brief and fly. It plans the route first, as "
        "plan_route does, and saves that plan with its altitude, VFR or IFR and time. Adds a new flight; changes "
        "nothing already saved. A flight shown or changed with show_flight and the edit tools is saved by "
        "save_flight_plan instead, which keeps its procedures, fuel stops and fuel on board too.",
        title="Save flight to Wingtip",
        annotations=additive("Save flight to Wingtip"),
        meta=WRITES,
    )
    async def save_flight(
        departure: Ident,
        destination: Ident,
        stops: Stops = [],  # noqa: B006 -- pydantic copies a default
        cruise_altitude_ft: Altitude = None,
        airplane_tail: Tail = None,
        depart_at: Depart = None,
        rules: Rules = "vfr",
    ) -> dict[str, Any]:
        who = pilot(WRITE)
        fields, flown = await route_fields(who, departure, destination, stops, cruise_altitude_ft, airplane_tail, depart_at, rules)
        p = await planned(fields)
        # The altitude asked, kept as the app's own address keeps it
        # (lib/flightLink PICK_KEYS), so it opens at that altitude.
        kept = {
            "altitude_ft": cruise_altitude_ft,
            "altitude_choice": p.get("altitude_choice") if cruise_altitude_ft is None else None,
            # IFR kept as save_flight_plan keeps it (flight_state.picks_of).
            "rules": "ifr" if rules == "ifr" else None,
        }
        picks = urlencode({k: v for k, v in kept.items() if v}) or None
        request = save_request(p, flown, depart_at.isoformat() if depart_at else None, picks)
        saved = await records.save_flight(who, request)
        return {
            "saved": {k: v for k, v in saved.items() if v is not None},
            "open_in_wingtip": app_link(fields),
            "sources": [ACCOUNT_SOURCE],
        }
