"""The fields nearest a position (app.routers.airports): the map's Nearest
and a search's results, each a field as the map marks it with what a
search filters by."""

from typing import Literal

from pydantic import BaseModel

from .airports import AirportPin, InboundRadio


class FieldForecast(BaseModel):
    """What the TAF that speaks for a field forecasts at a time asked
    (wingtip.field_forecast): the flight category of the worst it forecasts
    then, TEMPO and PROB included (AIM 7-1-7; None where it does not settle
    it or does not cover the time), the station and how far it is (None
    for the field's own)."""

    at: float
    category: Literal["VFR", "MVFR", "IFR", "LIFR"] | None = None
    station: str
    distance_nm: float | None = None


class NearestAirport(AirportPin):
    """A field near a position: how far and which way (true), its town,
    elevation and longest open runway, and a frequency listed for it
    (None where OurAirports lists none); and what a search's filters read
    of it (wingtip.field_facts): its fuel, its runways' surfaces, an
    instrument approach, its METAR's wind and visibility, and its
    forecast at the time asked."""

    municipality: str | None = None
    elevation_ft: float | None = None
    distance_nm: float
    bearing_deg: float
    longest_runway_ft: int | None = None
    radio: InboundRadio | None = None
    #: The fuels it sells, of 100LL, Jet A (and Jet A-1) and UL94, from
    #: NASR APT_BASE's FUEL_TYPES (the Chart Supplement's fuel codes).
    fuel: list[Literal["100LL", "Jet A", "UL94"]] = []
    #: Its runways' surfaces, from NASR APT_RWY's SURFACE_TYPE_CODE.
    runway_surfaces: list[Literal["paved", "turf", "water", "other"]] = []
    #: An instrument approach coded in the FAA's CIFP; None where the CIFP
    #: could not be had.
    instrument_approach: bool | None = None
    #: Its METAR's wind (true, as reported; None where variable or calm)
    #: and visibility, statute miles; None with no report of its own.
    wind_dir_true_deg: float | None = None
    wind_speed_kt: float | None = None
    wind_gust_kt: float | None = None
    visibility_sm: float | None = None
    #: Its forecast at the time asked (`at`); None where none was asked or
    #: no TAF speaks for it.
    forecast: FieldForecast | None = None


class NearestAirports(BaseModel):
    airports: list[NearestAirport]
