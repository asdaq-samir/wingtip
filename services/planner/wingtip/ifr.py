"""The minimum IFR altitude's data: the ground within reach of each leg
and the DOF obstacles near it, read here and handed to the engine
(wingtip_engine::altitude::floor, `ifr_floors`, #482 phase 3), which holds
the rule -- 14 CFR 91.177(a)(2)'s 1,000 ft above the highest obstacle
within 4 nm of the course, 2,000 ft over a mountainous area Part 95
designates (95.11 to 95.21, drawn in the engine), for a direct or GPS
route with no altitude published for it in Parts 95 and 97 -- and the IFR
cruising altitudes over it (91.179(b), `legal_cruising_altitudes`).

The ground is USGS 3DEP's, read off the terrain tiles wingtip.elevation
already uses (Terrain Tiles on AWS): every pixel within the 4 nm, not
samples along the line, since a summit 3 nm off course counts as much as
one under it. The pixels stay here, as arrays; the engine gets each leg's
highest of them.
"""

from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from . import elevation, faa_data, geo
from .engine import ask as engine
from .retry import with_retries
from .terrain import DEFAULT_FAA_CACHE_DIR
from .units import M_TO_FT

#: 14 CFR 91.177(a)(2): the highest obstacle within 4 nm of the course,
#: the engine's figure, which the pixels are read within.
OBSTACLE_RADIUS_NM = engine("ifr_obstacle_radius_nm")

#: The terrain tiles' zoom: 76 m a pixel, and within 20 ft of the
#: published summits of Rainier (14,396 ft against 14,411), Whitney
#: (14,486 against 14,505), Mitchell (6,671 against 6,684) and Pikes Peak
#: (14,117 against 14,115), measured 2026-10-11 as the highest pixel
#: within half a mile of each -- zoom 12's 38 m pixels came within 15 ft,
#: for four times the tiles: a 90 nm leg in the Rockies took 18 s to
#: read at 12.
TILE_ZOOM = 11
#: What is added to the tiles' highest ground before its clearance, so a
#: summit the pixels shave a few feet off is never undercounted.
TILE_ALLOWANCE_FT = 50.0
#: A leg is measured in pieces no longer than this, each flat on its own
#: (equirectangular about its middle), a few metres off the true distance
#: from the course at 4 nm out; and each piece reads only the tiles beside
#: it, where a long diagonal leg's whole box was hundreds of tiles of
#: ground nowhere near it (C81 to KDLH: 30 s, its tiles already on disk).
PIECE_NM = 10.0


def _pixel_lat_lon(z: int, x: int, y: int, size: int) -> tuple[np.ndarray, np.ndarray]:
    """Each pixel's centre in a slippy-map tile, as (lat, lon) grids."""
    within = (np.arange(size) + 0.5) / size
    lats, lons = geo.tile_lat_lon(within + x, within + y, z)
    return np.meshgrid(lats, lons, indexing="ij")


def _tiles_over(bbox: tuple, z: int) -> list[tuple[int, int]]:
    """The tiles at zoom z that cover (min_lat, min_lon, max_lat, max_lon)."""
    min_lat, min_lon, max_lat, max_lon = bbox
    x0, y0 = (int(v) for v in geo.tile_xy(max_lat, min_lon, z))
    x1, y1 = (int(v) for v in geo.tile_xy(min_lat, max_lon, z))
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def _from_course_nm(lat, lon, a: tuple, b: tuple):
    """Each point's distance from the course a to b (a segment: its ends
    rounded, as "within 4 nm of the course" takes the ends too), in nm:
    off the great circle abeam, and from the nearer end past either end
    (the engine's cross- and along-track, as geo.along_path_nm holds them
    to a leg)."""
    cross, along = geo.track_distances_nm(np.asarray(lat, dtype=float), np.asarray(lon, dtype=float), a, b)
    return np.hypot(cross, along - np.clip(along, 0.0, geo.distance_nm(*a, *b)))


def _pieces(a: tuple, b: tuple) -> list[tuple[tuple, tuple]]:
    """The course a to b in pieces of at most PIECE_NM, along its great circle."""
    count = max(1, math.ceil(geo.distance_nm(*a, *b) / PIECE_NM))
    lats, lons = geo.great_circle_points(a, b, count + 1)
    points = [a] + list(zip(lats[1:-1].tolist(), lons[1:-1].tolist())) + [b]
    return list(zip(points, points[1:]))


def _tiles_beside(piece: tuple) -> list[tuple[int, int]]:
    """The tiles that hold the ground within OBSTACLE_RADIUS_NM of a piece."""
    # A mile past the radius, its longitude's at the box's poleward edge.
    return _tiles_over(geo.corridor_bbox(*piece, OBSTACLE_RADIUS_NM + 1), TILE_ZOOM)


