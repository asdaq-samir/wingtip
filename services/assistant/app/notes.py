"""Per-checkpoint identification notes: a short, pilot-facing "how to
spot it" sentence, written by Claude and streamed one checkpoint at a
time rather than making the whole nav log wait on N sequential LLM
calls. The checkpoints and the notes kept for them are the planner's
(its routers/notes.py): it says which have none yet (POST
/api/checkpoint-notes/pending) and keeps each note written here as the
shared one (/seed). A pilot's own edit is saved at the planner too, through
the gateway, and never comes here."""

import logging

import anthropic
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import tracing
from .generated import planner_client as planner
from .generated.planner_models import NoteToWrite
from .gateway import gateway
from .schemas import NoteCheckpoint, NoteDone, NoteError, NoteStart
from .settings import get_settings

router = APIRouter()
log = logging.getLogger(__name__)

# Named by the environment, as every model here is. Haiku:
# on eight of the C81 to KDLH route's checkpoints (2026-10-08) it wrote
# lines as useful as claude-sonnet-5's for a quarter of the cost, $0.0002
# a checkpoint against $0.00085, on that day's prices. At today's
# (2026-11-10), claude-haiku-5-5's $0.10 / $0.50 a million tokens in and
# out is about a twentieth of claude-sonnet-5-5's $2 / $10.
CHECKPOINT_NOTE_MODEL = get_settings().checkpoint_note_model
# Medium, not low: at low effort the same eight ran to 28 words where the
# prompt asks under 20, and one line ended "Wait, that's not quite right;
# let me give one clean sentence instead." -- in a pilot's nav log. At
# medium, a median of 20 words and nothing of the kind. The model thinks
# first, and the thinking counts toward max_tokens: at 1,024 it ran out
# before the sentence on the nightly AI check's first run (stop reason
# max_tokens), so the cap is 4,096 -- even used whole, $0.002 on Haiku.
CHECKPOINT_NOTE_EFFORT = "medium"
CHECKPOINT_NOTE_MAX_TOKENS = 4096
# These fail the same way for every checkpoint in the route, not just
# the one that happened to hit it first -- a bad key or an exhausted
# rate limit does not get better by trying the next 20 checkpoints the
# same way, it just burns 20 more calls to learn the same thing.
# APITimeoutError is a subclass of APIConnectionError already.
GLOBAL_ANTHROPIC_ERRORS = (
    anthropic.AuthenticationError,
    anthropic.PermissionDeniedError,
    anthropic.APIConnectionError,
    anthropic.RateLimitError,
)

#: Set by the gateway's proxy from the signed-in pilot, and stripped from
#: anything a browser sent (PlannerProxyController), and passed on to the
#: planner: the notes a pilot sees first are their own.
PILOT_HEADER = "X-Pilot-Id"


class GenerateNotesRequest(BaseModel):
    departure_ident: str
    destination_ident: str
    #: The stops landed at on the way, in order.
    stops: list[str] = []


def _describe_checkpoint(checkpoint: NoteToWrite, dep_ident: str, prev_name: str | None, next_name: str | None) -> str:
    """One Claude call, one checkpoint. The prompt is deliberately
    told not to invent geographic specifics it cannot know: the
    checkpoint data reaching this service is a lat/lon point plus a
    category and an optional OSM name -- no polygon or shoreline
    survives the pipeline this far, so a claim like "the east shore"
    would be a guess dressed as a fact.
    """
    name = checkpoint.name or checkpoint.category
    prompt = (
        "In one short sentence (under 20 words), describe exactly where a "
        "VFR pilot should look to positively identify this checkpoint from "
        "the air, so they know they're at the right spot and not somewhere "
        "similar-looking nearby.\n\n"
        f"Checkpoint: {name}, category \"{checkpoint.category}\".\n"
        f"{checkpoint.along_track_nm or 0:.1f} nm along the route from {dep_ident}.\n"
        f"Previous checkpoint: {prev_name or 'none (departure)'}\n"
        f"Next checkpoint: {next_name or 'none (destination)'}\n\n"
        "If you don't have specific knowledge of this named feature's "
        "actual shape or layout, say only what's safely inferable from its "
        "category and position -- don't invent specific geographic "
        "details (which shore, which bend) you can't know.\n\n"
        "Reply with that one sentence and nothing else: no preamble, and no "
        "remark about what you do or don't know."
    )
    with tracing.feature("checkpoint_notes"):
        resp = anthropic.Anthropic().messages.create(
            model=CHECKPOINT_NOTE_MODEL,
            max_tokens=CHECKPOINT_NOTE_MAX_TOKENS,
            output_config={"effort": CHECKPOINT_NOTE_EFFORT},
            messages=[{"role": "user", "content": prompt}],
        )
    # The answer is the text block: a thinking block can come first. A
    # reply cut off at the cap (the thinking shares it) is refused like an
    # empty one, since the note is saved as the one every pilot then sees.
    text = "".join(block.text for block in resp.content if block.type == "text").strip()
    if not text or resp.stop_reason == "max_tokens":
        raise RuntimeError(f"Claude did not finish a note (stop reason {resp.stop_reason})")
    return text


