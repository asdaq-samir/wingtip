"""USGS 3DEP point elevation queries (no API key needed), used to estimate
local elevation prominence -- how much a candidate stands above its
immediate surroundings, a rough proxy for "sticks up and is easy to spot
from the air."

The public EPQS endpoint is slow and occasionally times out under a single
sequential connection, so lookups are parallelized with a thread pool and
cached to disk (keyed by lat/lon rounded to ~1m) -- a fresh run over ~230
candidates takes several minutes the first time and is instant after.
The USGS's tiles and EPQS themselves are asked by wingtip.elevation_sources.
"""

import csv
import io
import threading
from pathlib import Path

import numpy as np
from cachetools import LRUCache

from . import atomic, elevation_sources, outside, units
from .config import REQUEST_HEADERS
from .engine import ask as engine
from .geo import destination_point, tile_xy
from .routecsv import locked

DEFAULT_CACHE_PATH = Path(__file__).resolve().parents[3] / "data" / "raw" / "elevation_cache.csv"

RING_RADIUS_NM = 1.0
RING_BEARINGS_DEG = (0, 90, 180, 270)  # N, E, S, W


def _load_cache(cache_path: Path) -> dict:
    """The file's points. A line another process is still writing at its
    end is left for the next read."""
    if not cache_path.exists():
        return {}
    cache = {}
    with cache_path.open() as f:
        for r in csv.DictReader(f):
            try:
                cache[(round(float(r["lat"]), 5), round(float(r["lon"]), 5))] = float(r["elevation_m"])
            except (TypeError, ValueError):
                continue
    return cache


# The file's points held in memory, by path, as of its last change: every
# lookup read the whole file (21,000 points, 0.7 MB, for every route) and
# every one that fetched wrote it whole again. Read again only when the
# file has changed since (another process's points).
_HELD: dict = {}
_HELD_LOCK = threading.Lock()


def _cache_of(cache_path: Path) -> dict:
    try:
        stamp = cache_path.stat().st_mtime_ns
    except OSError:
        stamp = None
    with _HELD_LOCK:
        held = _HELD.get(str(cache_path))
        if held is not None and held[0] == stamp:
            return held[1]
    cache = _load_cache(cache_path)
    with _HELD_LOCK:
        _HELD[str(cache_path)] = (stamp, cache)
    return cache


def _save_cache(fetched: dict, cache_path: Path) -> None:
    """Adds `fetched` to the file, a line a point, under its lock: two
    requests at once each add their own, and none is dropped. It was
    rewritten whole for every lookup, then whole beside it and renamed
    over it once two at once were found dropping each other's points."""
    with locked(cache_path):
        new = not cache_path.exists()
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with cache_path.open("a", newline="") as f:
            writer = csv.writer(f)
            if new:
                writer.writerow(["lat", "lon", "elevation_m"])
            writer.writerows([lat, lon, elev] for (lat, lon), elev in fetched.items())
        with _HELD_LOCK:
            held = _HELD.get(str(cache_path))
            if held is not None:
                held[1].update(fetched)
                _HELD[str(cache_path)] = (cache_path.stat().st_mtime_ns, held[1])


def _from_terrain_tiles(keys: list) -> dict:
    """The points the USGS's tiles leave out -- open water, where they hold
    no height, and past the country's edges -- from the terrain tiles
    (ground_m), the sea at its surface, 0 m, not the sea bed. EPQS answered
    these one request a point, and over the Gulf it answered nothing a
    JSON reader could read, three tries each, so a route from Seattle to
    Miami failed after minutes (2026-10-23). A point whose tile cannot be
    fetched is left out, for EPQS."""
    found: dict = {}
    # A tile that failed is not asked again for its other points: each
    # would wait out its own fetch's timeout first.
    failed: set = set()
    for key in keys:
        fx, fy = tile_xy(key[0], key[1], TERRAIN_TILE_ZOOM)
        tile = (int(fx), int(fy))
        if tile in failed:
            continue
        try:
            found[key] = max(0.0, ground_m(*key))
        except Exception:  # noqa: BLE001 -- a tile's fetch or decode failing: EPQS answers instead
            failed.add(tile)
    return found


def get_elevations_m(points: list, cache_path: Path = DEFAULT_CACHE_PATH, max_workers: int = 20) -> dict:
    """Look up elevation (meters) for a list of (lat, lon) points, using an
    on-disk cache so repeat notebook runs don't re-hit the network for
    points already seen. Returns {(lat, lon): elevation_m} for every input
    point (exact keys passed in, not the rounded cache keys). From the
    elevation tiles where they answer (above), and EPQS where they do not.
    """
    cache = _cache_of(cache_path)
    keys = [(round(lat, 5), round(lon, 5)) for lat, lon in points]
    to_fetch = sorted(set(k for k in keys if k not in cache))

    if to_fetch:
        fetched = elevation_sources.from_tiles(to_fetch)
        rest = [k for k in to_fetch if k not in fetched]
        if rest:
            fetched.update(_from_terrain_tiles(rest))
            rest = [k for k in rest if k not in fetched]
        if rest:
            fetched.update(elevation_sources.fetch_many(rest, max_workers))
        _save_cache(fetched, cache_path)
        cache = {**cache, **fetched}

    return {point: cache[key] for point, key in zip(points, keys)}


