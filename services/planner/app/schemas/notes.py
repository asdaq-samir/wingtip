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


class PilotNotes(BaseModel):
    """A pilot's own notes, for their account's export."""

    notes: list[CheckpointNote]


class PilotNotesForgotten(BaseModel):
    """How many of one pilot's own notes went, as their account did."""

    removed: int


class RouteNote(BaseModel):
    """A route's checkpoint with its note (POST /api/checkpoint-notes/route):
    where it is, what it is, the hop its note is kept under, and the note
    kept for it -- the pilot's own, else the shared one -- or None."""

    lat: float
    lon: float
    id: str
    name: str | None = None
    category: str
    along_track_nm: float
    hop_key: str
    saved: str | None = None


class RouteNotes(BaseModel):
    """A route's checkpoints in along-track order, for their notes."""

    departure_ident: str
    checkpoints: list[RouteNote]
