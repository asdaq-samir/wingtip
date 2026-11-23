"""The connector's tools for a field on a day: the sun's times and the
night the rules read from them, and the pilot's own airplane's weight
and balance and runway distances there. The figures are the engine's
(sun_times, gonogo_balance, gonogo_runway_checks), asked as the Brief
asks them; the field's runways and weather are the planner's briefing.
No airplane is ever assumed (the owner, 2026-11-09), and a figure the
pilot never gave is said to be missing, never filled in."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field
from wingtip import field_use, time_zone, utc
from wingtip.engine import ask as engine_ask

from ..generated.planner_calls import airport_place, briefing
from ..gonogo.runways import runway_checks
from ..gonogo.weight_balance import balance
from . import airplane
from .airport_tools import Ident
from .calls import METAR_SOURCE, editions, ident as ident_of, pick, pilot, rounded
from .tool_meta import READS, read_only

SUN_SOURCE = {"source": "Wingtip engine: NOAA's solar calculation, sunrise and sunset as the Naval Observatory defines them"}
POH_SOURCE = {"source": "The airplane's POH loading and short-field tables (its Wingtip profile), and its weight and balance record"}
#: What each period is, as the rules read it.
PERIODS = {
    "night": "14 CFR 1.1's night: end of evening civil twilight to beginning of morning civil twilight "
    "(91.151(a)(2)'s 45-minute VFR reserve, 91.205(c)'s equipment, night flight time)",
    "passenger_night": "14 CFR 61.57(b): 1 hour after sunset to 1 hour before sunrise; carrying passengers in it "
    "needs three takeoffs and landings to a full stop made in it in the preceding 90 days",
    "lights": "14 CFR 91.209(a): position lights on from sunset to sunrise",
}


def zone_of(name: str | None) -> ZoneInfo | None:
    try:
        return ZoneInfo(name) if name else None
    except (ZoneInfoNotFoundError, ValueError):
        return None


def today(lon: float, zone: ZoneInfo | None, now: datetime | None = None) -> date:
    """The place's own date now, the date the engine reads (its local one,
    at the longitude's mean noon): a US evening is already tomorrow in
    UTC. Where no zone is known, the longitude's mean solar time."""
    now = now or datetime.now(timezone.utc)
    return now.astimezone(zone).date() if zone else (now + timedelta(hours=lon / 15)).date()


def _at(s: float | None, zone: ZoneInfo | None) -> dict | None:
    """An instant in UTC and in the field's own clock, its zone's name
    with it ("2026-11-23 16:21 CST"), so the model need not work out the
    offset or whether daylight saving time is in force."""
    if s is None:
        return None
    local = datetime.fromtimestamp(s, zone).strftime("%Y-%m-%d %H:%M %Z") if zone else None
    return {"utc": utc.iso(s), "local": local}


def _period(p: dict, what: str, zone: ZoneInfo | None) -> dict:
    return {"from": _at(p["from_s"], zone), "until": _at(p["until_s"], zone), "all_day": p["all_day"], "rule": PERIODS[what]}


def field_status(ident: str) -> dict:
    """Whether a field is open, the engine's field_status of NASR APT_BASE's
    ARPT_STATUS: a closed one is labelled wherever it appears (decision
    0043), `closed` its label ("Closed indefinitely")."""
    return engine_ask("field_status", status=(field_use.record_of(ident) or {}).get("status"))


