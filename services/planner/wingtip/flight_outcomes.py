"""What a flight is planned with (Asked), what a hop's altitude plan comes
to (Flown, Unflyable or NoWinds) and the hops' runs, with the time on the
ground at a stop. The types wingtip.flight_plan's parts pass between them."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime

from . import elevation
from .engine import ask as engine
from .units import M_TO_FT
from .weather import WeatherServiceError

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Asked:
    """What a flight is planned with, read from the request by its caller
    (app.routers.plan's PlanQuery.asked, which refuses what is not one).

    `profile` is the airplane's (wingtip.aircraft.aircraft_profile) and
    `aircraft_key` what the altitude selection is cached by (its name and any
    ceiling of the pilot's own); `profile` None is no airplane (no `aircraft`
    asked): the route's own figures, and none that needs an airplane.
    `altitude_ft`, a pilot's own cruise, is flown on every leg -- or,
    `altitude_nearest` (the wheel's pick), at each leg's legal altitude nearest
    it; without it the plan `altitude_choice` is flown. `own_altitudes` are
    points' own altitudes by ident, `drawn` the procedures picked as drawn
    (wingtip.procedures.procedure_drawing), `leave_runways` and `land_runways`
    the runways picked by field, `wind_runways` whether the rest are picked
    into the wind (wind_picks), `ground` the minutes on the ground at stops,
    `holds` the pilot's holds, `checkpoints` whether the legs run by the
    chart's checkpoints, and `alternate` the IFR alternate filed, as the
    airports table has it with its ident."""

    profile: dict | None
    aircraft_key: str
    altitude_ft: float | None = None
    altitude_nearest: bool = False
    altitude_choice: str = "fastest"
    rules: str = "vfr"
    depart: datetime | None = None
    own_altitudes: dict = field(default_factory=dict)
    altitude_starts: frozenset = frozenset()  # the Start At points (wingtip.own_altitude)
    drawn: list = field(default_factory=list)
    leave_runways: dict = field(default_factory=dict)
    land_runways: dict = field(default_factory=dict)
    wind_runways: bool = False
    ground: dict = field(default_factory=dict)
    holds: list = field(default_factory=list)
    checkpoints: bool = True
    alternate: dict | None = None


def departure_elevation(r) -> float | None:
    """The field the climb starts from, when the airports table knows
    it; a present position's own altitude, the GPS's, where it has one --
    a Direct-To in the air climbs from where the airplane is, not from the
    ground or level at the first leg's altitude; None starts the log level
    at the first leg's altitude -- as a hop out of a waypoint does, flown
    through at cruise.

    Never under the ground at the position (USGS 3DEP, wingtip.elevation: the
    first of the route's terrain samples, read already for its floor): a
    phone indoors gave its GPS altitude as 0 ft MSL where the ground is
    730 ft, and the log climbed from under it. Where the ground cannot be
    read, the GPS's altitude as it is."""
    if r.takes_off:
        return r.departure.get("elevation_ft")
    altitude_ft = r.dep_airport.get("altitude_ft")
    if altitude_ft is None:
        return None
    point = (r.dep_airport["lat"], r.dep_airport["lon"])
    try:
        ground_ft = elevation.get_elevations_m([point])[point] * M_TO_FT
    except Exception:  # noqa: BLE001 -- the ground unread is the GPS's word alone, not a failed plan
        return altitude_ft
    return max(altitude_ft, round(ground_ft))


@dataclass(frozen=True)
class Flown:
    """Legs to fly: the chosen plan's (`choice`), or at a pilot's own
    altitude (`choice` None), with the selection and the four plans
    beside them either way (`options`, each as the engine gives it with
    its `kind`). `legs` of a plan is the planner's cached list: read it,
    never change it. `by_hop`, a route with stops' legs hop by hop (one
    list for a route without), for each hop's totals."""

    selection: dict
    options: list
    choice: str | None
    altitude_ft: float
    legs: list
    by_hop: tuple = ()
    #: For each hop flown at a pilot's own altitude, what is wrong with it
    #: (own_altitude_caution).
    cautions: tuple = ()
    #: The route flown at each altitude the wheel offers (the planner's
    #: AltitudeFigure).
    figures: tuple = ()

    @property
    def hop_legs(self) -> list:
        return list(self.by_hop) or [self.legs]


@dataclass(frozen=True)
class Unflyable:
    """Some leg has no legal cruising altitude; the selection says why.
    `between`, the hop of a route with stops it is on."""

    selection: dict
    between: tuple[str, str] | None = None


@dataclass(frozen=True)
class NoWinds:
    """The winds the legs need could not be read. The selection -- and
    the plans, when it was only a pilot's own altitude that failed --
    still stand, and a caller can report them before the failure."""

    selection: dict
    options: list
    error: WeatherServiceError
    figures: tuple = ()


@dataclass(frozen=True)
class HopRun:
    """One hop's planning, as a route without stops is planned: its fixes,
    the winds forecast period and go/no-go window it is flown in, and the
    departure time its fuel reserve is judged by (None, as the route's,
    when none was given); and its legs flown along a procedure's path, whose
    ground its floor reads too (wingtip.procedure_legs.paths_by_hop); and
    the visits of its two ends, which a point's own altitude is kept by
    (wingtip.own_altitude.visits)."""

    hop: object
    fixes: list
    fcst_hr: str
    window: tuple
    depart: datetime | None
    paths: tuple = ()
    visits: tuple = (1, 1)


#: The time on the ground at a stop where the pilot gave none, min: a
#: turnaround -- taxi in, fuel, a break, taxi out -- at the owner's pick of
#: the audit's choices (2026-10-20), the engine's (planning_figures), which
#: the web asks too for the rows it draws before the nav log's legs say
#: each stop's (Leg.ground_min).
TURNAROUND_MIN = float(engine("planning_figures")["turnaround_min"])


def ground_min_at(ground: dict[str, float] | None, ident: str) -> float:
    """The minutes on the ground at the stop `ident`: the pilot's own
    (Asked.ground), else TURNAROUND_MIN. The one rule the hops' start
    times, the legs and the totals all go by."""
    return (ground or {}).get(ident.upper(), TURNAROUND_MIN)
