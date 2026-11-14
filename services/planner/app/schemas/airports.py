"""The shapes app.routers.airports sends and takes, as Pydantic models."""

from typing import Literal

from pydantic import BaseModel

from .airport_lights import LightingNote, LightingSystem
from .airport_record import AirportRecord
from .field import Frequency, Metar, Runway, SurfaceAirspace, TrafficPattern
from .plates import ApproachFacts


class ForecastWind(BaseModel):
    """The wind a TAF forecasts at a field for a time (wingtip.weather.
    forecast_wind): its own TAF's, else the nearest station's within 30
    nm (`ident`, `distance_nm`). From true north; `dir_true_deg` None for
    a variable wind. `valid_from` and `valid_to`, the period's, s since
    1970."""

    ident: str
    distance_nm: float
    dir_true_deg: float | None
    speed_kt: float
    gust_kt: float | None = None
    valid_from: float
    valid_to: float


class NearbyMetar(BaseModel):
    """A field's nearest report within 30 nm, for one with none of its
    own: the station, how far and which way from the field (true), its
    METAR, and `near` where it is within 10 statute miles, close enough to
    say the field's weather by it, approximately (wingtip.weather)."""

    ident: str
    distance_nm: float
    bearing_deg: int
    near: bool
    metar: Metar


class ModelledWeather(BaseModel):
    """The weather at a field as the NWS's Gridded LAMP models it for the
    hour (wingtip.glmp), for one with no report of its own: the ceiling above
    the ground (None with none), the visibility (10 sm and more is "10"),
    their flight category (AIM 7-1-7), and the hour it is for. Planning
    guidance, not an observation."""

    ceiling_ft: float | None
    visibility_sm: float
    flight_category: Literal["VFR", "MVFR", "IFR", "LIFR"]
    valid_at: str


class PlaceFound(BaseModel):
    """A place a pilot typed for Nearest to find the fields near: an
    airport, a town, a street address (wingtip.geocode), and where it is."""

    label: str
    kind: Literal["airport", "town", "address"]
    lat: float
    lon: float


class PlacesFound(BaseModel):
    places: list[PlaceFound]


class AirportPin(BaseModel):
    """A landing field the map can open a card for: the ident pilots use,
    where it is, and its size -- the bigger ones are kept when a wide
    view holds more than the map asks for. `flight_category` is the
    field's METAR's (VFR, MVFR, IFR, LIFR), for the map's weather chip:
    None where it has no reporting station, or the weather could not be
    asked. `military` is a field the armed services own (the FAA's
    airport file, wingtip.faa_data.military_fields): "military" where a civil
    airplane lands only with the service's permission, "joint" where a
    civil airport shares it; None for every other field."""

    ident: str
    name: str
    lat: float
    lon: float
    kind: Literal["large", "medium", "small", "other"]
    flight_category: str | None = None
    military: Literal["military", "joint"] | None = None
    #: Closed to the public (wingtip.faa_data.private_fields): landed at only
    #: with its owner's permission, the sectional's R in a circle.
    private: bool = False
    #: The class of the airspace at its surface (wingtip.airspace.surface_classes),
    #: for its mark on the map in that airspace's look; None where the FAA's
    #: airspace could not be had.
    airspace_class: Literal["B", "C", "D", "E", "G"] | None = None
    #: The class of airspace this field is the primary airport of (the FAA's
    #: airspace file names each Class B, C and D for one field), for the map
    #: to show that field first where only one fits: zoomed out over Texas
    #: it showed Love Field and Hobby beside Dallas's and Houston's rings,
    #: both inside the Class B, and not DFW and Intercontinental at their
    #: middle (the owner, 2026-11-03). None for every other field.
    primary_of: Literal["B", "C", "D"] | None = None
    #: Whether the field has a control tower (NASR APT_BASE TWR_TYPE_CODE
    #: ATCT...): the sectional's airport symbol is blue for a towered
    #: field, magenta for every other (FAA Aeronautical Chart User's
    #: Guide, VFR Terms and Symbols, Airports).
    towered: bool = False


class InboundRadio(BaseModel):
    """The frequency a pilot calls a field on, inbound: `kind` "TWR",
    "CTAF" or "UNICOM", and the frequency in MHz."""

    kind: Literal["TWR", "CTAF", "UNICOM"]
    mhz: float


class WaypointPin(BaseModel):
    """A VFR waypoint on the sectional (VPBNG), for the map's diamond: a
    tap names it, and with a route open puts it in the stops."""

    ident: str
    lat: float
    lon: float
    #: Where it is, a stand-alone waypoint having no name of its own: "by
    #: Bangs Lake", "2 nm W of Glenview" (wingtip.places). None before the
    #: place names have loaded, or where nothing is near.
    description: str | None = None


