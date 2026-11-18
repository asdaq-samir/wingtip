"""Where a point's height comes from when wingtip.elevation's cache has
none: USGS 3DEP's 1 arc-second tiles, read in place from the copies USGS
stages on AWS (or a tile on disk), and its Elevation Point Query Service
(EPQS) a point at a time for what they leave out. Heights in metres."""

from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

from .config import REQUEST_HEADERS
from .retry import with_retries

EPQS_URL = "https://epqs.nationalmap.gov/v1/json"


def fetch_elevation_m(lat: float, lon: float, retries: int = 3) -> float:
    params = {"x": lon, "y": lat, "units": "Meters", "wkid": 4326, "includeDate": "false"}

    def attempt() -> float:
        resp = requests.get(EPQS_URL, params=params, headers=REQUEST_HEADERS, timeout=30)
        resp.raise_for_status()
        return float(resp.json()["value"])

    return with_retries(
        attempt,
        describe=f"EPQS query for ({lat}, {lon})",
        retries=retries,
        transient=(requests.RequestException, KeyError, ValueError, TypeError),
    )


def fetch_many(keys: list, max_workers: int) -> dict:
    """Fetches every key's elevation, collecting all results even if some
    fail -- unlike ThreadPoolExecutor.map, which raises (abandoning every
    still-in-flight lookup) as soon as it reaches a failed one in submit
    order, discarding whatever the other workers had already fetched. A
    burst of `max_workers` concurrent requests against a public,
    unauthenticated EPQS endpoint can transiently rate-limit or drop one
    request among many that otherwise succeed (this is the terrain-floor
    analogue of the aviationweather.gov 504 fixed in wingtip.altitude --
    except unlike weather, a route's terrain floor is not optional
    context, so the fix here cannot be "proceed without it"). Points that
    fail get one more attempt, serially, outside the burst, before this
    gives up -- only then does it raise, naming exactly which point(s)
    never resolved.
    """
    results: dict = {}
    failed: dict = {}
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        future_to_key = {ex.submit(fetch_elevation_m, *k): k for k in keys}
        for future in as_completed(future_to_key):
            key = future_to_key[future]
            try:
                results[key] = future.result()
            except RuntimeError as err:
                failed[key] = err

    for key in list(failed):
        try:
            results[key] = fetch_elevation_m(*key)
            del failed[key]
        except RuntimeError as err:
            failed[key] = err

    if failed:
        points = ", ".join(f"({lat}, {lon})" for lat, lon in failed)
        raise RuntimeError(f"EPQS elevation lookup failed for {len(failed)} point(s) after retry: {points}") from next(
            iter(failed.values())
        )

    return results


# The same heights from USGS 3DEP's 1 arc-second elevation (about 30 m),
# which EPQS answers from too -- 238.577 m at C81 from both -- read from
# the cloud-optimised GeoTIFFs USGS stages on AWS, one 1-degree tile a
# file: a few range requests a tile -- the blocks a route's points are
# in, some hundreds of kilobytes -- where EPQS took 3 to 5 s a point (a
# route's ground was 4 to 9 s of its nav log, measured 2026-10-07). Not
# the whole tile, 50 MB, for one route's few dozen points: what is read
# is kept a point at a time beside EPQS's answers (above), and a tile put
# in DEM_DIR is read from disk instead. EPQS answers whatever the tiles
# do not: a point outside them, a read that fails. Checked against EPQS
# at twelve places across the country: within 0.3 m at the airports, and
# 2.5 m lower on the summits of Mount Mitchell and Pikes Peak, where the
# 30 m cells average the top -- far inside the floor's 1,000 ft margin
# (wingtip.terrain, 14 CFR 91.119), and less than the 2 nm between samples
# along the route already misses between them.
DEM_URL = "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1/TIFF/current/{name}/USGS_1_{name}.tif"
DEM_DIR = Path(__file__).resolve().parents[3] / "data" / "raw" / "dem"


def dem_name(lat: float, lon: float) -> str | None:
    """The 1-degree tile a point is in, by its north-west corner
    ("n43w089" for C81), or None outside the north and west, which the
    tiles' names do not cover."""
    if lat <= 0 or lon >= 0:
        return None
    return f"n{math.ceil(lat):02d}w{math.ceil(-lon):03d}"


def dem_heights(name: str, points: list) -> dict:
    """The points' heights from one tile, in metres -- from disk where the
    tile is in DEM_DIR, else from the cloud copy. A point with no height
    there is left out, for EPQS. Empty where rasterio is not installed
    (the pipeline's images have no GDAL)."""
    try:
        import rasterio
    except ImportError:
        return {}
    path = DEM_DIR / f"USGS_1_{name}.tif"
    local = path.exists()
    source = str(path) if local else "/vsicurl/" + DEM_URL.format(name=name)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with rasterio.open(source) as ds:
            nodata = ds.nodata
            values = [float(v[0]) for v in ds.sample([(lon, lat) for lat, lon in points])]
    return {p: v for p, v in zip(points, values) if (nodata is None or v != nodata) and v > -500}


#: Points read on one thread, and threads at once. A cloud tile's points are
#: each a range request of their own, a third of a second, and one thread a
#: tile read them one after another: a new route's side view waited 13 to
#: 22 s on them (60 points C81-KORD 13.3 s, 2026-11-18). Four points a
#: thread on sixteen read the same heights in 1.9 s; GDAL keeps the tile's
#: header for the process, so opening it again for each four costs nothing.
POINTS_A_READ = 4
READERS = 16


def from_tiles(keys: list) -> dict:
    """Every key the tiles can answer, a few points of a tile to a thread;
    a read that fails answers none of its points, which EPQS then does."""
    by_tile: dict = {}
    for key in keys:
        name = dem_name(*key)
        if name is not None:
            by_tile.setdefault(name, []).append(key)
    found: dict = {}
    reads = [(name, ks[i : i + POINTS_A_READ]) for name, ks in by_tile.items() for i in range(0, len(ks), POINTS_A_READ)]
    if not reads:
        return found
    with ThreadPoolExecutor(max_workers=min(READERS, len(reads))) as ex:
        futures = [ex.submit(dem_heights, name, tile_keys) for name, tile_keys in reads]
        for future in as_completed(futures):
            try:
                found.update(future.result())
            except Exception:  # noqa: BLE001 -- rasterio's errors are many kinds; EPQS answers instead
                continue
    return found
