"""Overpass API query + parsing for candidate visual landmarks.

Candidate categories are things a VFR pilot can plausibly pick out from
altitude: water bodies, stadiums, and towns/cities, all via
CANDIDATE_SPECS below -- plus rivers, railroads,
major-highway intersections, and wind farms, which aren't single-point
OSM features and need their own resolvers (query_line_features here and
wingtip.osm_resolvers' find_line_crossings, query_major_highways/
find_intersections, and query_wind_turbines/find_wind_farms).

VOR navaids and generic towers/obstacles are NOT sourced from OSM at all
-- see wingtip.faa_data, which pulls both from the FAA's own NASR/Digital
Obstacle File data. The FAA is definitionally the authority on its own
navaid network, and DOF obstacle height/lighting data lets "tower"
candidates be filtered to ones actually significant enough to matter
from the air, rather than every generic man_made=tower OSM tag.
"""

import pandas as pd
import requests

# Overpass rejects requests without an identifiable User-Agent (406 Not Acceptable).
from .config import REQUEST_HEADERS
from .geo import distance_nm
from .retry import with_retries
from .units import M_PER_NM

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# The public Overpass instances, tried in turn: the main one answers
# 504 Gateway Timeout for minutes at a time under load (a retrain's
# collect step died that way three attempts running on 2026-09-21),
# and the same query on a mirror usually goes through.
OVERPASS_URLS = (OVERPASS_URL, "https://overpass.kumi.systems/api/interpreter", "https://lz4.overpass-api.de/api/interpreter")

# category -> (Overpass tag filter clause, predicate on the element's tags dict)
# Each category is one entry, but its rule is written twice in it: as the
# filter that fetches the category's elements and as the predicate that
# labels them. The two are kept saying the same thing by hand, and
# services/planner/tests_wingtip/test_osm.py pins both -- the query, whole, and the labels. An
# element is given the first category whose predicate matches, in this
# order: natural=water with water=reservoir is a lake_or_pond.
# natural=water covers rivers too, as polygons -- and those are already
# handled properly by query_line_features/find_line_crossings, which
# resolve a river to the point where the route actually crosses it (the
# only sensible checkpoint for a linear feature). Left in, they arrived
# as enormous "lakes" placed at the centre of their bounding box: the
# worst offender was a 665 km2 unnamed water=river multipolygon whose
# marker landed nowhere near any water.
_RIVERINE_WATER = ("river", "stream", "canal", "ditch")

CANDIDATE_SPECS = {
    # intermittent!=yes excludes seasonal/dry water bodies -- not a
    # reliable visual checkpoint if it might be empty when you fly over.
    "lake_or_pond": (
        '["natural"="water"]["intermittent"!="yes"]["water"!~"^(river|stream|canal|ditch)$"]',
        lambda t: t.get("natural") == "water" and t.get("intermittent") != "yes" and t.get("water") not in _RIVERINE_WATER,
    ),
    "reservoir": (
        '["water"="reservoir"]["intermittent"!="yes"]',
        lambda t: t.get("water") == "reservoir" and t.get("intermittent") != "yes",
    ),
    "stadium": ('["leisure"="stadium"]', lambda t: t.get("leisure") == "stadium"),
    "town": ('["place"~"^(city|town)$"]', lambda t: t.get("place") in ("city", "town")),
    # "tower", "vor", "water_tower" and "quarry" are deliberately absent.
    #
    # tower/vor come from wingtip.faa_data (FAA DOF obstacles / NASR navaids)
    # instead of OSM tags -- the FAA is the authority on its own network,
    # and DOF height/lighting data filters obstacles down to ones actually
    # significant from the air.
    #
    # water_tower was dropped because a sectional draws every obstacle
    # with the same symbol -- there is no water-tower symbol -- so from
    # the chart alone you cannot tell one from any other tower, and the
    # label is defined as a chart judgment. Checking the 17 this used to
    # produce: 16 were not charted at all (nearest FAA obstacle 0.23 to
    # 30 nm away), so they were unratable rather than merely ambiguous;
    # the 1 that was charted duplicated a DOF entry 0.0014 nm away. The
    # FAA already carries genuinely charted water towers as TANK
    # obstacles, so nothing is lost.
    #
    # quarry went for the same reason one step further along: a sectional
    # marks a mine or quarry with a crossed-pick symbol only where one is
    # large and isolated enough to be a landmark, so most OSM
    # landuse=quarry polygons -- gravel pits beside a county road -- have
    # nothing drawn at all, and from the air a working pit reads as a
    # bare patch indistinguishable from a field being cleared.
}


