"""The shapes app.routers.traffic sends and takes, as Pydantic models."""

from typing import Literal

from pydantic import BaseModel


class TrafficAircraft(BaseModel):
    """One airplane in the air near the point (wingtip.traffic): who, where,
    how high -- the GNSS height where it sends one, else its pressure
    altitude set on the nearest METAR's altimeter (wingtip.traffic.on_altimeter),
    or as sent where none is near (`pressure_altitude`) -- its track, speed
    and climb, and how many seconds old its position is."""

    hex: str
    callsign: str | None = None
    registration: str | None = None
    type: str | None = None
    lat: float
    lon: float
    altitude_ft: float | None = None
    pressure_altitude: bool = False
    track_deg: float | None = None
    speed_kt: float | None = None
    vertical_fpm: float | None = None
    seen_s: float | None = None
    #: Its transponder code, and the emergency it declares, if any.
    squawk: str | None = None
    emergency: str | None = None
    #: What it is, as its transponder says: DO-260B's emitter category
    #: ("A1" light ... "A7" rotorcraft), for the Aircraft tab's filters.
    category: str | None = None


class Traffic(BaseModel):
    """The airplanes ADS-B receivers hear near a point, from adsb.lol's
    open data, under the Open Database License 1.0, which asks that the
    map say so where it draws them."""

    aircraft: list[TrafficAircraft]
    #: How many seconds before this answer the airplanes were where it
    #: gives them, each `seen_s` more: the map carries each on from there.
    age_s: float = 0.0
    source: str = "adsb.lol"
    license: str = "ODbL 1.0"


class FlightDeparted(BaseModel):
    """The field a flight took off from, and when (Unix seconds)."""

    ident: str
    name: str | None = None
    at: float


class TrailPoint(BaseModel):
    """Where an airplane was: Unix seconds, its position, its height (None
    on the ground)."""

    t: float
    lat: float
    lon: float
    alt_ft: float | None = None


class AircraftRegistration(BaseModel):
    """A US airplane's record in the FAA's aircraft registry (wingtip.registry,
    the Releasable Aircraft Database): who it is registered to and where,
    what it is, its engine, and its registration's and airworthiness
    certificates. The owner's town, never the street; an owner who asked
    the FAA to withhold their name (49 U.S.C. 44114(b)) is not in it."""

    n_number: str
    mode_s_hex: str | None = None
    serial: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    year: int | None = None
    aircraft_type: str | None = None
    engines: int | None = None
    seats: int | None = None
    engine: str | None = None
    engine_type: str | None = None
    horsepower: int | None = None
    thrust_lb: int | None = None
    owner: str | None = None
    owner_type: str | None = None
    co_owners: int = 0
    city: str | None = None
    state: str | None = None
    country: str | None = None
    certificate_issued: str | None = None
    expires: str | None = None
    airworthiness: str | None = None
    airworthiness_date: str | None = None
    kit: str | None = None
    fractional: bool = False
    status: str | None = None
    standing: Literal["valid", "lapsed", "other"] = "other"
    #: The rest of the FAA's MASTER record: its make and model's and its
    #: engine's codes (the reference records' keys), the FAA region of the
    #: address, the last action on the record, the transponder code in
    #: octal, the FAA's unique id, the certification code as filed, and the
    #: co-owners' names. The street, zip code and county are not given.
    model_code: str | None = None
    engine_code: str | None = None
    region: str | None = None
    last_action: str | None = None
    mode_s_octal: str | None = None
    unique_id: str | None = None
    certification_code: str | None = None
    co_owner_names: list[str] = []


