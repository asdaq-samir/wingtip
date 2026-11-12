"""Great-circle navigation helpers.

A sphere of 3,440.065 nm, the same approximation flight computers use
and plenty accurate for spacing VFR checkpoints. Its figures --
distance, initial course, cross- and along-track, a point a course and
distance out -- are the engine's (engine/crates/core/src/geo.rs), asked
through wingtip_native as the web and the phones ask them, so a figure
is worked out in one place (the owner, 2026-11-12: the geo maths moves
into the engine). What stays here is not a figure: Web Mercator's tile
grid, a KD-tree's "who is near whom", and the flat projection
shape_distance_nm measures shapes on.

The engine is asked a whole array at a time. Every function below takes
scalars or arrays interchangeably, and the callers that work a whole
corridor at once (wingtip.pipeline's corridor filter, wingtip.osm's
crossing finder, wingtip.ml_features' clutter measure) pass arrays: one
crossing into the engine for all of them (wingtip_native.geo_many,
numpy's buffers read and written in place), since a call a point, or
JSON text for a corridor, would cost more than the sums. A scalar takes
wingtip_native.geo_one, a few hundred times a nav log.

services/planner/tests_wingtip/test_geo.py pins every function here
against pygeodesy's independent implementations and pyproj's Geod on the
same sphere; both are test dependencies only (requirements-dev-wingtip.txt).

Sign convention for cross-track: positive is right of course, negative
is left. Along-track is negative behind the route start.
"""

import math

import numpy as np
import wingtip_native
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import KDTree

from .units import NM_PER_DEG_LAT

#: The engine's sphere (wingtip_core::geo::EARTH_RADIUS_NM), for the
#: KD-tree's chords and the flat projection below.
EARTH_RADIUS_NM = 3440.065

# isinstance against a tuple, not np.ndim: the scalar path is the one
# the nav log takes a few hundred times per plan, and np.ndim on a
# plain float costs more than the engine call it is guarding.
_NUMBER = (int, float, np.integer, np.floating)


def _figure(name: str, *values):
    """The engine's figure `name` (wingtip_core::geo_many: "inverse",
    "track", "destination") as its two answers.

    Scalars in, floats out, one row. Otherwise every argument is
    broadcast to one shape -- the usual call is one route start against
    a whole corridor of points -- and the engine fills two arrays of it
    in place.
    """
    if all(isinstance(v, _NUMBER) for v in values):
        return wingtip_native.geo_one(name, values)
    shape = np.broadcast_shapes(*(np.shape(v) for v in values))
    # broadcast_to gives a read-only view the engine would read with
    # strides of 0, so this copies into one contiguous column each.
    columns = [np.ascontiguousarray(np.broadcast_to(np.asarray(v, dtype=float), shape)).reshape(-1) for v in values]
    first, second = np.empty(columns[0].size), np.empty(columns[0].size)
    wingtip_native.geo_many(name, columns, first, second)
    return first.reshape(shape), second.reshape(shape)


def _plain(value):
    """A numpy 0-d result back to a plain float, for a nav log
    serialised to JSON; an array result passes through untouched."""
    return float(value) if isinstance(value, _NUMBER) else value


def distance_nm(lat1, lon1, lat2, lon2):
    """Great-circle distance between two points, in nautical miles."""
    return _figure("inverse", lat1, lon1, lat2, lon2)[0]


def bearing_deg(lat1, lon1, lat2, lon2):
    """Initial great-circle bearing from point 1 to point 2, in degrees
    [0, 360).

    Zero for two points that coincide, as the engine answers: the
    bearing between a point and itself is undefined, and zero is what
    this project has always reported and what wingtip.navlog's callers
    expect.
    """
    return _figure("inverse", lat1, lon1, lat2, lon2)[1]


def angle_between(a: float, b: float) -> float:
    """How far apart two directions are, degrees 0 to 180, either way
    round the compass (358 is 4 from 002)."""
    return abs((a - b + 180) % 360 - 180)


def _track(lat, lon, route_start, route_end):
    """(cross-track, along-track) in nautical miles, both signed: the
    engine's track_nm, the standard spherical identities.

    The sign on the along-track is what makes a point behind the
    departure read negative, which wingtip.pipeline's corridor filter
    depends on -- it bounds along-track at -MARGIN_NM, a bound an
    unsigned value could never cross.
    """
    return _figure("track", lat, lon, route_start[0], route_start[1], route_end[0], route_end[1])


def cross_track_distance_nm(lat, lon, route_start: tuple, route_end: tuple):
    """Perpendicular distance from the point(s) to the great-circle route
    route_start -> route_end, in nautical miles. Positive = right of course.
    """
    return _track(lat, lon, route_start, route_end)[0]


def along_track_distance_nm(lat, lon, route_start: tuple, route_end: tuple):
    """Signed distance along the route from route_start to the projection
    of the point(s) onto it, in nautical miles. Negative behind the start.
    """
    return _track(lat, lon, route_start, route_end)[1]


def track_distances_nm(lat, lon, route_start: tuple, route_end: tuple):
    """Both at once, for the callers that want both."""
    return _track(lat, lon, route_start, route_end)


