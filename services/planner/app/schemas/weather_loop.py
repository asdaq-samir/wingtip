"""The shapes app.routers.weather_loop sends, as Pydantic models."""

from typing import Literal

from pydantic import BaseModel


class LoopFrame(BaseModel):
    """One frame of the loop (wingtip.weather_loop): when it was made, ISO
    UTC -- the older of its layers' times -- and each layer's XYZ tile
    template, None where the frame does not draw it. The satellite's
    carries `{bbox-epsg-3857}`, the tile's box in web Mercator metres."""

    valid: str
    radar_tiles: str | None = None
    satellite_tiles: str | None = None


class WeatherLoop(BaseModel):
    """The radar or satellite loop the map plays, oldest frame first, the
    step between frames, how old the newest may be before the apps label
    it old, and the sources' credit."""

    kind: Literal["radar", "ir", "visible", "both"]
    frames: list[LoopFrame]
    step_s: float
    old_after_s: float
    credit: str
