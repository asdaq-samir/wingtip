"""The ground the map draws in relief and in 3D, and the obstacles on it
(wingtip.terrain_view): parsed, asked, answered."""

from typing import Annotated

import requests
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from wingtip import terrain_view

from ..gateway import PUBLIC, SHARED
from ..terrain_schemas import Obstacle, Obstacles

router = APIRouter()

#: The ground does not change between chart cycles: a tile is kept by the
#: browser (and the CDN, SHARED) for a month.
_TERRAIN_TILE_MAX_AGE_S = 30 * 24 * 3600


@router.get(
    "/api/terrain-tile/{z}/{x}/{y}.png",
    responses={200: {"content": {"image/png": {}}}, 404: {"description": "No terrain tile at that zoom"}},
    openapi_extra=SHARED,
)
def terrain_tile(z: int, x: int, y: int) -> Response:
    """The ground's heights for one {z}/{x}/{y} tile as a terrarium PNG:
    the AWS Terrain Tiles (USGS 3DEP, SRTM and, offshore, ETOPO1) the
    planner reads its terrain floors from, their voids filled and the sea
    floor the sea's surface, so the map's relief and 3D ground are the
    ground the altitudes were planned over. Zooms 0 to 13: 13 built ahead
    round the public-use airports and over steep ground, from USGS 3DEP's
    1/3 arc-second (wingtip.terrain_fine), and elsewhere its zoom-12
    parent drawn larger, never fetched on the request."""
    try:
        png = terrain_view.tile_png(z, x, y)
    except terrain_view.NoSuchTile as err:
        raise HTTPException(404, str(err)) from err
    except requests.RequestException as err:
        raise HTTPException(503, "The terrain tile could not be fetched.") from err
    return Response(content=png, media_type="image/png", headers={"Cache-Control": f"public, max-age={_TERRAIN_TILE_MAX_AGE_S}"})


@router.get("/api/terrain/obstacles", response_model=Obstacles, openapi_extra=PUBLIC)
def obstacles(
    south: Annotated[float, Query(ge=-90, le=90)],
    west: Annotated[float, Query(ge=-180, le=180)],
    north: Annotated[float, Query(ge=-90, le=90)],
    east: Annotated[float, Query(ge=-180, le=180)],
    min_agl_ft: Annotated[int, Query(ge=0, le=2000)] = terrain_view.OBSTACLE_MIN_AGL_FT,
) -> Obstacles:
    """The FAA's Digital Obstacle File's obstacles in a box at least
    `min_agl_ft` tall (200 ft by default, 14 CFR 77.9(a)'s), tallest
    first, for the map to stand them up over its 3D ground. A box over two
    degrees either way is a 422: the map asks for its view close in."""
    try:
        found, more = terrain_view.obstacles_in_box(south, west, north, east, min_agl_ft)
    except terrain_view.BoxTooWide as err:
        raise HTTPException(422, str(err)) from err
    except (requests.RequestException, OSError) as err:
        raise HTTPException(503, "The FAA's obstacle file could not be read.") from err
    return Obstacles(obstacles=[Obstacle(**o) for o in found], more=more)
