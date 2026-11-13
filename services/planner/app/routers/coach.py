"""The pilot's proficiency coach: POST /api/pilot/coach answers the
engine's proficiency plan (proficiency_plan: what is due and when under
14 CFR 61.56 and 61.57, the weak areas the pilot's own debriefs show, and
the sessions, each at a field near home found by wingtip.coach), and POST
/api/words/coach/sources puts a plan as lines a sentence can cite. The
gateway forwards neither the sources nor anything that words them.

Nothing is decided here: the plan is the engine's, and the lines say its
figures as it gave them. The ids a sentence cites: "due:<key>",
"ev:<n>", "session:<n>"."""

from fastapi import APIRouter, HTTPException
from wingtip import coach

from ..gateway import gateway
from ..schemas.coach import CoachAsk, ProficiencyPlan
from ..schemas.words import WordsSource as Source, WordsSources

router = APIRouter()

#: The pilot's own records, so signed in; it changes nothing, and the
#: phones, which hold no cookie, ask it too. A logbook of a few thousand
#: entries and a few debriefs' profiles are well under 1 MB.
COACH = gateway("signed-in", csrf=False, body_limit=1024 * 1024)

STATUS_WORDS = {
    "current": "current",
    "due_soon": "lapses soon",
    "lapsed": "lapsed",
    "pending": "not current yet",
    "unknown": "nothing on record",
}


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
        "entries": [e.model_dump(mode="json") for e in ask.entries],
        "flight_review_on": ask.flightReviewOn.isoformat() if ask.flightReviewOn else None,
        "medical_expires_on": ask.medicalExpiresOn.isoformat() if ask.medicalExpiresOn else None,
        "ipc_on": ask.ipcOn.isoformat() if ask.ipcOn else None,
        "ratings": ask.ratings,
        "held": [h.model_dump(mode="json") for h in ask.held],
        "debriefs": [d.model_dump(mode="json", by_alias=True) for d in ask.debriefs],
        "remind_days": ask.remindDays,
    }
    try:
        return ProficiencyPlan.model_validate(coach.plan(given, ask.home))
    except ValueError as refused:  # the engine's Err: input not of its shape
        raise HTTPException(status_code=422, detail=str(refused)) from refused


def plan_sources(p: ProficiencyPlan) -> list[Source]:
    """The plan as lines: each currency not current, each line of
    evidence, each session; a currency that is current and a field's
    approaches not in a session are left out, as nothing to say."""
    out: list[Source] = []
    for d in p.due:
        if d.status == "current":
            continue
        until = f", until {d.until.isoformat()}" if d.until else ""
        start = f", current from {d.from_.isoformat()}" if d.from_ else ""
        out.append(Source(id=d.id, label=d.label, text=f"{d.label}: {STATUS_WORDS[d.status]}{until}{start} ({d.rule}). {d.detail}."))
    for e in p.evidence:
        where = f"{e.place}, {e.procedure}" if e.procedure else e.place
        out.append(Source(id=e.id, label=f"{where} {e.flown_on.isoformat()}", text=f"{e.flown_on.isoformat()} at {where}: {e.text}."))
    for i, s in enumerate(p.sessions, 1):
        where = ""
        if s.place:
            away = "your home field" if s.place.distance_nm < 0.5 else f"{s.place.distance_nm:g} nm from home"
            where = f" At {s.place.ident} ({s.place.name}, {away})"
            where += f", the {s.place.approach}." if s.place.approach else "."
        who = " With an instructor." if s.instructor else ""
        wings = f" {s.wings.note}: {s.wings.area}, ACS {s.wings.acs}." if s.wings else ""
        out.append(
            Source(
                id=s.id,
                label=f"Session {i}",
                text=f"Session {i}: {s.practise}.{where} About {s.minutes} min.{who}{wings} Answers {', '.join(s.why)}.",
            )
        )
    return out


@router.post("/api/words/coach/sources")
def coach_sources(p: ProficiencyPlan) -> WordsSources:
    """A proficiency plan's lines, each a source a sentence can cite."""
    return WordsSources(sources=plan_sources(p))
