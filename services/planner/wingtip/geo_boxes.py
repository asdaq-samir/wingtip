"""Search boxes in degrees that hold across the antimeridian (the
edge-places audit's S10, 2026-11-21).

A box of (south, west, north, east) is how the planner cuts the FAA's
obstacles, airspace, TFRs, fixes and the weather's stations down to a
route before measuring them (wingtip.geo.corridor_bbox, box_around). Read
as plain longitudes, a leg from Adak (PADK, 176.65 W) to Shemya (PASY,
174.11 E) made a box about 350 degrees wide, and a point within its pad
of 180 (Shemya, Attu) a box past 180 that met nothing across the line: the
obstacles, airspace and TFRs just over it were missed. So each box here
is worked out with every longitude within 180 degrees of the first
(wingtip_core::geo::lon_near's rule, the short way round as the geodesic
goes), so it may pass -180 or 180, and whatever reads data with it reads
it as the one or two boxes it is between -180 and 180 (`split_box`,
route_options' own since the routes audit's P12): `in_box` and `meets`.
A box that does not reach 180, every route in the 48 states, is the one
box wingtip.geo gives, to the bit, and is read as it always was.

The engine's copy is wingtip_core::geo (lon_near, split_box,
corridor_boxes, box_over); this is the planner's, for the data it reads
itself.
"""

from __future__ import annotations

import math

import numpy as np
from shapely.geometry import LineString, MultiLineString, MultiPolygon
from shapely.geometry import box as envelope

from . import geo

Box = tuple[float, float, float, float]


def lon_near(lon, reference: float):
    """`lon` within 180 degrees of `reference`, whole turns added or taken;
    left as it is where it is within 180 already (so a box near neither
    edge is the one it always was). Scalars or arrays."""
    lon = np.asarray(lon, dtype=float) if not isinstance(lon, (int, float)) else float(lon)
    shifted = lon + 360.0 * np.round((reference - lon) / 360.0)
    out = np.where(np.abs(lon - reference) <= 180.0, lon, shifted)
    return float(out) if np.ndim(out) == 0 else out


def split_box(box) -> list[Box]:
    """A (south, west, north, east) box as the one or two boxes it is
    between -180 and 180: one past the antimeridian is split there."""
    s, w, n, e = (float(v) for v in box)
    if e - w >= 360.0:
        return [(s, -180.0, n, 180.0)]
    if w < -180.0:
        return [(s, w + 360.0, n, 180.0), (s, -180.0, n, e)]
    if e > 180.0:
        return [(s, w, n, 180.0), (s, -180.0, n, e - 360.0)]
    return [(s, w, n, e)]


def corridor_box(route_start: tuple, route_end: tuple, buffer_nm: float) -> Box:
    """wingtip.geo.corridor_bbox round a leg the short way round: its end's
    longitude read within 180 degrees of its start's, so the box may pass
    -180 or 180 (a reader cuts it with split_box, or in_box and meets)."""
    return geo.corridor_bbox(route_start, (route_end[0], lon_near(route_end[1], route_start[1])), buffer_nm)


def box_over(lats, lons, pad_nm: float) -> Box:
    """The box round a path's or a track's points, `pad_nm` wider (geo's
    corridor_bbox over its corners), each longitude read within 180
    degrees of the first point's: past -180 or 180 where it reaches it."""
    lats = np.asarray(lats, dtype=float)
    lons = np.asarray(lons, dtype=float)
    lons = lon_near(lons, float(lons.ravel()[0]))
    return geo.corridor_bbox((float(lats.min()), float(np.min(lons))), (float(lats.max()), float(np.max(lons))), pad_nm)


def beside(path) -> list[tuple[float, float]]:
    """A path's (lat, lon) points, each longitude within 180 degrees of the
    one before (lon_near): one across 180 read the short way round, so its
    longitudes may pass -180 or 180. Points nowhere near 180 as they are."""
    out, before = [], None
    for lat, lon in path:
        lon = float(lon) if before is None else lon_near(float(lon), before)
        out.append((float(lat), lon))
        before = lon
    return out


def path_box(path, buffer_nm: float) -> Box:
    """The box round every leg of a path, each leg's geo.corridor_bbox, the
    path read the short way round (beside): past -180 or 180 where it
    reaches it, and where it does not the box it always was."""
    points = beside(path)
    boxes = [geo.corridor_bbox(a, b, buffer_nm) for a, b in zip(points, points[1:])] or [geo.corridor_bbox(points[0], points[0], buffer_nm)]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def _turn(lon: float) -> int:
    """How many whole turns a longitude read beside another is from its
    own between -180 and 180."""
    return 0 if -180.0 <= lon <= 180.0 else math.floor((lon + 180.0) / 360.0)


def line_across(path):
    """The path as a line of (lon, lat) on the plane of degrees the FAA's
    shapes are drawn on, the short way round: a leg across 180 is cut there
    into its two pieces, each between -180 and 180, its latitude at 180
    read along the straight line in degrees as the line itself is. A path
    that does not cross 180 is the LineString it always was."""
    pieces, piece = [], []
    points = beside(path)
    for k, (lat, lon) in enumerate(points):
        if k:
            plat, plon = points[k - 1]
            was, now = _turn(plon), _turn(lon)
            if now != was:
                edge = (180.0 if now > was else -180.0) + 360.0 * was
                at = plat + (edge - plon) / (lon - plon) * (lat - plat)
                piece.append((edge - 360.0 * was, at))
                pieces.append(piece)
                piece = [(edge - 360.0 * now, at)]
        piece.append((lon - 360.0 * _turn(lon), lat))
    pieces.append(piece)
    return LineString(pieces[0]) if len(pieces) == 1 else MultiLineString(pieces)


def in_box(box, lat, lon):
    """Whether each point (its longitude between -180 and 180) lies in the
    box, read as its one or two halves. Scalars give a bool, arrays a mask."""
    lat = np.asarray(lat, dtype=float)
    lon = np.asarray(lon, dtype=float)
    mask = np.zeros(np.broadcast(lat, lon).shape, dtype=bool)
    for s, w, n, e in split_box(box):
        mask |= (lat >= s) & (lat <= n) & (lon >= w) & (lon <= e)
    return bool(mask) if mask.ndim == 0 else mask


def meets(box, south: float, west: float, north: float, east: float) -> bool:
    """Whether a shape's own box (south, west, north, east, between -180
    and 180) meets the box, read as its one or two halves."""
    return any(not (north < s or south > n or east < w or west > e) for s, w, n, e in split_box(box))


def shape_of(box):
    """The box as a shapely shape on the plane of degrees, (lon, lat): its
    one rectangle, or its two halves either side of 180."""
    halves = [envelope(w, s, e, n) for s, w, n, e in split_box(box)]
    return halves[0] if len(halves) == 1 else MultiPolygon(halves)
