"""The Studio's crash drafts (docs/STUDIO-PIPELINE.md): what the
crash-leads job (services/jobs/crash) found, checked and kitted, read
from the shared store (wingtip.crash_drafts) and judged here by the
developer. Nothing is fetched on a request. The developer's, as the
Studio is; the two the gateway's CrashDraftMail asks are its own
(x-internal), never forwarded."""

import time

from fastapi import APIRouter, HTTPException
from wingtip import crash_drafts

from ..gateway import DEVELOPER, INTERNAL_GATEWAY
from ..schemas.studio import StudioTrack
from ..schemas.studio_drafts import StudioDraft, StudioDraftIdentityAsk

router = APIRouter()


def _one(draft_id: str) -> dict:
    try:
        return crash_drafts.draft(draft_id)
    except crash_drafts.NoSuchDraft as err:
        raise HTTPException(404, "No draft by that id.") from err


@router.get("/api/studio/drafts", response_model=list[StudioDraft], openapi_extra=DEVELOPER)
def studio_drafts() -> list[StudioDraft]:
    """Every crash draft, the newest event first."""
    return [StudioDraft(**d) for d in crash_drafts.drafts()]


@router.get("/api/studio/drafts/{draft_id}", response_model=StudioDraft, openapi_extra=DEVELOPER)
def studio_draft(draft_id: str) -> StudioDraft:
    """One draft, with its kit's captions where the kit is made."""
    draft = _one(draft_id)
    lead = crash_drafts.kit(draft_id).get("lead") or {}
    return StudioDraft(**draft, captions=lead.get("captions"))


@router.get("/api/studio/drafts/{draft_id}/track", response_model=StudioTrack, openapi_extra=DEVELOPER)
def studio_draft_track(draft_id: str) -> StudioTrack:
    """The ADS-B track the draft's identity was confirmed on, as its kit
    keeps it: a same-day trace, kept before it rolled off. A 404 for a
    draft with none ("No ADS-B track"): never a guessed path."""
    _one(draft_id)
    track = crash_drafts.kit(draft_id).get("track")
    if not track:
        raise HTTPException(404, "This draft has no ADS-B track.")
    return StudioTrack(**track)


@router.post("/api/studio/drafts/{draft_id}/identity", response_model=StudioDraft, openapi_extra=DEVELOPER)
def studio_draft_identity(draft_id: str, ask: StudioDraftIdentityAsk) -> StudioDraft:
    """The developer's word: the identity is right (ready; with a new
    N-number, checked again by the job first), or it is not (the match
    forgotten, waiting for a person)."""
    _one(draft_id)
    draft = crash_drafts.confirm(draft_id, ask.n_number) if ask.confirm else crash_drafts.reject(draft_id)
    return StudioDraft(**draft)


@router.post("/api/studio/drafts/{draft_id}/dismiss", response_model=StudioDraft, openapi_extra=DEVELOPER)
def studio_draft_dismiss(draft_id: str) -> StudioDraft:
    """Set the draft aside: no film, no mail."""
    _one(draft_id)
    return StudioDraft(**crash_drafts.update(draft_id, status="dismissed"))


@router.post("/api/studio/drafts/{draft_id}/rendered", response_model=StudioDraft, openapi_extra=DEVELOPER)
def studio_draft_rendered(draft_id: str) -> StudioDraft:
    """The Studio's film of a ready draft made (scripts/dev/studio-render.mjs,
    through the page). Publishing stays a person's."""
    draft = _one(draft_id)
    if draft["status"] != "ready":
        raise HTTPException(409, "Only a ready draft is rendered.")
    return StudioDraft(**crash_drafts.update(draft_id, status="rendered", rendered_at=time.time()))


@router.get("/api/studio/drafts-to-notice", response_model=list[StudioDraft], openapi_extra=INTERNAL_GATEWAY)
def studio_drafts_to_notice() -> list[StudioDraft]:
    """The ready drafts with a kit the developer has not been mailed about."""
    return [StudioDraft(**d) for d in crash_drafts.to_notice()]


@router.post("/api/studio/drafts/{draft_id}/noticed", response_model=StudioDraft, openapi_extra=INTERNAL_GATEWAY)
def studio_draft_noticed(draft_id: str) -> StudioDraft:
    """The developer mailed about the draft: not again."""
    _one(draft_id)
    return StudioDraft(**crash_drafts.update(draft_id, noticed_at=time.time()))
