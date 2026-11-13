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
from wingtip.aircraft import OWN_AIRPLANE, profile_path

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
