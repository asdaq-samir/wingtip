"""The point-shaped candidates OSM has no single feature for: where the route
crosses a river or railroad, a major-highway intersection (a node shared by
two or more highway ways) and a wind farm (individually mapped turbines,
clustered): each one's Overpass query, and the resolver that turns what
comes back into candidates. The candidate categories' own query and parse
are wingtip.osm's."""

import numpy as np
import pandas as pd

from .geo import cluster_points, cross_track_distance_nm, distance_nm
from .osm import _bbox_area_m2, _post_overpass_query


def _lerp_point(p1: tuple, p2: tuple, t: float) -> tuple:
    """Point a fraction t of the way from p1 to p2, in (lat, lon). Planar
    interpolation -- fine at the scale of two adjacent vertices on an OSM
    way (a few hundred meters to a couple nm apart at most), where
    great-circle vs. straight-line error is negligible.
    """
    lat1, lon1 = p1
    lat2, lon2 = p2
    return lat1 + t * (lat2 - lat1), lon1 + t * (lon2 - lon1)


_LINE_CROSSING_COLUMNS = ["osm_id", "osm_type", "name", "lat", "lon", "bbox_area_m2", "tags"]

# Crossings closer together than this are the same checkpoint as far as a
# pilot is concerned -- a meandering river can weave back over the course
# line three times inside 100 m, and at 120 kt that's a couple of seconds.
# Collapsing them stops the same feature being offered for labeling
# repeatedly, and stops one label being joined onto several training rows.
MIN_CROSSING_SEPARATION_NM = 0.5


def find_line_crossings(ways: list, route_start: tuple, route_end: tuple) -> pd.DataFrame:
    """Resolve each way's crossing point(s) with the route's great-circle
    line: walk the way's vertices, and wherever cross_track_distance_nm
    (already used to enforce the route corridor everywhere else) flips
    sign between two consecutive vertices, the route crosses between
    them -- linearly interpolate the crossing point there. A winding
    river/track can cross more than once, so this can emit multiple rows
    per way. `category` is left for the caller to assign, since this is
    shared by rivers and railroads.

    Crossings within MIN_CROSSING_SEPARATION_NM of one already kept are
    dropped as the same checkpoint. Those that survive get distinct ids
    ("<way id>#2", "#3", ...) because osm_id is what labels join on: left
    identical, a single rating would be joined onto every crossing of that
    river and silently counted several times over. The first crossing
    keeps the bare way id so existing labels still match.
    """
    rows = []
    for way in ways:
        geometry = way.get("geometry")
        if not geometry:
            continue
        tags = way.get("tags", {})
        # Every vertex of the way in one call. A long river runs to
        # hundreds of vertices and a corridor to hundreds of ways, so
        # asking per vertex was most of what this function cost.
        cross_tracks = cross_track_distance_nm(
            np.array([pt["lat"] for pt in geometry], dtype=float),
            np.array([pt["lon"] for pt in geometry], dtype=float),
            route_start,
            route_end,
        )

        crossings = []
        for i in range(len(geometry) - 1):
            ct1, ct2 = cross_tracks[i], cross_tracks[i + 1]
            if (ct1 < 0) == (ct2 < 0):
                continue
            t = abs(ct1) / (abs(ct1) + abs(ct2))
            lat, lon = _lerp_point((geometry[i]["lat"], geometry[i]["lon"]), (geometry[i + 1]["lat"], geometry[i + 1]["lon"]), t)
            if any(distance_nm(lat, lon, kept_lat, kept_lon) < MIN_CROSSING_SEPARATION_NM for kept_lat, kept_lon in crossings):
                continue
            crossings.append((lat, lon))

        for n, (lat, lon) in enumerate(crossings):
            rows.append(
                {
                    "osm_id": way["id"] if n == 0 else f"{way['id']}#{n + 1}",
                    "osm_type": "way",
                    "name": tags.get("name"),
                    "lat": lat,
                    "lon": lon,
                    "bbox_area_m2": 0.0,
                    "tags": tags,
                }
            )
    return pd.DataFrame(rows, columns=_LINE_CROSSING_COLUMNS)