class WaypointsInView(BaseModel):
    waypoints: list[WaypointPin]


class TerminalChart(BaseModel):
    """One of a field's charts in the d-TPP (wingtip.publications): `kind` the
    FAA's chart code -- APD the airport diagram, HOT its hot spots, LAH
    land and hold short, IAP an approach, DP and ODP a departure, STR an
    arrival, MIN the takeoff or alternate minimums -- `name` its title as
    the FAA prints it, `url` its PDF."""

    kind: str
    name: str
    url: str


class ProcedureSummary(BaseModel):
    """One of a field's instrument procedures in the FAA's CIFP
    (wingtip.procedures): `id` its coded identifier ("I08-Y"), `name` its
    chart's title ("ILS Y RWY 08"), `runway` an approach's, and the
    transitions a pilot picks from -- an approach's, an arrival's or a
    departure's enroute ones -- and an arrival's or departure's runway
    transitions, which are drawn with it."""

    kind: Literal["approach", "arrival", "departure"]
    id: str
    name: str
    runway: str | None = None
    transitions: list[str]
    runway_transitions: list[str]


class ProcedureList(BaseModel):
    """A field's instrument procedures, approaches first, from the CIFP
    of the AIRAC cycle that took effect on `cycle` (YYMMDD); none for a
    field with none."""

    airport: str
    cycle: str
    # True when `cycle` is not the one in force: the FAA's file for it
    # could not be had, and an older one is used.
    stale: bool = False
    procedures: list[ProcedureSummary]


class ProcedureLine(BaseModel):
    """A line of a drawn procedure, its points latitude and longitude:
    an approach's `transition`, its `final` and its `missed` approach; an
    arrival's or departure's enroute `transition`, `common` route, or a
    `runway` transition, `name` the transition's ("RW08")."""

    role: Literal["transition", "final", "missed", "common", "runway"]
    name: str | None = None
    points: list[tuple[float, float]]


class ProcedureHold(BaseModel):
    """A holding pattern of a drawn procedure, or its procedure turn: at `fix`, its inbound
    course `inbound_deg` true, its turns right or left (`turn`), drawn to
    a light airplane's size (the engine's paths.rs, HOLD_SPEED_KT)."""

    fix: str
    turn: Literal["L", "R"]
    inbound_deg: int
    missed: bool
    points: list[tuple[float, float]]
    #: A hold, or a procedure turn (45°/180°, AIM 5-4-9) where the chart has
    #: its barb, drawn and flown as a hold is.
    kind: Literal["hold", "procedure turn"] = "hold"


class ProcedureFix(BaseModel):
    """A fix of a drawn procedure: its `roles` on an approach (IAF, IF,
    FAF, MAP, hold), the altitudes it is crossed at -- at or above
    `min_ft`, at or below `max_ft`, at both where they are one -- and the
    speed it is crossed at, `speed_limit` saying whether that is the
    speed ("at"), a minimum ("min") or a maximum ("max"; ARINC 424-18
    5.261). `missed` where it is on the missed
    approach alone."""

    ident: str
    lat: float
    lon: float
    roles: list[str]
    min_ft: int | None = None
    max_ft: int | None = None
    speed_kt: int | None = None
    speed_limit: Literal["at", "min", "max"] | None = None
    missed: bool
    #: The vertical path's angle at the fix, degrees of descent, where the
    #: CIFP codes one: an approach's glidepath at its final approach fix
    #: and its missed approach point (ARINC 424-18 5.70).
    vertical_angle_deg: float | None = None


class ProcedureMissedLeg(BaseModel):
    """A leg of an approach's missed approach, in the order flown, as its
    words are made: `path` its ARINC 424-18 path and terminator (5.21: CA
    a course to an altitude, VA a heading to one, VI a heading to an
    intercept, CF and TF to a fix, DF direct to one, HM, HA and HF a
    hold), `fix` the fix it goes to, `course_deg` its course or heading
    magnetic, `turn` which way it turns, and the altitudes it climbs to
    (at or above `min_ft`, at or below `max_ft`)."""

    path: str
    fix: str | None = None
    course_deg: int | None = None
    turn: Literal["L", "R"] | None = None
    min_ft: int | None = None
    max_ft: int | None = None


class ProcedureRunwayPath(BaseModel):
    """The path an approach's final comes down, placed (wingtip.procedures):
    `deg` below level, into `fix`, its runway's threshold at `lat`/`lon`,
    crossed at `ft` MSL -- the threshold's elevation and its crossing
    height (ARINC 424-18 5.70)."""

    deg: float
    fix: str
    lat: float
    lon: float
    ft: int


