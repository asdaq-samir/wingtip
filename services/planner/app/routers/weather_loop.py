"""The radar and satellite loop on the map (wingtip.weather_loop): which
frames there are and each one's tiles, for the apps to preload and play.
The tiles themselves the apps ask IEM and nowCOAST for."""

from typing import Literal

from fastapi import APIRouter, Query
from wingtip import weather_loop

from ..gateway import PUBLIC
from ..schemas.weather_loop import WeatherLoop
from . import weather_flow

router = APIRouter()
# The model weather's flow layer, the map's other moving weather, on this
# router rather than another line in app.main (which is at its size).
router.include_router(weather_flow.router)


@router.get("/api/weather/loop", response_model=WeatherLoop, openapi_extra=PUBLIC)
def weather_loop_frames(
    kind: Literal["radar", "ir", "visible", "both"] = Query(
        description="Radar; the infrared or visible satellite picture; or radar over the infrared"
    ),
) -> WeatherLoop:
    """The loop's frames, oldest first: the radar's last hour five minutes
    apart, or a satellite picture's last two hours ten minutes apart; each
    frame's time and its tile templates. An empty list where the weather
    service holds nothing of the source yet."""
    return WeatherLoop(**weather_loop.frames(kind))