def build_overpass_query(bbox: tuple, specs: dict = CANDIDATE_SPECS, timeout_s: int = 60) -> str:
    """bbox = (min_lat, min_lon, max_lat, max_lon).

    Uses `out geom;` so ways/relations come back with full vertex
    geometry. `out bb;` (and `out center;`, which is the same thing) only
    gives a bounding box, and its centre is not a point on the feature --
    for anything non-convex, a crescent lake or a bay, the marker lands
    off the water entirely. See _representative_point.

    The bounds Overpass still returns alongside the geometry are what
    _bbox_area_m2 uses to tell a farm pond from a real lake; the true
    polygon area isn't needed for that.
    """
    min_lat, min_lon, max_lat, max_lon = bbox
    bbox_str = f"{min_lat},{min_lon},{max_lat},{max_lon}"
    clauses = []
    for filt, _match in specs.values():
        clauses.append(f"node{filt}({bbox_str});")
        clauses.append(f"way{filt}({bbox_str});")
        clauses.append(f"relation{filt}({bbox_str});")
    body = "\n".join(clauses)
    return f"[out:json][timeout:{timeout_s}];\n(\n{body}\n);\nout geom;"


def _post_overpass_query(query: str, retries: int = 3) -> dict:
    attempts = {"n": 0}

    def attempt() -> dict:
        # Each retry moves to the next instance, so three attempts are
        # three servers rather than the same overloaded one three times.
        url = OVERPASS_URLS[attempts["n"] % len(OVERPASS_URLS)]
        attempts["n"] += 1
        resp = requests.post(url, data={"data": query}, headers=REQUEST_HEADERS, timeout=90)
        resp.raise_for_status()
        return resp.json()

    return with_retries(
        attempt, describe="Overpass query", retries=retries, backoff_s=5.0, transient=(requests.RequestException, ValueError)
    )


def query_overpass(bbox: tuple, specs: dict = CANDIDATE_SPECS, retries: int = 3) -> dict:
    """Raw Overpass API response for every candidate-category feature
    (see specs) inside bbox -- pass to parse_overpass_response to get a
    usable DataFrame out of it."""
    query = build_overpass_query(bbox, specs)
    return _post_overpass_query(query, retries)


def _category_for_tags(tags: dict, specs: dict = CANDIDATE_SPECS) -> str:
    for category, (_filt, match) in specs.items():
        if match(tags):
            return category
    return "other"


def _bbox_area_m2(bounds: dict) -> float:
    """Rough rectangular footprint area from an Overpass `bounds` block —
    an overestimate of the true polygon area, but fine for telling a real
    lake apart from a farm pond.
    """
    width_nm = distance_nm(bounds["minlat"], bounds["minlon"], bounds["minlat"], bounds["maxlon"])
    height_nm = distance_nm(bounds["minlat"], bounds["minlon"], bounds["maxlat"], bounds["minlon"])
    return (width_nm * M_PER_NM) * (height_nm * M_PER_NM)


