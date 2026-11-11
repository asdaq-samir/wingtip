"""The shapes app.routers.chart sends and takes, as Pydantic models."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from .common import PickSummary


Rating = Literal[0, 1, 2, 3, 4, 5]
Role = Literal["dr", "visual"]
Source = Literal["detected", "added"]


class Pick(BaseModel):
    """A pilot's own mark on the chart. `rated` is derived from the
    rating, so a rated point can never describe itself as unrated."""

    route: str | None = None
    source: Source
    role: Role | None = None
    category: str
    lat: float
    lon: float
    along_track_nm: float
    cross_track_nm: float
    rating: Rating | None = None
    area_m2: float = 0.0
    note: str | None = None
    created_at: str | None = None

    @field_validator("area_m2", mode="before")
    @classmethod
    def _missing_area_is_zero(cls, value):
        return 0.0 if value is None else value

    @computed_field
    @property
    def rated(self) -> bool:
        return self.rating is not None


class DisplacedPick(BaseModel):
    """A pick on another point that a save took the place of: the store
    keeps one pick per place (wingtip.routecsv.SAME_PLACE_NM), whatever each
    point is."""

    lat: float
    lon: float
    category: str


class PickSaved(BaseModel):
    ok: bool
    pick: Pick
    summary: PickSummary
    #: Picks on other points nearby that this one replaced -- no longer
    #: saved, though the page may still show them rated.
    displaced: list[DisplacedPick] = []


class PickDeleted(BaseModel):
    ok: bool
    summary: PickSummary


class Classification(BaseModel):
    """What the chart draws at one point; None where it has no coverage."""

    model_config = ConfigDict(extra="allow")

    category: str | None
    reason: str | None = None


class Detection(BaseModel):
    """A point the chart-vision detector found. `rating`/`role` are None
    until a pick claims it; `rated` is derived from the rating, as a
    Pick's is, rather than set beside it. `score` is the palette's
    constant for its kind; `predicted_score` the chart model's rating
    for it (wingtip.chartmodel), None while none is promoted or the corridor
    is still being read for the first time."""

    lat: float
    lon: float
    category: str
    area_m2: float
    score: float
    predicted_score: float | None = None
    along_track_nm: float
    cross_track_nm: float
    rating: Rating | None
    role: Role | None

    @computed_field
    @property
    def rated(self) -> bool:
        return self.rating is not None


class DetectStart(BaseModel):
    type: Literal["start"] = "start"
    route: str


class DetectBlock(BaseModel):
    type: Literal["block"] = "block"
    block: int
    blocks: int
    tiles: int = 0
    missing: int = 0
    detections: list[Detection]


class DetectDone(BaseModel):
    type: Literal["done"] = "done"
    total: int
    added: list[Pick]
    summary: PickSummary


class DetectError(BaseModel):
    """The corridor read failed after the stream had started; always the
    last line."""

    type: Literal["error"] = "error"
    detail: str


DetectMessage = Annotated[DetectStart | DetectBlock | DetectDone | DetectError, Field(discriminator="type")]
