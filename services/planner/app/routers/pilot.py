"""A pilot's currency and a student's 61.109 experience from their
logbook, what a student's endorsements say and when an airplane's
inspections fall due, for the gateway: it keeps the records and asks here
for what they mean (CLAUDE.md: Spring Boot holds no aviation logic). The
rules are the shared engine's (pilot_currency, pilot_experience:
engine/crates/pilot/src/pilot/currency.rs; endorsement_records,
inspections_due: records.rs; AC 61-65K's endorsements and their words,
endorsement_kinds and endorsement_fill: kinds.rs; how far back an
instructor's page lists, instructor_records_since: instructor_records.rs), asked by name through wingtip_native.call;
this only carries the records across.

The entries are the gateway's LogbookEntry, camelCase, as the engine
reads them, and the answers its CurrencyDto and ExperienceItemDto, so the
gateway hands them on as they come."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Body, HTTPException
from wingtip import airmen

from ..gonogo import ask as engine
from ..schemas.pilot import (
    MAX_BATCH,
    Currency,
    CurrencyAsk,
    EndorsementFillAsk,
    EndorsementFilled,
    EndorsementKind,
    Endorsements,
    EndorsementsAsk,
    ExperienceAsk,
    ExperienceItem,
    Inspections,
    InspectionsAsk,
    InstructorVerification,
    InstructorVerificationAsk,
    LogbookEntry,
    PaperworkDue,
    RecordsBatch,
    RecordsBatchAsk,
    ReviewCheck,
    VorCheck,
)

router = APIRouter()


def _entries(entries: list[LogbookEntry]) -> list[dict]:
    return [e.model_dump(mode="json") for e in entries]


def _ask(name: str, **given):
    try:
        return engine(name, **given)
    except ValueError as refused:  # the engine's Err: input not of its shape
        raise HTTPException(status_code=422, detail=str(refused)) from refused


@router.post("/api/pilot/currency")
def currency(ask: CurrencyAsk) -> Currency:
    """The pilot's currency from their logbook (14 CFR 61.56, 61.57)."""
    return Currency(
        **_ask(
            "pilot_currency",
            entries=_entries(ask.entries),
            today=ask.today.isoformat(),
            flight_review_on=ask.flightReviewOn,
            medical_expires_on=ask.medicalExpiresOn,
            ipc_on=ask.ipcOn,
        )
    )


@router.post("/api/pilot/experience")
def experience(ask: ExperienceAsk) -> list[ExperienceItem]:
    """A student's private pilot experience from their logbook, item by
    item (14 CFR 61.109(a))."""
    return [ExperienceItem(**i) for i in _ask("pilot_experience", entries=_entries(ask.entries), today=ask.today.isoformat())]


@router.post("/api/pilot/endorsements")
def endorsements(ask: EndorsementsAsk) -> Endorsements:
    """What a student's endorsements say: how long each is good for, the
    day their solo endorsement runs out, and 61.93(d)'s checks for a solo
    cross-country."""
    got = _ask(
        "endorsement_records",
        flight_on=ask.flightOn.isoformat() if ask.flightOn else None,
        held=[{"code": h.code, "on": h.on.isoformat(), "make_model": h.makeModel} for h in ask.held],
    )
    return Endorsements(until=got["until"], soloUntil=got["solo_until"], checks=[ReviewCheck(**c) for c in got["checks"]])


@router.get("/api/pilot/endorsement-kinds")
def endorsement_kinds() -> list[EndorsementKind]:
    """AC 61-65K's endorsements a student meets on the way to a private
    pilot certificate, in the order they meet them, word for word."""
    return [EndorsementKind(**k) for k in _ask("endorsement_kinds")]


@router.get("/api/pilot/instructor-records-since")
def instructor_records_since(today: date) -> date:
    """The first day an instructor's page lists what they signed: 3 years
    before `today`, as 14 CFR 61.189(c) has them keep the records (the
    engine's instructor_records_since)."""
    return date.fromisoformat(_ask("instructor_records_since", today=today.isoformat()))


