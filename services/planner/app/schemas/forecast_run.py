"""The shapes app.routers.forecast_run takes and sends, as Pydantic models:
the dry run's points and fields in, the engine's forecast_run out
(engine/crates/weather/contract/forecast_run.json)."""

from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["VFR", "MVFR", "IFR", "LIFR"]
Role = Literal["departure", "stop", "destination"]
AlertKind = Literal["vfr_minimums", "pilot_minimums", "sigmet", "gairmet", "outlook"]


class RunPoint(BaseModel):
    """A point of the dry run: when (s since 1970), where, how high (ft
    MSL, None on the ground or not known) and the nav log's row it flies to."""

    t: float
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    alt_ft: float | None = None
    row: int = Field(ge=0)


class RunField(BaseModel):
    """A field the run takes off from or lands at, and when."""

    ident: str = Field(min_length=1, max_length=8)
    role: Role
    t: float
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class RunMinimums(BaseModel):
    """The pilot's personal minimums, each None until set."""

    ceiling_ft: float | None = None
    visibility_sm: float | None = None


class ForecastRunAsk(BaseModel):
    """The dry run to play against the forecast."""

    track: list[RunPoint] = Field(min_length=1, max_length=600)
    fields: list[RunField] = Field(default_factory=list, max_length=12)
    rules: Literal["VFR", "IFR"] = "VFR"
    minimums: RunMinimums | None = None


class RunSample(BaseModel):
    """What the airplane meets at a point: the forecast ceiling (ft above
    the ground) and visibility then and its flight category (AIM 7-1-7),
    whose forecast it is, the wind aloft at its altitude, and the areas
    (indexes into `areas`) it is in."""

    t: float
    lat: float
    lon: float
    category: Category | None
    ceiling_ft: float | None
    ceiling_unknown: bool
    visibility_sm: float | None
    source: str | None
    wind_dir_true_deg: float | None
    wind_speed_kt: float | None
    areas: list[int]


class RunLeg(BaseModel):
    """A leg as flown: its nav log row, when, and its worst forecast category."""

    row: int
    from_t: float
    to_t: float
    category: Category | None
    worst_t: float | None


class RunFieldForecast(BaseModel):
    """A field's TAF at the run's time there."""

    ident: str
    role: Role
    t: float
    category: Category | None
    ceiling_ft: float | None
    ceiling_unknown: bool
    visibility_sm: float | None
    source: str | None


class RunArea(BaseModel):
    """An advisory area the run is in at some time: in words, cited, its
    altitudes (ft MSL), when in force, and its outline ([lat, lon])."""

    kind: Literal["sigmet", "gairmet", "outlook"]
    words: str
    source: str
    low_ft: float | None
    high_ft: float | None
    valid_from: float | None
    valid_to: float | None
    coords: list[list[float]]


class RunAlert(BaseModel):
    """What the run is warned of, when and where, its rule and product cited."""

    t: float
    lat: float
    lon: float
    kind: AlertKind
    words: str
    source: str


class ForecastRun(BaseModel):
    """The dry run against the forecast, and the products that could not be had."""

    samples: list[RunSample]
    legs: list[RunLeg]
    fields: list[RunFieldForecast]
    areas: list[RunArea]
    alerts: list[RunAlert]
    unavailable: list[str]
