"""What is near a field and what it offers: services, nearby places, ground photos and the stops a route may use (app.routers.airports)."""

from typing import Literal

from pydantic import BaseModel


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
    """What a field offers a pilot who lands there: from its Chart Supplement entry (NASR's APT_BASE and
    its remarks) the fuel, fees, parking, repair and oxygen, and from Overture Maps (wingtip.nearby) the
    places to eat, sleep and hire a car within five miles and the airport's own website (its listing on
    the field). `nearby_unavailable` where Overture could not be read: not the same as nothing near."""

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
    website: str | None = None
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