def register(server: MCPServer) -> None:
    @server.tool(
        name="sun_times",
        description="Sunrise, sunset and civil twilight at an airport or a place on its local date (each time in "
        "UTC and in the place's own time zone), and when "
        "night begins and ends from that evening by each rule that reads it: 14 CFR 1.1's night (civil twilight; "
        "the VFR night reserve), 61.57(b)'s period an hour after sunset to an hour before sunrise (night currency "
        "and passengers) and 91.209(a)'s position lights from sunset. Where the sun does not set or rise, says so.",
        title="Sun and night",
        annotations=read_only("Sun and night"),
        meta=READS,
    )
    async def sun_times(
        airport: Annotated[str | None, Field(max_length=7, description="The field: KDLH, C81.")] = None,
        lat: Annotated[float | None, Field(ge=-90, le=90, description="Or a place's latitude, degrees north.")] = None,
        lon: Annotated[float | None, Field(ge=-180, le=180, description="And longitude, degrees east (west negative).")] = None,
        on: Annotated[
            date | None, Field(description="The place's local date, yyyy-mm-dd; its own today (tonight's night) when omitted.")
        ] = None,
    ) -> dict[str, Any]:
        pilot()
        where = None
        if airport:
            card = await airport_place(ident=ident_of(airport))
            lat, lon, where = card["lat"], card["lon"], card["ident"]
        elif lat is None or lon is None:
            raise ToolError("Give an airport, or lat and lon.")
        zone_name = time_zone.at(lat, lon)
        zone = zone_of(zone_name)
        day = on or today(lon, zone)
        sun = engine_ask("sun_times", lat=lat, lon=lon, date=day.isoformat())
        return {
            "airport": where,
            "lat": lat,
            "lon": lon,
            "date": day.isoformat(),
            "time_zone": zone_name if zone else None,
            "sun": sun["sun"],
            "civil_twilight": sun["civil_twilight"],
            "solar_noon": _at(sun["solar_noon_s"], zone),
            "sunrise": _at(sun["sunrise_s"], zone),
            "sunset": _at(sun["sunset_s"], zone),
            "civil_dawn": _at(sun["civil_dawn_s"], zone),
            "civil_dusk": _at(sun["civil_dusk_s"], zone),
            **{what: _period(sun[what], what, zone) for what in PERIODS},
            "sources": [SUN_SOURCE],
        }

    @server.tool(
        name="airplane_performance",
        description="The pilot's own airplane at a field: its weight and balance at takeoff and landing against "
        "its POH's limits and envelope (14 CFR 91.9), and its short-field takeoff and landing distances on the "
        "runway the wind favours, from the field's pressure and density altitude and reported wind, against the "
        "runway's length (91.103(b)). Needs one of the pilot's airplanes (my_airplanes); says which figures are missing. "
        "A field NASR lists as closed is labelled Closed.",
        title="Airplane performance",
        annotations=read_only("Airplane performance"),
        meta=READS,
    )
    async def airplane_performance(
        airport: Ident,
        # Required: Wingtip assumes no airplane (the owner, 2026-11-09).
        airplane_tail: Annotated[
            str, Field(min_length=2, max_length=8, description="The pilot's airplane by tail number (my_airplanes lists them).")
        ],
        stations_lb: Annotated[
            list[float] | None, Field(max_length=12, description="Pounds at each loading station, in the POH's order.")
        ] = None,
        fuel_gal: Annotated[float | None, Field(ge=0, le=2000, description="Fuel at engine start, gal; full usable when omitted.")] = None,
        trip_fuel_gal: Annotated[float | None, Field(ge=0, le=2000, description="Fuel burnt before landing, gal.")] = None,
        empty_weight_lb: Annotated[
            float | None, Field(gt=0, le=20000, description="Basic empty weight; the record's when omitted.")
        ] = None,
        empty_moment_lb_in: Annotated[float | None, Field(gt=0, description="Basic empty moment; the record's when omitted.")] = None,
    ) -> dict[str, Any]:
        who = pilot()
        a = await airplane.find(who, airplane_tail)
        profile = airplane.profile(a)
        loading, missing = profile.get("loading"), []
        if not loading:
            missing.append("the POH's loading (stations, arms, limits and envelope): none in this airplane's Wingtip profile")
        fuel = fuel_gal if fuel_gal is not None else profile.get("usable_fuel_gal")
        if loading and fuel is None:
            missing.append("fuel_gal, the fuel at engine start: the airplane has no usable fuel on record")
        load, lacking = (None, [])
        if loading and fuel is not None:
            load, lacking = airplane.load(a, loading, stations_lb, fuel, (empty_weight_lb, empty_moment_lb_in))
        missing += lacking
        loaded = balance(loading, load, trip_fuel_gal) if load else None
        if not profile.get("takeoff") or not profile.get("landing"):
            missing.append("the POH's short-field takeoff and landing tables: none in this airplane's Wingtip profile")
        field = ident_of(airport)
        status = field_status(field)
        brief = await briefing(dep=field, dest=field)
        ends = [{"ident": i, "elevation_ft": (brief["airports"].get(i) or {}).get("elevation_ft")} for i in brief["airports"]]
        checks = runway_checks(
            profile,
            brief,
            [ends[0], ends[0]] if ends else [],
            loaded["takeoff"]["weight_lb"] if loaded else None,
            loaded["landing"]["weight_lb"] if loaded else None,
        )
        runway = ("role", "end", "pressure_alt_ft", "density_alt_ft", "temp_c", "reported", "headwind_kt", "crosswind_kt")
        distance = ("kind", "end", "ground_roll_ft", "total_ft", "over", "unknown", "beyond", "caveats")
        return {
            # A closed field first, so it is said before any distance is
            # (decision 0043): the figures are its runways' as recorded.
            "closed": f"{status['closed']}: NASR lists {field} as closed, not a field to use; the distances are its runways' as recorded"
            if status["closed"]
            else None,
            "airplane": airplane.label(a),
            "airport": field,
            "balance": rounded({k: v for k, v in loaded.items() if k != "takeoff_words"}) if loaded else None,
            "load": load,
            "fuel_gal": fuel,
            "runways": [
                rounded(pick(c, runway))
                | {"runway": (c["runway"] or {}).get("ends"), "length_ft": (c["runway"] or {}).get("length_ft")}
                | {"crosswind_over_demonstrated": c["crosswind_over"], "unchecked": c["unchecked"]}
                | {"distances": [rounded(pick(d, distance)) for d in c["distances"]]}
                for c in checks
            ],
            # The engine reads the table at its heaviest, the longest
            # distances, where no weight is known.
            "distance_weight": "the loading's" if loaded else "the POH table's heaviest weight",
            "missing": missing,
            "sources": [POH_SOURCE, METAR_SOURCE, *editions("nasr")],
        }
