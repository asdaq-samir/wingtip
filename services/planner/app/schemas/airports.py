"""The shapes app.routers.airports sends and takes, as Pydantic models."""

from typing import Literal

from pydantic import BaseModel

from .airport_lights import LightingNote, LightingSystem
from .airport_record import AirportDetails, AirportRecord
from .field import Frequency, Metar, Runway, SurfaceAirspace, TrafficPattern


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


class AirportPlace(AirportRecord, AirportDetails):
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
