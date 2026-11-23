"""The pilot's own airplane, by its tail number, as the planner flies it:
on the stock profile of its type with its record's figures laid over it,
or on its figures alone where no stock profile has its type -- the web's
lib/aircraftChoice choiceOf, read here from the same gateway record. No
airplane named is no airplane: the plan then has only the route's own
figures, never a stock airplane's in its place (the owner, 2026-11-09:
"don't assume")."""

from __future__ import annotations

import re

from mcp.server.mcpserver.exceptions import ToolError
from wingtip.aircraft import OWN_AIRPLANE, UnknownAircraft, aircraft_profile, profile_path

from ..gonogo.weight_balance import default_load
from . import records


async def find(pilot_id: str, tail: str) -> dict:
    """The pilot's airplane by its tail number, or a tool error naming theirs."""
    theirs = await records.airplanes(pilot_id)
    wanted = tail.strip().upper().removeprefix("N")
    for a in theirs:
        if str(a.get("tailNumber", "")).upper().removeprefix("N") == wanted:
            return a
    named = ", ".join(a["tailNumber"] for a in theirs) or "none yet (add one in Wingtip's Setup, Airplanes)"
    raise ToolError(f"No airplane {tail.strip().upper()} in this pilot's Wingtip. Their airplanes: {named}.")


def profile_of(type_designator: str) -> str:
    """The stock profile named by its type (a C172 flies on c172), else
    the pilot's own figures alone."""
    name = re.sub(r"[^a-z0-9]", "", type_designator.lower())
    return name if profile_path(name) else OWN_AIRPLANE


def plan_fields(a: dict) -> dict:
    """The airplane as PlanQuery's and GoNoGoAsk's fields take it; a figure
    the pilot never gave is left out, the profile's own then flown."""
    own = a.get("figures") or {}
    handbook = a.get("handbook") or {}
    fields = {
        "aircraft": profile_of(a.get("typeDesignator", "")),
        "cruise_tas_kt": a.get("cruiseTasKt"),
        "fuel_burn_gph": a.get("fuelBurnGph"),
        "usable_fuel_gal": a.get("usableFuelGal"),
        "cruise_power_pct": a.get("cruisePowerPct"),
        "climb_tas_kt": a.get("climbTasKt"),
        "climb_fuel_burn_gph": a.get("climbFuelBurnGph"),
        "descent_ias_kt": a.get("descentIasKt"),
        "descent_fuel_burn_gph": a.get("descentFuelBurnGph"),
        "service_ceiling_ft": own.get("serviceCeilingFt"),
        "climb_rate_fpm": own.get("climbRateFpm") or handbook.get("climb_rate_fpm"),
        "taxi_fuel_gal": own.get("taxiFuelGal"),
        "glide_ratio": own.get("glideRatio") or handbook.get("glide_ratio"),
    }
    return {k: v for k, v in fields.items() if v is not None}


def label(a: dict) -> str:
    return f"{a.get('tailNumber')} ({a.get('typeDesignator')})"


def profile(a: dict) -> dict:
    """The airplane as the planner flies it (PlanQuery.profile): its stock
    type's profile with its own figures over it, or its own figures alone."""
    fields = plan_fields(a)
    try:
        return aircraft_profile(fields.pop("aircraft"), **fields)
    except UnknownAircraft as err:
        raise ToolError(f"{err} Add them to {label(a)} in Wingtip's Setup, Airplanes.") from err


def load(a: dict, loading: dict, stations_lb, fuel_gal: float, empty=(None, None)) -> tuple[dict | None, list[str]]:
    """What is aboard, as the engine's gonogo_balance and /api/go-no-go's
    `load` take it, or what is missing for it: never the POH's sample
    airplane and its 170 lb pilot in the pilot's place. The empty weight
    and moment are the pilot's (theirs given, else the airplane's weight
    and balance record), read to an arm by the engine's own default_load."""
    figures = a.get("figures") or {}
    weight = empty[0] if empty[0] is not None else figures.get("emptyWeightLb")
    moment = empty[1] if empty[1] is not None else figures.get("emptyMomentLbIn")
    names = [s["name"] for s in loading.get("stations") or []]
    missing = []
    if weight is None or moment is None:
        missing.append("empty_weight_lb and empty_moment_lb_in, from the airplane's weight and balance record")
    if stations_lb is None:
        missing.append(f"stations_lb, the pounds at each station in order: {', '.join(names)}")
    elif len(stations_lb) != len(names):
        raise ToolError(f"stations_lb takes {len(names)} weights, one a station in order: {', '.join(names)}.")
    if missing:
        return None, missing
    own = {**loading, "sample_empty_weight_lb": weight, "sample_empty_moment_lb_in": moment}
    return {**default_load(own, fuel_gal), "stations_lb": list(stations_lb)}, []


def _inspections(i: dict) -> dict:
    """The record's inspections as the risk assessment reads them (the
    web's lib/airworthiness inspectionsInput, the same gateway record)."""
    return {
        "annual_good_through": i.get("annualGoodThrough"),
        "elt_inspection_good_through": i.get("eltInspectionGoodThrough"),
        "elt_battery_due_on": i.get("eltBatteryDueOn"),
        "static_check_good_through": i.get("staticCheckGoodThrough"),
        "transponder_check_good_through": i.get("transponderCheckGoodThrough"),
        # The engine weighs the 100-hour only where the owner says the
        # airplane is flown for hire (14 CFR 91.409(b)).
        "hundred_hour_due_at_hours": i.get("hundredHourDueAtHours"),
        "for_hire": i.get("forHire"),
        "hours_now": i.get("hoursNow"),
    }


def own_airplane(a: dict) -> dict:
    """The airplane's records the risk assessment weighs (/api/go-no-go's
    `own_airplane`): its last VOR check (91.171), its inspections and its
    open squawks (91.213), as the web's Brief sends them."""
    vor = a.get("vorCheck")
    return {
        "vor_check": {"good_through": vor["goodThrough"], "within_limit": vor["withinLimit"]} if vor else None,
        "inspections": _inspections(a["inspections"]) if a.get("inspections") else None,
        "squawks": [
            {"text": s["text"], "inoperative": bool(s.get("inoperative")), "deferred_for": s.get("deferredFor")}
            for s in a.get("openSquawks") or []
        ],
    }