def _highest_ground_ft(pieces: list, heights: dict) -> float:
    """The highest ground within OBSTACLE_RADIUS_NM of any piece, feet
    MSL: each tile's pixels against the pieces beside it alone."""
    beside: dict[tuple[int, int], list] = {}
    for piece in pieces:
        for tile in _tiles_beside(piece):
            beside.setdefault(tile, []).append(piece)
    highest = -math.inf
    # The highest tiles first, and none whose highest pixel is no higher
    # than the ground already found: the same answer, from a handful of
    # tiles rather than every pixel of hundreds (a 600 nm route's floor
    # was three seconds of pixel distances, 2026-10-21).
    by_top = sorted(beside.items(), key=lambda item: -float(heights[item[0]].max()))
    for (x, y), near_pieces in by_top:
        tile = heights[(x, y)]
        if float(tile.max()) * M_TO_FT <= highest:
            break
        lats, lons = _pixel_lat_lon(TILE_ZOOM, x, y, tile.shape[0])
        near = np.zeros(tile.shape, dtype=bool)
        for a, b in near_pieces:
            near |= _from_course_nm(lats, lons, a, b) <= OBSTACLE_RADIUS_NM
        if near.any():
            highest = max(highest, float(tile[near].max()) * M_TO_FT)
    return highest


#: Tiles fetched at once: more, and Docker's resolver gave up on some of
#: them (2026-10-11, sixteen at once, "Temporary failure in name
#: resolution").
TILE_WORKERS = 8


def _tile(xy: tuple[int, int]) -> np.ndarray:
    """One tile's heights, fetched again after a failure: it is the floor,
    and a route without one cannot be planned under IFR at all."""
    return with_retries(lambda: elevation._terrain_tile(TILE_ZOOM, *xy), describe=f"terrain tile {xy}", backoff_s=1.0)


def floor_profile(fixes: list, faa_cache_dir=DEFAULT_FAA_CACHE_DIR) -> list[dict]:
    """Each leg's minimum IFR altitude (14 CFR 91.177(a)(2)) between the
    nav log's fixes, the engine's `ifr_floors` answer: the highest ground
    within 4 nm of each leg's course (TILE_ALLOWANCE_FT added) and the DOF
    obstacles near it, read here; the clearance, the mountainous areas and
    the rounding are the engine's."""
    legs = list(zip(fixes, fixes[1:]))
    leg_pieces = [_pieces(a, b) for a, b in legs]
    wanted = sorted({tile for pieces in leg_pieces for piece in pieces for tile in _tiles_beside(piece)})
    with ThreadPoolExecutor(max_workers=min(TILE_WORKERS, max(1, len(wanted)))) as pool:
        heights = dict(zip(wanted, pool.map(_tile, wanted)))

    lats = [p[0] for p in fixes]
    lons = [p[1] for p in fixes]
    # A degree of longitude is cos(latitude) of a degree of latitude: twice
    # the reach fell short of 91.177(a)(2)'s 4 nm above about 66 N (the
    # aviation check, 2026-10-27), so corridor_bbox scales it at the box's
    # poleward edge.
    bbox = geo.corridor_bbox((min(lats), min(lons)), (max(lats), max(lons)), OBSTACLE_RADIUS_NM + 1)
    obstacles = faa_data.load_obstacles(faa_data.ensure_nasr_file("DOF.DAT", faa_cache_dir), bbox, min_agl_ft=0)
    obstacle_lat = obstacles["lat"].to_numpy(dtype=float)
    obstacle_lon = obstacles["lon"].to_numpy(dtype=float)
    obstacle_ft = obstacles["amsl_ft"].to_numpy(dtype=float)
    # Only those within a mile past the radius of any leg go to the engine,
    # which keeps the 4 nm's own: a long diagonal route's box holds
    # thousands nowhere near it.
    near = np.zeros(obstacle_ft.shape, dtype=bool)
    for pieces in leg_pieces:
        for p, q in pieces:
            near |= _from_course_nm(obstacle_lat, obstacle_lon, p, q) <= OBSTACLE_RADIUS_NM + 1
    return engine(
        "ifr_floors",
        legs=[
            {"a": list(a), "b": list(b), "ground_ft": _highest_ground_ft(pieces, heights) + TILE_ALLOWANCE_FT}
            for (a, b), pieces in zip(legs, leg_pieces)
        ],
        obstacles=[
            {"lat": float(lat), "lon": float(lon), "amsl_ft": float(ft)}
            for lat, lon, ft in zip(obstacle_lat[near], obstacle_lon[near], obstacle_ft[near])
        ],
    )
