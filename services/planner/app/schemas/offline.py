"""The shapes app.routers.offline sends, as Pydantic models: the chart
regions a phone can keep for flying with no signal (wingtip.offline_charts)."""

from pydantic import BaseModel


class OfflineRegion(BaseModel):
    """A place to keep: a sectional sheet's coverage, a state, or a box
    drawn on the map. `sizes` are the bytes of each of its archives
    already worked out ("sec", "sec@2x", "tac" ...); the rest come with
    the region's own answer."""

    id: str
    name: str
    group: str
    boxes: list[list[float]]
    sizes: dict[str, int]


class OfflineOverlay(BaseModel):
    """The map's overlays of the cycle, the whole country in one archive
    (/api/overlay-tiles/{name}.pmtiles), kept with any region."""

    name: str
    bytes: int


class OfflineCatalog(BaseModel):
    """What can be kept: the cycle the map draws, the day it is replaced,
    the next cycle where it is here ahead of its date, the archives each
    cycle has (a kind and a density: "sec", "sec@2x"), the overlays and
    the regions."""

    cycle: str
    expires: str | None
    next_cycle: str | None
    next_effective: str | None
    archives: list[str]
    overlay: OfflineOverlay | None
    regions: list[OfflineRegion]


class OfflineArchive(BaseModel):
    """One archive of a region: its kind and density, how many tiles and
    bytes it holds (`exact` once cut, else from the directory, within a
    few KB), and its address under the planner."""

    archive: str
    kind: str
    scale: int
    tiles: int
    bytes: int
    exact: bool
    url: str


class OfflinePack(BaseModel):
    """A cycle pack the region touches (/api/cycle-pack/{cycle}/{name}.pack)."""

    name: str
    bytes: int
    url: str


class OfflineRegionFiles(BaseModel):
    """Everything a phone fetches to keep a region of a cycle: an archive
    per kind and density with tiles there, and the cycle packs it touches."""

    cycle: str
    expires: str | None
    region: OfflineRegion
    archives: list[OfflineArchive]
    packs: list[OfflinePack]


class OfflineBox(BaseModel):
    """A box drawn on the map as a region id, snapped outward to the half
    degree (wingtip.offline_regions.box_id)."""

    id: str
