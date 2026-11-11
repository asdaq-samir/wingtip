"""POST /api/pilot/coach's ask and answer: the pilot's logbook, dates,
ratings and debriefs in, the engine's proficiency plan out
(proficiency_plan, its shapes in engine/contract/engine.schema.json:
ProficiencyPlanInput, ProficiencyPlanAnswer). The logbook entries are
the gateway's LogbookEntry, camelCase, as the app has them from GET
/api/logbook; the rest is the engine's own snake_case, passed on whole."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CoachLogbookEntry(BaseModel):
    """One logbook entry, the columns the currency rules read; a column
    missing is none of it."""

    model_config = ConfigDict(extra="ignore")

    flownOn: date
    totalHours: float = 0
    nightHours: float = 0
    crossCountryHours: float = 0
    dayLandings: int = Field(0, description="Every landing, by day or at night (14 CFR 61.57(a)).")
    nightLandings: int = Field(0, description="Landings to a full stop at night (61.57(b)).")
    dualHours: float = 0
    soloHours: float = 0
    instrumentHours: float = 0
    approaches: int = 0
    holding: bool = False
    tracking: bool = False


class CoachEndorsement(BaseModel):
    """An endorsement a student holds: AC 61-65K's code and its day."""

    code: str = Field(max_length=32)
    on: date


class CoachProfilePoint(BaseModel):
    to_go_nm: float | None = None
    alt_ft: float
    off: bool


class CoachFinding(BaseModel):
    tone: Literal["stop", "caution", "ok", "info"]
    text: str = Field(max_length=300)


class CoachLeg(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True, serialize_by_alias=True)
    from_: str = Field(alias="from")
    to: str
    altitude_within: float | None = None
    course_within: float | None = None
    ok: bool


class CoachPattern(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ident: str
    off_ft: float
    ok: bool


class CoachDebrief(BaseModel):
    """One of the pilot's own debriefed flights, trimmed (the engine's
    CoachDebrief): an approach's profile and findings, or a flight's legs
    and pattern entries."""

    kind: Literal["approach", "flight"]
    flown_on: date
    place: str = Field("", max_length=40)
    procedure: str | None = Field(None, max_length=60, description='An approach\'s procedure as the chart names it ("ILS Y RWY 08").')
    elevation_ft: float | None = Field(None, description="The field's, ft MSL, for the 500 ft gate (AC 61-98D 2.1.4).")
    profile: list[CoachProfilePoint] = Field([], max_length=400)
    findings: list[CoachFinding] = Field([], max_length=40)
    legs: list[CoachLeg] = Field([], max_length=40)
    patterns: list[CoachPattern] = Field([], max_length=40)


class CoachAsk(BaseModel):
    """What the app holds of the pilot: the logbook and the dates from the
    gateway, the ratings the pilot gives, a student's endorsements, the
    debriefs of their recent flights, their home field and their day."""

    entries: list[CoachLogbookEntry] = Field(max_length=5000)
    flightReviewOn: date | None = None
    medicalExpiresOn: date | None = None
    ipcOn: date | None = None
    ratings: list[Literal["student", "private", "commercial", "atp", "instrument", "cfi"]] = []
    held: list[CoachEndorsement] = Field([], max_length=60)
    debriefs: list[CoachDebrief] = Field([], max_length=40)
    home: str | None = Field(None, max_length=8, description="The pilot's home field, where the sessions' fields are looked for round.")
    today: date
    remindDays: int | None = Field(None, ge=0, le=365)


class CoachDue(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)
    key: Literal["flight_review", "solo", "day_passengers", "night_passengers", "instrument", "medical"]
    id: str
    label: str
    rule: str
    until: date | None
    from_: date | None = Field(alias="from")
    days_left: int | None
    status: Literal["current", "due_soon", "lapsed", "pending", "unknown"]
    detail: str


class CoachReminder(BaseModel):
    key: str
    text: str
    until: date | None
    days_left: int


class CoachEvidence(BaseModel):
    id: str
    flown_on: date
    place: str
    procedure: str | None = Field(None, description='The approach procedure flown ("ILS Y RWY 08"), where the line is an approach\'s.')
    area: str
    text: str


class CoachWeakArea(BaseModel):
    key: Literal["unstable_approach", "approach_deviation", "pattern_altitude", "cruise_holding"]
    label: str
    acs: list[str]
    evidence: list[str]


class CoachPlace(BaseModel):
    ident: str
    name: str
    distance_nm: float
    approach: str | None


class CoachWings(BaseModel):
    area: str = Field(description="The accident causal factor's area (AC 61-91K 6).")
    acs: str
    note: str


class CoachSession(BaseModel):
    id: str
    key: str
    practise: str
    why: list[str]
    place: CoachPlace | None
    minutes: int
    instructor: bool
    wings: CoachWings | None = Field(description="Where it may count toward a WINGS flight activity; never that it does.")


class ProficiencyPlan(BaseModel):
    """The engine's proficiency_plan answer."""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    today: date
    due: list[CoachDue]
    reminders: list[CoachReminder]
    evidence: list[CoachEvidence]
    weak_areas: list[CoachWeakArea]
    sessions: list[CoachSession] = Field(max_length=4)
