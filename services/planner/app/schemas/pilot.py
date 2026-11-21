"""The shapes app.routers.pilot sends and takes, as Pydantic models: a
logbook entry and the asks and answers of the engine's pilot and
airplane rules (the router's docstring names them), and the batches of
them the gateway asks in one call (an instructor's page, an aircraft
list)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LogbookEntry(BaseModel):
    """One logbook entry, the columns the rules read; a column missing is
    none of it."""

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
    toweredLandings: int = 0
    distanceNm: float = 0
    longestLegNm: float = 0
    approaches: int = 0
    holding: bool = False
    tracking: bool = False


class CurrencyAsk(BaseModel):
    """The logbook, the dates the pilot gives and the day it is asked for
    (the pilot's own calendar's)."""

    entries: list[LogbookEntry]
    flightReviewOn: date | None = None
    medicalExpiresOn: date | None = None
    ipcOn: date | None = None
    today: date


class PaperworkDue(BaseModel):
    """One thing that falls due, named and with the rule that asks for it
    (the engine's PaperworkDue), for the gateway's Coming up list and its
    reminders, which add only the days and hours left."""

    what: str
    itemId: int | None
    label: str
    rule: str | None = Field(description="14 CFR 61.56(c); an AD its own number and 14 CFR 39.7; an owner's item its reference.")
    until: date | None
    dueAtHours: float | None
    lead: str = Field(description="The reminder sentence's start, to which the day is added.")


class Currency(BaseModel):
    """Where the pilot stands (the engine's pilot_currency): each date
    null where it cannot be had."""

    dayPassengersUntil: date | None = Field(description="90 days after the third most recent landing (14 CFR 61.57(a)).")
    nightPassengersUntil: date | None = Field(description="90 days after the third most recent night full-stop landing (61.57(b)).")
    flightReviewOn: date | None
    flightReviewUntil: date | None = Field(description="The end of the 24th calendar month after the flight review's (61.56(c)).")
    medicalExpiresOn: date | None
    totalHours: float
    nightHours: float
    crossCountryHours: float
    landings: int
    flights: int
    instrumentCurrentUntil: date | None = Field(
        description="The last day of instrument currency (61.57(c)(1), or 61.57(d)'s check); in the past where it has lapsed."
    )
    instrumentCurrentFrom: date | None = Field(
        description="The first day of an instrument currency not begun yet: approaches flown this month count from "
        "the first of next month (61.57(c)(1)), and until then the pilot is not current. Null when current now."
    )
    ipcOn: date | None
    ipcNeededAfter: date | None = Field(description="The day after which only an instrument proficiency check restores it (61.57(d)).")
    approachesInWindow: int = Field(description="Approaches logged in the 6 calendar months before this one (61.57(c)(1)(i)).")
    holdingInWindow: bool
    trackingInWindow: bool
    due: list[PaperworkDue] = Field(description="What falls due, each named and cited (61.56(c), 61.23, 61.57(a)-(c)).")


class ExperienceAsk(BaseModel):
    """The student's logbook and the day it is asked for."""

    entries: list[LogbookEntry]
    today: date


class ExperienceItem(BaseModel):
    """One of 14 CFR 61.109(a)'s requirements: how much of it the logbook
    shows of how much, and whether that is met."""

    key: str
    rule: str
    label: str
    have: float
    need: float
    unit: Literal["h", "landings", "flights"]
    met: bool


class HeldEndorsement(BaseModel):
    """An endorsement the student holds: its code (AC 61-65K's, as the
    engine's endorsement_kinds names it), the day it was given, and the make
    and model it names where it says."""

    code: str
    on: date
    makeModel: str | None = None


class EndorsementsAsk(BaseModel):
    """The endorsements held, voided ones left out by the gateway where it
    asks the solo endorsement's day and the review's checks, and the day of
    a solo cross-country to check them for."""

    held: list[HeldEndorsement]
    flightOn: date | None = None


class ReviewCheck(BaseModel):
    """One of 14 CFR 61.93(d)'s determinations, as far as the record
    answers it (the gateway's ReviewCheckDto)."""

    rule: str
    label: str
    met: bool
    detail: str


class Endorsements(BaseModel):
    """What the endorsements say (the engine's endorsement_records)."""

    until: list[date | None] = Field(
        description=(
            "Each held endorsement's last good day, in order: 90 days on for a solo (14 CFR 61.87(n), (o), (p)) "
            "or Class B one (61.95); null for one that does not run out."
        )
    )
    soloUntil: date | None = Field(description="The last day of the latest solo endorsement (61.87(n), (p)).")
    checks: list[ReviewCheck] = Field(description="61.93(d)(4) and (5) for the solo cross-country on flightOn; none without.")


class EndorsementField(BaseModel):
    """A blank in an endorsement's words, as the instructor's sheet asks for it."""

    key: str
    label: str
    example: str
    required: bool


class EndorsementKind(BaseModel):
    """One of the student endorsements (the engine's endorsement_kinds):
    its code, AC 61-65K's paragraph, the 14 CFR section it answers, its
    name, and the sample's words with the blanks the instructor fills."""

    code: str
    paragraph: str = Field(description="AC 61-65K's paragraph, \"A.10\".")
    rule: str = Field(description="The 14 CFR section it answers, \"61.93(c)(3)\".")
    label: str
    template: str = Field(description="The sample's words, {student} and each field's {key} in them.")
    fields: list[EndorsementField]


class EndorsementFillAsk(BaseModel):
    """An endorsement to sign: its code, the student's name as on their
    certificate, and the fields the instructor gave."""

    code: str
    student: str = ""
    fields: dict[str, str] = {}


class EndorsementFilled(BaseModel):
    """The endorsement made ready to sign (the engine's endorsement_fill)."""

    fields: dict[str, str] = Field(description="Each field it takes, tidied to single spaces, \"\" where not given.")
    missing: list[str] = Field(description="The labels of the required fields still empty.")
    text: str = Field(description="Its words with the student and the fields in, as they are signed.")


class VorCheckAsk(BaseModel):
    """A VOR check recorded (14 CFR 91.171(d)): the day, its kind by the
    gateway's VorCheck names, and the bearing error found."""

    on: date
    kind: Literal["VOT", "REPAIR_STATION", "GROUND", "AIRBORNE", "RADIAL", "DUAL"]
    errorDeg: float


class KeptItem(BaseModel):
    """An owner's own item: an AD (14 CFR part 39) or anything else, with
    its next day or hours."""

    id: int
    kind: Literal["AD", "OTHER"]
    title: str
    reference: str | None = None
    dueOn: date | None = None
    dueAtHours: float | None = None


class InspectionsAsk(BaseModel):
    """The days the airplane's inspections and checks were done, and the
    hours of its last 100-hour; each left out where not recorded. With the
    airplane's registration, whether it is flown for hire, its ELT
    battery's marked date and the owner's items, for the list of what
    falls due (`due`)."""

    tailNumber: str | None = None
    forHire: bool = False
    eltBatteryDueOn: date | None = None
    kept: list[KeptItem] = []

    annualOn: date | None = None
    eltOn: date | None = None
    staticCheckOn: date | None = None
    transponderCheckOn: date | None = None
    hundredHourAtHours: float | None = None
    vorCheck: VorCheckAsk | None = None


class VorCheck(BaseModel):
    limitDeg: float = Field(description="The largest bearing error 91.171(b) or (c) allows for this kind of check.")
    within: bool
    until: date = Field(description="30 days on (91.171(a)(2)).")


class Inspections(BaseModel):
    """When each falls due (the engine's inspections_due), null where it was not recorded."""

    annualUntil: date | None = Field(description="The end of the 12th calendar month after (14 CFR 91.409(a)).")
    eltUntil: date | None = Field(description="The end of the 12th calendar month after (91.207(d)).")
    staticCheckUntil: date | None = Field(description="The end of the 24th calendar month after (91.411(a)).")
    transponderCheckUntil: date | None = Field(description="The end of the 24th calendar month after (91.413(a)).")
    hundredHourDueAtHours: float | None = Field(description="100 hours of time in service after the last (91.409(b)).")
    vorCheck: VorCheck | None
    due: list[PaperworkDue] = Field(description="Each recorded one named and cited, then the owner's dated items (an AD by 14 CFR 39.7).")


#: The most asks one batch call takes: well above an instructor's
#: students and reviews, or one owner's airplanes.
MAX_BATCH = 500


class RecordsBatchAsk(BaseModel):
    """Many students' records asked at once, for an instructor's page:
    each student's experience (ExperienceAsk) and every endorsements ask
    (EndorsementsAsk: a student's solo day, a review's 61.93(d) checks,
    a signed list's last good days), answered in the same order. One
    round trip for the page rather than two a student and two a review."""

    # A bound on one call, which only the gateway makes, from one
    # instructor's own students and reviews (the deep security review of
    # 2026-11-21): without one, a body of any length held a worker through
    # one engine call an ask.
    experience: list[ExperienceAsk] = Field(default=[], max_length=MAX_BATCH)
    endorsements: list[EndorsementsAsk] = Field(default=[], max_length=MAX_BATCH)


class RecordsBatch(BaseModel):
    """The answers to a RecordsBatchAsk, each list in the order asked."""

    experience: list[list[ExperienceItem]]
    endorsements: list[Endorsements]
