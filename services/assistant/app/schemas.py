"""The assistant's answers that are not its own modules': the streams'
lines and the mock oral's shapes, published in openapi.json
(app.openapi), which the web's types are generated from (npm run types:
src/lib/api/assistant-schema.d.ts)."""
from typing import Annotated, Literal

from pydantic import BaseModel, Field


# --- /api/checkpoint-notes/generate: a note a checkpoint, as each is written (app.notes) ---


class NoteStart(BaseModel):
    type: Literal["start"] = "start"
    count: int


class NoteCheckpoint(BaseModel):
    """`source` says where the text came from: "saved" is a pilot's own
    earlier edit, "generated" a fresh model call, "error" that call
    failing for this checkpoint alone (`description` is None then)."""

    type: Literal["checkpoint"] = "checkpoint"
    lat: float
    lon: float
    id: str
    description: str | None
    source: Literal["generated", "saved", "error"]
    detail: str | None = None


class NoteError(BaseModel):
    """A failure that applies to every checkpoint the same way (a bad
    key, an exhausted rate limit), sent once."""

    type: Literal["error"] = "error"
    detail: str


class NoteDone(BaseModel):
    type: Literal["done"] = "done"


CheckpointNoteMessage = Annotated[
    NoteStart | NoteCheckpoint | NoteError | NoteDone, Field(discriminator="type"),
]


# --- /api/briefing/narrative: the Brief's narrative as it is written (app.narrative) ---


class NarrativeDelta(BaseModel):
    """A piece of the briefing as Claude writes it."""

    type: Literal["delta"] = "delta"
    text: str


class NarrativeDone(BaseModel):
    """The whole briefing, once it is written."""

    type: Literal["done"] = "done"
    briefing: str


class NarrativeError(BaseModel):
    """Why there is no briefing, in words a pilot reads. It may come after
    deltas: a failure once the first line is out cannot change the status
    any more."""

    type: Literal["error"] = "error"
    detail: str


NarrativeMessage = Annotated[NarrativeDelta | NarrativeDone | NarrativeError, Field(discriminator="type")]


# --- the mock oral (app.oral) ---


class OralFocus(BaseModel):
    """An ACS element the mock oral examines: its code and its words."""

    code: str = Field(pattern=r"^[A-Z]{2}\.[IVX]+\.[A-Z]\.[KRS]\d+[a-z]?$")
    text: str = Field(max_length=400)


class OralQuestionRequest(BaseModel):
    """The student's flight in a few lines (the page's own summary of its
    plan and briefing), the ACS elements to examine, and the questions
    already asked."""

    plan: str = Field(max_length=6000)
    focus: list[OralFocus] = Field(min_length=1, max_length=12)
    asked: list[Annotated[str, Field(max_length=600)]] = Field(default=[], max_length=20)


class OralCitation(BaseModel):
    """A passage an answer rests on, quoted word for word (checked), with
    its source's title and where to read it."""

    source: str
    title: str
    url: str
    quote: str


class OralEditions(BaseModel):
    """The editions the sources are: the eCFR's issue date and the day the
    AIM was read."""

    cfr_issued: str | None = None
    aim_fetched: str | None = None


class OralQuestion(BaseModel):
    """One examiner's question (app.oral), its answer and key points, the
    citations that survived the check, and the sources to grade from.
    `unsupported` where none did."""

    question: str
    acs_code: str
    model_answer: str
    key_points: list[str]
    citations: list[OralCitation]
    source_ids: list[str]
    unsupported: bool
    editions: OralEditions


class OralGradeRequest(BaseModel):
    question: str = Field(max_length=1000)
    model_answer: str = Field(max_length=4000)
    key_points: list[Annotated[str, Field(max_length=300)]] = Field(default=[], max_length=12)
    source_ids: list[Annotated[str, Field(max_length=40)]] = Field(max_length=12)
    answer: str = Field(min_length=1, max_length=4000)


class OralGrade(BaseModel):
    """The student's answer graded: satisfactory, partial or unsatisfactory,
    in a few sentences, the key points it missed, and the citations."""

    verdict: Literal["satisfactory", "partial", "unsatisfactory"]
    feedback: str
    missed: list[str]
    citations: list[OralCitation]


# The unions no route returns, published into the OpenAPI components by
# app.main so apps/web/ gets a TypeScript type for each stream.
STREAM_MESSAGES = {
    "CheckpointNoteMessage": CheckpointNoteMessage,
    "NarrativeMessage": NarrativeMessage,
}