def along_path_nm(lat: float, lon: float, path: list) -> float:
    """How far along the route flown through `path` [(lat, lon), ...] the
    nearest point of it to (lat, lon) is: the leg the point is closest
    to, and how far along that leg, held to its ends. A route with stops
    is not one great circle, so along its first and last points alone a
    place beside the second leg read as somewhere off the first."""
    best, nearest, offset = 0.0, float("inf"), 0.0
    for a, b in zip(path, path[1:]):
        leg = distance_nm(*a, *b)
        cross, along = _track(lat, lon, a, b)
        held = min(max(along, 0.0), leg)
        off = float(np.hypot(cross, along - held))
        if off < nearest:
            best, nearest = offset + held, off
        offset += leg
    return best


def destination_point(lat: float, lon: float, bearing: float, distance_nm_: float) -> tuple:
    """Point reached from (lat, lon) travelling `bearing` degrees for
    `distance_nm_` nautical miles along a great circle.
    """
    return _figure("destination", lat, lon, bearing, distance_nm_)


def great_circle_points(start: tuple, end: tuple, count: int) -> tuple:
    """`count` points (at least two) evenly along the great circle from
    start to end, both ends included, as (lats, lons) arrays: each the
    engine's destination from the start on its initial course, as PROJ's
    intermediate points were. Two points that coincide give `count` of it."""
    distance, course = _figure("inverse", start[0], start[1], end[0], end[1])
    steps = np.linspace(0.0, distance, max(2, count))
    return _figure("destination", start[0], start[1], course, steps)


def path_points(path: list, step_nm: float) -> tuple:
    """The route flown through `path` [(lat, lon), ...] as (lats, lons),
    each leg along its great circle in steps of at most `step_nm`."""
    lats, lons = [np.array([path[0][0]])], [np.array([path[0][1]])]
    for a, b in zip(path, path[1:]):
        la, lo = great_circle_points(a, b, int(math.ceil(distance_nm(*a, *b) / step_nm)) + 1)
        lats.append(la[1:])
        lons.append(lo[1:])
    return np.concatenate(lats), np.concatenate(lons)


def shape_distance_nm(geometry, other, centre: tuple) -> float:
    """The distance between two shapely geometries in (lon, lat), nm, 0
    where they meet: measured on PROJ's azimuthal equidistant projection
    of this sphere about `centre` (lat, lon), put in or beside one of them.
    Distances from the centre are true on it and every other is drawn a
    little long, never short (the projection's scale is 1 along a radius
    and grows across one), by under 0.1% within 250 nm of the centre
    (x / sin x, x the distance over the radius). An
    edge is drawn straight there, so a long leg wants its points close
    (path_points). It replaces buffers sized in degrees, which a degree of
    longitude's change with latitude left too narrow at the poleward end."""
    import shapely
    from pyproj import Proj

    # The engine's sphere, its radius in nautical miles, so the
    # projection's units, and the distance, are nautical miles.
    aeqd = Proj(proj="aeqd", lat_0=centre[0], lon_0=centre[1], R=EARTH_RADIUS_NM)

    def flat(coords: np.ndarray) -> np.ndarray:
        return np.column_stack(aeqd(coords[:, 0], coords[:, 1]))

    return float(shapely.distance(shapely.transform(geometry, flat), shapely.transform(other, flat)))


def corridor_bbox(route_start: tuple, route_end: tuple, buffer_nm: float) -> tuple:
    """Padded (min_lat, min_lon, max_lat, max_lon) bounding box around the
    route, generous enough for an Overpass query. The real corridor width
    is enforced later by filtering on cross_track_distance_nm.
    """
    lats = [route_start[0], route_end[0]]
    lons = [route_start[1], route_end[1]]
    pad_lat = buffer_nm / NM_PER_DEG_LAT
    # A minute of longitude is cos(latitude) of a mile: the same degrees
    # east and west were 4.95 nm of a 7 nm pad at 45 N, and the obstacles
    # 4.7-5 nm abeam a north-south leg fell out of the terrain floor's 5 nm
    # corridor (the aviation check, 2026-10-27). Widened at the box's
    # poleward edge, where a degree is shortest.
    widest = min(89.0, max(abs(route_start[0]), abs(route_end[0])) + pad_lat)
    pad_lon = pad_lat / max(0.05, math.cos(math.radians(widest)))
    return (min(lats) - pad_lat, min(lons) - pad_lon, max(lats) + pad_lat, max(lons) + pad_lon)


def box_around(lat: float, lon: float, radius_nm: float) -> tuple[float, float, float, float]:
    """(south, west, north, east), degrees, of a box holding what lies
    within `radius_nm` of a point: a search's first cut, the distance
    measured within it after. A degree of latitude taken as 60 nm
    (wingtip.units.NM_PER_DEG_LAT); a degree of longitude as cos(latitude)
    of that at the box's poleward edge, where it is shortest, as
    corridor_bbox above has it for a route."""
    pad_lat = radius_nm / NM_PER_DEG_LAT
    widest = min(89.0, abs(lat) + pad_lat)
    pad_lon = pad_lat / max(0.05, math.cos(math.radians(widest)))
    return lat - pad_lat, lon - pad_lon, lat + pad_lat, lon + pad_lon


