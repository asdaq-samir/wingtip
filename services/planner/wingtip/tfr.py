"""Temporary flight restrictions: the FAA's own, from tfr.faa.gov, as the
weather service (services/weather/app/tfr.py) keeps them in the weather
store (wingtip.weather_store, "tfrs"): the site's shapes, one MultiPolygon
per NOTAM with its title and kind, each with what its own XNOTAM file
says -- when it is in force, how high it reaches, why, under which rule
-- read by the engine (wingtip_engine::tfr). Never fetched from here, so
neither the map nor a briefing waits on tfr.faa.gov (#535).
"""

from __future__ import annotations

import math
import time
from datetime import datetime, timezone

from shapely.geometry import LineString, Point, shape
from shapely.ops import nearest_points

from . import weather_store
from .engine import ask as engine
from .geo import along_track_distance_nm
from .units import NM_PER_DEG_LAT

#: How often the service reads the shapes again: the site updates them
#: every few minutes. A list older than this was kept through an outage.
SHAPES_TTL_S = 10 * 60
#: How near the route a TFR is listed with it: a pilot plans round one,
#: not along its edge.
NEAR_NM = 5.0


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


def all_tfrs() -> list:
    """Every TFR in force or to come, one per NOTAM: {"notam_id", "title",
    "kind", "state", "geometry" (GeoJSON, a MultiPolygon of its areas)}
    and its detail ({"effective", "expires", "rule", "purpose",
    "floor_ft", "floor_ref", "ceiling_ft", "ceiling_ref"}, where its file
    could be read). TfrUnavailable where the service has stored none."""
    weather_store.mark_asked()
    record = weather_store.read("tfrs")
    if record is None:
        raise TfrUnavailable("tfr.faa.gov has not been read yet")
    # A list held through an outage may name TFRs that have since expired,
    # which the site's own list would no longer carry: those are left out.
    # One issued since cannot be known; the map says how old the list is.
    held = time.time() - record.fetched_at >= SHAPES_TTL_S
    now = datetime.now(timezone.utc)
    return [dict(t) for t in record.data if not (held and _ended(t, now))]


def in_force(tfr: dict, start: datetime, end: datetime) -> bool:
    """Whether a TFR is in force at any time from `start` to `end` (UTC):
    one with no times is taken as in force (_when, the engine's)."""
    return _when(tfr, start, end) not in ("before", "after")


def along_route(path: list, start: datetime, end: datetime, near_nm: float = NEAR_NM) -> list:
    """The TFRs within `near_nm` of a route flown through `path` [(lat,
    lon)], in force at some time from `start` to `end`, in along-route
    order: each of all_tfrs()'s, with "along_track_nm", how far along it
    is, "crosses", whether the route goes through it, and "active_now"."""
    line = LineString([(lon, lat) for lat, lon in path])
    # Degrees of buffer, as many as `near_nm` of longitude at the route's
    # latitude, which are the more: a little generous north and south.
    mid_lat = sum(lat for lat, _ in path) / len(path)
    buffer_deg = near_nm / NM_PER_DEG_LAT / max(0.2, math.cos(math.radians(mid_lat)))
    near = line.buffer(buffer_deg)
    now = datetime.now(timezone.utc)
    found = []
    for tfr in all_tfrs():
        try:
            geometry = shape(tfr["geometry"])
        except (KeyError, TypeError, ValueError):
            continue
        if not near.intersects(geometry) or not in_force(tfr, start, end):
            continue
        point = geometry.representative_point()
        found.append(
            {
                **tfr,
                "along_track_nm": round(along_track_distance_nm(point.y, point.x, path[0], path[-1]), 1),
                "crosses": line.intersects(geometry),
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
    buffer_deg = near_nm / NM_PER_DEG_LAT / max(0.2, math.cos(math.radians(lat)))
    near = point.buffer(buffer_deg)
    now = datetime.now(timezone.utc)
    found = []
    for tfr in all_tfrs():
        try:
            geometry = shape(tfr["geometry"])
        except (KeyError, TypeError, ValueError):
            continue
        if near.intersects(geometry) and in_force(tfr, start, end):
            edge = nearest_points(geometry, point)[0]
            found.append(
                {**tfr, "crosses": geometry.contains(point), "active_now": in_force(tfr, now, now), "edge": {"lat": edge.y, "lon": edge.x}}
            )
    return found


def at_point(lat: float, lon: float) -> list:
    """The TFRs in force or to come over a point: each of all_tfrs()'s,
    with "active_now"."""
    point = Point(lon, lat)
    now = datetime.now(timezone.utc)
    found = []
    for tfr in all_tfrs():
        try:
            geometry = shape(tfr["geometry"])
        except (KeyError, TypeError, ValueError):
            continue
        if geometry.contains(point):
            found.append({**tfr, "active_now": in_force(tfr, now, now)})
    return found
