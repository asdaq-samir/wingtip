"""The shapes more than one router sends or takes, and those app.main,
app.figures.schemas and app.gonogo.schemas build on, as Pydantic models.
A model one router alone uses lives in that router's module here."""

from typing import Literal

from pydantic import BaseModel


#: The flight rules a route is planned under: VFR, or IFR (wingtip.ifr).
FlightRules = Literal["vfr", "ifr"]


class Wind(BaseModel):
    wind_dir_true_deg: float
    wind_speed_kt: float


class OnRoute(BaseModel):
    """Where and when the flight meets a hazard (app.exposure): the legs
    it is on (0-based, Briefing.leg_fixes' -- the nav log's where the
    page sent them), from how far along to how far (nm from the
    departure), when the airplane gets there and leaves (ISO 8601 UTC),
    and the hazard's own times -- valid from and to, and when it was
    issued (a pilot report's, when it was made; a METAR's, when it was
    observed). `when` is whether the airplane is in it while it is
    valid, give or take half an hour; None for one with no valid times
    (a pilot report, a report or forecast for a field)."""

    legs: list[int]
    from_nm: float
    to_nm: float
    enter: str | None = None
    leave: str | None = None
    valid_from: str | None = None
    valid_to: str | None = None
    when: Literal["during", "before", "after"] | None = None
    source: Literal["SIGMET", "Convective SIGMET", "AIRMET", "G-AIRMET", "TFR", "PIREP", "METAR", "TAF"]
    issued: str | None = None


class Hazard(BaseModel):
    """A SIGMET/AIRMET whose polygon the route line crosses; in the
    briefing, with where and when the flight meets it."""

    hazard: str | None = None
    type: str | None = None
    altitude_low_ft: float | None = None
    altitude_high_ft: float | None = None
    raw: str | None = None
    on_route: OnRoute | None = None


class SpecialUse(BaseModel):
    """One special-use area, as the FAA publishes it."""

    name: str
    #: P, R, MOA, W, A or D.
    type: str
    kind: str
    floor_ft: float | None = None
    #: SFC, MSL or AGL.
    floor_ref: str | None = None
    ceiling_ft: float | None = None
    ceiling_ref: str | None = None
    times_of_use: str | None = None
    #: The IANA zone its times of use are written in (wingtip.sua.time_zone,
    #: from the FAA's GMTOFFSET and DST_CODE); None where the FAA gives none.
    time_zone: str | None = None
    controlling_agency: str | None = None


AltitudeChoice = Literal["lowest", "highest", "fastest", "economical"]


class LoadingStation(BaseModel):
    name: str
    arm_in: float
    max_lb: float | None = None


class Loading(BaseModel):
    """How the aeroplane is loaded (its POH's weight and balance): the
    weight limits, a sample empty weight and moment (each aeroplane's own
    is on its weight and balance record), the stations and their arms,
    the fuel's, and the centre-of-gravity envelope as (arm, weight)
    corners."""

    source: str
    max_ramp_lb: float
    max_takeoff_lb: float
    max_landing_lb: float
    sample_empty_weight_lb: float
    sample_empty_moment_lb_in: float
    stations: list[LoadingStation]
    baggage_combined_max_lb: float | None = None
    fuel_arm_in: float
    fuel_max_gal: float
    fuel_lb_per_gal: float = 6.0
    start_taxi_fuel_lb: float = 0.0
    envelope: list[tuple[float, float]]


class ForecastStation(BaseModel):
    """A TAF station near the route: the worst it forecasts over the
    whole flight (`ceiling_ft`, `visibility_sm`, the go/no-go read), and
    -- placed along the route -- when the flight gets there and the worst
    it forecasts within an hour of then, with the TAF as issued."""

    icaoId: str
    ceiling_ft: float | None
    visibility_sm: float | None
    #: A ceiling forecast with no height ("OVC///") over the flight: the
    #: worst ceiling is not known, whatever `ceiling_ft` says (14 CFR 1.1).
    ceiling_unknown: bool = False
    lat: float | None = None
    lon: float | None = None
    along_track_nm: float | None = None
    #: When the flight gets there, ISO 8601 UTC: the flight's share of its
    #: time at that distance along.
    eta: str | None = None
    eta_ceiling_ft: float | None = None
    eta_ceiling_unknown: bool = False
    eta_visibility_sm: float | None = None
    raw: str | None = None


class Forecast(BaseModel):
    min_ceiling_ft: float | None
    min_visibility_sm: float | None
    #: The stations forecasting a ceiling with no height: the worst
    #: ceiling along the route is not known there.
    ceiling_unknown_at: list[str] = []
    stations: list[ForecastStation]


