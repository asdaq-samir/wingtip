"""What the planner says about an altitude that is not the legal one: a
pilot's own altitude under the floor or in prohibited airspace, the
altitude flown anyway where none is legal, and the Class B a route can go
round. The altitude selection itself is wingtip.altitude's and the
engine's; these read its answer."""

from cachetools import TTLCache

from . import altitude as altitude_module
from . import airspace
from .engine import ask as engine


def own_altitude_caution(selection: dict, legs: list, between: tuple[str, str], profile: dict | None = None) -> dict | None:
    """What is wrong with an altitude the pilot set for a hop -- the whole
    route's Custom one, or a waypoint's own -- against the band the planner
    worked out for each of its legs: the engine's `own_altitude_caution`
    (14 CFR 91.119, 91.159, 91.131, 91.155, 71.33, 91.211, and under IFR
    91.177(a) and 91.179(b)). A warning, never a refusal. None when
    nothing is."""
    return engine(
        "own_altitude_caution",
        selection=_caution_selection(selection),
        legs=[{"altitude_ft": leg["altitude_ft"]} for leg in legs],
        between=list(between),
        profile=profile,
    )


def _caution_selection(selection: dict) -> dict:
    """The members of a selection the cautions read: its rules, segments
    and special-use airspace."""
    return {k: selection[k] for k in ("rules", "segments", "special_use") if k in selection}


def altitude_anyway(selection: dict) -> float | None:
    """The altitude a route with no legal one is flown at anyway, at the
    owner's "I don't want to put hard limits on anything. A warning tick or
    a label is enough" (2026-10-23): the engine's `altitude_anyway` (the
    floor everywhere on the course's own altitudes, 14 CFR 91.159 or
    91.179(b)), for own_altitude_caution to say what stops it there."""
    return engine("altitude_anyway", selection=_engine_selection(selection))


def _engine_selection(selection: dict) -> dict:
    """The members of a selection the engine's words read: its rules, its
    course and floor, its segments, its Class B transits and its
    special-use airspace -- not the weather's hazards and the rest."""
    keys = ("rules", "course_magnetic_deg", "floor_ft", "hemispheric_rule_from_ft", "segments", "airspace_transits", "special_use")
    return {k: selection[k] for k in keys if k in selection}


def prohibited_caution(selection: dict) -> list[str]:
    """Prohibited airspace on the way, as a warning (14 CFR 73.83): the
    engine's `prohibited_caution`."""
    return engine("prohibited_caution", selection=_caution_selection(selection))


def no_altitude(selection: dict, between: tuple[str, str] | None = None, via: dict | None = None, where: str | None = None) -> dict:
    """Why no plan has an altitude, in a pilot's words (the engine's
    `no_altitude`): a headline saying where along the route it fails, the
    reasons there as short sentences -- the terrain's floor, the first
    altitude above it on that course, what stops the climb -- what to do
    about it, `class_b` where Class B airspace is what stops it, and
    `detail`, all of it as one message for /api/plan's 422. `between`, the
    hop of a route with stops it fails on; `via`, the best waypoint round
    the Class B (class_b_detours); `where`, the place it binds by the
    route's own points ("540 nm past KDLH")."""
    return engine(
        "no_altitude",
        selection=_engine_selection(selection),
        between=list(between) if between else None,
        via={"ident": via["ident"], "added_nm": via["added_nm"]} if via else None,
        where=where,
    )


def class_b_detours(selection: dict, start: tuple, end: tuple) -> list[dict]:
    """Where Class B airspace is what leaves a leg of the flight from
    `start` to `end` no altitude, the waypoints that keep both legs out of
    it (wingtip.airspace.detour_waypoints), best first -- out of the parts low
    enough to stop the lowest altitude the leg's ground allows; none
    otherwise."""
    stuck = next((s for s in selection.get("segments", []) if not s.get("candidates_ft")), None)
    if stuck is None or stuck.get("airspace_ceiling_ft") is None or stuck.get("band_ceiling_ft") != stuck["airspace_ceiling_ft"]:
        return []
    lowest = engine(
        "legal_cruising_altitudes",
        floor_ft=stuck["floor_ft"],
        magnetic_course_deg=stuck.get("course_magnetic_deg", 0.0),
        rule_from_ft=stuck.get("hemispheric_rule_from_ft"),
    )
    if not lowest:
        return []
    shp_path = airspace.ensure_class_airspace_shapefile(altitude_module.DEFAULT_FAA_CACHE_DIR)
    return airspace.detour_waypoints(start, end, shp_path, lowest[0])


#: class_b_ways by leg and altitude: each altitude picked on the wheel is
#: a new plan, and the detours were worked out again for every one, a
#: third of a second of each pick (py-spy, 2026-10-20). The airspace
#: changes only with the FAA's chart cycle; six hours is well inside one.
_CLASS_B_WAYS: TTLCache = TTLCache(maxsize=512, ttl=6 * 3600)


def class_b_ways(start: tuple, end: tuple, cruise_ft: float) -> list[dict]:
    """Where a leg planned with the Class B clearance (the default, at the
    owner's pick, 2026-10-20) enters Class B at its cruise altitude, the
    waypoints that keep it out at that altitude (wingtip.airspace.
    detour_waypoints), best first: the pilot's "Avoid Class B". None where
    it passes under, over or round it."""
    key = (round(start[0], 4), round(start[1], 4), round(end[0], 4), round(end[1], 4), cruise_ft)
    if key in _CLASS_B_WAYS:
        return _CLASS_B_WAYS[key]
    shp_path = airspace.ensure_class_airspace_shapefile(altitude_module.DEFAULT_FAA_CACHE_DIR)
    ways = airspace.detour_waypoints(start, end, shp_path, cruise_ft) if airspace.class_b_entered(start, end, shp_path, cruise_ft) else []
    _CLASS_B_WAYS[key] = ways
    return ways
