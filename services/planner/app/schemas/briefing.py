"""The shapes app.routers.briefing sends and takes, as Pydantic models."""

from typing import Literal

from pydantic import BaseModel

from .common import DataCycle, TfrInfo


class Tfr(TfrInfo):
    """A TFR with its areas, for the map: a GeoJSON MultiPolygon."""

    geometry: dict


class Tfrs(BaseModel):
    tfrs: list[Tfr]


class DataSource(BaseModel):
    """One source the planner downloads and keeps, for the pilot's Status
    page: its name in a pilot's words, when the copy it holds was fetched,
    to when that copy may still be served by the product's own validity
    (None: no limit, or none held), and whether the source is failing,
    the held copy then served on (ISO 8601 UTC)."""

    name: str
    fetched_at: str | None = None
    kept_until: str | None = None
    failing: bool = False


class MapLayerAges(BaseModel):
    """When the planner fetched what the map's weather layers are drawn
    from (ISO 8601 UTC; None before the first fetch): the METARs the
    airports' flight categories come from, and the TFRs; and every source
    it keeps, for the Status page."""

    metars_at: str | None = None
    tfrs_at: str | None = None
    sources: list[DataSource] = []
    # Each FAA data set's edition and whether it is in its cycle, for the
    # Status page, the map's settings and the Brief to say when one is
    # out of date.
    data_cycles: list[DataCycle] = []


class DestinationCheck(BaseModel):
    """The destination against 14 CFR 91.169(b)'s "1-2-3": an instrument
    approach published, and its TAF an hour either side of the ETA a
    ceiling of 2,000 ft or more and 3 sm or more -- else an alternate is
    `required`, `reasons` saying why (wingtip.alternates)."""

    ident: str
    approach: bool
    ceiling_ft: float | None = None
    visibility_sm: float | None = None
    taf: str | None = None
    required: bool
    reasons: list[str] = []


class AlternateMinimums(BaseModel):
    ceiling_ft: float
    visibility_sm: float


class AlternateCheck(BaseModel):
    """A field as the IFR alternate (14 CFR 91.169(c)): its forecast at the
    ETA there against its minimums -- 600 and 2 with a precision approach,
    800 and 2 without -- `good` True or False, or None where the pilot has
    to look (its own published alternate minimums, no approach, no TAF)."""

    ident: str
    approach: bool
    precision: bool
    minimums: AlternateMinimums | None = None
    alternate_minimums_url: str | None = None
    ceiling_ft: float | None = None
    visibility_sm: float | None = None
    taf: str | None = None
    good: bool | None = None
    #: Its forecast meets the standard minimums; where `good` is None for
    #: minimums of its own, the pilot checks those.
    meets_standard: bool = False
    reasons: list[str] = []
    distance_nm: float | None = None


class Alternates(BaseModel):
    """GET /api/alternate: the destination's check, the pilot's alternate's
    and the nearest fields that will do."""

    destination: DestinationCheck
    alternate: AlternateCheck | None = None
    suggestions: list[AlternateCheck] = []


class IcingLayer(BaseModel):
    """The levels icing is forecast between over a leg, ft MSL."""

    bottom_ft: float
    top_ft: float


class IcingForecastLeg(BaseModel):
    """One leg's forecast icing (wingtip.icing_forecast): the worst
    severity at the altitude flown, null where the AWC had no forecast for
    it; the share of the leg in icing there; the layer icing is in over
    the leg at any level; and the time it was read for, the leg's middle."""

    index: int
    altitude_ft: float
    severity: Literal["none", "trace", "light", "moderate", "heavy"] | None
    share: float | None
    layer: IcingLayer | None
    valid_s: float | None


class IcingForecastWorst(BaseModel):
    severity: Literal["trace", "light", "moderate", "heavy"]
    altitudes_ft: list[float]
    legs: list[int]


class IcingForecast(BaseModel):
    """GET /api/icing/route: the AWC's forecast icing (its GFA's, from CIP
    and FIP; AIM 7-1-4) on each leg at the altitude flown, the worst of it
    and the Go / No-Go's line (the engine's icing_forecast_route); the
    legs it had no forecast for; the hour the forecast was issued."""

    legs: list[IcingForecastLeg]
    worst: IcingForecastWorst | None
    unchecked: list[int]
    line: str | None
    issued: str
