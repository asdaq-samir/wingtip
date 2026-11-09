"""The chart regions a phone keeps for flying with no signal
(wingtip.offline_charts): the list of what can be kept, a region's files
with their sizes before any is fetched, and a region's archive of one
chart kind and density, cut from the cycle's archives on the first ask
and kept on disk for the cycle."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from wingtip import cycle_pack, data_cycles, offline_charts, offline_regions, vector_tiles

from ..gateway import SHARED, gateway
from ..router_basics import DIAGRAM_CACHE, SHARED_CACHE
from ..schemas.offline import OfflineArchive, OfflineBox, OfflineCatalog, OfflineOverlay, OfflinePack, OfflineRegion, OfflineRegionFiles

router = APIRouter()


def _day(value) -> str | None:
    return value.isoformat() if value else None


def _region(cycle: str, region: offline_regions.Region) -> OfflineRegion:
    return OfflineRegion(
        id=region.id,
        name=region.name,
        group=region.group,
        boxes=[list(b) for b in region.boxes],
        sizes=offline_charts.known_sizes(cycle, region),
    )


@router.get("/api/offline-charts", response_model=OfflineCatalog, openapi_extra=SHARED)
def offline_catalog() -> JSONResponse:
    """The sectional sheets and the states a phone can keep the charts of,
    with each archive's size where it is known (all of them within about
    a minute of a cycle's first ask), the overlays, and the cycle's end.
    404 until the cycle's archives are on this disk."""
    cycle, ahead = offline_charts.cycles()
    if cycle is None:
        raise HTTPException(404, "no chart archives here yet: the charts job packs them once a cycle")
    regions = offline_regions.catalog()
    offline_charts.warm(cycle, regions)
    overlay = vector_tiles.tiles_index()
    body = OfflineCatalog(
        cycle=cycle,
        expires=_day(offline_charts.expires(cycle)),
        next_cycle=ahead,
        next_effective=_day(data_cycles.chart_effective(ahead)),
        archives=offline_charts.archives_of(cycle),
        overlay=OfflineOverlay(name=overlay["name"], bytes=overlay["bytes"]) if overlay else None,
        regions=[_region(cycle, r) for r in regions],
    )
    return JSONResponse(body.model_dump(), headers={"Cache-Control": SHARED_CACHE})


def _found(cycle: str, region_id: str) -> offline_regions.Region:
    region = offline_regions.find(region_id)
    if region is None:
        raise HTTPException(
            404,
            f"no region {region_id}: a sheet, state-XX, or a box of at most "
            f"{offline_regions.BOX_MOST_DEG2:g} square degrees on the "
            f"{offline_regions.BOX_GRID:g}-degree grid",
        )
    if not offline_charts.archives_of(cycle):
        raise HTTPException(404, f"no chart archives of {cycle} here")
    return region


@router.get("/api/offline-charts/{cycle}/{region}", response_model=OfflineRegionFiles, openapi_extra=SHARED)
def offline_region(cycle: str, region: str) -> JSONResponse:
    """A region's files for a cycle, each with its size before it is
    fetched: an archive per chart kind and density it has tiles of, and
    the cycle packs it touches. A drawn box is `box_W_S_E_N` snapped to
    the half degree (offline_regions.box_id)."""
    found = _found(cycle, region)
    base = f"/api/offline-charts/{cycle}/{found.id}"
    index = cycle_pack.phone_index()
    body = OfflineRegionFiles(
        cycle=cycle,
        expires=_day(offline_charts.expires(cycle)),
        region=_region(cycle, found),
        archives=[OfflineArchive(**a, url=f"{base}/{a['archive']}.pmtiles") for a in offline_charts.region_archives(cycle, found)],
        packs=[
            OfflinePack(name=p["name"], bytes=p["bytes"], url=f"/api/cycle-pack/{index['cycle']}/{p['name']}.pack")
            for p in offline_charts.packs_for(found, index)
        ],
    )
    return JSONResponse(body.model_dump(), headers={"Cache-Control": SHARED_CACHE})


@router.get("/api/offline-box", response_model=OfflineBox, openapi_extra=SHARED)
def offline_box(
    west: Annotated[float, Query(ge=-180, le=180)],
    south: Annotated[float, Query(ge=-85, le=85)],
    east: Annotated[float, Query(ge=-180, le=180)],
    north: Annotated[float, Query(ge=-85, le=85)],
) -> OfflineBox:
    """The id of a box drawn on the map, snapped outward to the half
    degree, for /api/offline-charts/{cycle}/{region}."""
    return OfflineBox(id=offline_regions.box_id(west, south, east, north))


@router.get(
    "/api/offline-charts/{cycle}/{region}/{archive}.pmtiles",
    responses={
        200: {"content": {"application/octet-stream": {}}},
        206: {"description": "The byte range asked for (Range: bytes=a-b)", "content": {"application/octet-stream": {}}},
    },
    # Fetched whole by a phone's background download, which resumes
    # from a range; its length is its progress.
    openapi_extra=gateway("public", cache=True, range=True, headers=("Content-Length", "Content-Range", "Accept-Ranges", "ETag")),
)
def offline_archive(cycle: str, region: str, archive: str) -> FileResponse:
    """The region's archive of one chart kind and density ("sec",
    "sec@2x", "tac", "ifr_low" ...), a PMTiles file of the same tiles the
    map's chart is drawn from. Cut on the first ask (Chicago's sectional
    at 2x, 583 MB, in under a second from a warm disk) and kept for the
    cycle, which its address names."""
    found = _found(cycle, region)
    if offline_charts.parse_archive(archive) is None:
        raise HTTPException(404, f"no chart archive {archive}")
    path = offline_charts.cut(cycle, found, archive)
    if path is None:
        raise HTTPException(404, f"{found.name} has no {archive} tiles in {cycle}")
    return FileResponse(path, media_type="application/octet-stream", headers={"Cache-Control": DIAGRAM_CACHE})
