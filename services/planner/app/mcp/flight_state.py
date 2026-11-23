"""The flight a pilot's AI app is planning with them, as the connector's
edit tools take and give it back: its route, the cruise altitude, the
departure time, the procedures picked, the fuel on board, the airplane and
the saved flight it came from. Wingtip keeps none of it between calls (the
planner holds no records, and the MCP server is stateless): the AI app
hands the flight it was given to the next tool, and the live view keeps
its own copy (docs/design/mcp-connector.md, "The live view").

It is the web's own address, key for key (apps/web lib/address), so the
same flight opens in Wingtip from its link and plans the same through
/api/plan: `stops`, `fuel`, `altitude_ft`, `depart`, `procs`, `tanks`."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from urllib.parse import parse_qs, urlencode

from pydantic import BaseModel, Field, field_validator
from wingtip.engine import ask as engine

from ..router_basics import MAX_STOPS
from ..settings import get_settings

Point = Annotated[str, Field(min_length=2, max_length=16)]


class Flight(BaseModel):
    """The flight being planned, as every edit tool takes it and answers it."""

    departure: Point = Field(description="The departure airport's identifier.")
    destination: Point = Field(description="The destination airport's identifier.")
    stops: list[Point] = Field(default=[], max_length=MAX_STOPS, description="Airports or waypoints on the way, in order.")
    fuel_stops: list[Point] = Field(default=[], max_length=MAX_STOPS, description="The stops among them where fuel is bought.")
    # Bounds on what may be asked, not a rule: whether it may be flown is
    # the engine's (14 CFR 91.119, 91.159), said in the plan's cautions.
    cruise_altitude_ft: int | None = Field(default=None, ge=500, le=45000, description="Feet MSL; none flies the legal fastest.")
    depart_at: datetime | None = Field(default=None, description="ISO 8601; none is now.")
    procedures: str = Field(
        default="",
        max_length=400,
        description="Procedures picked, as Wingtip writes them (KDLH:I27:::L); change them with change_approach.",
    )
    # As many fields as a route has (its two ends and its stops): the
    # model hands the flight back, and an unbounded map was a /api/plan
    # query of any length (the security review of 2026-11-22, L3).
    fuel_on_board: dict[Point, float] = Field(
        default={},
        max_length=MAX_STOPS + 2,
        description="Gallons in the tanks leaving a field, by its identifier; a field not named leaves full.",
    )
    airplane_tail: str | None = Field(default=None, max_length=8, description="The pilot's own airplane, by tail number.")
    rules: Literal["vfr", "ifr"] = Field(
        default="vfr", description="VFR or IFR: the cruising altitudes (14 CFR 91.159 or 91.179) and the reserve (91.151 or 91.167)."
    )
    saved_flight_id: int | None = Field(default=None, description="The saved flight this came from, if any.")

    @field_validator("departure", "destination", "airplane_tail")
    @classmethod
    def _upper(cls, value: str | None) -> str | None:
        return value.strip().upper() if value else value

    @field_validator("stops", "fuel_stops")
    @classmethod
    def _uppers(cls, value: list[str]) -> list[str]:
        return [v.strip().upper() for v in value if v.strip()]

    @field_validator("fuel_on_board")
    @classmethod
    def _gallons(cls, value: dict[str, float]) -> dict[str, float]:
        if any(g < 0 or g > 2000 for g in value.values()):
            raise ValueError("fuel on board is 0 to 2,000 gallons")
        return {k.strip().upper(): float(g) for k, g in value.items()}


def same(a: str, b: str) -> bool:
    """Whether two identifiers are one field, KDSM and DSM (the engine's same_field)."""
    return bool(engine("same_field", a=a, b=b))


def tanks_text(flight: Flight) -> str:
    """The fuel on board as /api/plan's `tanks` and the address write it: "KOSH:30,KJVL:0"."""
    return ",".join(f"{k}:{g:g}" for k, g in flight.fuel_on_board.items())


def query_of(flight: Flight, airplane_fields: dict) -> dict:
    """The flight as /api/plan's query takes it, flown on the airplane's fields."""
    return {
        "dep": flight.departure,
        "dest": flight.destination,
        "stops": ",".join(flight.stops),
        "altitude_ft": flight.cruise_altitude_ft,
        "depart": flight.depart_at.isoformat() if flight.depart_at else None,
        "rules": flight.rules,
        "procedures": flight.procedures,
        "tanks": tanks_text(flight),
        **airplane_fields,
    }


def address_of(flight: Flight) -> dict[str, str]:
    """The web's address keys for the flight (lib/address), those set: its
    route, picks and rules."""
    keys = {
        "dep": flight.departure,
        "dest": flight.destination,
        "stops": ",".join(flight.stops),
        "fuel": ",".join(flight.fuel_stops),
        "altitude_ft": str(flight.cruise_altitude_ft) if flight.cruise_altitude_ft is not None else "",
        "depart": flight.depart_at.isoformat() if flight.depart_at else "",
        "procs": flight.procedures,
        "tanks": tanks_text(flight),
        # The rules flown, which the web's address reads (lib/address
        # PICK_KEYS), so an IFR plan opens as IFR, not the app's own setting
        # (the mcp audit, L8); VFR is the default and not written.
        "rules": "ifr" if flight.rules == "ifr" else "",
    }
    return {k: v for k, v in keys.items() if v}


def link_of(flight: Flight) -> str | None:
    """The flight in Wingtip, its own address on the planner's page."""
    base = get_settings().mcp_issuer
    return f"{base}/app/plan?{urlencode(address_of(flight))}" if base else None


def _tanks(text: str) -> dict[str, float]:
    """The address's `tanks` ("KOSH:30,KJVL:0") as the flight's fuel on board."""
    pairs = (part.partition(":") for part in text.split(",") if ":" in part)
    return {ident: float(gal) for ident, _, gal in pairs if ident and gal}


def from_saved(saved: dict) -> Flight:
    """A saved flight (the gateway's FlightSummaryDto) as the flight to edit:
    its route, its altitude, the procedures, the fuel stops, the fuel on
    board and the rules it was saved with (its picks, as the address
    writes them), its airplane and its time."""
    picks = {k: v[0] for k, v in parse_qs(saved.get("picks") or "").items()}
    altitude = picks.get("altitude_ft") or saved.get("cruiseAltitudeFt")
    return Flight(
        departure=saved["departureIdent"],
        destination=saved["destinationIdent"],
        stops=saved.get("stops") or [],
        fuel_stops=[f for f in picks.get("fuel", "").split(",") if f],
        cruise_altitude_ft=int(altitude) if altitude and "altitude_ft" in picks else None,
        depart_at=saved.get("plannedFor"),
        procedures=picks.get("procs", ""),
        fuel_on_board=_tanks(picks.get("tanks", "")),
        airplane_tail=saved.get("aircraftTailNumber"),
        rules="ifr" if picks.get("rules") == "ifr" else "vfr",
        saved_flight_id=saved.get("id"),
    )


def picks_of(flight: Flight) -> str | None:
    """What a saved flight keeps besides its route (the gateway's
    SaveFlightRequest.picks, the address's PICK_KEYS): the altitude asked,
    the procedures, the fuel stops (`fuel`), the fuel on board (`tanks`)
    and IFR (`rules`; VFR is the default and not written), so a flight
    opened again plans as it was saved (mcp audit 2026-11-23, M5)."""
    picks = {
        "altitude_ft": flight.cruise_altitude_ft,
        "procs": flight.procedures,
        "fuel": ",".join(flight.fuel_stops),
        "tanks": tanks_text(flight),
        "rules": "ifr" if flight.rules == "ifr" else None,
    }
    text = urlencode({k: v for k, v in picks.items() if v not in (None, "")})
    return text or None
