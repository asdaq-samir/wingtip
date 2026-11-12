"""The shapes app.routers.weather_flow sends, as Pydantic models."""

from pydantic import BaseModel


class FlowField(BaseModel):
    """How a field's PNG holds it: its unit, the values its channel's 0
    and 255 stand for (a 255th a step between), and whether it is the
    wind, its east part in red and its north part in green."""

    unit: str
    unscale: list[float]
    vector: bool


class FlowSource(BaseModel):
    """Where a field's picture came from, as the legend says it: its
    source's name ("AWC winds", "NOAA GFS"), when the run that made it
    was made, ISO UTC, whether that is older than the source's cadence
    and a margin (`stale`), and whether NOAA's model stands in for AWC's
    while AWC's is unavailable (`fallback`)."""

    label: str
    issued: str | None = None
    stale: bool
    fallback: bool


class FlowFrame(BaseModel):
    """One hour of the flow layer's timeline (wingtip.weather_flow): its
    id (YYYYMMDDHH, the PNGs' address), when it is valid, ISO UTC, the
    models that made it ("HRRR and GFS" over the lower 48 and the GFS
    beyond, or the GFS alone) with each one's run and forecast hour,
    whether its hour has come (`past`), the fields it has, and for a past
    hour the radar mosaic made by then, XYZ tiles, None with none. A
    field is a name and, at a level, the level after a dash ("wind-060");
    `versions` gives each picture's version, its address's `v`, and
    `sources` where each came from."""

    id: str
    valid: str
    model: str
    gfs_run: str | None = None
    gfs_forecast_hour: int | None = None
    hrrr_run: str | None = None
    hrrr_forecast_hour: int | None = None
    past: bool
    fields: list[str]
    versions: dict[str, str] = {}
    sources: dict[str, FlowSource] = {}
    radar_tiles: str | None = None


class FlowLayer(BaseModel):
    """The flow layer's timeline, oldest frame first; the pictures' box,
    [west, south, east, north] degrees, and the world wind's ("world");
    each field's levels by AWC's names ("sfc", "060", "max"); each
    field's encoding; when the
    weather service fetched it, UNIX seconds; and the credit."""

    frames: list[FlowFrame]
    bounds: list[float]
    world_bounds: list[float] | None = None
    levels: dict[str, list[str]] = {}
    fields: dict[str, FlowField]
    fetched_at: float
    credit: str
