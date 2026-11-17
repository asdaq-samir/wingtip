"""The shapes app.routers.plan sends and takes, as Pydantic models."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from .aircraft_figures import DemonstratedCrosswind, DistanceTable, ShortField  # noqa: F401  (re-exported)
from .altitude_breakdown import AltitudeBreakdown, AltitudeCaution
from .altitude_plans import AltitudeFigure, AltitudeOption, AltitudeStep  # noqa: F401  (re-exported)
from .common import AltitudeChoice, FlightRules, Loading
from .plan_chart import ChartInfo, ChartLayer, ChartSheet  # noqa: F401  (the chart, its own file)
from .plan_legs import AlternateLeg, Leg
from .route_profile import ProfileAirspace, ProfileGround, ProfileObstacle, RouteProfile  # noqa: F401  (the side view, its own file)
from .winds_period import WindsPeriod


class AirportEnd(BaseModel):
    """A point of the route: an airport, or -- a stop only -- a named fix
    flown through (`kind` "fix": a VFR or GPS waypoint, its `name` the
    kind of fix it is, no elevation)."""

    ident: str
    name: str
    lat: float
    lon: float
    elevation_ft: float | None = None
    kind: Literal["airport", "fix"] = "airport"
    #: An airport's: the class of the airspace at its surface, as its card
    #: has it (wingtip.airspace.surface_class_at) -- for the route's points to
    #: be drawn in their airspace's look the moment the course is in,
    #: where each was a card's whole lookup (its METAR among it) behind
    #: the plan being made.
    airspace_class: Literal["B", "C", "D", "E", "G"] | None = None
    #: An airport's traffic pattern altitude above sea level, to the nearest
    #: hundred feet (the TPA the FAA publishes, else 1,000 ft over the
    #: field): what the route's box offers as the altitude there.
    pattern_altitude_ft: float | None = None


class Course(ChartInfo):
    """The course: the departure, the stops it lands at on the way (in
    order; none for a route flown straight), the destination, the whole
    distance stop by stop, the bearing out of the departure, and the line
    through every stop."""

    departure: AirportEnd
    destination: AirportEnd
    stops: list[AirportEnd] = []
    distance_nm: float
    bearing_deg: float
    course_line: list[tuple[float, float]]
    #: Whether the chart along every hop is read already, so its
    #: checkpoints, and the nav log through them, are a moment away: the
    #: web app asks for the route as entered beside them only where they
    #: are not.
    checkpoints_ready: bool = False


class Candidate(BaseModel):
    """A scored detection off the chart (app.checkpoint_scoring): `id` its kind and
    place, `name` the FAA's for an airport and the kind of thing for
    the rest. `selected` is set by the server's greedy pass."""

    id: str
    name: str | None = None
    category: str
    lat: float
    lon: float
    predicted_score: float
    along_track_nm: float
    selected: bool
    #: Which hop of a route with stops it is on, from 0 (app.router_basics.Route).
    hop: int = 0
    #: A selected checkpoint's waypoint name in the route's ForeFlight pack
    #: (app.foreflight.waypoint_names: LAKE_ZURICH), for a flight plan to
    #: name it by; None for a candidate not selected.
    waypoint: str | None = None


class Checkpoints(BaseModel):
    """Every hop's candidates and selected checkpoints in order along the
    whole route (app.checkpoint_scoring.route_checkpoints), its along-track
    distances running on through each stop."""

    departure: AirportEnd
    destination: AirportEnd
    stops: list[AirportEnd] = []
    candidates: list[Candidate]
    selected: list[Candidate]