def elevation_prominence_m(
    candidates: list, radius_nm: float = RING_RADIUS_NM, bearings_deg: tuple = RING_BEARINGS_DEG, cache_path: Path = DEFAULT_CACHE_PATH
) -> list:
    """For each (lat, lon) in `candidates`, return elevation at that point
    minus the mean elevation of a ring of points `radius_nm` away in
    `bearings_deg` directions. Positive means the candidate sticks up above
    its immediate surroundings (a bluff, a hill) -- a reasonable proxy for
    "easy to pick out from the air"; near-zero or negative is flat terrain
    or a low spot (which is fine for a lake, less so for a tower).
    """
    all_points = []
    for lat, lon in candidates:
        all_points.append((lat, lon))
        for bearing in bearings_deg:
            all_points.append(destination_point(lat, lon, bearing, radius_nm))

    elevations = get_elevations_m(all_points, cache_path=cache_path)

    n_ring = len(bearings_deg)
    results = []
    for i, point in enumerate(candidates):
        base = elevations[all_points[i * (n_ring + 1)]]
        ring_points = all_points[i * (n_ring + 1) + 1 : i * (n_ring + 1) + 1 + n_ring]
        ring_mean = sum(elevations[p] for p in ring_points) / n_ring
        results.append(base - ring_mean)
    return results


# One point's ground at once, for a tap on the chart (wingtip.airspace_at):
# EPQS took 4 to 8 s a point, the elevation tiles AWS publishes
# (Terrain Tiles, from USGS 3DEP and SRTM) a third of a second for a
# tile ten kilometres across, then nothing. Zoom 12: about 38 m a pixel,
# well inside what an AGL floor needs.
TERRAIN_TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
TERRAIN_TILE_ZOOM = 12
TERRAIN_TILE_DIR = Path(__file__).resolve().parents[3] / "data" / "raw" / "terrain-tiles"
# Decoded tiles held, as float32 (a quarter of a megabyte each): a long
# IFR route's floor reads some four hundred, and with sixty-four held a
# second plan of it decoded every one from disk again (2026-10-21).
_TERRAIN_TILES: LRUCache = LRUCache(maxsize=512)
_TERRAIN_LOCK = threading.Lock()
# One pool of connections to the tiles' bucket, kept open: a new route's
# hundreds of tiles each opened their own TLS connection, most of the
# time a first plan took (2026-10-21, C81-KTPA under IFR).
_TERRAIN_SESSION = outside.session(pool=16)


#: Below the lowest ground in North America a terrain tile's pixel is the
#: sea floor (the tiles carry its bathymetry), and the surface under an
#: airplane there is the sea's, 0 m: the engine's ground_figures
#: (lowest_ground_ft, Badwater Basin's 282 ft below the sea).
LOWEST_GROUND_M = engine("ground_figures")["lowest_ground_ft"] * units.M_PER_FT


def terrarium_m(rgb: np.ndarray) -> np.ndarray:
    """A terrarium tile's heights in metres, from its RGB: NaN where the
    tile has no height (a void, the pixels round one, a spike), 0 (the
    sea's surface) where it is the sea floor (LOWEST_GROUND_M).

    The encoding (height = R * 256 + G + B / 256 - 32768) writes a void in
    its source DEM as its two ends: black, -32,768 m, and white, +32,767.996
    m. Read as heights they were the ground grid's 102 cells of 32,000 ft
    (the clip of +107,503 ft) over the Everglades, the Navajo Nation and
    some ninety more places, each with a lowest of -30,000 ft (2026-11-02:
    tile 11/565/876's pixels round 26.41 N, 80.45 W alternate between the
    two). No ground on earth is within a kilometre of either end."""
    heights = rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256 - 32768
    void = (heights <= -32767) | (heights >= 32767)
    if void.any():
        # And the pixels round a void, drawn half from it: on the Navajo
        # Nation's tile (11/395/812) they read as low as -219 m in ground of
        # 1,690 m out to 10 pixels from one, and as the ground from 12 on
        # (2026-11-02).
        from scipy import ndimage

        void |= ndimage.distance_transform_edt(~void) <= VOID_EDGE_PX
    heights = np.where(void, np.nan, heights)
    # And a pixel far off the ground round it, the tiles' own error: the
    # ringing of their resampling at a coast, 4,933 m beside 72 m on
    # Sonora's and 480 m (1,575 ft) on Florida's flat shore at St Marks
    # (2026-11-02). No ground stands so far from the median of the 5 by 5
    # pixels round it: 254 m at most on tiles over Yosemite's El Capitan
    # and Half Dome, Zion, the Grand Canyon, Big Sur, Whitney, Rainier,
    # Shasta, Hells Canyon, the Black Canyon and the Na Pali coast at
    # zooms 11 and 12; the errors stand 391 to 4,860 m off.
    heights[np.abs(heights - _neighbours_median(heights)) > SPIKE_M] = np.nan
    return np.where(heights < LOWEST_GROUND_M, 0.0, heights)