class ProcedureDrawing(BaseModel):
    """One procedure drawn with the transition picked (wingtip.procedures):
    its lines, holds and fixes, from the CIFP of `cycle`."""

    airport: str
    kind: Literal["approach", "arrival", "departure"]
    id: str
    name: str
    transition: str | None = None
    cycle: str
    stale: bool = False
    lines: list[ProcedureLine]
    holds: list[ProcedureHold]
    fixes: list[ProcedureFix]
    #: An approach's final: its glidepath's angle, degrees, where the CIFP
    #: codes one (a vertical angle on its final's legs, ARINC 424-18 5.70),
    #: and its course, degrees magnetic, as its missed approach point's leg
    #: codes it or else from its final approach fix to that point.
    glidepath_deg: float | None = None
    final_course_deg: int | None = None
    #: Its missed approach's legs in order, for the words a plate says it in.
    missed_legs: list[ProcedureMissedLeg] = []
    #: The glidepath placed: its angle into its runway's threshold and the
    #: altitude it crosses it at, for a flown track to be measured against
    #: (the approach debrief); None where the missed approach point is not
    #: a runway's.
    runway_path: ProcedureRunwayPath | None = None
    #: An approach's own figures beside its legs, for the tags its fixes
    #: carry (the engine's approach_fix_tags); None for another procedure.
    approach: ApproachFacts | None = None


class ChartPage(BaseModel):
    """One page of one of the FAA's charts, to show in the app: its
    picture is /api/faa-chart/page/{source}/{edition}/{pdf}/{page}.png,
    `width` by `height` pixels (wingtip.publications.chart_page_png)."""

    source: Literal["dtpp", "dcs"]
    edition: str
    pdf: str
    page: int
    width: int
    height: int


class ChartPages(BaseModel):
    """The pages of an FAA chart the app shows, in order: every page of a
    chart of its own, a booklet's pages for the field, a Chart Supplement
    entry's pages (wingtip.publications.chart_pages)."""

    pages: list[ChartPage]


class AirportPlace(AirportRecord):
    """One airport the way the map's card shows it: its name and place, the class of the airspace at
    its surface, its tower, runways and radio, and the weather now. `metar` is None for a field with
    no reporting station; `weather_unavailable`, the weather service could not be asked at all."""

    ident: str
    name: str
    municipality: str | None = None
    region: str | None = None
    lat: float
    lon: float
    elevation_ft: float | None = None
    kind: Literal["large", "medium", "small", "other"]
    airspace_class: Literal["B", "C", "D", "E", "G"] | None = None
    surface_airspace: SurfaceAirspace | None = None  # the same, with its part-time hours
    #: A field the armed services own, as AirportPin's.
    military: Literal["military", "joint"] | None = None
    #: Closed to the public, as AirportPin's (ask the owner first); and where
    #: NASR lists it closed (CI, CP), the engine's label, never offered (0043).
    private: bool = False
    closed: str | None = None
    towered: bool
    # Its remarks a pilot acts on from the cockpit (wingtip.remarks): its
    # lighting remarks as sent (`lighting`), read by the engine into each
    # system and how it is turned on (`lights`) and what it could not read
    # (`light_notes`); the other remarks that count mic clicks, such as the
    # weather read out on the CTAF, in plain English. `standard_keying`
    # where the lights are the pilot's and the remarks do not say how many
    # clicks: AIM 2-1-8's 7, 5 and 3 apply.
    lighting: list[str] = []
    lights: list[LightingSystem] = []
    light_notes: list[LightingNote] = []
    radio_notes: list[str] = []
    standard_keying: bool = False
    pattern: TrafficPattern | None = None
    runways: list[Runway]
    frequencies: list[Frequency]
    metar: Metar | None = None
    #: Where it has none, the nearest report within 30 nm
    #: (wingtip.weather.nearest_report): its flight category the card's,
    #: marked approximate, where it is `near`.
    nearby_metar: NearbyMetar | None = None
    #: Where it has none, the weather the NWS's Gridded LAMP models at the
    #: field for the hour (wingtip.glmp): the card's category, marked
    #: modelled, before a near station's.
    modelled_weather: ModelledWeather | None = None
    #: Its own TAF as issued, where it has one (most have none): the card's
    #: hours are read from it (web lib/hourly), the text the pilot's as sent.
    taf: str | None = None
    weather_unavailable: bool = False
    # Its phone and one-line street address, from the FAA's airport file
    # (faa_data.airport_contact): the manager's, else the owner's; None if none.
    phone: str | None = None
    address: str | None = None
    # The FAA's airport diagram and Chart Supplement page for the current editions (wingtip.publications); None where the field
    # has none. Its picture is /api/airport-diagram/{airport_diagram_cycle}/{ident}.png, the runways' .../runways/{ident}.png (WEB-41).
    airport_diagram_url: str | None = None
    airport_diagram_cycle: str | None = None
    airport_diagram_runways: bool = True
    chart_supplement_url: str | None = None
    # And all of the field's charts in this cycle's d-TPP, the diagram among
    # them: what the card's Diagrams tab lists.
    procedures: list[TerminalChart] = []