# --- Highway intersections: a node shared by 2+ distinct major-highway ways ---


def query_major_highways(bbox: tuple, retries: int = 3, timeout_s: int = 60) -> tuple:
    """Overpass query for major highway ways plus every node they
    reference (`out body; >; out skel qt;`): a road intersection isn't a
    taggable OSM feature on its own, it's a node shared by 2+ distinct
    ways, so this needs each way's ordered node-id list plus real node
    coordinates rather than the `out bb;` shape used elsewhere.

    Returns (highway_ways, node_coords): highway_ways is the list of way
    elements (each with an ordered "nodes" id list), node_coords is a
    {node_id: (lat, lon)} dict for every node referenced by those ways.
    """
    min_lat, min_lon, max_lat, max_lon = bbox
    bbox_str = f"{min_lat},{min_lon},{max_lat},{max_lon}"
    query = (
        f'[out:json][timeout:{timeout_s}];\nway["highway"~"^(motorway|trunk|primary|secondary)$"]({bbox_str});\nout body;\n>;\nout skel qt;'
    )
    elements = _post_overpass_query(query, retries).get("elements", [])
    highway_ways = [el for el in elements if el["type"] == "way"]
    node_coords = {el["id"]: (el["lat"], el["lon"]) for el in elements if el["type"] == "node"}
    return highway_ways, node_coords


_INTERSECTION_COLUMNS = ["osm_id", "osm_type", "category", "name", "lat", "lon", "bbox_area_m2", "tags"]


def find_intersections(highway_ways: list, node_coords: dict) -> pd.DataFrame:
    """A road intersection = a node shared by ways belonging to 2+
    genuinely different *numbered* roads (their `ref` tag, e.g. "US 51").
    Matching on `ref` only (not falling back to `name`) is deliberate:
    OSM splits a single physical road into many short way segments
    (speed limit changes, bridges, ...), and inconsistently re-tags the
    same numbered route's `name` as whatever local street it's currently
    running along (e.g. "US 51 Business" also appears as "Grand Avenue",
    "Merrill Avenue", "Schofield Avenue", ... along its own length) --
    matching on `name` produces overwhelming false-positive
    "intersections" between segments of the *same* road. Requiring `ref`
    on both sides also naturally excludes plain local streets with no
    route number, matching the "avoid small local road intersections"
    guidance this whole feature is scoped around.
    """
    node_to_ways: dict = {}
    for way in highway_ways:
        for node_id in way.get("nodes", []):
            node_to_ways.setdefault(node_id, set()).add(way["id"])

    way_by_id = {way["id"]: way for way in highway_ways}

    def road_ref(way: dict) -> str | None:
        return (way.get("tags", {}).get("ref") or "").strip() or None

    rows = []
    for node_id, way_ids in node_to_ways.items():
        if node_id not in node_coords:
            continue
        lat, lon = node_coords[node_id]
        labels = sorted({road_ref(way_by_id[wid]) for wid in way_ids} - {None})
        if len(labels) < 2:
            continue  # same numbered road (or an unnumbered local street)
        rows.append(
            {
                "osm_id": node_id,
                "osm_type": "node",
                "category": "intersection",
                "name": " & ".join(labels),
                "lat": lat,
                "lon": lon,
                "bbox_area_m2": 0.0,
                "tags": {"intersecting_ways": labels},
            }
        )

    df = pd.DataFrame(rows, columns=_INTERSECTION_COLUMNS)
    if df.empty:
        return df

    # A real interchange is frequently digitized as several nodes a few
    # tens of meters apart (ramps, a divided-highway median, ...) -- each
    # would otherwise show up as its own near-duplicate candidate. Merge
    # ones within 0.03 nm (~55 m) of each other, same trick as
    # find_wind_farms. Deliberately tight: two genuinely separate
    # intersections a couple hundred meters apart (e.g. where a
    # multiplexed route's concurrency starts vs. ends) should stay separate.
    df = df.assign(cluster_id=cluster_points(df["lat"], df["lon"], cluster_distance_nm=0.03))
    merged = []
    for _, group in df.groupby("cluster_id"):
        labels = sorted({label for tags in group["tags"] for label in tags["intersecting_ways"]})
        merged.append(
            {
                "osm_id": group["osm_id"].iloc[0],
                "osm_type": "node",
                "category": "intersection",
                "name": " & ".join(labels),
                "lat": group["lat"].mean(),
                "lon": group["lon"].mean(),
                "bbox_area_m2": 0.0,
                "tags": {"intersecting_ways": labels},
            }
        )
    return pd.DataFrame(merged, columns=_INTERSECTION_COLUMNS)


