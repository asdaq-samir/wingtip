"""The shapes app.routers.approach_teaching takes and sends: an approach
taught (the engine's approach_brief, approach_coaching, approach_quiz and
approach_profile) and an approach debriefed against a flown track
(approach_find, approach_transition). The answers are the engine's, in
its own shapes (engine/contract/engine.schema.json gives each), so they
are passed on as it gives them."""

from pydantic import BaseModel, Field

from .airport_procedures import ProcedureDrawing
from .field import Frequency

#: A flown track's points at most: the gateway keeps 5,000 a flight
#: (TrackDto), and a followed airplane's ADS-B reports run to more.
MOST_POINTS = 20_000
#: A field's approaches drawn at most, each with its transitions: the
#: CIFP codes a few dozen at the biggest field.
MOST_DRAWINGS = 120


class LessonAsk(BaseModel):
    """An approach as drawn (GET /api/airport/{ident}/procedures/{id}),
    the field's radio from its card, the airplane's VREF or landing
    configuration's stall speed where its figures carry either (its
    approach category, 14 CFR 97.3), and the ground speed it is flown at."""

    drawing: ProcedureDrawing
    frequencies: list[Frequency] = Field(default_factory=list, max_length=200)
    vref_kt: float | None = Field(default=None, gt=0, le=400)
    vso_kt: float | None = Field(default=None, gt=0, le=400)
    gs_kt: float = Field(gt=0, le=400)


class ApproachTaught(BaseModel):
    """The lesson: the briefing (approach_brief), the steps flown fix by
    fix at the ground speed (approach_coaching), each with `way`, the
    procedure's line from the step before's place to its own (the way the
    lesson's airplane flies it), the quiz (approach_quiz) and the side
    view (approach_profile)."""

    brief: list[dict]
    steps: list[dict]
    quiz: list[dict]
    profile: dict


class TrackPoint(BaseModel):
    """A point of a flown track: when, ms since 1970; GPS altitude, feet
    above sea level, where it has one."""

    t: float
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    alt_ft: float | None = None


class ApproachFindAsk(BaseModel):
    """A field's approaches as drawn, each from vectors or with the
    transition picked, the track, the approach picked for the flight and
    the pilot's minimums (DA or MDA, ft MSL) where typed."""

    drawings: list[ProcedureDrawing] = Field(max_length=MOST_DRAWINGS)
    points: list[TrackPoint] = Field(max_length=MOST_POINTS)
    picked: str | None = None
    minimums_ft: float | None = None


class ApproachTransitionAsk(BaseModel):
    """An approach found from vectors (its final approach fix's time and
    the way-in fixes it passed) and its transitions as drawn, with the
    track: which transition it came in by."""

    faf_at: float
    passed: int = Field(ge=0)
    drawings: list[ProcedureDrawing] = Field(max_length=MOST_DRAWINGS)
    points: list[TrackPoint] = Field(max_length=MOST_POINTS)
    minimums_ft: float | None = None
