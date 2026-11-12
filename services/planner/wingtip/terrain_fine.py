"""Sharper ground where it matters: the terrain tiles one zoom finer than
the planner's own (zoom 13, some 15 m a pixel at 40 N), built ahead into
the shared store (wingtip.elevation's TERRAIN_TILE_DIR, data/raw/terrain-
tiles/13) round the public-use airports and over the steep ground, and
served by the same /api/terrain-tile (wingtip.terrain_view) the map's 3D
ground and relief are drawn from. A pilot's request never waits on them:
a zoom-13 tile that was not built is drawn from its zoom-12 parent's
pixels, which the map would otherwise have stretched itself.

The source is the AWS Terrain Tiles (Mapzen's terrarium set, AWS Open
Data's "Terrain Tiles"), the tiles the planner already reads: in the
lower 48 from USGS 3DEP's 1/3 arc-second elevation, about 10 m, which is
in the public domain (USGS); SRTM and ETOPO1 round it. Their own terms
ask the sources be credited (github.com/tilezen/joerd, docs/attribution.md).
Zoom 13 is about that 10 m in the lower 48; zoom 14 is finer than the
source, and measured over Aspen and the Maroon Bells (2026-11-12) it
differs from zoom 13 drawn larger by 0.3 to 0.9 m RMS, where zoom 13
differs from zoom 12 by 0.8 to 2.6 m and zoom 12 from 11 by 5 to 14:
four times the tiles for under a metre, so it is not built.

The scope (`scope`): every tile within AIRPORT_RADIUS_NM of a public-use
airport in the lower 48 (NASR's APT_BASE), where the map is looked at
closest, coming and going; and every tile whose ground rises RELIEF_FT or
more within it (wingtip.ground_grid's highest less its lowest), where a
route's ground is worth seeing sharper. Counted 2026-11-12 over the 4,480
public-use airports and the ground grid: 5 nm round the airports 122,789
tiles, ground rising 1,500 ft 82,589, together 198,548, some 23 GB (10 nm
and 1,000 ft would be 405,128, 48 GB; every tile over the grid's extent,
the sea in it too, 1,016,064, about 100 GB). `python -m
wingtip.terrain_fine size` prints the scope's.

Built by `python -m wingtip.terrain_fine build` (resumable: a tile on
disk is not fetched again), a long job for a server or the jobs image,
not a pilot's request.

The planner's floors are not read from these: they take the ground
grid's highest of every zoom-11 pixel in a cell and RESAMPLED_MARGIN_FT
over it (wingtip.ground_grid), from the same tiles, and the floor's own
1,000 ft over that (wingtip.terrain, 14 CFR 91.119). On 80 steep tiles
(2026-11-12), 10 had a zoom-13 pixel above its cell's highest and that
margin, by 122 ft at most: well inside the 1,000, but the grid built from
these, or a margin of 300 ft, would make the two agree.
"""

from __future__ import annotations

import io
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import requests

from . import elevation, faa_data, geo, ground_grid, outside
from .atomic import atomic_path
from .config import REQUEST_HEADERS

#: The finest zoom built and served (terrain_view.MAX_ZOOM).
FINE_ZOOM = elevation.TERRAIN_TILE_ZOOM + 1
#: How far round a public-use airport the finer tiles are built, nm: the
#: pattern, the climb out and the descent in, where 3D is looked at close
#: -- a 3 degree path (an ILS glide slope's usual angle, AIM 1-1-9) falls
#: 318 ft a nm, so it is 1,500 ft above the field some 4.7 nm out.
AIRPORT_RADIUS_NM = 5.0
#: The ground's rise within a tile, ft, from which the tile is built: hills
#: a phone's 3D view shows blurred at zoom 12 (a zoom-13 tile is some 3.7 km
#: across at 40 N). A choice of how much to store, no aviation figure.
RELIEF_FT = 1500
#: The AWS tiles at zoom 13 measured 75 to 118 KB over the Rockies, the
#: plains and Chicago, and the 1,064 of this scope between Centennial and
#: Aspen 126 MB, 118 KB each (2026-11-12): the scope is mostly steep ground.
MEAN_TILE_KB = 118