class Totals(BaseModel):
    """The trip's sums, and the fuel check: the legs' fuel plus the VFR
    reserve (30 minutes by day, 45 at night -- `night` is None when no
    departure time said which) against the aeroplane's usable fuel,
    when it has one. `fuel_margin_gal` below zero is a flight the tanks
    do not hold."""

    distance_nm: float
    #: The miles the procedures picked add to the route's, flown in place
    #: of its legs (plan.with_procedures): in `distance_nm`, and their time
    #: and fuel in `ete_min` and `fuel_gal`.
    procedure_nm: float = 0.0
    ete_min: float | None
    fuel_gal: float | None
    unflyable_legs: int
    legs_without_wind: int
    reserve_min: float | None = None
    reserve_gal: float | None = None
    #: Start, taxi and takeoff, included in fuel_required_gal.
    taxi_gal: float | None = None
    fuel_required_gal: float | None = None
    usable_fuel_gal: float | None = None
    fuel_margin_gal: float | None = None
    night: bool | None = None
    #: Whether any of the flight is in 14 CFR 61.57(b)'s night-passenger
    #: period (1 hour after sunset to 1 hour before sunrise), its own
    #: window rather than 1.1's night, for the night-currency caution.
    night_passengers: bool | None = None
    #: The rules the reserve is under: IFR's 45 minutes day or night
    #: (14 CFR 91.167(a)(3)), VFR's 30 by day and 45 at night (91.151).
    rules: FlightRules = "vfr"
    #: Under IFR with an alternate filed: the leg on to it, whose fuel is
    #: in `fuel_required_gal` before the reserve (14 CFR 91.167(a)(2)).
    alternate: "AlternateLeg | None" = None
    #: A route with stops: each flight between two landings with its own
    #: fuel check, the tanks filled at each stop -- the route's own fuel
    #: figures are None then (wingtip.planning.route_totals). Empty without.
    hops: list["HopTotals"] = []
    #: Where a flight the tanks do not hold could land for fuel
    #: (wingtip.fuelstops), one entry a flight short of fuel; empty where every
    #: flight's fuel check passes.
    fuel_stops: list["FuelStopSuggestion"] = []
    #: Minutes on the ground at the route's stops (PlanQuery.ground), not in
    #: `ete_min`: the destination's arrival is `ete_min` and this after the
    #: departure. 0 without stops.
    ground_min: float = 0.0
    #: When the plan was made, ISO UTC.
    planned_at: str | None = None
    #: The period of the winds-aloft forecast the legs fly (a route with
    #: stops, its first flight's; each hop has its own): None where it
    #: could not be read.
    winds: WindsPeriod | None = None


class FuelStop(BaseModel):
    """A field with the airplane's fuel a flight can land at for it, with
    its reserve left (wingtip.fuelstops)."""

    ident: str
    name: str
    city: str
    lat: float
    lon: float
    #: Miles from the flight's departure to it, and the miles it adds to
    #: the flight's straight line.
    from_nm: float
    added_nm: float
    #: The fuel left on landing there, gallons.
    lands_with_gal: float
    #: Minutes flown to it from the flight's departure.
    minutes: float
    #: What fuel it sells, as the FAA lists it ("100LL,A").
    fuel_types: str
    #: Its longest paved runway, feet.
    runway_ft: int
    elevation_ft: float | None = None


class FuelStopSuggestion(BaseModel):
    """The stops that take one flight short of fuel to its destination with
    the reserve left at every landing, the tanks filled at each, and other
    fields the first could be. `reason` is "fuel": breaks for a meal or a
    rest are the pilot's to pick from the map's Stops."""

    departure: str
    destination: str
    #: The tanks' usable fuel, gallons, each stop's landing measured against.
    usable_gal: float
    reason: Literal["fuel", "break"] = "fuel"
    stops: list[FuelStop]
    choices: list[FuelStop] = []


class HopTotals(BaseModel):
    """One flight between two landings of a route with stops."""

    departure: str
    destination: str
    totals: Totals


Totals.model_rebuild()


