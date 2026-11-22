"""The plates a device keeps for flying with no signal (wingtip.plate_sets):
a flight's, for Keep for the Air, and a state's, for Downloads."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from .airports import TerminalChart

Role = Literal["departure", "destination", "stop", "alternate", "diversion"]
PlatesState = Literal["current", "kept", "unavailable"]


class KeptPlateField(BaseModel):
    """A field whose plates are kept: its part in the flight, how far it is
    off the route (a diversion's), and the charts its part keeps (the
    engine's `plates_kept`)."""

    ident: str
    role: Role
    off_nm: float | None = None
    charts: list[TerminalChart]


class FlightPlates(BaseModel):
    """The plates Keep for the Air keeps for a flight, with their size,
    about, before any is fetched. `range_nm` is the diversion range (the
    engine's `diversion_range_nm`: the reserve's `reserve_min` at the
    airplane's cruise, or its tanks' reach, `basis`), null with no
    airplane. `alternate` is the one filed, or the engine's pick
    (`alternate_picked`, 14 CFR 91.169(c)). `cycle` is the d-TPP cycle the
    charts are of (`state` "kept" where the FAA's could not be had), and
    `next_at` when the next takes over."""

    range_nm: float | None
    reserve_min: float
    basis: Literal["reserve", "tanks", "no_airplane"]
    cycle: str | None
    state: PlatesState
    next_at: str
    alternate: str | None
    alternate_picked: bool
    fields: list[KeptPlateField]
    charts: int
    bytes: int


class PlateStateSet(BaseModel):
    """A state's plates as Downloads offers them: its fields and charts
    and their size, about."""

    id: str
    name: str
    fields: int
    charts: int
    bytes: int


class PlateStates(BaseModel):
    """The states whose plates can be kept, of the d-TPP `cycle` (null
    where no index could be had), and when the next takes over."""

    cycle: str | None
    next_at: str
    state: PlatesState
    states: list[PlateStateSet]


class PlateStateField(BaseModel):
    """One field of a state's set and its charts."""

    ident: str
    charts: list[TerminalChart]


class PlateStateCharts(BaseModel):
    """A state's set of `cycle`: every open field the d-TPP files under it
    and its charts, each fetched as the card's Charts tab fetches it."""

    cycle: str
    next_at: str
    id: str
    name: str
    fields: list[PlateStateField]
