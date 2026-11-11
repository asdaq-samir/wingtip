"""The shapes app.routers.notes sends and takes, as Pydantic models."""

from pydantic import BaseModel


class CheckpointNote(BaseModel):
    route: str
    lat: float
    lon: float
    description: str
    created_at: str


class CheckpointNoteSaved(BaseModel):
    ok: bool
    note: CheckpointNote


class PilotNotesForgotten(BaseModel):
    """How many of one pilot's own notes went, as their account did."""

    removed: int


class NoteToWrite(BaseModel):
    """A route's checkpoint as the assistant writes its note
    (POST /api/checkpoint-notes/pending): where it is, what it is, the
    hop its note is kept under, and the note already kept for it -- the
    pilot's own, else the shared one -- or None, for the assistant to
    write and seed."""

    lat: float
    lon: float
    id: str
    name: str | None = None
    category: str
    along_track_nm: float
    hop_key: str
    saved: str | None = None


class NotesToWrite(BaseModel):
    """A route's checkpoints in along-track order, for their notes."""

    departure_ident: str
    checkpoints: list[NoteToWrite]


class NoteSeeded(BaseModel):
    """A generated note offered as the shared one: kept (`written`), or
    the shared one saved meanwhile, which stays (`description` is it)."""

    description: str
    written: bool
