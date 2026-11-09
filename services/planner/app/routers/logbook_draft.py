"""A flight logged from the app's own track: POST /api/logbook-draft
answers the draft entry for the pilot to review (wingtip.logbook_draft,
the engine's logbook_from_track). Nothing is saved here: the app sends
the entry the pilot confirms to the gateway's POST /api/logbook."""

from fastapi import APIRouter, HTTPException
from wingtip import logbook_draft

from ..gateway import gateway
from ..schemas.logbook_draft import LogbookDraft, LogbookDraftAsk

router = APIRouter()

#: The pilot's own flight, so signed in; it changes nothing, and the
#: phones, which hold no cookie, ask it too.
SIGNED_IN_READ_BY_POST = gateway("signed-in", csrf=False)


@router.post(
    "/api/logbook-draft",
    response_model=LogbookDraft,
    openapi_extra=SIGNED_IN_READ_BY_POST,
    responses={422: {"description": "The track is not of the engine's shape"}},
)
def draft(ask: LogbookDraftAsk) -> LogbookDraft:
    """The logbook entry a flown track makes, each figure with its reason
    (14 CFR 1.1, 61.1(b), 61.51, 61.57): flight, air and night time, the
    landings by kind and by 61.57's day and night, the cross-country, and
    apart 61.57(c)'s approaches (matched to the CIFP's), holds and tracking
    for the pilot to add where flown by instruments."""
    try:
        answer = logbook_draft.draft(
            [p.model_dump() for p in ask.points],
            aircraft=ask.aircraft,
            aircraft_type=ask.aircraftType,
            utc_offset_min=ask.utcOffsetMin,
            picked=ask.picked,
        )
    except ValueError as refused:  # the engine's Err: input not of its shape
        raise HTTPException(status_code=422, detail=str(refused)) from refused
    return LogbookDraft.model_validate(answer)
