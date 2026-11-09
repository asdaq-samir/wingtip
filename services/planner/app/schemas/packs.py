"""The shapes app.routers.packs sends and takes, as Pydantic models."""

from pydantic import BaseModel


class CyclePackRegion(BaseModel):
    """One region's phone pack (wingtip.cycle_pack's write_phone): its bounds in
    degrees, its size in bytes and its CRC-32 (zlib's), for the phone to
    check it whole."""

    name: str
    west: float
    south: float
    east: float
    north: float
    bytes: int
    crc32: int


class CyclePacks(BaseModel):
    """The phones' packs of the FAA cycle the planner holds: the regions
    there are, each fetched at /api/cycle-pack/{cycle}/{name}.pack; how
    far the packs' lines may stray from the FAA's (degrees, and the worst
    in nm); and how big a region is (degrees)."""

    cycle: str
    built_at: float
    tolerance_deg: float
    worst_nm: float
    region_deg: int
    regions: list[CyclePackRegion]


class OverlayTilesLayer(BaseModel):
    """One layer of the overlay tiles (wingtip.vector_tiles.LAYERS) and how
    many features it holds."""

    name: str
    features: int


class OverlayTiles(BaseModel):
    """The map's FAA overlays as vector tiles (wingtip.vector_tiles): one
    PMTiles archive of the cycle, fetched in byte ranges at
    /api/overlay-tiles/{name}.pmtiles; its zooms, and how far its lines
    may stray from the FAA's (metres on the ground)."""

    cycle: str
    name: str
    version: int
    bytes: int
    built_at: float
    min_zoom: int
    max_zoom: int
    tolerance_m: float
    layers: list[OverlayTilesLayer]
