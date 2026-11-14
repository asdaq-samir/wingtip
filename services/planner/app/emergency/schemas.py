"""GET /api/emergency/fields' answer: each field as the engine's
best_fields reads a candidate, with what the screen shows beside it."""

from typing import Literal

from pydantic import BaseModel

from ..schemas.plan import DemonstratedCrosswind, ShortField


class EmergencyRunwayEnd(BaseModel):
    ident: str
    #: True; the table's, else its number's turned true; None for neither.
    heading_true_deg: float | None = None


class EmergencyRunway(BaseModel):
    """An open runway (OurAirports' runways.csv)."""

    surface: str | None = None
    length_ft: float | None = None
    closed: bool = False
    runway_ends: list[EmergencyRunwayEnd]


class EmergencyMetar(BaseModel):
    """What the ranking reads of a field's METAR, and the report as sent."""

    dir_true_deg: float | None = None
    speed_kt: float | None = None
    gust_kt: float | None = None
    altimeter_in_hg: float | None = None
    temp_c: float | None = None
    flight_category: str | None = None
    raw: str | None = None


class EmergencyFrequency(BaseModel):
    """An approach, departure, tower, CTAF or UNICOM frequency, as the
    FAA (else OurAirports) lists it for the field."""

    kind: str
    mhz: float
    description: str | None = None


class EmergencyField(BaseModel):
    ident: str
    name: str
    lat: float
    lon: float
    elevation_ft: float | None = None
    distance_nm: float
    bearing_deg: float
    runways: list[EmergencyRunway]
    metar: EmergencyMetar | None = None
    towered: bool = False
    private: bool = False
    #: "military" (the service's permission) or "joint" (public use), as
    #: AirportPin's; None for every other field.
    military: Literal["military", "joint"] | None = None
    #: NASR APT_BASE's ARPT_STATUS, None with no NASR record: the engine's
    #: best_fields never ranks a field with any but O (decision 0043).
    status: str | None = None
    frequencies: list[EmergencyFrequency] = []
    #: The FAA's listed phone for the field (NASR APT_CON); None where none.
    phone: str | None = None


class WindAloft(BaseModel):
    """The modelled wind (GFS) at the altitude asked, true."""

    from_deg: float
    kt: float


class GlideFigures(BaseModel):
    """The POH's best-glide speed and glide ratio (Section 3). A pilot's
    own airplane of no stock type has its glide ratio alone, as its pilot
    gave it: no best-glide speed (none is taken from another airplane) and
    its source the pilot."""

    best_glide_kias: float | None = None
    ratio: float
    source: str = "The pilot's own figure, from the airplane's handbook"


class EmergencyAirplane(BaseModel):
    """The stock profile's figures the ranking uses (data/aircraft); each
    None where the profile has none: no glide, and the glide is not
    guessed."""

    name: str
    type: str | None = None
    glide: GlideFigures | None = None
    landing: ShortField | None = None
    crosswind: DemonstratedCrosswind | None = None
    cruise_tas_kt: float | None = None


class EmergencyFields(BaseModel):
    fields: list[EmergencyField]
    wind: WindAloft | None = None
    airplane: EmergencyAirplane | None = None
