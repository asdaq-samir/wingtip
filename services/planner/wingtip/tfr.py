"""Temporary flight restrictions: the FAA's own, from tfr.faa.gov, as the
weather service (services/weather/app/tfr.py) keeps them in the weather
store (wingtip.weather_store, "tfrs"): the site's shapes, one MultiPolygon
per NOTAM with its title and kind, each with what its own XNOTAM file
says -- when it is in force, how high it reaches, why, under which rule
-- read by the engine (wingtip_engine::tfr). Never fetched from here, so
neither the map nor a briefing waits on tfr.faa.gov (#535).
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

import numpy as np
from shapely import STRtree
from shapely.geometry import LineString, Point, box, shape
from shapely.ops import nearest_points

from . import weather_store
from .engine import ask as engine
from .geo import along_track_distance_nm, box_around, corridor_bbox, path_points, shape_distance_nm

#: How often the service reads the shapes again: the site updates them
#: every few minutes. A list older than this was kept through an outage.
SHAPES_TTL_S = 10 * 60
#: How near the route a TFR is listed with it: a pilot plans round one,
#: not along its edge. The app's own margin, no FAA figure.
NEAR_NM = 5.0
#: How far apart the route's points are measured from a TFR, nm.
STEP_NM = 2.0


class TfrUnavailable(RuntimeError):
    """The weather service has no list of tfr.faa.gov's."""


def _when(tfr: dict, start: datetime, end: datetime) -> str | None:
    """A TFR's window against a flight's time from `start` to `end`: the
    engine's gonogo_hazard_window with no margin -- "before" it begins,
    "after" it ends, "during", or None where it gives no time at all. A TFR
    is in force only from its effective to its expiry time, as its NOTAM
    gives them (AIM 3-5-3; 14 CFR 91.137-91.145); one with no expiry is
    until further notice, and a time that cannot be read is no time."""

    def at(key: str) -> float | None:
        try:
            return datetime.fromisoformat(tfr[key].replace("Z", "+00:00")).timestamp() if tfr.get(key) else None
        except ValueError:
            return None

    return engine(
        "gonogo_hazard_window",
        enter=start.timestamp(),
        leave=end.timestamp(),
        valid_from=at("effective"),
        valid_to=at("expires"),
        margin_min=0,
    )


def _ended(detail: dict, now: datetime) -> bool:
    """Whether a TFR's NOTAM has passed its expiry (_when's "after")."""
    return _when(detail, now, now) == "after"


def failing() -> bool:
    """Whether the service's last ask of tfr.faa.gov failed, the list held
    before served on in its place (for the pilot's Status page)."""
    tried = weather_store.attempt("tfrs")
    record = weather_store.read("tfrs")
    return bool(tried and tried.get("error") and (record is None or tried["attempted"] >= record.fetched_at))


def fetched_at() -> float | None:
    """When the TFRs the map is drawn from were fetched (UNIX seconds),
    None before the first fetch."""
    record = weather_store.read("tfrs")
    return record.fetched_at if record else None


def _record():
    weather_store.mark_asked()
    record = weather_store.read("tfrs")
    if record is None:
        raise TfrUnavailable("tfr.faa.gov has not been read yet")
    return record


def _keeps(record):
    """Which of the record's TFRs all_tfrs keeps: a list held through an
    outage may name TFRs that have since expired, which the site's own list
    would no longer carry, and those are left out. One issued since cannot
    be known; the map says how old the list is."""
    held = time.time() - record.fetched_at >= SHAPES_TTL_S
    now = datetime.now(timezone.utc)
    return lambda t: not (held and _ended(t, now))


def all_tfrs() -> list:
    """Every TFR in force or to come, one per NOTAM: {"notam_id", "title",
    "kind", "state", "geometry" (GeoJSON, a MultiPolygon of its areas)}
    and its detail ({"effective", "expires", "rule", "purpose",
    "floor_ft", "floor_ref", "ceiling_ft", "ceiling_ref"}, where its file
    could be read). TfrUnavailable where the service has stored none."""
    record = _record()
    return list(map(dict, filter(_keeps(record), record.data)))


# The record's shapes, parsed once per copy the service writes (every few
# minutes) rather than at every ask: (record, [shape or None a TFR], their
# STRtree, which skips the Nones and keeps the list's positions).
_SHAPES: dict = {}


def _shapes(record) -> tuple[list, STRtree]:
    held = _SHAPES.get("held")
    if held is not None and held[0] is record:
        return held[1], held[2]
    geometries = []
    for t in record.data:
        try:
            geometries.append(shape(t["geometry"]))
        except (KeyError, TypeError, ValueError):
            geometries.append(None)
    tree = STRtree(geometries)
    _SHAPES["held"] = (record, geometries, tree)
    return geometries, tree