def _line(message: BaseModel) -> str:
    return message.model_dump_json(by_alias=True) + "\n"


def _name(cp: NoteToWrite | None) -> str | None:
    return (cp.name or cp.category) if cp else None


@router.post(
    "/api/checkpoint-notes/generate",
    responses={200: {"content": {"application/x-ndjson": {}}}},
    openapi_extra=gateway("signed-in", paid="CHECKPOINT_NOTES", pilot=True),
)
def describe_checkpoints(
    request: GenerateNotesRequest, x_pilot_id: str | None = Header(default=None, alias=PILOT_HEADER)
) -> StreamingResponse:
    """One "how to spot it" line per checkpoint, as newline-delimited
    JSON (each line one CheckpointNoteMessage), so a slow LLM call on
    checkpoint 3 does not hold up checkpoints 1 and 2 that already
    arrived.

    Two different kinds of failure, reported two different ways. A
    single checkpoint's own LLM call failing for a reason specific to
    it does not take the rest of the stream down -- every other
    checkpoint is independent and still worth generating, so that one
    gets its own per-checkpoint "error" line and the loop moves on.
    GLOBAL_ANTHROPIC_ERRORS is the opposite case: a bad key or an
    exhausted rate limit fails identically for every checkpoint, so
    it's reported once as a single stream-level "error" (for one
    banner instead of the same text repeated per row) -- but the
    stream itself keeps going: every remaining checkpoint still gets
    its own per-checkpoint "error" line too, just without spending a
    call to learn what's already known. A pilot still gets a row to
    type a note into for every checkpoint, not just the ones that
    happened to come before the failure.

    A POST, not a GET: every checkpoint without a note is a billed
    Claude call and a write. The caller's own edit is what they see
    where they made one; generation only ever fills the shared note.
    The route and its checkpoints are asked of the planner before the
    stream opens, so an ident that is not one is the planner's 404 here.
    """
    try:
        pending = planner.notes_to_write(body=request.model_dump(), x_pilot_id=x_pilot_id)
    except planner.PlannerError as err:
        raise HTTPException(err.status, err.detail) from err
    selected = pending.checkpoints or []
    dep_ident = pending.departure_ident or request.departure_ident

    def checkpoint_line(cp: NoteToWrite, description: str | None, source: str, detail: str | None = None) -> str:
        return _line(NoteCheckpoint(lat=cp.lat, lon=cp.lon, id=cp.id, description=description, source=source, detail=detail))

    def lines():
        yield _line(NoteStart(count=len(selected)))
        global_error: str | None = None
        for i, cp in enumerate(selected):
            if cp.saved is not None:
                yield checkpoint_line(cp, cp.saved, "saved")
                continue
            if global_error is not None:
                yield checkpoint_line(cp, None, "error", global_error)
                continue
            try:
                description = _describe_checkpoint(
                    cp, dep_ident, _name(selected[i - 1] if i > 0 else None), _name(selected[i + 1] if i + 1 < len(selected) else None)
                )
                held = planner.seed_note(body={"hop_key": cp.hop_key, "lat": cp.lat, "lon": cp.lon, "description": description})
            except GLOBAL_ANTHROPIC_ERRORS as err:
                global_error = str(err)
                yield _line(NoteError(detail=global_error))
                yield checkpoint_line(cp, None, "error", global_error)
                continue
            except Exception as err:  # noqa: BLE001 -- one bad LLM call must not stop the rest
                log.warning("checkpoint note failed: %s", err)
                yield checkpoint_line(cp, None, "error", str(err))
                continue
            if not held.written:
                # A shared note saved while this stream ran: it stays.
                yield checkpoint_line(cp, held.description, "saved")
                continue
            yield checkpoint_line(cp, description, "generated")
        yield _line(NoteDone())

    return StreamingResponse(lines(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