class Metar(BaseModel):
    raw: str | None = None
    #: When the station made the report (ISO 8601, UTC).
    observed_at: str | None = None
    flight_category: str | None = None
    ceiling_ft: float | None = None
    #: The lowest broken or overcast layer was reported with no height
    #: ("OVC///"): the ceiling is not known, not absent (14 CFR 1.1).
    ceiling_unknown: bool = False
    visibility_sm: float | None = None
    visibility_plus: bool = False  # at least visibility_sm: P6SM, the AWC's "10+" (awc_metars_read)
    wind_dir_true_deg: float | None = None
    wind_speed_kt: float | None = None
    wind_gust_kt: float | None = None
    altimeter_in_hg: float | None = None
    temp_c: float | None = None
    dewpoint_c: float | None = None


class RunwayWind(BaseModel):
    """The reported wind on the end of a runway it favours, the one with
    the most headwind (wingtip.runway_wind): the headwind negative for a
    tailwind, the crosswind positive from the right, and the crosswind
    in the gusts where the report has them."""

    end: str
    headwind_kt: float
    crosswind_kt: float
    gust_crosswind_kt: float | None = None
    #: Calm now: True where `end` is the one the field's last wind
    #: favoured, the runway in use (wingtip.runway_wind.favoured_end).
    in_use: bool | None = None


class RunwayEnd(BaseModel):
    """One end of a runway (wingtip.pattern): its true heading, None for a
    helipad, which way its traffic pattern is flown -- left unless the FAA
    flags it right (14 CFR 91.126(b)(1)) -- and where it is."""

    ident: str
    heading_true_deg: float | None = None
    traffic: Literal["left", "right"] = "left"
    #: Where it is, for the card's sketch of the field's runways: NASR's
    #: surveyed threshold, else OurAirports'; None where neither has it.
    lat: float | None = None
    lon: float | None = None


class RunwayTurf(BaseModel):
    """A length of a runway of two surfaces that is turf, where the FAA's
    remarks say which (wingtip.remarks.runway_turf): from `from_ft` to `to_ft`
    feet along it from its `end`, `to_ft` None for the rest of it."""

    end: str
    from_ft: int
    to_ft: int | None = None


class Runway(BaseModel):
    ends: str | None
    length_ft: int | None
    width_ft: int | None
    surface: str | None
    lighted: bool
    closed: bool
    #: The current METAR's wind on the end it favours; None without a
    #: report, with a variable wind, or for a helipad.
    wind: RunwayWind | None = None
    runway_ends: list[RunwayEnd] = []
    #: Its turf, where it is partly paved and the remarks say where: C81's
    #: 06/24, the south-west 1,000 ft. None said for a runway of one
    #: surface, whose `surface` says it.
    turf: list[RunwayTurf] = []


class TrafficPattern(BaseModel):
    """How high a field's traffic pattern is flown (wingtip.pattern):
    `agl_ft` above the field, the FAA's own where `published`, else AC
    90-66C's 1,000 ft for a propeller aeroplane; `altitude_ft` above sea
    level where the field's elevation is known."""

    agl_ft: float
    altitude_ft: float | None = None
    published: bool = False


class Frequency(BaseModel):
    type: str | None = None
    description: str | None = None
    frequency_mhz: float | None = None


class AirportFacilities(BaseModel):
    #: The airport's name, for what a pilot calls its tower or its
    #: traffic, its elevation, and the class of the airspace at its
    #: surface (wingtip.airspace.surface_class_at).
    name: str | None = None
    elevation_ft: float | None = None
    airspace_class: Literal["B", "C", "D", "E", "G"] | None = None
    pattern: TrafficPattern | None = None
    runways: list[Runway]
    # The FAA's airport diagram and Chart Supplement page (wingtip.publications),
    # and the d-TPP cycle to ask for the diagram's picture by
    # (/api/airport-diagram/{cycle}/{ident}.png).
    airport_diagram_url: str | None = None
    airport_diagram_cycle: str | None = None
    chart_supplement_url: str | None = None
    frequencies: list[Frequency]


class TfrInfo(BaseModel):
    """A temporary flight restriction (wingtip.tfr): its NOTAM, the site's
    title and kind, when it is in force (UTC; `expires` None until further
    notice), the rule it is issued under, why, and how high it reaches --
    the lowest floor and highest ceiling of its areas, MSL or AGL."""

    notam_id: str
    title: str | None = None
    kind: str | None = None
    state: str | None = None
    effective: str | None = None
    expires: str | None = None
    rule: str | None = None
    purpose: str | None = None
    floor_ft: float | None = None
    floor_ref: Literal["MSL", "AGL"] | None = None
    ceiling_ft: float | None = None
    ceiling_ref: Literal["MSL", "AGL"] | None = None


