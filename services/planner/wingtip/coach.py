"""A pilot's proficiency plan: the data the engine's rule needs that the
apps do not hold, gathered round the pilot's home field, and the rule
asked.

The rule is the engine's (proficiency_plan, engine/crates/pilot/src/coach):
what is due and when (14 CFR 61.56, 61.57), what the pilot's own
debriefs show, and the sessions -- with the field each is flown at,
picked from the places given here. What this adds is what the engine
never fetches: the fields near home, each with

- whether a runway is lighted (OurAirports' runways, `lighted`), for
  night landings (61.57(b));
- its instrument approaches from the FAA's CIFP in force today
  (procedures.procedures_at), a precision one marked by its name (ILS,
  GLS: a glidepath the coded name says it has; an RNAV's LPV line is on
  the plate, not in the name, so an RNAV approach is not counted as one).
"""

from __future__ import annotations

import logging

from . import airports, procedures
from .engine import ask as engine

log = logging.getLogger(__name__)

#: The fields looked at round home: the nearest, a short flight away.
#: A practice session is flown from home and back, so a field further
#: than this is no one's local practice field.
NEAREST_FIELDS = 10
WITHIN_NM = 40.0

#: The approach names (FAA CIFP, procedures.procedure_name) of a precision
#: approach: one with an electronic glidepath (AIM 5-4-5's ILS and GLS).
PRECISION = ("ILS", "GLS")


def _lighted(place: dict) -> bool:
    try:
        return any(r.get("lighted") and not r.get("closed") for r in airports.get_runways(place.get("source_ident") or place["ident"]))
    except (OSError, ValueError, KeyError):
        log.warning("No runways for %s", place.get("ident"), exc_info=True)
        return False


def _approaches(ident: str) -> list[dict]:
    try:
        listed = procedures.procedures_at(ident)
    except RuntimeError:
        log.warning("No CIFP for the practice approaches at %s", ident, exc_info=True)
        return []
    return [
        {"name": p["name"], "precision": p["name"].upper().startswith(PRECISION)}
        for p in (listed or {}).get("procedures", [])
        if p["kind"] == "approach"
    ]


def practice_places(home: str | None) -> list[dict]:
    """The fields within WITHIN_NM of the home field, the nearest first,
    as the engine's PracticePlace; none without a home it can find."""
    place = airports.find_place(home) if home else None
    if place is None:
        return []
    found = []
    for f in airports.nearest(place["lat"], place["lon"], limit=NEAREST_FIELDS):
        if f["distance_nm"] > WITHIN_NM:
            continue
        found.append(
            {
                "ident": f["ident"],
                "name": f["name"],
                "distance_nm": f["distance_nm"],
                "lighted": _lighted(f),
                "approaches": _approaches(f["ident"]),
            }
        )
    return found


def plan(ask: dict, home: str | None) -> dict:
    """The engine's proficiency_plan for `ask` (its input without the
    places), with the fields round `home` as its places."""
    return engine("proficiency_plan", **ask, places=practice_places(home))
