"""A field as the briefing and the airport card send it: its METAR, its
runways with the wind on them, its traffic pattern and its frequencies, as
Pydantic models. Apart from app.schemas.common, which builds the briefing
on them, so each file holds one kind of thing."""

from typing import Literal

from pydantic import BaseModel


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
    #: The crosswind, the gust's where more, unrounded: what a limit (the
    #: POH's demonstrated crosswind, the pilot's own) is judged against, so
    #: 10.4 kt is past 10 while `crosswind_kt` reads 10 (the engine's AV-10).
    #: None where the wind was calm.
    crosswind_exact_kt: float | None = None
    #: Calm now: True where `end` is the one the field's last wind
    #: favoured, the runway in use (wingtip.runway_wind.favoured_end).
    in_use: bool | None = None


class RunwayEnd(BaseModel):
    """One end of a runway (wingtip.pattern): its true heading, None for a helipad, which way its traffic pattern is flown -- left
    unless the FAA flags it right (14 CFR 91.126(b)(1)) -- where it is, and its displaced threshold and landing distance available
    (LDA), feet: NASR APT_RWY_END's DISPLACED_THR_LEN and LNDG_DIST_AVBL, None where NASR gives none."""

    ident: str
    heading_true_deg: float | None = None
    traffic: Literal["left", "right"] = "left"
    #: Where it is, for the card's sketch: NASR's surveyed threshold, else OurAirports'; None where neither has it.
    lat: float | None = None
    lon: float | None = None
    displaced_threshold_ft: int | None = None
    lda_ft: int | None = None


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