class AircraftProfile(BaseModel):
    """The aircraft's name plus its performance profile -- every field a
    data/aircraft/*.json file carries, declared, so a page reads them as
    fields rather than guessing at a dict. The three figures after the
    name are required when a stock profile is loaded (REQUIRED_FIELDS in
    wingtip.aircraft); a pilot's own airplane of no stock type ("own",
    wingtip.aircraft.OWN_AIRPLANE) has its record's alone, and no service
    ceiling where the record gives none. A figure left out is missing,
    and each rule that needs it says so. `extra="allow"` keeps a field a
    newer profile adds on its way through."""

    model_config = ConfigDict(extra="allow")

    name: str
    cruise_tas_kt: float
    fuel_burn_gph: float
    service_ceiling_ft: float | None = None
    #: Its start, taxi and takeoff fuel, gal, its POH's (or its pilot's
    #: own); None where it has none, and none is then counted.
    taxi_fuel_gal: float | None = None
    type: str | None = None
    #: Its type designator as FAA Order JO 7360.1 lists it, what a flight
    #: plan's item 9 takes: C172 for the Cessna 172, P28A for the PA-28s
    #: from the -140 to the -181.
    designator: str | None = None
    #: The power `cruise_tas_kt` and `fuel_burn_gph` are at, in percent,
    #: at wingtip.performance's reference altitude on a standard day. None:
    #: no power model, its TAS and burn as given at every altitude and no
    #: other airplane's power assumed (the engine's performance_cruise).
    cruise_power_pct: float | None = None
    climb_rate_fpm_sea_level: float | None = None
    climb_tas_kt: float | None = None
    climb_fuel_burn_gph: float | None = None
    #: The descent's indicated airspeed (kt) and fuel flow (gal/h), as a
    #: handbook gives them; the nav log flies the descent on them.
    descent_ias_kt: float | None = None
    descent_fuel_burn_gph: float | None = None
    usable_fuel_gal: float | None = None
    supplemental_oxygen: bool | None = None
    pressurized: bool | None = None
    # Its POH's loading and short-field distances, where the profile has
    # them (the Cessna 172S's).
    loading: Loading | None = None
    takeoff: ShortField | None = None
    landing: ShortField | None = None
    crosswind: DemonstratedCrosswind | None = None


class Plan(BaseModel):
    departure: AirportEnd
    destination: AirportEnd
    stops: list[AirportEnd] = []
    distance_nm: float
    course_line: list[tuple[float, float]]
    candidates: list[Candidate]
    selected: list[Candidate]
    legs: list[Leg]
    totals: Totals
    altitude_ft: float
    altitude_selection: AltitudeBreakdown | None
    altitude_options: list[AltitudeOption] = []
    altitude_choice: AltitudeChoice | None = None
    #: As the nav log stream's (NavLogAltitude.cautions).
    altitude_cautions: list[AltitudeCaution] = []
    #: Flown at no legal altitude (altitude_anyway), the way round the
    #: high ground that stops each hop, for the pilot to take or not
    #: (Detour); none for a pilot's own altitude.
    detours: list["Detour"] = []
    #: The route flown at each altitude any leg may fly (AltitudeFigure),
    #: lowest first: the altitude wheel's figures.
    altitude_figures: list[AltitudeFigure] = []
    #: None with no airplane picked (aircraft=none).
    aircraft: AircraftProfile | None
    max_zoom: int
    min_zoom: int
    chart_cycle: str
    chart_revision: int = 0
    chart_tiles_base: str | None = None
    chart_layers: list[ChartLayer]


class Detour(BaseModel):
    """A way round the high ground that leaves a route no altitude
    (wingtip.terrain_detour), and where it goes in the stops: before the
    stop at `stop_index`, so on the hop it is for."""

    ident: str
    #: What it is to a pilot: "VFR waypoint", "GPS waypoint" (wingtip.fixes).
    kind: str
    #: How much longer the route is through it.
    added_nm: float
    stop_index: int
    #: Where it is: "in Downers Grove" (wingtip.places).
    description: str | None = None
    #: Every point to fly by, in order, the first of them `ident`.
    via: list[str] = []


class RouteChecked(BaseModel):
    """A route that would plan (GET /api/route-check): its stops as the
    planner reads them."""

    stops: list[str]
