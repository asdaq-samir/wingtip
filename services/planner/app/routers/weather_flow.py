"""The map's flow layer (wingtip.weather_flow): the model weather's
timeline and each hour's picture of a field, as the weather service
stored them. Nothing here waits on NOMADS."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Path
from fastapi.responses import FileResponse
from wingtip import weather_flow

from ..gateway import PUBLIC
from ..schemas.weather_flow import FlowLayer

router = APIRouter()

Field = Literal["wind", "gust", "precip", "cloud", "temp", "vis"]


@router.get("/api/weather/flow", response_model=FlowLayer, openapi_extra=PUBLIC)
def flow_layer() -> FlowLayer:
    """The timeline's frames, oldest first: the last hour, now and every
    second hour to twelve ahead, each with its models' runs, its fields and
    (an hour past) the radar mosaic. A 404 where the weather service holds
    none yet, or none recent enough to show."""
    layer = weather_flow.layer()
    if layer is None:
        raise HTTPException(404, "The model weather isn't available yet.")
    return FlowLayer(**layer)


@router.get(
    "/api/weather/flow/{frame}/{field}.png",
    response_class=FileResponse,
    responses={200: {"content": {"image/png": {}}, "description": "The field's picture"}},
    openapi_extra=PUBLIC,
)
def flow_picture(frame: str = Path(pattern=r"^\d{10}$"), field: Field = Path()) -> FileResponse:
    """One frame's picture of a field, a PNG of the layer's grid (FlowLayer's
    bounds and the field's encoding); a 404 for a frame no longer held."""
    path = weather_flow.picture(frame, field)
    if path is None:
        raise HTTPException(404, "That hour's picture is no longer held.")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "no-store"})
