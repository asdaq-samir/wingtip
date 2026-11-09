"""POST /api/departure-window's question and answer: the Go / No-Go's
question (the route, the airplane and what only the pilot knows) with the
hours to look at, and each hour's say with the windows, best first."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from ..gonogo.schemas import GoNoGoAsk, VerdictItem

#: The most hours looked at, two days (the planner's own bound); they stop
#: sooner where the TAFs along the route do (wingtip.departure_window.taf_reach).
MAX_HOURS = 48

HourVerdict = Literal["go", "caution", "no-go", "unknown"]


class DepartureWindowAsk(GoNoGoAsk):
    """The Go / No-Go's ask, its `depart` unused: each hour is a departure."""

    #: The first departure hour; the next whole hour when not given.
    start: datetime | None = None
    #: How many hours to look at, each an hour after the last; fewer where
    #: the forecasts end first.
    hours: int = Field(default=MAX_HOURS, ge=1, le=MAX_HOURS)
    #: An airplane is picked. False: the stock profile plans the route's
    #: own figures, and the hours say nothing of time, fuel, runways or
    #: loading, which are an airplane's (the owner, 2026-11-08: "don't
    #: assume").
    airplane: bool = True


class WindowHour(BaseModel):
    """One departure hour: go, caution, no-go or not known, the findings
    that decide it, and its time and fuel with an airplane."""

    depart: datetime
    verdict: HourVerdict
    reasons: list[VerdictItem]
    ete_min: float | None
    fuel_gal: float | None
    #: Any of the flight at night (14 CFR 1.1), or in 61.57(b)'s
    #: night-passenger period.
    night: bool
    night_passengers: bool
    #: The forecast's worst along the route over the minimums, the lesser
    #: of the ceiling's and the visibility's ratios, at most 3.
    margin: float | None


class Window(BaseModel):
    """A run of go hours: its first and last departure hour, how many, its
    least margin and its shortest ETE, and the hour that has it."""

    start: datetime
    last: datetime
    hours: int
    margin: float | None
    ete_min: float | None
    quickest: datetime


class DepartureWindow(BaseModel):
    hours: list[WindowHour]
    #: Best first: the most margin, then the shortest ETE.
    windows: list[Window]
    airplane: bool
    #: The last time the TAFs along the route forecast; None where none is near.
    forecast_until: datetime | None