# --- Wind farms: individually-mapped turbines, clustered into farm-level candidates ---


def query_wind_turbines(bbox: tuple, retries: int = 3, timeout_s: int = 60) -> pd.DataFrame:
    """Overpass query for individual wind-turbine nodes
    (power=generator + generator:source=wind). Each turbine is its own
    OSM node; find_wind_farms clusters them into farm-level candidates.
    """
    min_lat, min_lon, max_lat, max_lon = bbox
    bbox_str = f"{min_lat},{min_lon},{max_lat},{max_lon}"
    query = f'[out:json][timeout:{timeout_s}];\nnode["power"="generator"]["generator:source"="wind"]({bbox_str});\nout;'
    elements = _post_overpass_query(query, retries).get("elements", [])
    rows = [
        {"osm_id": el["id"], "lat": el["lat"], "lon": el["lon"], "name": el.get("tags", {}).get("name")}
        for el in elements
        if el["type"] == "node"
    ]
    return pd.DataFrame(rows, columns=["osm_id", "lat", "lon", "name"])


_WIND_FARM_COLUMNS = ["osm_id", "osm_type", "category", "name", "lat", "lon", "bbox_area_m2", "tags"]


def find_wind_farms(turbine_df: pd.DataFrame, cluster_distance_nm: float = 1.0) -> pd.DataFrame:
    """Group individual turbines into farm-level candidates -- a pilot
    spots "that field of turbines" as one checkpoint, not each turbine
    separately. Clusters via geo.cluster_points, then represents each
    cluster by its centroid, turbine count, and bounding-box footprint
    (so log_size_feature sees a real size: a 40-turbine farm should read
    as more visible than a 3-turbine cluster).
    """
    if turbine_df.empty:
        return pd.DataFrame(columns=_WIND_FARM_COLUMNS)

    turbine_df = turbine_df.reset_index(drop=True)
    turbine_df = turbine_df.assign(cluster_id=cluster_points(turbine_df["lat"], turbine_df["lon"], cluster_distance_nm))

    rows = []
    for _, group in turbine_df.groupby("cluster_id"):
        bounds = {"minlat": group["lat"].min(), "minlon": group["lon"].min(), "maxlat": group["lat"].max(), "maxlon": group["lon"].max()}
        names = group["name"].dropna()
        farm_name = names.mode().iloc[0] if not names.empty else f"Wind Farm ({len(group)} turbines)"
        rows.append(
            {
                "osm_id": int(group["osm_id"].min()),
                "osm_type": "cluster",
                "category": "wind_farm",
                "name": farm_name,
                "lat": group["lat"].mean(),
                "lon": group["lon"].mean(),
                "bbox_area_m2": _bbox_area_m2(bounds),
                "tags": {"turbine_count": int(len(group))},
            }
        )
    return pd.DataFrame(rows, columns=_WIND_FARM_COLUMNS)
