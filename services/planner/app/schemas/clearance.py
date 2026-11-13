"""The shapes app.routers.clearance sends and takes, as Pydantic models."""

from typing import Literal

from pydantic import BaseModel


class SpokenProcedureAsk(BaseModel):
    """A SID or STAR as a clearance said it: "Bunyan" "1", its
    transition's words where one was said ("Duluth")."""

    name: str
    number: str
    transition: str | None = None


class ClearanceAsk(BaseModel):
    """POST /api/clearance/places: the places a clearance heard named, in
    the words the recognizer wrote (web lib/clearance), for the planner to
    find as idents near `near`, the route's points as "lat,lon;lat,lon".
    `dep` and `dest`, the fields whose SID and STAR were said."""

    near: str = ""
    dep: str | None = None
    dest: str | None = None
    limit: str | None = None
    route: list[str] = []
    departure: SpokenProcedureAsk | None = None
    arrival: SpokenProcedureAsk | None = None


class SpokenPlace(BaseModel):
    """A place a clearance said, as found (the engine's clearance_places):
    `ident` None where nothing near was like it, `sure` false where it was
    found by its sound alone, for the pilot to check."""

    said: str
    ident: str | None = None
    name: str | None = None
    kind: Literal["airport", "navaid", "fix"] | None = None
    lat: float | None = None
    lon: float | None = None
    sure: bool = False


class SpokenProcedure(BaseModel):
    """A SID or STAR said, as found among its field's: its coded
    identifier ("BUNYN1") and the transition said, if one was."""

    id: str
    transition: str | None = None
    sure: bool = False


class ClearancePlaces(BaseModel):
    """The places a clearance named, as idents: its limit, each phrase of
    its route as the places in it in order, its SID and STAR."""

    limit: SpokenPlace | None = None
    route: list[list[SpokenPlace]] = []
    departure: SpokenProcedure | None = None
    arrival: SpokenProcedure | None = None


class ClearanceWords(BaseModel):
    """GET /api/clearance/words: the names a clearance near the route is
    likely to say -- its navaids', its fixes' and its fields' SIDs' -- for
    the phone's recognizer to listen for (iOS's contextualStrings,
    Android's biasing strings)."""

    words: list[str]
