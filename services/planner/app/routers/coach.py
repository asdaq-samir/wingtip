"""The pilot's proficiency coach: POST /api/pilot/coach answers the
engine's proficiency plan (proficiency_plan: what is due and when under
14 CFR 61.56 and 61.57, the weak areas the pilot's own debriefs show, and
the sessions, each at a field near home found by wingtip.coach).

Nothing is decided here: the plan is the engine's."""

from fastapi import APIRouter, HTTPException
from wingtip import coach

from ..gateway import gateway
from ..schemas.coach import CoachAsk, ProficiencyPlan

router = APIRouter()

#: The pilot's own records, so signed in; it changes nothing, and the
#: phones, which hold no cookie, ask it too. A logbook of a few thousand
#: entries and a few debriefs' profiles are well under 1 MB.
COACH = gateway("signed-in", csrf=False, body_limit=1024 * 1024)


@router.post(
    "/api/pilot/coach",
    response_model=ProficiencyPlan,
    openapi_extra=COACH,
    responses={422: {"description": "A day or a debrief not of the engine's shape"}},
)
def coach_plan(ask: CoachAsk) -> ProficiencyPlan:
    """The pilot's proficiency plan: each currency with its last day and
    status, the reminders for those lapsing within remindDays (30 where
    not given), the weak areas their debriefs of the last half year show
    with each line of evidence, and up to four sessions -- what to
    practise, why, where, how long and whether it may count toward a
    WINGS flight activity (AC 61-91K 7.3)."""
    given = {
        "today": ask.today.isoformat(),
        "entries": [e.model_dump(mode="json", by_alias=True) for e in ask.entries],
        "flight_review_on": ask.flightReviewOn.isoformat() if ask.flightReviewOn else None,
        "medical_expires_on": ask.medicalExpiresOn.isoformat() if ask.medicalExpiresOn else None,
        "ipc_on": ask.ipcOn.isoformat() if ask.ipcOn else None,
        "flying": ask.flying.model_dump(by_alias=True) if ask.flying else None,
        "ratings": ask.ratings,
        "held": [h.model_dump(mode="json") for h in ask.held],
        "debriefs": [d.model_dump(mode="json", by_alias=True) for d in ask.debriefs],
        "remind_days": ask.remindDays,
    }
    try:
        return ProficiencyPlan.model_validate(coach.plan(given, ask.home))
    except ValueError as refused:  # the engine's Err: input not of its shape
        raise HTTPException(status_code=422, detail=str(refused)) from refused
