"""POST /api/read-document: a photographed page read into figures and
checked. The route only parses, calls and returns: the model reads the
page (reader.py), and the engine checks what it read, through the
planner's POST /api/engine/{name} (handbook_read_check,
logbook_read_check: the contract's "x-assistant" rules). A clearance note
goes back as the controller's words for the app's own clearance reader
(the engine's read_clearance), which makes its card.

Nothing is saved here or anywhere on the way: the app shows each item
with its flags for the pilot to confirm, and saves what was confirmed
through the gateway (/api/aircraft, /api/logbook)."""

from __future__ import annotations

import base64
import binascii
import datetime as dt
import logging

from fastapi import APIRouter, HTTPException

from ..gateway import gateway
from ..generated import planner_client as planner
from ..settings import get_settings
from .reader import ReaderUnavailable, read
from .schemas import (
    ClearancePage,
    DocumentRead,
    HandbookCheck,
    HandbookPage,
    HandbookRead,
    LogbookCheck,
    LogbookPage,
    LogbookPageRead,
    ReadAsk,
)

log = logging.getLogger(__name__)
router = APIRouter()

#: The most a photo may be, decoded: under the 5 MB the API takes an image
#: at, and the gateway's 4 MB body as base64. The apps send a JPEG of about
#: 2,000 px on its long edge, a few hundred KB.
MOST_IMAGE_BYTES = 3_500_000
#: The first bytes of each image kind the request may name.
MAGIC = {"image/jpeg": (b"\xff\xd8\xff",), "image/png": (b"\x89PNG",), "image/gif": (b"GIF8",), "image/webp": (b"RIFF",)}


def _image(ask: ReadAsk) -> str:
    """The photo's base64, checked to be the image it says it is."""
    try:
        raw = base64.b64decode(ask.image, validate=True)
    except (binascii.Error, ValueError) as err:
        raise HTTPException(422, "The photo is not base64.") from err
    if len(raw) > MOST_IMAGE_BYTES:
        raise HTTPException(413, f"The photo is {len(raw) // 1000} KB; at most {MOST_IMAGE_BYTES // 1000} KB.")
    if not raw.startswith(MAGIC[ask.media_type]):
        raise HTTPException(422, f"The photo is not a {ask.media_type.removeprefix('image/').upper()}.")
    return base64.b64encode(raw).decode()


def _checked(rule: str, given: dict) -> dict:
    """The engine's rule on the read, asked through the planner; its
    refusal (a read not of the rule's shape) is a 502 here, as the model's
    answer was at fault, not the app's."""
    try:
        return planner.engine_rule(name=rule, body=given)  # type: ignore[arg-type] -- an x-assistant rule
    except planner.PlannerError as err:
        log.warning("%s refused the read: %s", rule, err.detail)
        raise HTTPException(502, f"The figures read could not be checked: {err.detail}") from err


@router.post("/api/read-document", openapi_extra=gateway("signed-in", paid="ASSISTANT"))
def read_document(ask: ReadAsk) -> DocumentRead:
    """A photographed page (`kind`: a handbook's performance or weight and
    balance page, a logbook page, a clearance note) read into figures, and
    the engine's check of every one: ranges, units and the page's own sums,
    each flagged "check" or "wrong" for the pilot to confirm. A page that
    could not be read says why in `unreadable`; a reader that could not be
    reached is a 503."""
    image = _image(ask)
    model = get_settings().documents_model
    try:
        page = read(ask.kind, image, ask.media_type)
    except ReaderUnavailable as err:
        raise HTTPException(503, str(err)) from err
    answer = DocumentRead(kind=ask.kind, model=model, notes=page.notes, unreadable=page.unreadable)
    if page.unreadable:
        # Told to give no figures then: whatever it gave is not shown.
        return answer
    if isinstance(page, HandbookPage):
        figures = HandbookRead.model_validate(page.model_dump(exclude={"notes", "unreadable"}))
        answer.handbook = figures
        answer.handbook_check = HandbookCheck.model_validate(_checked("handbook_read_check", figures.model_dump(mode="json")))
    elif isinstance(page, LogbookPage):
        figures = LogbookPageRead.model_validate(page.model_dump(exclude={"notes", "unreadable"}, by_alias=True))
        given = figures.model_dump(mode="json", by_alias=True) | {"today": ask.today or dt.datetime.now(dt.UTC).date().isoformat()}
        answer.logbook = figures
        answer.logbook_check = LogbookCheck.model_validate(_checked("logbook_read_check", given))
    elif isinstance(page, ClearancePage):
        answer.clearance = page.clearance
    return answer
