"""The shapes app.routers.route_options sends and takes, as Pydantic models."""

from typing import Literal

from pydantic import BaseModel


class RouteHazard(BaseModel):
    """What a way keeps clear of or is told of (wingtip.route_options): its
    kind -- storm, weather, marginal, sigmet, tfr, prohibited, terrain,
    fuel, or a special-use area a way is flown through and stays open
    across (restricted, moa, warning, alert; AIM 3-4-3 to 3-4-6) -- and its
    words ("Restricted area R-2508")."""

    kind: str
    name: str


class RouteBand(BaseModel):
    """A run of the weather a way meets (the engine's route_options): VFR,
    marginal (MVFR), IFR or a thunderstorm, and how many minutes of the
    flight it lasts, in the order flown."""

    kind: Literal["vfr", "mvfr", "ifr", "storm"]
    min: float


class RouteAlong(BaseModel):
    """What a way meets along it: its weather strip, its mean wind (kt,
    a tailwind positive) and its floor (ft, the highest ground with
    14 CFR 91.119's 1,000 ft)."""

    bands: list[RouteBand]
    tail_kt: float
    floor_ft: int
    #: Its miles out of a glide's reach of dry land (wingtip.water).
    water_nm: int = 0


class RouteOption(BaseModel):
    """One way to fly the route (wingtip.route_options): the points between
    its ends in order, as the address's `stops` takes them -- turns as the
    pilot's own points off a fix, fuel stops as fields (`fuel`) -- and the
    kinds of way it is the best of, with its estimate of the flight. The
    hazards it still crosses and the marginal weather it passes, by their
    index in RouteOptions.hazards."""

    kind: Literal["fastest", "weather", "stops", "land", "own"]
    kinds: list[Literal["fastest", "weather", "stops", "land", "own"]]
    title: str
    stops: list[str]
    fuel: list[str]
    #: The fuel stops with somewhere to eat on the field or a walk from it.
    food: list[str] = []
    path: list[list[float]]
    distance_nm: float
    #: Minutes in the air and the fuel burnt: None with no airplane picked,
    #: which they need.
    air_min: float | None
    ground_min: float
    fuel_gal: float | None
    landings: int
    crosses: list[int]
    marginal: list[int]
    #: The card's one warning, the worst the way crosses, in the engine's
    #: words ("Crosses a restricted area": 14 CFR 91.133(a), AIM 3-4-3;
    #: "Crosses a MOA" ...); None where it crosses nothing.
    warning: str | None = None
    bands: list[RouteBand] = []
    tail_kt: float = 0.0
    floor_ft: int = 0
    water_nm: int = 0


class RouteChip(BaseModel):
    """One choice on FPL's route line (the owner's redesign, 2026-10-26:
    the route folding as a runway line does, a chip a way): its `key`
    ("none" the route as typed, "fuel" it with its fuel stops, else the
    way's kind), the words on it -- the way's name and the stops it adds
    -- the stops and fuel stops it puts in the address, and the hazards
    it crosses by their index in RouteOptions.hazards."""

    key: str
    label: str
    stops: list[str]
    fuel: list[str]
    crosses: list[int] = []


class RouteOptions(BaseModel):
    """The ways to fly a route, the fastest first; what the straight line
    crosses (`direct`), what is at its ends (`ends`) and what the pilot's
    own route crosses and passes (`current`, `current_marginal`), by index
    in `hazards`; and what could not be read or is not known now
    (`unchecked`, the engine's words: "terrain", "TFRs", "service ceiling",
    "start and taxi fuel" ...)."""

    options: list[RouteOption]
    #: The pilot's own route with the fuel stops it needs put in; None
    #: where no chain of fields reaches.
    own: RouteOption | None = None
    direct: list[int]
    ends: list[int]
    current: list[int] = []
    current_marginal: list[int] = []
    current_along: RouteAlong | None = None
    #: The pilot's own route, [[lat, lon]] end to end, for the map.
    current_path: list[list[float]] = []
    #: FPL's route line, in its order, "As typed" first; empty where there is
    #: nothing but the route itself to offer. Web and the native app both
    #: read their words from here.
    chips: list[RouteChip] = []
    hazards: list[RouteHazard]
    unchecked: list[str]
