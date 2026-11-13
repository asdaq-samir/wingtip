"""Per-checkpoint identification notes: a short, pilot-facing "how to
spot it" sentence, kept here and edited by a pilot. Persisted separately
from chart_picks.csv (that file is ML training data); this is an
operational annotation a pilot edits, not a label. The apps read a
route's notes from POST /api/checkpoint-notes/route and save a pilot's
edit with POST /api/checkpoint-notes."""

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from wingtip import checkpoint_notes

from wingtip import geo

from ..router_basics import load_route
from ..schemas.notes import CheckpointNote, CheckpointNoteSaved, PilotNotes, PilotNotesForgotten, RouteNote, RouteNotes
from ..checkpoint_scoring import route_checkpoints
from ..gateway import gateway

router = APIRouter()


class CheckpointNoteRequest(BaseModel):
    departure_ident: str
    destination_ident: str
    #: The stops landed at on the way, in order (app.router_basics.load_route).
    stops: list[str] = []
    lat: float
    lon: float
    #: A "how to spot it" sentence, not a document; the file is read whole
    #: on every notes request.
    description: str = Field(max_length=500)


class RouteNotesRequest(BaseModel):
    departure_ident: str
    destination_ident: str
    stops: list[str] = []


def _hop_key(hop) -> str:
    """Where a hop's notes are kept: as the route between its two
    landings, so a hop flown on its own, or in another route, reads the
    notes made on it."""
    return checkpoint_notes.route_key(hop.dep_ident, hop.dest_ident)


def _hop_of(r, lat: float, lon: float):
    """The hop of `r` a point is on: the one it lies nearest beside."""
    return min(r.hops, key=lambda hop: abs(geo.cross_track_distance_nm(lat, lon, hop.start, hop.end)))


#: Set by the gateway's proxy from the signed-in pilot, and stripped from
#: anything a browser sent (PlannerProxyController). Absent where nobody
#: can sign in, which makes an edit the shared note -- one user, locally.
PILOT_HEADER = "X-Pilot-Id"


# A POST that changes nothing (the route rides in its body), so no CSRF
# token: the native app holds none.
@router.post("/api/checkpoint-notes/route", openapi_extra=gateway("signed-in", csrf=False, pilot=True))
def route_notes(request: RouteNotesRequest, x_pilot_id: str | None = Header(default=None, alias=PILOT_HEADER)) -> RouteNotes:
    """A route's selected checkpoints in along-track order, each with the
    note kept for it (the pilot's own edit, else the shared one) or None,
    and the hop its note is kept under."""
    r = load_route(request.departure_ident, request.destination_ident, request.stops)
    _, selected, _ = route_checkpoints(r)  # already along-track order
    # Notes are matched by place, so the same corridor flown the other
    # way reads the same ones; a route with stops keeps each hop's as
    # that hop's.
    existing = [
        note
        for hop in r.hops
        for note in (
            checkpoint_notes.load_notes(_hop_key(hop))
            + checkpoint_notes.load_notes(checkpoint_notes.route_key(hop.dest_ident, hop.dep_ident))
        )
    ]
    checkpoints = []
    for cp in selected:
        saved = checkpoint_notes.find_note(existing, cp["lat"], cp["lon"], x_pilot_id)
        checkpoints.append(
            RouteNote(
                lat=cp["lat"],
                lon=cp["lon"],
                id=cp["id"],
                name=cp.get("name"),
                category=cp["category"],
                along_track_nm=cp["along_track_nm"],
                hop_key=_hop_key(r.hops[cp.get("hop", 0)]),
                saved=saved["description"] if saved is not None else None,
            )
        )
    return RouteNotes(departure_ident=r.dep_ident, checkpoints=checkpoints)


@router.post("/api/checkpoint-notes", openapi_extra=gateway("signed-in", pilot=True))
def save_checkpoint_note(
    note: CheckpointNoteRequest, x_pilot_id: str | None = Header(default=None, alias=PILOT_HEADER)
) -> CheckpointNoteSaved:
    """A pilot's own edit to a checkpoint's identification note: what
    they see at that place from now on. Other pilots keep the shared
    note; where nobody can sign in, this becomes the shared note."""
    if not note.description.strip():
        raise HTTPException(422, "description must not be empty")
    r = load_route(note.departure_ident, note.destination_ident, note.stops)
    route = _hop_key(_hop_of(r, note.lat, note.lon))
    saved = checkpoint_notes.save_note(route, note.lat, note.lon, note.description.strip(), x_pilot_id)
    return CheckpointNoteSaved(ok=True, note=saved)


@router.get("/api/checkpoint-notes/mine")
def pilots_notes(x_pilot_id: str | None = Header(default=None, alias=PILOT_HEADER)) -> PilotNotes:
    """A pilot's own notes, every one, for their account's export (the
    gateway's GET /api/me/export). Asked by the gateway alone, as the
    delete below is: the pilot is named by the header it sets."""
    if not x_pilot_id:
        raise HTTPException(422, f"{PILOT_HEADER} names the pilot whose notes these are")
    return PilotNotes(notes=[CheckpointNote(**n) for n in checkpoint_notes.pilots_notes(x_pilot_id)])


@router.delete("/api/checkpoint-notes/mine")
def forget_pilots_notes(x_pilot_id: str | None = Header(default=None, alias=PILOT_HEADER)) -> PilotNotesForgotten:
    """A pilot's own notes, every one, taken out as their account is
    deleted (the gateway's DELETE /api/me). Asked by the gateway alone:
    its proxy does not forward this path, and the pilot is named by the
    header it sets from the session. The shared notes stay."""
    if not x_pilot_id:
        raise HTTPException(422, f"{PILOT_HEADER} names the pilot whose notes go")
    return PilotNotesForgotten(removed=checkpoint_notes.forget_pilot(x_pilot_id))