class RouteTfr(TfrInfo):
    """A TFR within a few miles of the route and in force at some time
    during the flight: how far along the route it is, whether the route
    goes through it, and whether it is in force now."""

    along_track_nm: float
    crosses: bool
    active_now: bool
    on_route: OnRoute | None = None


class Pirep(BaseModel):
    """A pilot report near the route (wingtip.weather.pireps_along_route):
    when, how high, in what, the turbulence and icing it reports (the
    intensity, as reported: "LGT", "MOD", "NEG"), and its own words."""

    observed_at: str | None = None
    altitude_ft: float | None = None
    aircraft: str | None = None
    urgent: bool = False
    turbulence: str | None = None
    icing: str | None = None
    raw: str | None = None
    along_track_nm: float
    on_route: OnRoute | None = None


class GAirmet(BaseModel):
    """A G-AIRMET the route crosses during the flight
    (app.exposure.gairmets): the hazard in words, its severity
    and cause, the time its snapshot is valid at, and its altitudes --
    `from_freezing_level` where it starts there."""

    hazard: str
    severity: str | None = None
    due_to: str | None = None
    valid_at: str | None = None
    #: When the G-AIRMET was issued, as aviationweather.gov gives it.
    issued: str | None = None
    altitude_low_ft: float | None = None
    from_freezing_level: bool = False
    altitude_high_ft: float | None = None
    on_route: OnRoute | None = None


class FieldBelowVfr(BaseModel):
    """A field whose weather is below VFR where the flight meets it
    (app.exposure.fields_below_vfr): an airport flown from or to whose
    METAR reports IFR or LIFR now, or a TAF station along the route
    forecast under 14 CFR 91.155's basic minimums for when the airplane
    is there, with the ceiling and visibility that put it there."""

    ident: str
    source: Literal["METAR", "TAF"]
    flight_category: str | None = None
    ceiling_ft: float | None = None
    visibility_sm: float | None = None
    on_route: OnRoute


class RoutePoint(BaseModel):
    lat: float
    lon: float


class DataCycle(BaseModel):
    """One FAA data set the planner uses and whether its edition is still
    in its cycle (wingtip.data_cycles, the engine's `data_cycle`): NASR
    and the CIFP on AIRAC's 28 days, the charts and the obstacle file on
    56. Days are YYYY-MM-DD, UTC. An edition past its cycle is still used,
    and said to be out of date (warn, never limit)."""

    # "nasr", "charts", "cifp", "dof" or "packs".
    key: str
    name: str
    kind: Literal["airac", "chart", "dof"]
    # The date the edition held is named by; None where nothing says.
    edition: str | None = None
    # The day it counts from, and the first day it no longer does.
    effective: str | None = None
    expires: str | None = None
    # The day the edition in force today took effect.
    current: str
    state: Literal["in_force", "expired", "not_yet", "unknown"]
    # How many editions have come out since the one held.
    behind: int = 0


class Briefing(BaseModel):
    """`weather_unavailable` names which of hazards/forecast/metars/tfrs
    come from a call that failed rather than one that found nothing: an
    empty `hazards` must not read the same as "no hazards reported"."""

    hazards: list[Hazard]
    forecast: Forecast
    metars: dict[str, Metar | None]
    airports: dict[str, AirportFacilities]
    weather_unavailable: list[Literal["hazards", "forecast", "metars", "tfrs", "pireps", "gairmets"]]
    # The TFRs near the route during the flight (wingtip.tfr.along_route).
    tfrs: list[RouteTfr] = []
    # Pilot reports near the route, and the G-AIRMETs it crosses.
    pireps: list[Pirep] = []
    gairmets: list[GAirmet] = []
    # "VFR flight not recommended" (AIM 7-1-5), as its reasons -- either
    # end reporting IFR/LIFR, the forecast under 14 CFR 91.155's basic
    # minimums -- worked out here (wingtip.weather) rather than by the page.
    # Empty when nothing warrants it.
    vfr_not_recommended: list[str] = []
    # The fields below VFR where the flight meets them.
    fields_below_vfr: list[FieldBelowVfr] = []
    # The fixes the hazards' legs run between (OnRoute.legs), one more
    # than the legs: the nav log's where the page sent them ("navlog"),
    # else the route's own, airport to airport ("route").
    leg_fixes: list[RoutePoint] = []
    legs_from: Literal["navlog", "route"] = "route"


class PickSummary(BaseModel):
    total: int
    accepted: int
    rejected: int
    added: int
    by_rating: dict[int, int]
    by_role: dict[str, int]
    added_categories: list[str] = []


class Index(BaseModel):
    service: str
    ui: str
    # Whether the reference data (airspace, obstacles, weather, the
    # corridors' charts) is loaded: false for the first minute or so
    # after a start, longer from a cold cache.
    warm: bool = False
