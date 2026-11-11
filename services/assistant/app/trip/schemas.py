"""The trip planner's shapes (app.trip): the ask, the proposal it builds and
the lines of its stream, published in openapi.json (STREAM_MESSAGES) so the
web's types and the phones' models are generated from them."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from ..toolbox import Context, Source


class TripAsk(BaseModel):
    """A trip in the pilot's own words ("VFR to Oshkosh Saturday morning,
    stay out of the Chicago Class B, back by 5"), the plan and record the
    app has (the assistant's Context: the departure where the words leave
    it out, the airplane, the minimums) and the pilot's time zone (IANA),
    which "Saturday" and "by 5" are read in."""

    text: str = Field(min_length=3, max_length=2000)
    context: Context | None = None
    time_zone: str = Field(default="America/Chicago", max_length=64)


class TripChange(BaseModel):
    """A leg as the app loads it into the FPL: the same fields as the
    assistant's proposed change (useAsk's AssistantChange), all of them."""

    dep: str
    dest: str
    stops: list[str]
    altitude_ft: float | None = None
    #: ISO 8601 UTC.
    depart: str


class TripWindow(BaseModel):
    """The run of go hours (the planner's departure window) the departure
    falls in: its first and last departure hour, UTC."""

    start: str
    last: str
    hours: int


class TripLeg(BaseModel):
    """One leg of the proposal: the route and time the pilot loads
    (`change`), and its figures, each the planner's: the altitude the plan
    chose or was asked, the distance, time and fuel of its nav log, the
    arrival (the departure and the plan's ETE), the go window the
    departure is in (None where the window was not asked or the time is
    outside it), the airspace it passes, the plan's cautions, and the ids
    of the sources they rest on."""

    kind: Literal["outbound", "return"]
    change: TripChange
    altitude_ft: float | None
    distance_nm: float | None
    ete_min: float | None
    fuel_gal: float | None
    arrive: str | None
    depart_local: str
    arrive_local: str | None
    window: TripWindow | None
    airspace: list[str]
    cautions: list[str]
    sources: list[str]


class TripProposal(BaseModel):
    """The trip proposed: its legs (the return where asked), the model's
    short reason for it, and every constraint it could not meet, in plain
    words -- the model's and the planner's checks' (a deadline missed, a
    Class B still crossed, a price the app cannot know). Nothing is
    applied until the pilot taps Use."""

    legs: list[TripLeg]
    rationale: str
    unmet: list[str]


class TripTool(BaseModel):
    type: Literal["tool"] = "tool"
    name: str
    label: str


class TripText(BaseModel):
    type: Literal["text"] = "text"
    text: str


class TripPlanned(BaseModel):
    type: Literal["plan"] = "plan"
    proposal: TripProposal


class TripSources(BaseModel):
    type: Literal["sources"] = "sources"
    sources: list[Source]


class TripDone(BaseModel):
    type: Literal["done"] = "done"


class TripError(BaseModel):
    type: Literal["error"] = "error"
    words: str


TripMessage = Annotated[TripTool | TripText | TripPlanned | TripSources | TripDone | TripError, Field(discriminator="type")]
