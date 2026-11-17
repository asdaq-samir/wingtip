"""Chart tiles for a route: the corridor's tiles, the web-mercator pixel
plane they sit in, and the Mosaic stitched from them (blocks of dense
rectangles, so a long diagonal corridor does not allocate its empty
bounding box). wingtip.chartvision segments the mosaic."""

from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from . import charts, geo
from .chartpalette import _COLOUR_BITS, GRATICULE_HALF_WIDTH_PX, GRATICULE_STEP_DEG, _colour_table
from .config import VFR_SECTIONAL_MAX_ZOOM
from .geo import distance_nm, tile_lat_lon, tile_xy

TILE_PX = 256
DEFAULT_ZOOM = VFR_SECTIONAL_MAX_ZOOM  # 12; the chart's own maximum


def latlon_to_global_px(lat: float, lon: float, zoom: int = DEFAULT_ZOOM) -> tuple:
    """Web-mercator pixel coordinates at `zoom`, in the whole-world plane."""
    x, y = tile_xy(lat, lon, zoom)
    return x * TILE_PX, y * TILE_PX


def global_px_to_latlon(x: float, y: float, zoom: int = DEFAULT_ZOOM) -> tuple:
    return tile_lat_lon(x / TILE_PX, y / TILE_PX, zoom)


def metres_per_pixel(lat: float, zoom: int = DEFAULT_ZOOM) -> float:
    """Ground resolution at this latitude -- web mercator stretches with
    latitude, so a pixel is not a fixed distance and blob areas would be
    overstated in the north without this."""
    return geo.WEB_MERCATOR_CIRCUMFERENCE_M * math.cos(math.radians(lat)) / ((2**zoom) * TILE_PX)