class TrafficFound(BaseModel):
    """The airplanes in the air a pilot named by callsign, registration
    or ICAO address (wingtip.traffic.find); and, where none is in the air or
    heard now, the FAA's record of the one named (wingtip.traffic.registered),
    to open its card all the same."""

    aircraft: list[TrafficAircraft]
    registered: AircraftRegistration | None = None
    #: False where adsb.lol could not be asked just now (it answers one
    #: request every few seconds): `aircraft` is then empty, `registered`
    #: the FAA's record all the same, and the page, which shows the
    #: airplanes its map has heard by that name besides, asks again.
    checked: bool = True
    #: Whose data `aircraft` is, to credit it where it is shown, as the
    #: map's traffic is (Traffic): ADS-B Exchange's for a search it
    #: answered (wingtip.traffic.find_credited), else adsb.lol's.
    source: str = "adsb.lol"
    license: str = "ODbL 1.0"


class PastFlightField(BaseModel):
    """A landing field a past flight took off from or landed at."""

    ident: str
    name: str | None = None
    city: str | None = None
    region: str | None = None


class PastFlightSummary(BaseModel):
    """One of an airplane's flights of the last days (wingtip.traffic.history):
    where it went from and to, where the receivers heard that, and when."""

    id: int
    origin: PastFlightField | None = None
    destination: PastFlightField | None = None
    off: float
    on: float
    landed: bool
    in_air: bool
    max_alt_ft: float


class PastFlights(BaseModel):
    """An airplane's last flights found, ten at most, newest first, from
    adsb.lol's traces (Open Database License 1.0)."""

    hex: str
    registration: str | None = None
    type: str | None = None
    flights: list[PastFlightSummary]
    #: Past days whose traces adsb.lol did not give just now: their
    #: flights are missing from the list, not known not to have flown.
    unread_days: int = 0
    #: The UTC day (ISO) to ask from, with `before` the last flight's id,
    #: for the flights before these; None where adsb.lol's archive, about
    #: six weeks, has none older.
    next_until: str | None = None


class PastFlightPoint(BaseModel):
    """A report of a past flight: when (s since 1970), where, its height
    (GNSS where sent, ft; None on the ground), ground speed (kt), track
    (degrees true) and climb (ft/min)."""

    t: float
    lat: float
    lon: float
    alt_ft: float | None = None
    gs_kt: float | None = None
    track_deg: float | None = None
    vrate_fpm: float | None = None


class PastFlight(BaseModel):
    """One past flight's reports, for its track log and its replay."""

    id: int
    points: list[PastFlightPoint]


class FlightArrival(PastFlightField):
    """The field an airplane has landed at, and when it was last heard (Unix seconds)."""

    at: float


class FlightStatus(BaseModel):
    """An airplane's state now, for the alerts a pilot sets on it
    (wingtip.traffic.status): how long since it was heard, whether it is in
    the air -- and where, as the map draws it -- the field it took off
    from, and, not in the air, the field it has landed at; from adsb.lol's
    open data (ODbL 1.0)."""

    hex: str
    heard_s: float | None = None
    airborne: bool = False
    aircraft: TrafficAircraft | None = None
    departed: PastFlightField | None = None
    arrived: FlightArrival | None = None


class FlightDetail(BaseModel):
    """An airplane and its flight today (wingtip.traffic.flight): what it is,
    who flies it, where it took off from where its track shows that, and
    its track since, from adsb.lol's open data (ODbL 1.0); and a US
    airplane's FAA registration."""

    hex: str
    faa: AircraftRegistration | None = None
    registration: str | None = None
    type: str | None = None
    description: str | None = None
    operator: str | None = None
    year: str | None = None
    departed: FlightDeparted | None = None
    trail: list[TrailPoint] = []


class RouteAirport(BaseModel):
    ident: str
    name: str | None = None
    location: str | None = None


class FlightRoute(BaseModel):
    """The route a flight number is scheduled to fly (wingtip.traffic.route),
    from Virtual Radar Server's route database (CC0): the airports in
    order, and whether the airplane is on or near it now. Not the flight
    plan filed for today's flight."""

    airports: list[RouteAirport]
    plausible: bool | None = None


class AircraftBases(BaseModel):
    """Where airplanes are based (wingtip.traffic.based): the field their last
    flights keep to, or None where none; those still being looked up are
    pending, given on a later ask."""

    based: dict[str, PastFlightField | None]
    pending: list[str]