_NASR_DIR = Path(__file__).resolve().parents[3] / "data" / "raw" / "faa_nasr"


def tile_path(x: int, y: int) -> Path:
    """Where a zoom-13 tile is kept, beside the planner's own (elevation)."""
    return elevation.TERRAIN_TILE_DIR / str(FINE_ZOOM) / str(x) / f"{y}.png"


def _tile_of(lat, lon) -> tuple[np.ndarray, np.ndarray]:
    """The zoom-13 tile each point is in, as (x, y) arrays (geo.tile_xy)."""
    x, y = geo.tile_xy(np.asarray(lat, dtype=float), np.asarray(lon, dtype=float), FINE_ZOOM)
    return np.floor(x).astype(int), np.floor(y).astype(int)


def _tile_bounds(x: int, y: int) -> tuple[float, float, float, float]:
    """A zoom-13 tile's south, west, north and east, degrees."""
    north, west = geo.tile_lat_lon(x, y, FINE_ZOOM)
    south, east = geo.tile_lat_lon(x + 1, y + 1, FINE_ZOOM)
    return south, west, north, east


def airport_tiles(points: list[tuple[float, float]], radius_nm: float = AIRPORT_RADIUS_NM) -> set[tuple[int, int]]:
    """The zoom-13 tiles any part of which is within `radius_nm` of a point:
    the nearest point of each tile in a point's box measured along the
    great circle (geo.distance_nm)."""
    found: set[tuple[int, int]] = set()
    for lat, lon in points:
        south, west, north, east = geo.box_around(lat, lon, radius_nm)
        (x0, x1), (y1, y0) = _tile_of([south, north], [west, east])
        for x in range(int(x0), int(x1) + 1):
            for y in range(int(y0), int(y1) + 1):
                south, west, north, east = _tile_bounds(x, y)
                near_lat = min(max(lat, south), north)
                near_lon = min(max(lon, west), east)
                if geo.distance_nm(lat, lon, near_lat, near_lon) <= radius_nm:
                    found.add((x, y))
    return found


def steep_tiles(high_ft: np.ndarray, low_ft: np.ndarray, relief_ft: float = RELIEF_FT) -> set[tuple[int, int]]:
    """The zoom-13 tiles over the ground grid whose highest less lowest is
    `relief_ft` or more: each grid cell given to the tile its middle is in,
    the cells no tile reached (ground_grid.NONE) left out."""
    rows, cols = high_ft.shape
    lats = ground_grid.SOUTH + (np.arange(rows) + 0.5) / ground_grid.PER_DEG
    lons = ground_grid.WEST + (np.arange(cols) + 0.5) / ground_grid.PER_DEG
    _, ty = _tile_of(lats, np.zeros(rows))
    tx, _ = _tile_of(np.zeros(cols), lons)
    # The grid's rows run south to north, the tiles' north to south: both
    # are in order, so each tile's cells are a run of rows and of columns.
    row_starts = np.flatnonzero(np.r_[True, ty[1:] != ty[:-1]])
    col_starts = np.flatnonzero(np.r_[True, tx[1:] != tx[:-1]])
    reached = high_ft != ground_grid.NONE
    high = np.where(reached, high_ft, np.iinfo(np.int16).min).astype(np.int32)
    low = np.where(reached, low_ft, np.iinfo(np.int16).max).astype(np.int32)
    tile_high = np.maximum.reduceat(np.maximum.reduceat(high, row_starts, axis=0), col_starts, axis=1)
    tile_low = np.minimum.reduceat(np.minimum.reduceat(low, row_starts, axis=0), col_starts, axis=1)
    steep = (tile_high - tile_low >= relief_ft) & (tile_high > np.iinfo(np.int16).min)
    r, c = np.nonzero(steep)
    return {(int(tx[col_starts[j]]), int(ty[row_starts[i]])) for i, j in zip(r, c)}