def corridor_tiles(start: tuple, end: tuple, half_width_nm: float, zoom: int = DEFAULT_ZOOM) -> list:
    """The tile (x, y) pairs covering a corridor around the route.

    Walks the great circle rather than taking the bounding box of the two
    endpoints: a long diagonal route's bounding box is mostly empty, and
    fetching it would multiply the tile count for nothing.
    """
    from .geo import bearing_deg, destination_point

    total_nm = distance_nm(start[0], start[1], end[0], end[1])
    step_nm = max(1.0, half_width_nm)
    tiles, current, travelled = set(), start, 0.0
    while True:
        for side in (-90.0, 0.0, 90.0):
            bearing = bearing_deg(current[0], current[1], end[0], end[1]) + side
            offset = current if side == 0.0 else destination_point(current[0], current[1], bearing, half_width_nm)
            px, py = latlon_to_global_px(offset[0], offset[1], zoom)
            tiles.add((int(px // TILE_PX), int(py // TILE_PX)))
        if travelled >= total_nm:
            break
        bearing = bearing_deg(current[0], current[1], end[0], end[1])
        current = destination_point(current[0], current[1], bearing, step_nm)
        travelled += step_nm

    # No hole-filling pass. The sampling step above is at most
    # half_width_nm, and a zoom-12 tile is about 5 nm across at these
    # latitudes, so consecutive samples land in the same or an adjacent
    # tile and cannot skip one. Dilating the set "to be safe" would have
    # widened an already 3-wide corridor to 5 and roughly tripled the
    # tiles fetched, which is the one cost that actually matters here.
    return sorted(tiles)


def fetch_tile(x: int, y: int, zoom: int = DEFAULT_ZOOM) -> Image.Image | None:
    """One sectional tile as RGB, rendered from the FAA's own raster by
    wingtip.charts (and cached there on disk, so a second route through the
    same area reads it back instantly). None where no chart covers the
    tile -- open water, Canada -- so one missing tile leaves a hole in
    the mosaic rather than failing the whole read.

    The same tiles back the map's own tile endpoint (planning-service's
    /api/chart-tile/sec/...): a corridor planned once has its map tiles
    ready, and a map browsed once has its detection tiles ready. The
    transparency of an uncovered corner is white here, since the
    detector's road-and-rail class looks for black.
    """
    return charts.tile_image(x, y, zoom, kind="sec")


@dataclass
class Mosaic:
    """A stitched block of chart tiles plus where it sits in the world."""

    pixels: np.ndarray  # (h, w, 3) uint8
    origin_px: tuple  # global pixel coords of the top-left corner
    zoom: int
    #: True where a tile was actually pasted. A tile the FAA publishes
    #: no sheet for -- open water, Canada, the gap either side of an
    #: Alaska route -- leaves its block of the canvas at the zeros it
    #: was allocated with, and (0, 0, 0) is not "no data" to a colour
    #: test: it is black, which is exactly what _dark_line looks for.
    #: Every missing tile was therefore being read as a solid block of
    #: road and railway linework, and a course crossing one came back
    #: with a string of road_or_rail crossings on chart that does not
    #: exist. 75 of 463 detections on one Alaska-to-Duluth route.
    covered: np.ndarray | None = None
    missing_tiles: int = 0
    fetched_tiles: int = 0
    cached_tiles: int = 0
    #: Each pixel's palette classes as bits (_colour_table), read once.
    _classes: np.ndarray | None = field(default=None, repr=False)

    def to_latlon(self, cx: float, cy: float) -> tuple:
        return global_px_to_latlon(self.origin_px[0] + cx, self.origin_px[1] + cy, self.zoom)

    def graticule(self) -> np.ndarray:
        """Where the chart draws its latitude and longitude lines: every
        GRATICULE_STEP_DEG, in the same near-black as roads and railroads
        and as long, so each one read as a road or railroad wherever the
        course crossed it -- and its minute ticks, attached to it, the
        same a few hundred metres either side. A pilot rated them 0. In
        web mercator a parallel is a row and a meridian a column, so the
        line is known exactly from the pixel's place and needs no reading:
        a band GRATICULE_HALF_WIDTH_PX either side of each. With the line
        out, its ticks are each too short to be a line (MIN_LINE_EXTENT_PX).
        A road that runs along one exactly is lost with it, which is rare;
        one that crosses it loses a few pixels and stays one line."""
        height, width = self.pixels.shape[:2]
        out = np.zeros((height, width), dtype=bool)
        north, west = self.to_latlon(0, 0)
        south, east = self.to_latlon(width, height)
        step, half = GRATICULE_STEP_DEG, GRATICULE_HALF_WIDTH_PX
        for k in range(math.ceil(south / step), math.floor(north / step) + 1):
            row = round(latlon_to_global_px(k * step, west, self.zoom)[1] - self.origin_px[1])
            out[max(0, row - half) : row + half + 1, :] = True
        for k in range(math.ceil(west / step), math.floor(east / step) + 1):
            col = round(latlon_to_global_px(north, k * step, self.zoom)[0] - self.origin_px[0])
            out[:, max(0, col - half) : col + half + 1] = True
        return out

    def colour(self, test) -> np.ndarray:
        """Where `test` -- a palette class's colour test -- holds: looked
        up per pixel in the table of every colour's answers, which one
        pass over the block reads for every class at once, where each
        test was arithmetic over the whole block. A test not in the
        table is worked out as before."""
        bit = _COLOUR_BITS.get(test)
        if bit is None:
            channels = self.pixels.astype(np.int16)
            return test(channels[:, :, 0], channels[:, :, 1], channels[:, :, 2])
        if self._classes is None:
            pixels = self.pixels
            codes = (pixels[:, :, 0].astype(np.uint32) << 16) | (pixels[:, :, 1].astype(np.uint32) << 8) | pixels[:, :, 2]
            self._classes = _colour_table()[codes]
        return (self._classes & bit) != 0

    def on_chart(self, mask: np.ndarray) -> np.ndarray:
        """`mask` with everything off the published chart removed. Every
        palette test goes through this, so a new one cannot forget."""
        return mask if self.covered is None else mask & self.covered


def build_mosaic(tiles: list, zoom: int = DEFAULT_ZOOM, max_workers: int = 8) -> Mosaic:
    """Render and stitch `tiles` into one array.

    The charts the block needs are downloaded first, once, on this
    thread -- a 70 MB sectional the first time a corridor crosses it,
    nothing after -- and only then are the tiles rendered, in parallel:
    the warp itself releases the GIL, so a handful of workers keeps a
    block to a few seconds. (Back when the tiles came from a hosted map
    service this ran 48 workers, because the work was all round trip.)

    The disk cache matters as much: the second plan through the same
    corridor renders nothing at all.
    """
    xs = [x for x, _ in tiles]
    ys = [y for _, y in tiles]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    width, height = (x1 - x0 + 1) * TILE_PX, (y1 - y0 + 1) * TILE_PX
    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    covered = np.zeros((height, width), dtype=bool)

    west, south, _, _ = charts.tile_bbox_wgs84(x0, y1, zoom)
    _, _, east, north = charts.tile_bbox_wgs84(x1, y0, zoom)
    charts.prepare_for_bbox((west, south, east, north), kinds=("sec",))

    cached = sum(1 for x, y in tiles if charts.tile_cached(x, y, zoom, "sec"))
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        results = pool.map(lambda t: (t, fetch_tile(t[0], t[1], zoom)), tiles)
        missing = 0
        for (x, y), image in results:
            if image is None:
                missing += 1
                continue
            px, py = (x - x0) * TILE_PX, (y - y0) * TILE_PX
            canvas[py : py + TILE_PX, px : px + TILE_PX] = np.asarray(image)
            covered[py : py + TILE_PX, px : px + TILE_PX] = True

    return Mosaic(
        pixels=canvas,
        origin_px=(x0 * TILE_PX, y0 * TILE_PX),
        zoom=zoom,
        covered=covered,
        missing_tiles=missing,
        fetched_tiles=len(tiles) - cached,
        cached_tiles=cached,
    )


# How many tiles across a single stitched block may span. A block is
# allocated as a dense rectangle, so this bounds memory and the pixels
# segmented -- see tile_blocks.
MAX_BLOCK_TILES = 6


def _has_chart(block: list, zoom: int) -> bool:
    """Whether any sectional sheet reaches this block at all.

    Asked before a block is read rather than after. A corridor is a
    rectangle of tiles and a long one can cross hundreds of miles the
    FAA publishes no sheet for -- the Pacific, Canada, the gap either
    side of an Alaska route. Those blocks used to be fetched tile by
    tile (every one a 404), stitched into an all-zero canvas, and run
    through the whole palette segmentation to find nothing, while the
    progress line counted them as work. Now they are not in the list,
    so the percentage measures chart actually read.

    Tested against each sheet's own envelope, which includes the
    printed collar and is therefore a superset of the chart face. That
    is the safe direction for skipping: no overlap with the envelope
    means there is certainly no chart, while a block that overlaps only
    the collar is still read and simply finds nothing.
    """
    xs = [x for x, _ in block]
    ys = [y for _, y in block]
    west, south, _, _ = charts.tile_bbox_wgs84(min(xs), max(ys), zoom)
    _, _, east, north = charts.tile_bbox_wgs84(max(xs), min(ys), zoom)
    return any(
        west < sheet_east and sheet_west < east and south < sheet_north and sheet_south < north
        for _, (sheet_west, sheet_south, sheet_east, sheet_north) in charts.sheets(charts.SECTIONAL)
    )


def tile_blocks(tiles: list, max_span: int = MAX_BLOCK_TILES) -> list:
    """Split a corridor's tiles into small dense rectangles to stitch.

    A route corridor is a thin diagonal ribbon, and the bounding box of a
    long one is almost entirely empty. Stitching it as a single mosaic
    allocated that whole rectangle: a 323 nm route spans roughly 62 by 55
    tiles, which is 668 MB of canvas to hold about 191 tiles of actual
    chart, and it made a fully cached run take 39 s.

    Blocks advance along the corridor in columns and take every tile in
    that column range, which suits a shape that is long in one direction
    and a few tiles thick in the other. One column of overlap so a lake
    on a seam is seen whole by one block; _dedupe drops the double
    sighting.

    The first version grouped by a square window in both axes and marked
    only an inner core as consumed, which re-stitched 369 tiles to cover
    198 -- 1.86x redundancy on a corridor barely three tiles thick.
    """
    if not tiles:
        return []
    by_x = {}
    for x, y in tiles:
        by_x.setdefault(x, []).append(y)

    columns = sorted(by_x)
    blocks, start = [], 0
    stride = max(1, max_span - 1)
    while start < len(columns):
        window = columns[start : start + max_span]
        block = [(x, y) for x in window for y in by_x[x]]
        if block:
            blocks.append(block)
        if start + max_span >= len(columns):
            break
        start += stride
    return blocks
