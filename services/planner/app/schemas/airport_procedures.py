"""A field's instrument procedures, as the airports router lists them and draws one (app.routers.airports)."""

from typing import Literal

from pydantic import BaseModel

from .plates import ApproachFacts


class ProcedureSummary(BaseModel):
    """One of a field's instrument procedures in the FAA's CIFP
    (wingtip.procedures): `id` its coded identifier ("I08-Y"), `name` its
    chart's title ("ILS Y RWY 08"), `runway` an approach's, and the
    transitions a pilot picks from -- an approach's, an arrival's or a
    departure's enroute ones -- and an arrival's or departure's runway
    transitions, which are drawn with it."""

    kind: Literal["approach", "arrival", "departure"]
    id: str
    name: str
    runway: str | None = None
    transitions: list[str]
    runway_transitions: list[str]


class ProcedureList(BaseModel):
    """A field's instrument procedures, approaches first, from the CIFP
    of the AIRAC cycle that took effect on `cycle` (YYMMDD); none for a
    field with none."""

    airport: str
    cycle: str
    # True when `cycle` is not the one in force: the FAA's file for it
    # could not be had, and an older one is used.
    stale: bool = False
    procedures: list[ProcedureSummary]


class ProcedureLine(BaseModel):
    """A line of a drawn procedure, its points latitude and longitude:
    an approach's `transition`, its `final` and its `missed` approach; an
    arrival's or departure's enroute `transition`, `common` route, or a
    `runway` transition, `name` the transition's ("RW08")."""

    role: Literal["transition", "final", "missed", "common", "runway"]
    name: str | None = None
    points: list[tuple[float, float]]


class ProcedureHold(BaseModel):
    """A holding pattern of a drawn procedure, or its procedure turn: at `fix`, its inbound
    course `inbound_deg` true, its turns right or left (`turn`), drawn to
    a light airplane's size (the engine's paths.rs, HOLD_SPEED_KT)."""

    fix: str
    turn: Literal["L", "R"]
    inbound_deg: int
    missed: bool
    points: list[tuple[float, float]]
    #: A hold, or a procedure turn (45°/180°, AIM 5-4-9) where the chart has
    #: its barb, drawn and flown as a hold is.
    kind: Literal["hold", "procedure turn"] = "hold"


class ProcedureFix(BaseModel):
    """A fix of a drawn procedure: its `roles` on an approach (IAF, IF,
    FAF, MAP, hold), the altitudes it is crossed at -- at or above
    `min_ft`, at or below `max_ft`, at both where they are one -- and the
    speed it is crossed at, `speed_limit` saying whether that is the
    speed ("at"), a minimum ("min") or a maximum ("max"; ARINC 424-18
    5.261). `missed` where it is on the missed
    approach alone."""

    ident: str
    lat: float
    lon: float
    roles: list[str]
    min_ft: int | None = None
    max_ft: int | None = None
    speed_kt: int | None = None
    speed_limit: Literal["at", "min", "max"] | None = None
    missed: bool
    #: The vertical path's angle at the fix, degrees of descent, where the
    #: CIFP codes one: an approach's glidepath at its final approach fix
    #: and its missed approach point (ARINC 424-18 5.70).
    vertical_angle_deg: float | None = None


class ProcedureMissedLeg(BaseModel):
    """A leg of an approach's missed approach, in the order flown, as its
    words are made: `path` its ARINC 424-18 path and terminator (5.21: CA
    a course to an altitude, VA a heading to one, VI a heading to an
    intercept, CF and TF to a fix, DF direct to one, HM, HA and HF a
    hold), `fix` the fix it goes to, `course_deg` its course or heading
    magnetic, `turn` which way it turns, and the altitudes it climbs to
    (at or above `min_ft`, at or below `max_ft`)."""

    path: str
    fix: str | None = None
    course_deg: int | None = None
    turn: Literal["L", "R"] | None = None
    min_ft: int | None = None
    max_ft: int | None = None


class ProcedureRunwayPath(BaseModel):
    """The path an approach's final comes down, placed (wingtip.procedures):
    `deg` below level, into `fix`, its runway's threshold at `lat`/`lon`,
    crossed at `ft` MSL -- the threshold's elevation and its crossing
    height (ARINC 424-18 5.70)."""

    deg: float
    fix: str
    lat: float
    lon: float
    ft: int


class ProcedureDrawing(BaseModel):
    """One procedure drawn with the transition picked (wingtip.procedures):
    its lines, holds and fixes, from the CIFP of `cycle`."""

    airport: str
    kind: Literal["approach", "arrival", "departure"]
    id: str
    name: str
    transition: str | None = None
    cycle: str
    stale: bool = False
    lines: list[ProcedureLine]
    holds: list[ProcedureHold]
    fixes: list[ProcedureFix]
    #: An approach's final: its glidepath's angle, degrees, where the CIFP
    #: codes one (a vertical angle on its final's legs, ARINC 424-18 5.70),
    #: and its course, degrees magnetic, as its missed approach point's leg
    #: codes it or else from its final approach fix to that point.
    glidepath_deg: float | None = None
    final_course_deg: int | None = None
    #: Its missed approach's legs in order, for the words a plate says it in.
    missed_legs: list[ProcedureMissedLeg] = []
    #: The glidepath placed: its angle into its runway's threshold and the
    #: altitude it crosses it at, for a flown track to be measured against
    #: (the approach debrief); None where the missed approach point is not
    #: a runway's.
    runway_path: ProcedureRunwayPath | None = None
    #: An approach's own figures beside its legs, for the tags its fixes
    #: carry (the engine's approach_fix_tags); None for another procedure.
    approach: ApproachFacts | None = None
