"""A pilot's currency and a student's 61.109 experience from their
logbook, what a student's endorsements say and when an airplane's
inspections fall due, for the gateway: it keeps the records and asks here
for what they mean (CLAUDE.md: Spring Boot holds no aviation logic). The
rules are the shared engine's (pilot_currency, pilot_experience:
engine/crates/pilot/src/pilot/currency.rs; endorsement_records,
inspections_due: records.rs; AC 61-65K's endorsements and their words,
endorsement_kinds and endorsement_fill: kinds.rs), asked by name through wingtip_native.call;
this only carries the records across.

The entries are the gateway's LogbookEntry, camelCase, as the engine
reads them, and the answers its CurrencyDto and ExperienceItemDto, so the
gateway hands them on as they come."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..gonogo import ask as engine

router = APIRouter()


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
        description="The last day of instrument currency (61.57(c)(1), or 61.57(d)'s check); in the past where it has lapsed.")
    instrumentCurrentFrom: date | None = Field(
        description="The first day of an instrument currency not begun yet: approaches flown this month count from "
                    "the first of next month (61.57(c)(1)), and until then the pilot is not current. Null when current now.")
    ipcOn: date | None
    ipcNeededAfter: date | None = Field(description="The day after which only an instrument proficiency check restores it (61.57(d)).")
    approachesInWindow: int = Field(description="Approaches logged in the 6 calendar months before this one (61.57(c)(1)(i)).")
    holdingInWindow: bool
    trackingInWindow: bool


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


def _entries(entries: list[LogbookEntry]) -> list[dict]:
    return [e.model_dump(mode="json") for e in entries]


def _ask(name: str, **given):
    try:
        return engine(name, **given)
    except ValueError as refused:   # the engine's Err: input not of its shape
        raise HTTPException(status_code=422, detail=str(refused)) from refused


@router.post("/api/pilot/currency")
def currency(ask: CurrencyAsk) -> Currency:
    """The pilot's currency from their logbook (14 CFR 61.56, 61.57)."""
    return Currency(**_ask("pilot_currency", entries=_entries(ask.entries), today=ask.today.isoformat(),
                           flight_review_on=ask.flightReviewOn, medical_expires_on=ask.medicalExpiresOn, ipc_on=ask.ipcOn))


@router.post("/api/pilot/experience")
def experience(ask: ExperienceAsk) -> list[ExperienceItem]:
    """A student's private pilot experience from their logbook, item by
    item (14 CFR 61.109(a))."""
    return [ExperienceItem(**i) for i in _ask("pilot_experience", entries=_entries(ask.entries), today=ask.today.isoformat())]


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
    until: list[date | None] = Field(description=(
        "Each held endorsement's last good day, in order: 90 days on for a solo (14 CFR 61.87(n), (o), (p)) "
        "or Class B one (61.95); null for one that does not run out."))
    soloUntil: date | None = Field(description="The last day of the latest solo endorsement (61.87(n), (p)).")
    checks: list[ReviewCheck] = Field(description="61.93(d)(4) and (5) for the solo cross-country on flightOn; none without.")


@router.post("/api/pilot/endorsements")
def endorsements(ask: EndorsementsAsk) -> Endorsements:
    """What a student's endorsements say: how long each is good for, the
    day their solo endorsement runs out, and 61.93(d)'s checks for a solo
    cross-country."""
    got = _ask("endorsement_records", flight_on=ask.flightOn.isoformat() if ask.flightOn else None,
               held=[{"code": h.code, "on": h.on.isoformat(), "make_model": h.makeModel} for h in ask.held])
    return Endorsements(until=got["until"], soloUntil=got["solo_until"], checks=[ReviewCheck(**c) for c in got["checks"]])


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


@router.get("/api/pilot/endorsement-kinds")
def endorsement_kinds() -> list[EndorsementKind]:
    """AC 61-65K's endorsements a student meets on the way to a private
    pilot certificate, in the order they meet them, word for word."""
    return [EndorsementKind(**k) for k in _ask("endorsement_kinds")]


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


@router.post("/api/pilot/endorsement-fill")
def endorsement_fill(ask: EndorsementFillAsk) -> EndorsementFilled:
    """An endorsement's fields, what is still missing and its words as
    they will be signed; 404 for a code no endorsement has."""
    got = _ask("endorsement_fill", code=ask.code, student=ask.student, fields=ask.fields)
    if got is None:
        raise HTTPException(status_code=404, detail=f"No such endorsement: {ask.code}.")
    return EndorsementFilled(**got)


class VorCheckAsk(BaseModel):
    """A VOR check recorded (14 CFR 91.171(d)): the day, its kind by the
    gateway's VorCheck names, and the bearing error found."""
    on: date
    kind: Literal["VOT", "REPAIR_STATION", "GROUND", "AIRBORNE", "RADIAL", "DUAL"]
    errorDeg: float


class InspectionsAsk(BaseModel):
    """The days the airplane's inspections and checks were done, and the
    hours of its last 100-hour; each left out where not recorded."""
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


@router.post("/api/aircraft/inspections")
def inspections(ask: InspectionsAsk) -> Inspections:
    """When an airplane's inspections and checks fall due."""
    day = lambda d: d.isoformat() if d else None  # noqa: E731
    vor = ask.vorCheck
    got = _ask("inspections_due", annual_on=day(ask.annualOn), elt_on=day(ask.eltOn), static_check_on=day(ask.staticCheckOn),
               transponder_check_on=day(ask.transponderCheckOn), hundred_hour_at_hours=ask.hundredHourAtHours,
               vor_check=None if vor is None else {"on": vor.on.isoformat(), "kind": vor.kind, "error_deg": vor.errorDeg})
    v = got["vor_check"]
    return Inspections(annualUntil=got["annual_until"], eltUntil=got["elt_until"], staticCheckUntil=got["static_check_until"],
                       transponderCheckUntil=got["transponder_check_until"], hundredHourDueAtHours=got["hundred_hour_due_at_hours"],
                       vorCheck=None if v is None else VorCheck(limitDeg=v["limit_deg"], within=v["within"], until=v["until"]))
