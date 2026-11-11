"""The shapes app.routers.live sends and takes, as Pydantic models."""

from pydantic import BaseModel


class ItwsAlert(BaseModel):
    """One ITWS alert (wingtip.itws): what (`alert`: microburst, wind
    shear, gust front, tornado, storm cell) and its words as a pilot is
    told them ("Runway 27L arrival microburst alert 40 kt, runway to 3
    mile final", AIM 4-3-7); a runway alert's runway, direction, code,
    value in knots and span."""

    alert: str
    words: str
    runway: str | None = None
    direction: str | None = None
    code: str | None = None
    value_kt: float | None = None
    minutes: float | None = None
    lat: float | None = None
    lon: float | None = None


class ItwsProduct(BaseModel):
    """One ITWS product's alerts for one airport, until it expires
    (`expires`, UNIX s), heard at `heard`."""

    airport: str
    product: str
    name: str
    alerts: list[ItwsAlert]
    expires: float | None = None
    heard: float


class ItwsAlerts(BaseModel):
    """The ITWS alerts in force at the airports asked for: none where no
    ITWS site alerts for them (most airports have no ITWS)."""

    alerts: list[ItwsProduct]


class SaaStatus(BaseModel):
    """A special activity airspace's status from SFDPS (wingtip.saa):
    `active` True (in use now), False (cold now) or None (no word of now);
    `until` when the status in force ends and `next` when the next
    activation starts (UNIX s); `heard` when SFDPS last spoke of it."""

    designator: str
    active: bool | None = None
    status: str | None = None
    until: float | None = None
    next: float | None = None
    heard: float


class SaaStatuses(BaseModel):
    """Each area asked for that SFDPS has spoken of, by the designator it
    was asked by ("R-4401A"); one it never has is left out: its chart
    times of use are all there is."""

    areas: dict[str, SaaStatus]


class RunwayRvr(BaseModel):
    """A runway end's RVR now (wingtip.rvr), ft: each reading None where it
    is not reported, `*_more` where it is the system's most (6,000 ft or
    more, AIM 7-1-13); heard at `heard` (UNIX s)."""

    airport: str
    runway: str
    touchdown_ft: int | None = None
    touchdown_more: bool = False
    touchdown_trend: str | None = None
    midpoint_ft: int | None = None
    midpoint_more: bool = False
    midpoint_trend: str | None = None
    rollout_ft: int | None = None
    rollout_more: bool = False
    rollout_trend: str | None = None
    edge_lights: str | None = None
    heard: float


class AirportRvr(BaseModel):
    """An airport's runway ends' RVR heard in the last ten minutes; none
    where it has no RVR system on SWIM, or none was heard."""

    airport: str
    runways: list[RunwayRvr]


class DigitalAtis(BaseModel):
    """One D-ATIS broadcast (wingtip.datis): `which` arrival, departure or
    None for the airport's one broadcast; its letter, issue time (ddhhmm
    Z), its words as sent, and the engine's reading of them (read_datis,
    read_atis's figures)."""

    airport: str
    which: str | None = None
    letter: str | None = None
    issued: str | None = None
    text: str
    reading: dict
    heard: float


class AirportAtis(BaseModel):
    airport: str
    broadcasts: list[DigitalAtis]


class FlowProgram(BaseModel):
    """A traffic management program or restriction at an airport
    (wingtip.flow): a program (`program`: ground stop, ground delay program,
    airspace flow program) from a Command Center advisory, with its delays
    in minutes and its words as sent; or a restriction (`restriction`
    true: miles or minutes in trail, `kind` ARRIVAL or DEPARTURE). Times
    are UNIX s."""

    airport: str
    program: str | None = None
    restriction: bool = False
    number: str | None = None
    starts: float | None = None
    ends: float | None = None
    average_delay_min: int | None = None
    maximum_delay_min: int | None = None
    condition: str | None = None
    title: str | None = None
    text: str | None = None
    kind: str | None = None
    category: str | None = None
    value: str | None = None
    element: str | None = None
    reason: str | None = None
    facility: str | None = None
    heard: float


class FlowAtAirports(BaseModel):
    """The programs and restrictions in force or to come at the airports
    asked for."""

    programs: list[FlowProgram]


class DepartureEvent(BaseModel):
    """A tower departure event (wingtip.departures): the flight, its
    airports and gate, and the event's times by name (`times`, UNIX s:
    clearance_delivery, the departure clearance's delivery, is what the
    feed has been seen to send)."""

    ident: str
    flight_id: str | None = None
    type: str | None = None
    beacon: str | None = None
    departure: str | None = None
    destination: str | None = None
    gate: str | None = None
    event_at: float | None = None
    times: dict[str, float] = {}
    heard: float


class DepartureEvents(BaseModel):
    events: list[DepartureEvent]
