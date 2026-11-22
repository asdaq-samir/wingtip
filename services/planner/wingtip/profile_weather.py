"""The weather on a route's side view: the forecast cloud bases, the
freezing level and the icing along it, each with where it is from and
for when, for the profile to draw over the ground (wingtip.profile) and
say whose it is.

All of it is read from the weather store the weather service keeps (no
pilot's request waits on aviationweather.gov or NOMADS), along the same
straight hops airport to airport the side view's ground is sampled on,
so its distances are the ground's:

- clouds: the TAF stations near each hop, their worst ceiling over the
  flight (the engine's tafs_along_route, as the altitude plan reads them),
  placed along the route with their base MSL (the engine's
  profile_clouds) and their TAF's issue time;
- freezing: where the forecast temperatures over a point cross 0 C (the
  engine's freezing_level) every FREEZING_EVERY_NM, from the GFS's
  temperatures the plan's winds are read with (wingtip.winds_aloft), its
  run and the time it is for;
- icing: the G-AIRMET icing areas the route crosses (AIM 7-1-6), from
  the one snapshot valid nearest the flight's middle, where along the
  route each begins and ends, between its altitudes (its floor the
  freezing level where it says FZL), its valid and issue times.

Each part is said unavailable where its product is not in the store,
rather than drawn as nothing found.
"""

import math
from itertools import pairwise

from shapely.geometry import LineString, Polygon

from . import geo, utc, weather, winds_aloft
from .engine import ask as engine

#: How often along the route the freezing level is read, nm: a display
#: spacing, finer than the GFS's quarter degree only where hops are short.
FREEZING_EVERY_NM = 20.0


def _clouds(path: list, window: tuple) -> list[dict]:
    """Each TAF station's cloud base along the route, once."""
    stations, seen = [], set()
    for a, b in pairwise(path):
        for s in weather.ceiling_visibility_along_route(a, b, window=window)["stations"]:
            if s["icaoId"] not in seen:
                seen.add(s["icaoId"])
                stations.append(s)
    return engine("profile_clouds", path=[list(p) for p in path], stations=stations)


def _freezing(path: list, key: str) -> list[dict]:
    """The freezing level every FREEZING_EVERY_NM along the route: a point
    whose air stays above freezing in the forecast's range is left out."""
    out, offset = [], 0.0
    for i, (a, b) in enumerate(pairwise(path)):
        length = geo.distance_nm(*a, *b)
        bearing = geo.bearing_deg(*a, *b)
        count = max(1, math.ceil(length / FREEZING_EVERY_NM))
        last = i == len(path) - 2
        for step in range(count + 1 if last else count):
            along = step * length / count
            lat, lon = geo.destination_point(a[0], a[1], bearing, along)
            level = weather.freezing_level(lat, lon, key)
            if level is not None:
                out.append({"along_nm": round(offset + along, 1), "ft": float(level["ft"]), "at_or_below": bool(level["at_or_below"])})
        offset += length
    return out


def _icing(path: list, window: tuple) -> list[dict]:
    """The G-AIRMET icing areas crossed, from the snapshot nearest the
    flight's middle, where along the route each is."""
    snaps = [s for s in weather.gairmet_snapshots_along_route(path, window) if s.get("hazard") == "Icing" and s.get("coords")]
    if not snaps:
        return []
    middle = (window[0] + window[1]) / 2
    nearest = min({s.get("valid") for s in snaps if s.get("valid") is not None} or {None}, key=lambda v: abs((v or middle) - middle))
    out, offset = [], 0.0
    for a, b in pairwise(path):
        length = geo.distance_nm(*a, *b)
        line = LineString([(a[1], a[0]), (b[1], b[0])])
        for snap in snaps:
            if snap.get("valid") != nearest:
                continue
            area = Polygon([(lon, lat) for lat, lon in snap["coords"]])
            if not area.is_valid:
                area = area.buffer(0)
            crossing = line.intersection(area)
            for part in getattr(crossing, "geoms", [crossing]):
                if part.is_empty or part.geom_type != "LineString":
                    continue
                ends = sorted(
                    min(max(geo.along_track_distance_nm(c[1], c[0], a, b), 0.0), length) for c in (part.coords[0], part.coords[-1])
                )
                out.append(
                    {
                        "from_nm": round(offset + ends[0], 1),
                        "to_nm": round(offset + ends[1], 1),
                        "low_ft": snap.get("altitude_low_ft"),
                        "high_ft": snap.get("altitude_high_ft"),
                        "from_freezing_level": bool(snap.get("from_freezing_level")),
                        "severity": snap.get("severity"),
                        "valid_at": snap.get("valid_at"),
                        "issued": snap.get("issued"),
                    }
                )
        offset += length
    return sorted(out, key=lambda x: x["from_nm"])


def along(path: list, start_s: float, end_s: float, depart) -> dict:
    """The weather along a route through `path` [(lat, lon)] for a flight
    from `start_s` to `end_s` (UNIX seconds), departing `depart` (a
    datetime, now where None): {"clouds", "freezing", "freezing_source",
    "icing", "unavailable"}."""
    window = (start_s, end_s)
    unavailable: list[str] = []
    try:
        clouds = _clouds(path, window)
    except weather.WeatherServiceError:
        clouds = []
        unavailable.append("clouds")
    key = winds_aloft.winds_key_for(depart)
    try:
        freezing = _freezing(path, key)
        source = winds_aloft.temperatures_source(key)
    except weather.WeatherServiceError:
        freezing, source = [], None
        unavailable.append("freezing")
    if source is None and "freezing" not in unavailable:
        unavailable.append("freezing")
    try:
        icing = _icing(path, window)
    except weather.WeatherServiceError:
        icing = []
        unavailable.append("icing")
    return {
        "clouds": clouds,
        "freezing": freezing if source else [],
        "freezing_source": source,
        "icing": icing,
        "unavailable": unavailable,
        "for_time": utc.iso(start_s),
    }
