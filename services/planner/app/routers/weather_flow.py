"""The map's flow layer (wingtip.weather_flow): the model weather's
timeline and each hour's picture of a field, as the weather service
stored them. Nothing here waits on NOMADS."""

from fastapi import APIRouter, HTTPException, Path, Query, Response
from fastapi.responses import FileResponse
from wingtip import weather_flow

from ..gateway import PUBLIC
from ..schemas.weather_flow import FlowLayer

router = APIRouter()

#: A field's picture: its name, and a level's after a dash ("wind-060",
#: "turb-max"), or the world's wind ("world").
FIELD = r"^[a-z]+(-[a-z0-9]{3})?$"
#: The timeline is asked again often (the apps every ten minutes): a
#: minute fresh, and served stale while it is asked again behind.
INDEX_CACHE = "public, max-age=60, stale-while-revalidate=600"
#: A picture asked for at its version never changes (its address carries
#: the run that made it), so it is kept for good.
IMMUTABLE = "public, max-age=31536000, immutable"


@router.get("/api/weather/flow", response_model=FlowLayer, openapi_extra=PUBLIC)
def flow_layer(response: Response) -> FlowLayer:
    """The timeline's frames, oldest first: the last hour, now and every
    second hour to twelve ahead, each with its models' runs, its fields and
    (an hour past) the radar mosaic. A 404 where the weather service holds
    none yet, or none recent enough to show."""
    layer = weather_flow.layer()
    if layer is None:
        raise HTTPException(404, "The model weather isn't available yet.")
    response.headers["Cache-Control"] = INDEX_CACHE
    return FlowLayer(**layer)


@router.get(
    "/api/weather/flow/{frame}/{field}.png",
    response_class=FileResponse,
    responses={200: {"content": {"image/png": {}}, "description": "The field's picture"}},
    openapi_extra=PUBLIC,
)
def flow_picture(
    frame: str = Path(pattern=r"^\d{10}$"),
    field: str = Path(pattern=FIELD),
    v: str | None = Query(default=None, pattern=r"^[a-z0-9]{1,40}$", description="The picture's version, the frame's versions[field]"),
) -> FileResponse:
    """One frame's picture of a field, a PNG of the layer's grid (FlowLayer's
    bounds and the field's encoding); a 404 for a frame no longer held.
    Asked for at its current version it is kept for good; otherwise not
    kept, as the next fetch may change it."""
    found = weather_flow.picture(frame, field)
    if found is None:
        raise HTTPException(404, "That hour's picture is no longer held.")
    path, version = found
    cache = IMMUTABLE if v == version else "no-store"
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": cache})
