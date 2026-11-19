"""Where a flight cannot fly its altitude, the way round the terrain that
stops it, as stops the pilot may add (the passes by ident, never a route
the planner flies unasked). Class B never stops it: the route is planned
through it with its clearance, and the Routes offer the way round it
(wingtip.class_b_route)."""

from __future__ import annotations

import logging

from . import geo, terrain_detour
from .planning import no_altitude

from .flight_outcomes import Asked, Flown, HopRun, Unflyable

log = logging.getLogger(__name__)


def unflyable_parts(outcome: Unflyable, runs: list[HopRun]) -> tuple[dict, list[dict]]:
    """no_altitude's words for a route with no legal altitude, and the way
    round the high ground that stops it (terrain_way), with its place in
    the stops: on the hop it fails on."""
    at = next((i for i, run in enumerate(runs) if (run.hop.dep_ident, run.hop.dest_ident) == outcome.between), 0)
    hop = runs[at].hop
    why = no_altitude(outcome.selection, outcome.between, _stuck_where(outcome.selection, hop))
    round_way = terrain_way(outcome.selection, hop)
    if not round_way:
        return why, []
    why = {**why, "advice": "Go round the high ground by the way suggested, or set a cruise altitude of your own to plan it anyway."}
    return why, [{**round_way, "stop_index": at}]


def terrain_way(selection: dict, hop) -> dict | None:
    """Where the airplane's service ceiling is what stops the route over
    high ground, the way round it (wingtip.terrain_detour): the points to fly
    by, as a detour of its own, with how much longer it makes the hop.
    None where something else stops it (the clouds) or there is no
    way round in reach. At the owner's ask ("Suggest a way around the
    terrain ... Yes build it", 2026-10-23)."""
    stuck = next((s for s in selection.get("segments", []) if not s.get("candidates_ft")), None)
    ceiling = (stuck or {}).get("service_ceiling_ft")
    if not ceiling:
        return None
    try:
        points = terrain_detour.way_round(hop.start, hop.end, ceiling)
    except Exception:  # noqa: BLE001 -- the tiles out of reach: no suggestion, the problem said as before
        return None
    if not points:
        return None
    path = [hop.start, *((p["lat"], p["lon"]) for p in points), hop.end]
    flown = sum(geo.distance_nm(a[0], a[1], b[0], b[1]) for a, b in zip(path, path[1:]))
    return {
        "ident": points[0]["ident"],
        "kind": "Around the high ground",
        "added_nm": round(float(flown - hop.length_nm), 1),
        "description": " · ".join(p["ident"] for p in points),
        "via": [p["ident"] for p in points],
    }


def ways_round_of(runs: list[HopRun], outcome: Flown) -> list[dict]:
    """For each hop flown at no legal altitude (altitude_anyway), the way
    round the high ground that stops it the problem offered when it
    refused, for the pilot to take or not."""
    if not any("candidates_ft" in seg and not seg["candidates_ft"] for seg in outcome.selection.get("segments", [])):
        return []
    out, start = [], 0.0
    for run in runs:
        end = start + run.hop.length_nm
        mine = [seg for seg in outcome.selection.get("segments", []) if start - 0.05 <= seg.get("from_nm", -1) < end - 0.05]
        start = end
        if not any("candidates_ft" in seg and not seg["candidates_ft"] for seg in mine):
            continue
        _, ways = unflyable_parts(Unflyable({**outcome.selection, "segments": mine}, (run.hop.dep_ident, run.hop.dest_ident)), runs)
        out.extend(ways)
    return out


def detours_of(runs: list[HopRun], outcome: Flown, asked: Asked) -> list[dict]:
    """The ways round the high ground of a route flown at no legal
    altitude (ways_round_of); none for a pilot's own altitude, flown as
    set with its cautions."""
    return [] if asked.altitude_ft is not None else ways_round_of(runs, outcome)


def _stuck_where(selection: dict, hop) -> str | None:
    """Where on the hop the altitude runs out, by the route's own points
    as the pilot entered them, at the pilot's ask: the middle of the first
    stretch with no legal altitude, from the nearer of the hop's ends --
    "540 nm past KDLH", "120 nm before KBUR" -- for the one line that says
    what stops the plan."""
    stuck = next((s for s in selection.get("segments", []) if not s.get("candidates_ft")), None)
    if stuck is None or stuck.get("from_nm") is None or stuck.get("to_nm") is None:
        return None
    middle = (stuck["from_nm"] + stuck["to_nm"]) / 2
    left = max(0.0, hop.length_nm - middle)
    return f"{middle:,.0f} nm past {hop.dep_ident}" if middle <= left else f"{left:,.0f} nm before {hop.dest_ident}"
