"""The map's own list of fields (/api/airports/in-view): each a pin and
its METAR as the map's marks read it (wingtip.map_weather). Apart from
app.schemas.airports, which the pin is."""

from typing import Literal

from pydantic import BaseModel

from .airports import AirportPin


class PinWeather(BaseModel):
    """A field's METAR as the map's station model and wind arrow read it
    (wingtip.map_weather): the wind (true, knots; no direction for a
    variable one), the visibility in statute miles and the weather with it
    as reported ("BR", "-TSRA"), the ceiling in feet AGL -- not known where
    `ceiling_unknown` (14 CFR 1.1) -- and `crosswind_kt`, the least
    crosswind on the field's runways, steady or gust, unrounded (the engine's
    least_crosswind), there only where the wind earns an arrow (the
    engine's wind_arrow) and a runway end has a heading."""

    wind_dir_true_deg: float | None = None
    wind_speed_kt: float | None = None
    wind_gust_kt: float | None = None
    visibility_sm: float | None = None
    #: The visibility is at least `visibility_sm`: the report's P6SM, the
    #: AWC's "10+" (the engine's awc_metars_read), for a station model's "6+".
    visibility_plus: bool = False
    wx: str | None = None
    ceiling_ft: float | None = None
    #: The ceiling's layer as the METAR writes it: "BKN", "OVC" or "VV" (an
    #: obscuration's vertical visibility); None with no ceiling, one not
    #: known, or a report read before the cover was kept.
    ceiling_cover: Literal["BKN", "OVC", "VV"] | None = None
    ceiling_unknown: bool = False
    crosswind_kt: float | None = None


class AirportInView(AirportPin):
    """A field on the map's own list (/api/airports/in-view): a pin, and
    its METAR as the map's marks read it, None where it has no report."""

    weather: PinWeather | None = None
    #: The engine's field_mark_rank for its mark, as the overlay tiles carry
    #: it (`rank`, `size`; wingtip.field_marks): `mark_order`, lower kept first
    #: where marks overlap (a Class B's field, a Class C's, then by tier and
    #: the longer hard runway); `mark_size`, the step its mark is drawn at.
    mark_order: int | None = None
    mark_size: Literal["largest", "larger", "regular", "small"] | None = None


class AirportsInView(BaseModel):
    airports: list[AirportInView]