def public_airports(nasr_dir: Path = _NASR_DIR) -> list[tuple[float, float]]:
    """The public-use airports (APT_BASE's SITE_TYPE_CODE A, FACILITY_USE_CODE
    PU) inside the ground grid's extent, the lower 48."""
    df = faa_data._read_apt_base(nasr_dir / "APT_BASE.csv")
    df = df[(df["SITE_TYPE_CODE"] == "A") & (df["FACILITY_USE_CODE"] == "PU")]
    lat = df["LAT_DECIMAL"].astype(float)
    lon = df["LONG_DECIMAL"].astype(float)
    inside = lat.between(ground_grid.SOUTH, ground_grid.NORTH) & lon.between(ground_grid.WEST, ground_grid.EAST)
    return list(zip(lat[inside], lon[inside]))


def scope(nasr_dir: Path = _NASR_DIR) -> tuple[set, set]:
    """The tiles to build: round the airports, and over the steep ground
    where the ground grid is built (none where it is not)."""
    near = airport_tiles(public_airports(nasr_dir))
    grids = ground_grid._grids()
    steep = steep_tiles(*grids) if grids is not None else set()
    return near, steep


def fine_tile_png(x: int, y: int) -> bytes:
    """A zoom-13 terrain tile as a terrarium PNG, cleaned as the planner's
    own are (elevation.terrain_tile_png): the one built, else its zoom-12
    parent's quarter drawn twice as large, so a tile outside the scope is
    never fetched on a pilot's request. Raises requests.RequestException
    where the parent cannot be had."""
    from PIL import Image

    if tile_path(x, y).exists():
        heights = elevation._terrain_tile(FINE_ZOOM, x, y)
    else:
        parent = elevation._terrain_tile(FINE_ZOOM - 1, x // 2, y // 2)
        half = parent.shape[0] // 2
        quarter = parent[(y % 2) * half : (y % 2 + 1) * half, (x % 2) * half : (x % 2 + 1) * half]
        size = parent.shape[0]
        heights = np.asarray(Image.fromarray(np.ascontiguousarray(quarter, dtype=np.float32), "F").resize((size, size), Image.BILINEAR))
    out = io.BytesIO()
    Image.fromarray(elevation.terrarium_rgb(heights), "RGB").save(out, "PNG")
    return out.getvalue()


def _fetch(session: requests.Session, x: int, y: int) -> bool:
    """One tile from the bucket onto disk; False for one it has not (the
    sea past its edge)."""
    # The session asks again after a dropped connection or a busy bucket
    # (wingtip.outside); a tile is written whole or not at all.
    resp = session.get(elevation.TERRAIN_TILE_URL.format(z=FINE_ZOOM, x=x, y=y), headers=REQUEST_HEADERS, timeout=30)
    if resp.status_code in (403, 404):
        return False
    resp.raise_for_status()
    with atomic_path(tile_path(x, y)) as part:
        part.write_bytes(resp.content)
    return True


def build(workers: int = 12) -> None:
    """Fetches every tile in the scope not yet on disk, a few at a time,
    printing how far it has got; stopped, it carries on where it was."""
    near, steep = scope()
    todo = sorted(t for t in near | steep if not tile_path(*t).exists())
    print(f"{len(near | steep)} tiles in the scope, {len(todo)} to fetch", flush=True)
    session = outside.session(pool=workers)
    with ThreadPoolExecutor(workers) as pool:
        for i, _ in enumerate(pool.map(lambda t: _fetch(session, *t), todo), 1):
            if i % 1000 == 0 or i == len(todo):
                print(f"{i} of {len(todo)}", flush=True)


def size() -> None:
    """Prints the scope's tiles and their size on disk, as built."""
    near, steep = scope()
    both = near | steep
    for name, tiles in (("airports", near), ("steep ground", steep), ("together", both)):
        print(f"{name}: {len(tiles):,} tiles, about {len(tiles) * MEAN_TILE_KB / 1e6:.1f} GB")


if __name__ == "__main__":
    {"build": build, "size": size}[sys.argv[1] if len(sys.argv) > 1 else "size"]()