def _representative_point(el: dict) -> tuple | None:
    """A (lat, lon) that actually lies on the feature, or None if the
    element's geometry can't be assembled into one.

    shapely's representative_point() is the point of this: unlike
    centroid(), it is guaranteed to fall *inside* the polygon, which is
    exactly the property a map marker needs. A centroid is fine for a
    blob and wrong for a crescent-shaped lake.

    Relations are multipolygons whose outer ring is often split across
    several member ways, so the members are stitched back together with
    polygonize() rather than assumed to be one closed loop. Where a
    relation yields several polygons (a lake with islands, a chain of
    pools), the largest is the one worth flying to.
    """
    from shapely.geometry import LineString, Polygon
    from shapely.ops import polygonize, unary_union

    def _coords(geometry):
        return [(p["lon"], p["lat"]) for p in geometry if p.get("lat") is not None]

    shapes = []
    if el["type"] == "way" and el.get("geometry"):
        coords = _coords(el["geometry"])
        if len(coords) >= 4 and coords[0] == coords[-1]:
            shapes.append(Polygon(coords))
        elif len(coords) >= 2:
            shapes.append(LineString(coords))
    elif el["type"] == "relation":
        lines = [
            LineString(_coords(m["geometry"]))
            for m in el.get("members", [])
            if m.get("role") in (None, "", "outer") and len(_coords(m.get("geometry") or [])) >= 2
        ]
        polys = list(polygonize(lines))
        shapes.extend(polys or lines)

    shapes = [s for s in shapes if not s.is_empty]
    if not shapes:
        return None

    areas = [s.area for s in shapes]
    shape = shapes[areas.index(max(areas))] if max(areas) > 0 else unary_union(shapes)
    point = shape.representative_point()
    return (point.y, point.x)


def _bounds_from_geometry(el: dict) -> dict | None:
    """Fall back to deriving bounds from the geometry, for the rare
    element Overpass returns without a bounds block."""
    points = list(el.get("geometry") or [])
    for member in el.get("members", []):
        points.extend(member.get("geometry") or [])
    lats = [p["lat"] for p in points if p.get("lat") is not None]
    lons = [p["lon"] for p in points if p.get("lon") is not None]
    if not lats or not lons:
        return None
    return {"minlat": min(lats), "maxlat": max(lats), "minlon": min(lons), "maxlon": max(lons)}


def parse_overpass_response(response: dict, specs: dict = CANDIDATE_SPECS) -> pd.DataFrame:
    """Flattens query_overpass's raw response into one row per candidate
    feature, categorized (see _category_for_tags) and with a bbox_area_m2
    computed for way/relation elements."""
    rows = []
    for el in response.get("elements", []):
        tags = el.get("tags", {})
        bounds = el.get("bounds")
        if el["type"] == "node":
            lat, lon = el.get("lat"), el.get("lon")
            bbox_area_m2 = 0.0
        else:
            bounds = bounds or _bounds_from_geometry(el)
            if not bounds:
                continue
            bbox_area_m2 = _bbox_area_m2(bounds)
            point = _representative_point(el)
            if point is not None:
                lat, lon = point
            else:
                # Geometry that won't assemble into a shape at all: the
                # bbox centre is wrong for anything non-convex, but it's
                # better than dropping the candidate outright.
                lat = (bounds["minlat"] + bounds["maxlat"]) / 2
                lon = (bounds["minlon"] + bounds["maxlon"]) / 2
        if lat is None or lon is None:
            continue
        rows.append(
            {
                "osm_id": el["id"],
                "osm_type": el["type"],
                "category": _category_for_tags(tags, specs),
                "name": tags.get("name"),
                "lat": lat,
                "lon": lon,
                "bbox_area_m2": bbox_area_m2,
                "tags": tags,
            }
        )
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.drop_duplicates(subset=["osm_id", "osm_type"]).reset_index(drop=True)
    return df


# --- Rivers + railroads: linear features resolved to their route-crossing point ---
#
# Neither is a single-point OSM feature, and a pilotage checkpoint for either
# is naturally "the point where the route crosses it" -- so both share one
# resolver rather than getting entries in CANDIDATE_SPECS.


def query_line_features(bbox: tuple, tag_filter: str, retries: int = 3, timeout_s: int = 60) -> list:
    """Overpass query for line-shaped ways with full vertex geometry --
    `out geom;` rather than the `out bb;` used everywhere else in this
    module, since resolving a crossing point needs the actual polyline,
    not just a bounding box.

    Returns the raw list of way elements, each with a `geometry` array of
    {lat, lon} vertices.
    """
    min_lat, min_lon, max_lat, max_lon = bbox
    bbox_str = f"{min_lat},{min_lon},{max_lat},{max_lon}"
    query = f'[out:json][timeout:{timeout_s}];\nway{tag_filter}({bbox_str});\nout geom;'
    return _post_overpass_query(query, retries).get("elements", [])