class NearbyPlace(BaseModel):
    """A place near a field from Overture Maps' places (wingtip.nearby)."""

    name: str
    #: What it is, in words: "American restaurant", "Motel", "Car rental".
    kind: str
    distance_m: int
    #: The minutes' walk where it is near enough to walk to, else None.
    walk_min: int | None = None
    phone: str | None = None
    #: Its own website, where Overture lists one: the card's link to it.
    website: str | None = None
    lat: float
    lon: float
    #: A place to eat at the airport itself (wingtip.nearby's outline).
    on_field: bool = False


class GroundPhoto(BaseModel):
    """A field's photo from the ground, from its Wikipedia article's lead
    image on Wikimedia Commons (wingtip.airport_photos), with its credit."""

    url: str
    #: Its size, pixels, for the full-screen viewer to fit it.
    width: int = 900
    height: int = 600
    credit: str
    license: str = ""
    source_url: str | None = None


class AirportPhotos(BaseModel):
    """The pictures an airport's card swipes through behind its diagram:
    its aerial from the USGS, every field's, and a photo from the ground
    where there is a free one."""

    aerial_url: str
    photo: GroundPhoto | None = None


class AirportServices(BaseModel):
    """What a field offers a pilot who lands there: from its Chart
    Supplement entry (NASR's APT_BASE and its remarks) the fuel, fees,
    parking, repair and oxygen, and from Overture Maps (wingtip.nearby) the
    places to eat, sleep and hire a car within five miles.
    `nearby_unavailable` where Overture could not be read: not the same
    as nothing near."""

    ident: str
    fuel_types: list[str] = []
    #: The remarks on its fuel and FBO's hours in words (the engine's
    #: remarks_read), and as sent (NASR APT_RMK), in the same order.
    fuel_notes: list[str] = []
    fuel_remarks: list[str] = []
    landing_fee: bool | None = None
    tie_down: bool = False
    hangar: bool = False
    airframe_repair: Literal["major", "minor"] | None = None
    powerplant_repair: Literal["major", "minor"] | None = None
    oxygen: bool = False
    courtesy_car: bool = False
    #: The remarks offering the courtesy car, in words (remarks_read).
    ground_notes: list[str] = []
    food: list[NearbyPlace] = []
    lodging: list[NearbyPlace] = []
    cars: list[NearbyPlace] = []
    nearby_unavailable: bool = False


class StopField(BaseModel):
    """A field for the map's Stops, near the pilot or along a route: what
    it has of the four kinds -- the fuel it sells and its airframe and
    engine repair from its Chart Supplement entry (NASR's APT_BASE), its
    places to eat on the field and its flight schools from Overture
    (wingtip.nearby) -- and its phone (NASR's APT_CON)."""

    ident: str
    name: str
    city: str | None = None
    lat: float
    lon: float
    #: From the pilot: how far and which way (true). Along a route: the
    #: miles from its flight's departure and those it adds to the flight.
    distance_nm: float
    bearing_deg: int
    departure: str | None = None
    added_nm: float | None = None
    #: Along a route: how far off the course it is, nm (the owner's "say
    #: how far off course", 2026-10-26).
    off_nm: float | None = None
    #: The manager's phone, else the owner's; None where the FAA lists none.
    phone: str | None = None
    #: APT_BASE's FUEL_TYPES: "100LL", "A" (Jet A), "MOGAS"...
    fuel_types: list[str] = []
    airframe_repair: Literal["major", "minor"] | None = None
    powerplant_repair: Literal["major", "minor"] | None = None
    food: list[NearbyPlace] = []
    training: list[NearbyPlace] = []
    #: Whether its Overture places have been read: until they are, its
    #: food and schools are still to come.
    places_known: bool = True


class StopFields(BaseModel):
    """The map's Stops: the fields with fuel, food, repair or a flight
    school, nearest first round the pilot or in route order along it, and
    how many fields still have their places to be read (`pending`): asked
    again until none."""

    fields: list[StopField]
    pending: int = 0
