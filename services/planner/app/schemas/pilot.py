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

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

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
    # 61.57(a)(1): the landings in the same category and class (and a
    # tailwheel's to a full stop); a landing whose entry doesn't say counts
    # toward none, and the engine says what it can't tell.
    category: str | None = Field(None, description="14 CFR 61.5 category, \"Airplane\".")
    aircraftClass: str | None = Field(None, alias="class", description="14 CFR 61.5 class, \"Single-engine land\".")
    tailwheel: bool | None = Field(None, description="A tailwheel airplane (61.57(a)(1)(ii)); null where not said.")
    fullStopLandings: int | None = Field(None, description="Landings to a full stop, day and night, where logged.")


class Flying(BaseModel):
    """The airplane to be flown, which 14 CFR 61.57(a)(1)(ii) judges
    passenger currency for: its category and class, and whether it has a
    tailwheel (null: not said, judged as one, the stricter)."""

    model_config = ConfigDict(populate_by_name=True)

    category: str | None = Field(None, description="14 CFR 61.5 category, \"Airplane\".")
    aircraftClass: str | None = Field(None, alias="class", description="14 CFR 61.5 class, \"Single-engine land\".")
    tailwheel: bool | None = None


class CurrencyAsk(BaseModel):
    """The logbook, the dates the pilot gives, the airplane to be flown
    where known, and the day it is asked for (the pilot's own calendar's)."""

    entries: list[LogbookEntry]
    flightReviewOn: date | None = None
    medicalExpiresOn: date | None = None
    ipcOn: date | None = None
    flying: Flying | None = Field(None, description="The airplane to be flown (61.57(a)(1)(ii)); none judges the newest flight's.")
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

    dayPassengersUntil: date | None = Field(
        description="90 days after the third most recent landing the logbook proves counts for the airplane judged (14 CFR 61.57(a)(1))."
    )
    nightPassengersUntil: date | None = Field(
        description="90 days after the third most recent night full-stop landing the logbook proves counts (61.57(b)(1))."
    )
    passengerClass: str | None = Field(
        None, description="The category and class judged: the airplane to be flown's, else the newest flight's (61.57(a)(1))."
    )
    passengerClassUnknown: bool = Field(False, description="Neither the airplane to be flown nor the newest flight says its category and class.")
    passengerTailwheel: bool | None = Field(None, description="Whether the airplane judged has a tailwheel; null not said, judged as one.")
    tailwheelPassengersUntil: date | None = Field(
        None, description="A tailwheel's own, for a pilot judged in a tricycle who has flown one in the class (61.57(a)(1)(ii))."
    )
    dayPassengersUnknown: str | None = Field(
        None, description="What the logbook doesn't say, where the pilot would be current by day if it were so: \"Can't tell: ...\"."
    )
    nightPassengersUnknown: str | None = Field(None, description="The same at night (61.57(b)(1)).")
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
    makeModel: str | None = Field(
        default=None,
        description="The solo cross-country's make and model: 61.93(d)(4), (5) and 61.87(n) hold the endorsements to it; "
        "none and the checks can't tell.",
    )


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


class InstructorVerificationAsk(BaseModel):
    """An instructor about to sign for a student: both names as on their
    certificates, the day, and the FAA records other accounts sign as."""

    instructor_name: str
    student_name: str = ""
    signed_on: date
    bound_elsewhere: list[str] = Field(default=[], description="FAA unique ids another Wingtip account already signs as.")


class InstructorVerification(BaseModel):
    """Whether the FAA airmen registry bears the instructor out (the
    engine's instructor_verification)."""

    verified: bool
    registry_id: str | None = Field(description="The FAA's unique id of the record matched, where one was.")
    reason: str = Field(description="verified, same_person, registry_unavailable, no_match, ambiguous, claimed or expired.")
    words: str = Field(description="The verdict as the pilot reads it.")


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
