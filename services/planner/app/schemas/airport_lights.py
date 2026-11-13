"""An airport's lights as its card shows them (/api/airport/{ident}): its
Chart Supplement lighting remarks read by the engine's lighting_read
(engine/contract/engine.schema.json), each system with how it is turned
on. Apart from app.schemas.airports, whose AirportPlace carries them."""

from typing import Literal

from pydantic import BaseModel


class LightingSystem(BaseModel):
    """One lighting system: its Chart Supplement legend code (None where its
    name says it all: taxiway lights, the beacon), its name in AIM 2-1, the
    runways or ends it serves as written, and how it is turned on --
    keyed on `frequency` (AIM 2-1-8), `clicks` where the remarks give a
    count, when the tower is closed, preset and turned up, on a
    `schedule`, or on all the time -- with `how` that in a pilot's words
    and `as_written` the sentence it was read from."""

    code: str | None
    name: str
    runways: list[str]
    pilot_controlled: bool
    frequency: str | None
    clicks: int | None
    tower_closed: bool
    preset: Literal["low", "medium", "high"] | None
    brighter: bool
    schedule: str | None
    continuous: bool
    nonstandard: bool
    how: str | None
    as_written: str


class LightingNote(BaseModel):
    """A sentence of the remarks the engine could not read as systems: its
    contractions written out, every other word kept (`words`), and as
    sent (`as_written`)."""

    words: str
    as_written: str