# --- Web Mercator tiles ---
#
# The slippy-map grid every tile here is cut on -- the charts, the
# terrain heights, the chart reader's pixels: spherical Web Mercator
# (EPSG:3857), 2**zoom tiles a side, x east from 180 W and y south from
# 85.0511 N. One place for its two formulas, the OpenStreetMap wiki's
# "Slippy map tilenames", which services/planner/tests_wingtip/test_geo.py pins against PROJ's
# EPSG:3857. Scalars or arrays, as above.


def tile_xy(lat, lon, zoom: int) -> tuple:
    """Where a point falls in the tile grid at `zoom`, as fractional
    (x, y): the tile is their floor, the place within it the rest."""
    n = 2**zoom
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2.0 * n
    return _plain(x), _plain(y)


def tile_lat_lon(x, y, zoom: int) -> tuple:
    """The (lat, lon) at fractional tile coordinates (x, y): a tile's
    north-west corner at whole ones."""
    n = 2**zoom
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1.0 - 2.0 * y / n))))
    return _plain(lat), _plain(x / n * 360.0 - 180.0)


# --- Neighbourhood questions, answered with a KD-tree on the unit sphere ---
#
# Chord length rises monotonically with great-circle distance, so a
# chord radius selects exactly the points an arc radius would, and a
# KD-tree can answer "who is near whom" without the n-by-n distance
# matrix -- or the nested Python loop -- these used to cost.


def _unit_sphere(lat, lon) -> np.ndarray:
    lat_r = np.radians(np.asarray(lat, dtype=float))
    lon_r = np.radians(np.asarray(lon, dtype=float))
    return np.column_stack([np.cos(lat_r) * np.cos(lon_r), np.cos(lat_r) * np.sin(lon_r), np.sin(lat_r)])


def _chord(distance_nm_: float) -> float:
    return 2 * np.sin(distance_nm_ / (2 * EARTH_RADIUS_NM))


def _arc_nm(chord: np.ndarray) -> np.ndarray:
    return 2 * EARTH_RADIUS_NM * np.arcsin(np.clip(chord / 2, 0.0, 1.0))


def nearest(lat, lon, to_lat, to_lon) -> np.ndarray:
    """For each point, the index of the nearest of the `to` points, the
    first of them where two are as near: what np.argmin of distance_nm
    from every point to every one gives, without the engine asked every
    pair. The unit vectors' dot products rank them (the nearer, the
    larger, on the sphere); the engine is asked only between those within
    rounding of the nearest, so it still decides, and a tie still goes to
    the first. Route options asked for each cell's distance to every
    winds-aloft station and each sample of the way to every field: over
    half their second (2026-11-02)."""
    lat, lon = np.asarray(lat, dtype=float).reshape(-1), np.asarray(lon, dtype=float).reshape(-1)
    to_lat, to_lon = np.asarray(to_lat, dtype=float).reshape(-1), np.asarray(to_lon, dtype=float).reshape(-1)
    cosine = _unit_sphere(lat, lon) @ _unit_sphere(to_lat, to_lon).T
    rows, cols = np.nonzero(cosine >= cosine.max(axis=1, keepdims=True) - 1e-9)
    nm = np.full(cosine.shape, np.inf)
    nm[rows, cols] = distance_nm(lat[rows], lon[rows], to_lat[cols], to_lon[cols])
    return np.argmin(nm, axis=1)


def nearest_neighbour_nm(lat, lon) -> np.ndarray:
    """Great-circle distance from each point to its closest *other*
    point, in input order -- "clutter". Two landmarks a tenth of a mile
    apart are harder to tell apart from the air, and to describe
    unambiguously on a nav log, than two ten miles apart.

    A lone point has no neighbour and gets infinity; callers decide what
    that means for them.
    """
    xyz = _unit_sphere(lat, lon)
    if len(xyz) < 2:
        return np.full(len(xyz), np.inf)
    chord, _ = KDTree(xyz).query(xyz, k=2)
    return _arc_nm(chord[:, 1])


def neighbours_within_nm(lat, lon, radius_nm: float) -> list:
    """For each point, the indices of every point within radius_nm of it,
    itself included."""
    xyz = _unit_sphere(lat, lon)
    if len(xyz) == 0:
        return []
    tree = KDTree(xyz)
    return tree.query_ball_point(xyz, _chord(radius_nm))


def cluster_points(lat, lon, cluster_distance_nm: float) -> np.ndarray:
    """Connected-components clustering: two points share a cluster if
    within cluster_distance_nm of each other, transitively (e.g. a chain
    of wind turbines spread along a ridge). Returns a cluster id (int)
    per input point, in input order.
    """
    xyz = _unit_sphere(lat, lon)
    if len(xyz) == 0:
        return np.empty(0, dtype=int)

    pairs = KDTree(xyz).query_pairs(_chord(cluster_distance_nm), output_type="ndarray")
    graph = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(xyz), len(xyz)))
    return connected_components(graph, directed=False)[1]
