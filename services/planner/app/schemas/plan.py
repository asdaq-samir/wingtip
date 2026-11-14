"""The shapes app.routers.plan sends and takes, as Pydantic models."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from .aircraft_figures import DemonstratedCrosswind, DistanceTable, ShortField  # noqa: F401  (re-exported)
from .altitude_plans import AltitudeFigure, AltitudeOption, AltitudeStep  # noqa: F401  (re-exported)
from .common import AltitudeChoice, FlightRules, Hazard, Loading, SpecialUse, Wind

from .leg_points import TopOfClimb, TopOfDescent
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


class ChartSheet(BaseModel):
    """One sheet of an overlay chart kind and where it is: the map
    offers to pin the terminal area chart when the view is over one."""

    name: str
    label: str
    west: float
    south: float
    east: float
    north: float


class ChartLayer(BaseModel):
    """One kind of FAA chart the map can draw and the zooms it has
    tiles for: the sectional and the IFR enroute charts as base layers
    (`base`), the terminal area chart as an overlay."""

    kind: str
    label: str
    min_zoom: int
    max_zoom: int
    base: bool
    # For an overlay, the base kinds it belongs over.
    over: list[str] = []
    # For an overlay, its sheets and their extents.
    sheets: list[ChartSheet] = []
    # The cycle this kind is drawn from (wingtip.charts.serving_cycle_of) and
    # its tiles' revision there: each kind goes over to a new cycle as its
    # own pyramid is finished, so the map's tile URLs carry its own.
    cycle: str | None = None
    revision: int = 0
    # The pixel densities its tiles were drawn at there
    # (wingtip.charts.tile_scales): 1, the 256-pixel tiles, and 2 when
    # the same z/x/y also comes as a 512-pixel tile named {y}@2x.png,
    # which a 2x or 3x screen draws in its place.
    scales: list[int] = [1]


class ChartInfo(BaseModel):
    """Which chart the map draws and where its tiles are: the map with no
    route on it yet asks for this alone (/api/chart), and a Course
    carries it as well."""

    chart_layers: list[ChartLayer]
    # The zooms the sectional layer draws at. Each overlay's own are in
    # chart_layers.
    max_zoom: int
    min_zoom: int
    # The chart edition the tile endpoints are serving. The map puts it
    # in every tile URL, so a browser that cached tiles under the same
    # {z}/{x}/{y} from an earlier edition -- or from the hosted service
    # this app drew before, whose no-coverage checkerboard one phone
    # went on showing for a day -- asks afresh when it changes.
    chart_cycle: str
    # How many times tiles already served for that edition have been
    # rendered again (a sheet cleaned on disk): in the tile URL beside
    # the cycle for the same reason, since a re-render leaves {z}/{x}/{y}
    # and the cycle as they were.
    chart_revision: int = 0
    # Where the map fetches tiles from instead of this planner: a base URL
    # the map appends /<cycle>/<kind>/{z}/{x}/{y}.png to. Always None
    # since a pyramid is kept as one archive a kind (wingtip.tile_archive,
    # #535): the planner serves every tile, on AWS from the published
    # archive and through CloudFront's cache. Kept for the apps that read
    # it, which then ask this planner.
    chart_tiles_base: str | None = None


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


class MissedApproachPath(BaseModel):
    """An approach's missed approach as it is flown, from its missed
    approach point and round its hold once (wingtip.procedure_paths.missed_path),
    and the altitude it climbs to: the highest its fixes set."""

    path: list[list[float]]
    ft: float | None


class LegProcedure(BaseModel):
    """A leg flown by the procedures picked -- out by a departure, in by an
    arrival and an approach (wingtip.procedure_paths.flown) -- rather than as
    the route goes: its path from the leg's start, [lat, lon] pairs; the
    altitude the chart sets at each point (None where it sets none); its
    length; whether it comes down to a runway; where its final starts, the
    index in `path` of its final approach fix; where its missed approach
    point is, the index in `path` the missed approach is flown from (short
    of the runway's threshold, where the path ends, on a VOR's or a LOC's
    approach); and the approach's missed approach. The miles it is more than the leg's own, and the time and
    fuel they take at the leg's ground speed and cruise burn, are in the
    leg's `ete_min` and `fuel_gal` (wingtip.flight_plan.with_procedures);
    with no airplane, the time and fuel None."""

    path: list[list[float]]
    ft: list[float | None]
    nm: float
    landing: bool
    final_at: int | None = None
    map_at: int | None = None
    missed: MissedApproachPath | None = None
    more_nm: float
    more_min: float | None
    more_gal: float | None


class LegHold(BaseModel):
    """A hold the pilot put at a point of the route (wingtip.holds), on the
    leg that leaves it -- `at_end`, the leg into the destination it is
    held at: its inbound course (magnetic), its turns, its legs by time or
    distance, how long (turns, or minutes), the minutes and fuel it takes,
    already in the leg's `ete_min` and `fuel_gal` (plan.with_holds), one
    turn round its racetrack's minutes, the entry from the course flown to
    it (AIM 5-3-8), and that one turn as [lat, lon] pairs from the point."""

    fix: str
    inbound_deg: int
    right: bool
    leg_min: float | None
    leg_nm: float | None
    turns: int | None
    minutes: float
    lap_min: float
    gal: float
    entry: Literal["direct", "teardrop", "parallel"]
    path: list[list[float]]
    at_end: bool = False


class Leg(BaseModel):
    """One dead-reckoning leg. `wind` is None when no winds-aloft station
    is near enough, which is not the same as calm: groundspeed then falls
    back to true airspeed. groundspeed/ETE/fuel are None when the wind
    exceeds true airspeed, i.e. the leg cannot be flown.

    The true airspeed and fuel flow are the aeroplane's in the leg's own
    air (wingtip.performance): its cruise figures are at a reference
    altitude on a standard day, and the forecast temperature at this
    altitude gives the density altitude they are flown at, at the power
    it allows -- the cruise power, or less where full throttle cannot
    make it; `power_pct` None where the profile names no cruise power, its
    TAS and burn then as given. `oat_c` is None where no forecast
    temperature was near: a standard day is assumed there."""

    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    distance_nm: float
    altitude_ft: float
    true_course_deg: float
    wind: Wind | None
    wca_deg: float | None
    true_heading_deg: float | None
    magnetic_variation_deg: float
    magnetic_heading_deg: float | None
    # The true course less the variation (east is least, west is best,
    # FAA-H-8083-25C ch. 16), the engine's: what the map's Route Leg sheet shows.
    magnetic_course_deg: float
    groundspeed_kt: float | None
    ete_min: float | None
    fuel_gal: float | None
    tas_kt: float | None
    fuel_burn_gph: float | None
    power_pct: float | None
    oat_c: float | None = None
    density_altitude_ft: float | None
    # How much of the leg's time is climb -- from the field on the first
    # leg, and up to a new level where a plan steps -- flown at climb
    # speed and burn, and already in `ete_min` and `fuel_gal`.
    climb_min: float = 0.0
    # True where the leg has climb minutes and the airplane's profile gives
    # no climb fuel flow: the climb's gallons are not in `fuel_gal`, and the
    # app asks for the figure; no multiple of the cruise burn is assumed
    # (the owner's rule of 2026-11-09). None or False otherwise.
    climb_fuel_unknown: bool | None = None
    # The one phase the leg is flown in whole, the climb or the descent,
    # its figures then that phase's; None for the cruise or a leg cut by a
    # top of climb or descent (the engine's NavLogLeg `phase`).
    phase: Literal["climb", "descent"] | None = None
    # The top of the climb, on the leg it is reached on, and the top of
    # the descent, on the leg it starts on.
    toc: TopOfClimb | None = None
    tod: TopOfDescent | None = None
    # Flown by the procedures picked, the time and fuel of their miles
    # more already in `ete_min` and `fuel_gal` (plan.with_procedures).
    procedure: LegProcedure | None = None
    # A hold the pilot put at its start (or, into the destination, its
    # end), its time and fuel already in `ete_min` and `fuel_gal`.
    hold: LegHold | None = None
    # Into a stop the route lands at and leaves again: the minutes on the
    # ground there before the next leg (the pilot's own, else the
    # planner's TURNAROUND_MIN), not in `ete_min`. None on every other
    # leg.
    ground_min: float | None = None
    # Along an airway (wingtip.airways, the route's "BAE V191 OSH"): the
    # segment flown and its published altitudes, the MEA the floor under
    # IFR (14 CFR 91.177(a)(1)), for the nav log's route column as a paper
    # IFR log has one. None off an airway.
    airway: "AirwayAltitudes | None" = None


class AlternateLeg(BaseModel):
    """The leg from the destination on to the IFR alternate: flown at the
    route's last altitude in its winds, or in still air where they could
    not be read (`still_air`). With no airplane, its miles alone: the
    time and fuel None."""

    ident: str
    distance_nm: float
    ete_min: float | None
    fuel_gal: float | None
    altitude_ft: float
    still_air: bool = False


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


class AirspaceTransit(BaseModel):
    """Controlled airspace the route passes through: a radio call to
    make, not a ceiling constraint."""

    model_config = ConfigDict(populate_by_name=True)

    name: str
    class_: str = Field(alias="class")
    floor_ft_msl: float | None = None
    requires: str
    along_track_nm: float


class SpecialUseArea(SpecialUse):
    """One special-use area the route crosses."""

    along_track_nm: float
    #: The legs (between consecutive fixes) that cross it.
    legs: list[int] = []


class AltitudeSegment(BaseModel):
    """One leg's own band: its floor, the shelf and the clouds over it
    alone, and the legal cruising altitudes between -- what lets a plan
    step down under a Class B shelf and climb again past it."""

    from_nm: float
    to_nm: float
    floor_ft: float
    airspace_ceiling_ft: float | None
    #: The aeroplane's service ceiling over this leg in the forecast air
    #: (see AltitudeBreakdown's).
    service_ceiling_ft: float | None = None
    #: The lowest cloud base (MSL) the TAFs near this leg forecast for
    #: the flight, and the station: the leg keeps 14 CFR 91.155's
    #: distance below it, up to `cloud_ceiling_ft`. None where no
    #: station near it forecasts one.
    cloud_base_ft: float | None = None
    cloud_station: str | None = None
    cloud_ceiling_ft: float | None = None
    #: False where the clouds leave this leg no altitude: VFR is not
    #: possible there as forecast, and its altitudes are the band's
    #: without the clouds.
    cloud_clearance_kept: bool = True
    band_ceiling_ft: float | None
    #: This leg's own magnetic course and half of the hemispheric rule,
    #: which its legal altitudes are rounded to.
    course_magnetic_deg: float | None = None
    eastbound: bool | None = None
    #: Where the rule begins over this leg (see AltitudeBreakdown's).
    hemispheric_rule_from_ft: float | None = None
    candidates_ft: list[float]
    #: No 500 ft step fits under this leg's ceiling, and its one altitude
    #: is the highest whole hundred under it that clears the floor (1,800
    #: ft under a 1,900 ft shelf): legal, but tight (wingtip.altitude).
    tight: bool = False
    #: What the floor is from: the ground or the DOF obstacle it rests on
    #: and its height MSL, and the clearance over it. Under IFR (wingtip.ifr,
    #: 14 CFR 91.177(a)(2)) the highest within 4 nm of the leg's course,
    #: whether the leg is over a mountainous area (Part 95), and 2,000 ft
    #: there, 1,000 elsewhere. Under VFR (wingtip.terrain, 14 CFR 91.119) the
    #: one whose top and clearance are highest: 1,000 ft over or within
    #: 2,000 ft of a congested area (91.119(b)), 500 ft elsewhere (91.119(c)):
    #: 91.119's own minimum, which a caution measures a pilot's altitude
    #: against. The VFR floor is at or above it, the ground taking the
    #: planner's 1,000 ft everywhere.
    highest_ft: float | None = None
    highest_is_obstacle: bool | None = None
    mountainous: bool | None = None
    obstacle_clearance_ft: float | None = None
    #: Under VFR, the DOF obstacle's type where the floor rests on one
    #: (TOWER, BLDG ...), as the FAA writes it.
    obstacle_type: str | None = None
    #: Under VFR, whether the clearance is 91.119(b)'s for a congested area
    #: (the Census urban areas and places, wingtip.congested); None where the
    #: towns could not be read and it took the 1,000 ft anyway.
    congested: bool | None = None
    #: Under IFR along an airway (wingtip.airways): the segment's published
    #: altitudes, its MEA the floor (14 CFR 91.177(a)(1)) and its MAA a
    #: ceiling.
    airway: "AirwayAltitudes | None" = None


class AirwayAltitudes(BaseModel):
    """An airway segment's published altitudes, feet MSL (NASR AWY_SEG_ALT):
    the MEA, the GNSS MEA, the MOCA and the MAA; `from_` the fix it starts
    at."""

    id: str
    from_: str = Field(alias="from")
    mea_ft: float | None = None
    gnss_mea_ft: float | None = None
    moca_ft: float | None = None
    maa_ft: float | None = None

    model_config = ConfigDict(populate_by_name=True)


class AltitudeCaution(BaseModel):
    """An altitude the pilot set for a hop (`from_ident` to `to_ident`) and
    what is wrong with it against the planner's band there
    (wingtip.planning.own_altitude_caution): a warning, not a refusal."""

    from_ident: str
    to_ident: str
    altitude_ft: float
    reasons: list[str]


class AltitudeBreakdown(BaseModel):
    """The full reasoning behind one recommended cruise altitude.
    `low_ceiling_or_visibility` is None, not False, when the forecast
    call itself failed: unknown must not read as confirmed fine.
    `candidates_ft` are every legal altitude for the whole route;
    `segments` the same leg by leg, present when the nav log's fixes
    were known."""

    #: The rules it was chosen under: "vfr", or "ifr" -- 14 CFR 91.177's
    #: minimum IFR altitudes for its floors, 91.179(b)'s thousands by
    #: direction of flight, no Class B, cloud or Class A ceiling (wingtip.ifr).
    rules: FlightRules = "vfr"
    recommended_ft: float | None
    candidates_ft: list[float] = []
    # The magnetic course the hemispheric rule was applied to, and which
    # half of the rule that is: 000-179 flies odd thousands plus 500,
    # 180-359 even thousands plus 500.
    course_magnetic_deg: float
    eastbound: bool
    #: 14 CFR 91.159 applies only more than 3,000 ft above the surface:
    #: this is 3,000 ft over the lowest ground on the route, and below it
    #: every 500 ft is legal as well as the rule's altitudes.
    hemispheric_rule_from_ft: float | None = None
    floor_ft: float
    airspace_ceiling_ft: float | None
    #: Planned with a Class B clearance: its shelves are no ceiling, and
    #: its transits still say it takes one.
    class_b_cleared: bool = False
    #: The aeroplane's service ceiling where it is in the forecast air,
    #: the lowest over any leg: a service ceiling is a density altitude
    #: (the profile's `service_ceiling_ft`, the book figure), so a warm
    #: day brings it down and a cold one lifts it. The book figure where
    #: the temperatures aloft could not be read.
    service_ceiling_ft: float | None = None
    #: The lowest forecast cloud base (MSL) along the route, and the TAF
    #: station it is from; `cloud_ceiling_ft` is the highest altitude
    #: that keeps 14 CFR 91.155's distance below it (500 ft, 1,000 ft at
    #: 10,000 and above), which the band keeps under.
    cloud_base_ft: float | None = None
    cloud_station: str | None = None
    cloud_ceiling_ft: float | None = None
    #: False where the clouds leave the route, or a leg of it, no
    #: altitude: those altitudes are the band's without the clouds.
    cloud_clearance_kept: bool = True
    airspace_transits: list[AirspaceTransit]
    #: Prohibited and restricted areas, MOAs and the like the legs cross
    #: (wingtip.sua); no candidate altitude enters a prohibited one.
    special_use: list[SpecialUseArea] = []
    freezing_level_ft: float | None
    #: The freezing level is at or below `freezing_level_ft`: it was
    #: already below 0 degC at the lowest altitude the forecast reports.
    freezing_level_at_or_below: bool = False
    #: A legal altitude reaches the freezing level and cloud or an icing
    #: AIRMET/SIGMET is forecast along the route. None where the freezing
    #: level could not be checked.
    icing_possible: bool | None = None
    band_ceiling_ft: float | None
    min_ceiling_ft: float | None
    min_visibility_sm: float | None
    hazards: list[Hazard]
    low_ceiling_or_visibility: bool | None
    weather_unavailable: list[Literal["freezing_level", "ceiling_visibility", "hazards", "special_use"]] = []
    segments: list[AltitudeSegment] = []
    #: Under IFR, some leg is over a designated mountainous area (14 CFR
    #: Part 95): its floor is 2,000 ft over the obstacles, not 1,000.
    mountainous: bool = False


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
    #: With the Class B clearance, the waypoints that keep the route out
    #: of the Class B it enters (Detour, best first): "Avoid Class B".
    class_b_detours: list["Detour"] = []
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


class NavLogStage(BaseModel):
    type: Literal["stage"] = "stage"
    detail: str


class Detour(BaseModel):
    """A named fix that keeps a route out of the Class B airspace it is
    stopped by (wingtip.airspace.detour_waypoint), and where it goes in the
    stops: before the stop at `stop_index`, so on the hop it is for."""

    ident: str
    #: What it is to a pilot: "VFR waypoint", "GPS waypoint" (wingtip.fixes).
    kind: str
    #: How much longer the route is through it.
    added_nm: float
    stop_index: int
    #: Where it is: "in Downers Grove" (wingtip.places).
    description: str | None = None
    #: A way round high ground the airplane cannot climb over
    #: (wingtip.terrain_detour): every point to fly by, in order, the first of
    #: them `ident`; empty for a Class B's one waypoint.
    via: list[str] = []


class NavLogError(BaseModel):
    """The stream's failure. `retry` False where asking again gets the
    same answer -- a route with no legal altitude -- so the page offers
    no Try again for it. For that one `detail` is the headline, and
    `reasons` and `advice` say why and what to do: the page lists them in
    the nav log (wingtip.planning.no_altitude)."""

    type: Literal["error"] = "error"
    detail: str
    retry: bool = True
    #: The whole of it in a few words, for the one line under the route:
    #: "Aircraft ceiling restricts mountainous flying".
    brief: str | None = None
    reasons: list[str] = []
    advice: str | None = None
    #: Class B airspace is what leaves no altitude: the page offers to
    #: plan it with a clearance (`class_b_clearance`), or to fly via a
    #: waypoint, `detours` the ones that keep the route out of it, best
    #: first.
    class_b: bool = False
    detours: list[Detour] = []


class NavLogAltitude(BaseModel):
    """Which altitudes the legs that follow fly. `flown` is the planner's
    plan of that name, or "custom" for a pilot's own altitude; None when
    the winds the legs need could not be read, so no leg follows -- the
    stream's next line is the error. `altitude_ft` is the first leg's (a
    plan may step), and None exactly when `flown` is. `options` are the
    four plans, offered beside a pilot's own as well; empty only when the
    winds failed before they could be made.

    It used to say all of that with `choice: null` and an empty `options`,
    which a winds outage produced too: the page showed "0 ft · yours",
    with Custom pressed, for an altitude nobody typed."""

    type: Literal["altitude"] = "altitude"
    flown: AltitudeChoice | Literal["custom"] | None
    altitude_ft: float | None
    altitude_selection: AltitudeBreakdown
    options: list[AltitudeOption] = []
    #: None with no airplane picked (aircraft=none).
    aircraft: AircraftProfile | None
    #: The altitudes the pilot set that the planner would not have flown,
    #: and why (AltitudeCaution); none for the planner's own plans.
    cautions: list[AltitudeCaution] = []
    #: With the Class B clearance, the waypoints that keep the route out
    #: of the Class B it enters (Detour, best first): "Avoid Class B".
    class_b_detours: list["Detour"] = []
    #: The route flown at each altitude any leg may fly (AltitudeFigure),
    #: lowest first: the altitude wheel's figures.
    altitude_figures: list[AltitudeFigure] = []


class NavLogLeg(Leg):
    type: Literal["leg"] = "leg"


class NavLogDone(BaseModel):
    type: Literal["done"] = "done"
    totals: Totals


NavLogMessage = Annotated[NavLogStage | NavLogError | NavLogAltitude | NavLogLeg | NavLogDone, Field(discriminator="type")]


class RouteChecked(BaseModel):
    """A route that would plan (GET /api/route-check): its stops as the
    planner reads them."""

    stops: list[str]