@router.post("/api/pilot/endorsement-fill")
def endorsement_fill(ask: EndorsementFillAsk) -> EndorsementFilled:
    """An endorsement's fields, what is still missing and its words as
    they will be signed; 404 for a code no endorsement has."""
    got = _ask("endorsement_fill", code=ask.code, student=ask.student, fields=ask.fields)
    if got is None:
        raise HTTPException(status_code=404, detail=f"No such endorsement: {ask.code}.")
    return EndorsementFilled(**got)


@router.post("/api/pilot/instructor-verification")
def instructor_verification(ask: InstructorVerificationAsk) -> InstructorVerification:
    """Whether the instructor about to sign is a flight instructor the FAA
    airmen registry bears out (the engine's instructor_verification, over
    the flight instructors of that last name ingest keeps, wingtip.airmen):
    an endorsement counts as signed only where it is (14 CFR 61.189(a))."""
    got = _ask(
        "instructor_verification",
        instructor_name=ask.instructor_name,
        student_name=ask.student_name,
        signed_on=ask.signed_on.isoformat(),
        registry=airmen.instructors_named(ask.instructor_name),
        bound_elsewhere=ask.bound_elsewhere,
    )
    return InstructorVerification(**got)


@router.post("/api/aircraft/inspections")
def inspections(ask: InspectionsAsk) -> Inspections:
    """When an airplane's inspections and checks fall due."""
    day = lambda d: d.isoformat() if d else None  # noqa: E731
    vor = ask.vorCheck
    got = _ask(
        "inspections_due",
        annual_on=day(ask.annualOn),
        elt_on=day(ask.eltOn),
        static_check_on=day(ask.staticCheckOn),
        transponder_check_on=day(ask.transponderCheckOn),
        hundred_hour_at_hours=ask.hundredHourAtHours,
        vor_check=None if vor is None else {"on": vor.on.isoformat(), "kind": vor.kind, "error_deg": vor.errorDeg},
        tail_number=ask.tailNumber,
        for_hire=ask.forHire,
        elt_battery_due_on=day(ask.eltBatteryDueOn),
        kept=[
            {"id": k.id, "kind": k.kind, "title": k.title, "reference": k.reference, "due_on": day(k.dueOn), "due_at_hours": k.dueAtHours}
            for k in ask.kept
        ],
    )
    v = got["vor_check"]
    return Inspections(
        annualUntil=got["annual_until"],
        eltUntil=got["elt_until"],
        staticCheckUntil=got["static_check_until"],
        transponderCheckUntil=got["transponder_check_until"],
        hundredHourDueAtHours=got["hundred_hour_due_at_hours"],
        vorCheck=None if v is None else VorCheck(limitDeg=v["limit_deg"], within=v["within"], until=v["until"]),
        due=[PaperworkDue(**d) for d in got["due"]],
    )


@router.post("/api/pilot/records-batch")
def records_batch(ask: RecordsBatchAsk) -> RecordsBatch:
    """Many students' experience and endorsements in one call, each as
    /api/pilot/experience and /api/pilot/endorsements answer it, in the
    order asked: an instructor's page asks its students and the reviews
    waiting on them together (14 CFR 61.109(a), 61.87, 61.93(d))."""
    return RecordsBatch(experience=[experience(a) for a in ask.experience], endorsements=[endorsements(a) for a in ask.endorsements])


@router.post("/api/aircraft/inspections-batch")
def inspections_batch(asks: Annotated[list[InspectionsAsk], Body(max_length=MAX_BATCH)]) -> list[Inspections]:
    """Many airplanes' inspections in one call, each as
    /api/aircraft/inspections answers it, in the order asked: a pilot's
    aircraft list and the daily reminders ask every airplane at once, at
    most MAX_BATCH."""
    return [inspections(a) for a in asks]
