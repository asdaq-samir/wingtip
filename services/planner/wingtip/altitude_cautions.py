"""What the planner says about an altitude that is not the legal one: a
pilot's own altitude under the floor or in prohibited airspace, and the
altitude flown anyway where none is legal. The altitude selection itself
is wingtip.altitude's and the engine's; these read its answer."""

from .engine import ask as engine


def own_altitude_caution(selection: dict, legs: list, between: tuple[str, str], profile: dict | None = None) -> dict | None:
    """What is wrong with an altitude the pilot set for a hop -- the whole
    route's Custom one, or a waypoint's own -- against the band the planner
    worked out for each of its legs: the engine's `own_altitude_caution`
    (14 CFR 91.119, 91.159, 91.155, 71.33, 91.211, and under IFR
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
    course and floor, its segments and its special-use airspace -- not
    the weather's hazards and the rest."""
    keys = ("rules", "course_magnetic_deg", "floor_ft", "hemispheric_rule_from_ft", "segments", "special_use")
    return {k: selection[k] for k in keys if k in selection}


def prohibited_caution(selection: dict) -> list[str]:
    """Prohibited airspace on the way, as a warning (14 CFR 73.83): the
    engine's `prohibited_caution`."""
    return engine("prohibited_caution", selection=_caution_selection(selection))


def no_altitude(selection: dict, between: tuple[str, str] | None = None, where: str | None = None) -> dict:
    """Why no plan has an altitude, in a pilot's words (the engine's
    `no_altitude`): a headline saying where along the route it fails, the
    reasons there as short sentences -- the terrain's floor, the first
    altitude above it on that course, what stops the climb -- what to do
    about it, and `detail`, all of it as one message for /api/plan's 422.
    `between`, the hop of a route with stops it fails on; `where`, the
    place it binds by the route's own points ("540 nm past KDLH")."""
    return engine("no_altitude", selection=_engine_selection(selection), between=list(between) if between else None, where=where)