def with_shapes(near=None, predicate: str | None = None) -> list[tuple[dict, object]]:
    """all_tfrs' TFRs that have a shape, each with it (shapely's), in their
    order: those whose shape's box meets `near` (a shapely geometry) where
    it is given, or with `predicate` those `near` stands in that relation
    to (STRtree.query's: "within", the point inside the shape)."""
    record = _record()
    geometries, tree = _shapes(record)
    kept = _keeps(record)
    found = range(len(geometries)) if near is None else sorted(tree.query(near, predicate=predicate).tolist())
    return [(dict(record.data[i]), geometries[i]) for i in found if geometries[i] is not None and kept(record.data[i])]


def in_force(tfr: dict, start: datetime, end: datetime) -> bool:
    """Whether a TFR is in force at any time from `start` to `end` (UTC):
    one with no times is taken as in force (_when, the engine's)."""
    return _when(tfr, start, end) not in ("before", "after")


def along_route(path: list, start: datetime, end: datetime, near_nm: float = NEAR_NM) -> list:
    """The TFRs within `near_nm` of a route flown through `path` [(lat,
    lon)], in force at some time from `start` to `end`, in along-route
    order: each of all_tfrs()'s, with "along_track_nm", how far along it
    is, "crosses", whether the route goes through it, and "active_now"."""
    # The route as it is flown, each leg along its great circle, its
    # points close enough that a straight edge between them on the flat
    # projection is the course (geo.shape_distance_nm).
    lats, lons = path_points(path, STEP_NM)
    line = LineString(np.column_stack([lons, lats]))
    # A first cut by the route's box, padded by near_nm as a degree of
    # longitude is at its poleward edge, where it is shortest: never short.
    south, west, north, east = corridor_bbox((lats.min(), lons.min()), (lats.max(), lons.max()), near_nm)
    now = datetime.now(timezone.utc)
    found = []
    for tfr, geometry in with_shapes(box(west, south, east, north)):
        g_west, g_south, g_east, g_north = geometry.bounds
        # The route within the TFR's own box, padded the same way: what
        # lies outside it is further than near_nm, and is not projected.
        reach = corridor_bbox((g_south, g_west), (g_north, g_east), near_nm)
        nearby = line.intersection(box(reach[1], reach[0], reach[3], reach[2]))
        if nearby.is_empty:
            continue
        point = geometry.representative_point()
        # Measured, not buffered in degrees: a buffer sized at the route's
        # middle latitude reached 4.1 of 5 nm east and west at 49 N on a
        # route from 25 N (cos 49 / cos 37, the stock audit's bug 2).
        apart = shape_distance_nm(nearby, geometry, (point.y, point.x))
        if apart > near_nm or not in_force(tfr, start, end):
            continue
        found.append(
            {
                **tfr,
                "along_track_nm": round(along_track_distance_nm(point.y, point.x, path[0], path[-1]), 1),
                "crosses": apart == 0.0,
                "active_now": in_force(tfr, now, now),
            }
        )
    return sorted(found, key=lambda t: t["along_track_nm"])


def near_point(lat: float, lon: float, start: datetime, end: datetime, near_nm: float = NEAR_NM) -> list:
    """The TFRs within `near_nm` of a point (a field), in force at some
    time from `start` to `end`: each of all_tfrs()'s, with "crosses",
    whether it covers the point, "active_now", as along_route gives
    them for a route, and "edge", the point of its areas nearest the
    field ({"lat", "lon"}), which the engine says how far and which way
    (tfr_read)."""
    point = Point(lon, lat)
    south, west, north, east = box_around(lat, lon, near_nm)
    now = datetime.now(timezone.utc)
    found = []
    for tfr, geometry in with_shapes(box(west, south, east, north)):
        if shape_distance_nm(point, geometry, (lat, lon)) <= near_nm and in_force(tfr, start, end):
            edge = nearest_points(geometry, point)[0]
            found.append(
                {**tfr, "crosses": geometry.contains(point), "active_now": in_force(tfr, now, now), "edge": {"lat": edge.y, "lon": edge.x}}
            )
    return found


def at_point(lat: float, lon: float) -> list:
    """The TFRs in force or to come over a point: each of all_tfrs()'s,
    with "active_now"."""
    now = datetime.now(timezone.utc)
    return [{**tfr, "active_now": in_force(tfr, now, now)} for tfr, _ in with_shapes(Point(lon, lat), "within")]
