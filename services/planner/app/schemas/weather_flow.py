"""The shapes app.routers.weather_flow sends, as Pydantic models."""

from pydantic import BaseModel


class FlowField(BaseModel):
    """How a field's PNG holds it: its unit, the values its channel's 0
    and 255 stand for (a 255th a step between), and whether it is the
    wind, its east part in red and its north part in green."""

    unit: str
    unscale: list[float]
    vector: bool


class FlowFrame(BaseModel):
    """One hour of the flow layer's timeline (wingtip.weather_flow): its
    id (YYYYMMDDHH, the PNGs' address), when it is valid, ISO UTC, the
    models that made it ("HRRR and GFS" over the lower 48 and the GFS
    beyond, or the GFS alone) with each one's run and forecast hour,
    whether its hour has come (`past`), the fields it has, and for a past
    hour the radar mosaic made by then, XYZ tiles, None with none."""

    id: str
    valid: str
    model: str
    gfs_run: str | None = None
    gfs_forecast_hour: int | None = None
    hrrr_run: str | None = None
    hrrr_forecast_hour: int | None = None
    past: bool
    fields: list[str]
    radar_tiles: str | None = None


class FlowLayer(BaseModel):
    """The flow layer's timeline, oldest frame first; the pictures' box,
    [west, south, east, north] degrees; each field's encoding; when the
    weather service fetched it, UNIX seconds; and the credit."""

    frames: list[FlowFrame]
    bounds: list[float]
    fields: dict[str, FlowField]
    fetched_at: float
    credit: str
