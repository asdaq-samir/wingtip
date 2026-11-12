"""The model reading one photographed page: the photo and the ask for its
kind in, the page's figures out as a filled-in shape (structured outputs,
`messages.parse`), so what comes back is data and not prose to parse."""

from __future__ import annotations

import anthropic
from pydantic import BaseModel

from .. import tracing
from ..settings import get_settings
from .prompts import ASKS, SYSTEM
from .schemas import ClearancePage, HandbookPage, Kind, LogbookPage

#: What each kind of page is read into.
SHAPES: dict[str, type[BaseModel]] = {
    "poh-performance": HandbookPage,
    "weight-balance": HandbookPage,
    "logbook-page": LogbookPage,
    "clearance": ClearancePage,
}
#: Non-streaming, as one page's figures are a few thousand tokens at most;
#: the model thinks first, within this (the notes' lesson: too few and it
#: runs out before the answer).
MAX_TOKENS = 16_000


class ReaderUnavailable(Exception):
    """The reader cannot be reached (no key, a refused one, no network, a
    limit), declined the page, or ran out of room."""


def read(kind: Kind, image_b64: str, media_type: str) -> BaseModel:
    """The page's figures, as the shape for `kind`."""
    s = get_settings()
    shape = SHAPES[kind]
    try:
        with tracing.feature("documents"):
            response = anthropic.Anthropic().messages.parse(
                model=s.documents_model,
                max_tokens=MAX_TOKENS,
                system=SYSTEM,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                            {"type": "text", "text": ASKS[kind]},
                        ],
                    }
                ],
                output_format=shape,
                output_config={"effort": s.documents_effort},
            )
    except anthropic.AnthropicError as err:
        raise ReaderUnavailable(str(err)) from err
    if response.stop_reason == "refusal":
        raise ReaderUnavailable("The reader declined this photo.")
    # Cut off, the last rows are cut off with it, and a table would look
    # whole when it is not.
    if response.stop_reason == "max_tokens":
        raise ReaderUnavailable("The reader ran out of room for this page.")
    if response.parsed_output is None:
        raise ReaderUnavailable("The reader gave no figures.")
    return response.parsed_output