#: How far round a void the tiles' pixels are not the ground (terrarium_m).
VOID_EDGE_PX = 11

#: How far a pixel may stand from its neighbours' median before it is
#: taken for the tiles' error (terrarium_m): above the steepest ground's
#: 254 m, under the errors' 391.
SPIKE_M = 300.0


def _neighbours_median(heights: np.ndarray) -> np.ndarray:
    """Each pixel's 5 by 5 median, a void taking its nearest pixel's
    height for it."""
    from scipy import ndimage

    return ndimage.median_filter(_filled(heights), size=5, mode="nearest")


def _filled(heights: np.ndarray) -> np.ndarray:
    """A tile's voids filled from the nearest pixel that has a height, so
    a point read on one has the ground beside it; a tile with none at all
    is left as it is."""
    void = np.isnan(heights)
    if not void.any() or void.all():
        return heights
    from scipy import ndimage

    nearest = ndimage.distance_transform_edt(void, return_distances=False, return_indices=True)
    return heights[tuple(nearest)]


def _terrain_tile(z: int, x: int, y: int) -> np.ndarray:
    """A terrarium tile's heights in metres, from disk or fetched once."""
    with _TERRAIN_LOCK:
        held = _TERRAIN_TILES.get((z, x, y))
    if held is not None:
        return held
    path = TERRAIN_TILE_DIR / str(z) / str(x) / f"{y}.png"
    if path.exists():
        data = path.read_bytes()
    else:
        resp = _TERRAIN_SESSION.get(TERRAIN_TILE_URL.format(z=z, x=x, y=y), headers=REQUEST_HEADERS, timeout=20)
        resp.raise_for_status()
        data = resp.content
        with atomic.atomic_path(path, durable=False) as part:  # a tile lost to a power cut is fetched again
            part.write_bytes(data)
    # Pillow only here, where a tile is decoded: the planner's airspace
    # column is its one caller, and Pillow comes with the planner's chart
    # requirements. wingtip.pipeline imports this module for its elevation
    # cache, in pipeline images that have no Pillow -- imported at the top,
    # it took both down at build (2026-10-05).
    from PIL import Image

    rgb = np.asarray(Image.open(io.BytesIO(data)).convert("RGB")).astype(np.float64)
    # Worked in float64, kept in float32: a metre's 1/256 survives either
    # at any height on earth, and the cache holds twice as many. A void
    # takes its nearest neighbour's height, not the encoding's -32,768 m.
    heights = _filled(terrarium_m(rgb)).astype(np.float32)
    with _TERRAIN_LOCK:
        _TERRAIN_TILES[(z, x, y)] = heights
    return heights


def terrarium_rgb(heights_m: np.ndarray) -> np.ndarray:
    """Heights in metres written back in the terrarium encoding
    (terrarium_m's: height = R * 256 + G + B / 256 - 32768), as 8-bit RGB:
    what a map's raster-dem source decodes (MapLibre's `terrarium`). A
    height none could be read for is the sea's surface, 0."""
    v = np.clip(np.nan_to_num(heights_m, nan=0.0), -32767.0, 32767.0) + 32768.0
    whole = np.floor(v)
    r = np.floor(whole / 256)
    g = whole - r * 256
    b = np.floor((v - whole) * 256)
    return np.stack([r, g, b], axis=-1).astype(np.uint8)


def terrain_tile_png(z: int, x: int, y: int) -> bytes:
    """A terrain tile as the map draws its relief and 3D ground from: the
    tile _terrain_tile reads and cleans -- its voids filled, its spikes
    gone, the sea floor the sea's surface (terrarium_m) -- written again as
    a terrarium PNG. The tiles as AWS publishes them put a pit 32 km deep
    under every void (the Everglades', the Navajo Nation's, 2026-11-02),
    which a 3D map would draw as such. Raises requests.RequestException
    where the tile cannot be fetched."""
    from PIL import Image

    out = io.BytesIO()
    Image.fromarray(terrarium_rgb(_terrain_tile(z, x, y)), "RGB").save(out, "PNG")
    return out.getvalue()


def ground_m(lat: float, lon: float, zoom: int = TERRAIN_TILE_ZOOM) -> float:
    """The ground's height at a point, in metres, from the terrain tiles.
    Raises requests.RequestException where they cannot be fetched."""
    fx, fy = tile_xy(lat, lon, zoom)
    x, y = int(fx), int(fy)
    heights = _terrain_tile(zoom, x, y)
    size = heights.shape[0]
    col = min(size - 1, int((fx - x) * size))
    row = min(size - 1, int((fy - y) * size))
    return float(heights[row, col])
