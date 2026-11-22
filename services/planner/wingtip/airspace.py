"""Controlled airspace along a route, from the FAA's own Class Airspace
shapefile -- real polygon geometry via shapely (pyshp reads the
.shp/.dbf; no geopandas/fiona needed), not an approximated circle, so
irregular/non-standard shelves are handled correctly.

The classes are not interchangeable, and this module stopped treating
them as such on 2026-09-10. Entering Class C or Class D requires only
that two-way radio communication be established -- you call approach or
tower, they answer with your callsign, and you are in. That is routine
VFR practice, not an obstacle, so C and D do not constrain cruising
altitude at all. They are reported instead as airspace to establish
contact with, which is nav-log information a pilot wants.

Class B is different: it takes an explicit clearance ("cleared into the
Bravo", 14 CFR 91.131(a)(1)). Since 2026-11-17 it imposes no ceiling
either (the owner: "keep it true by default in the app"): a route is
planned through it with the clearance it takes, its transits say so, and
the Routes offer the way round it (class_b_entered, detour_waypoints,
wingtip.class_b_route).

Before 2026-09-10, all of B/C/D imposed a ceiling, which forced routes
beneath shelves a pilot would simply have talked their way through -- and
for a Class-C-to-Class-C route left no legal altitude at all.

Class E is excluded entirely: VFR overflight needs neither clearance nor
a radio call, just cloud clearance and visibility minimums.
"""

import threading
from pathlib import Path

import shapefile
from cachetools import LRUCache, TTLCache
from shapely import STRtree, points as shapely_points
from shapely.geometry import Point, shape as shapely_shape

from .airspace_file import CONTROLLED_CLASSES as CONTROLLED_CLASSES, _ALL_AIRSPACE_LOCK, _text as _text
from .airspace_file import _load_all_controlled_airspace as _load_all_controlled_airspace
from .airspace_file import ensure_class_airspace_shapefile as ensure_class_airspace_shapefile
from . import geo_boxes
from .engine import ask as engine

# Class E surface areas (E2) and their extensions (E3, E4): controlled
# from the ground, the dashed magenta line the chart draws round a field.
# Read only for an airport's own class (surface_class_at); a route never
# needs them, as nothing about E asks a VFR pilot for a clearance.
SURFACE_E_TYPES = ("CLASS_E2", "CLASS_E3", "CLASS_E4")

# Class B takes an explicit clearance, which can be refused: the only class
# the Routes offer a way round (detour_waypoints).
CLEARANCE_CLASSES = ("B",)


def preload(faa_cache_dir) -> None:
    """Parses (or reads back) the controlled-airspace polygons now, so a
    service can pay the cold cost at startup rather than on a pilot's
    first request."""
    shp_path = ensure_class_airspace_shapefile(faa_cache_dir)
    _load_all_controlled_airspace(shp_path)
    _load_surface_e(shp_path)


_SURFACE_E_CACHE: LRUCache = LRUCache(maxsize=1)


def _load_surface_e(shp_path) -> list:
    """Every Class E surface area and extension (SURFACE_E_TYPES) as
    (geometry, bbox) pairs, per shapefile: a second or so, the records
    read whole and only those shapes built, kept for the process."""
    shp_path = Path(shp_path)
    stat = shp_path.stat()
    key = (str(shp_path), stat.st_size, stat.st_mtime)
    with _ALL_AIRSPACE_LOCK:
        if key not in _SURFACE_E_CACHE:
            sf = shapefile.Reader(str(shp_path))
            fields = [f[0] for f in sf.fields[1:]]
            local_type = fields.index("LOCAL_TYPE")
            areas = []
            for index, record in enumerate(sf.iterRecords()):
                if record[local_type] in SURFACE_E_TYPES:
                    shape = sf.shape(index)
                    areas.append((shapely_shape(shape.__geo_interface__), tuple(shape.bbox)))
            _SURFACE_E_CACHE[key] = areas
        return _SURFACE_E_CACHE[key]


def load_controlled_airspace(shp_path, bbox: tuple) -> list:
    """Class B/C/D polygons (as shapely geometries, with a floor_ft_msl)
    whose bounding box overlaps bbox. Returns a list of
    {"name", "class", "floor_ft_msl", "geometry"} dicts.

    Callers must treat the result as read-only, since it's filtered
    from the same cached list every other bbox query shares.
    """
    # The box read as its one or two halves either side of 180 (geo_boxes).
    return [
        p for p in _load_all_controlled_airspace(shp_path) if geo_boxes.meets(bbox, p["bbox"][1], p["bbox"][0], p["bbox"][3], p["bbox"][2])
    ]


def surface_class_at(lat: float, lon: float, shp_path) -> str:
    """The class of the airspace at the surface at a point, an airport's
    own asked at the airport: "B", "C" or "D", the most restrictive where
    they overlap; "E" in a Class E surface area or its extension; "G"
    anywhere else, uncontrolled at the ground -- the classes the chart
    draws solid blue, solid magenta, dashed blue, dashed magenta and, for
    G, none at all, the field under the shaded edge of the E above it."""
    return surface_classes([(lat, lon)], shp_path)[0]


# The surface airspace's indexes, per shapefile (surface_classes).
_SURFACE_TREES: dict = {}


def surface_classes(points: list[tuple[float, float]], shp_path) -> list[str]:
    """surface_class_at for many (lat, lon) points at once -- every field
    in the map's view, for its mark -- through indexes (shapely's STRtree)
    of the B, C and D reaching the ground and the E surface areas, built
    once a shapefile: a point in a shape is in its box, so the country's
    find what the shapes round the points did, with no trees made an ask."""
    if not points:
        return []
    controlled, surface_e = _load_all_controlled_airspace(shp_path), _load_surface_e(shp_path)
    held = _SURFACE_TREES.get("held")
    if held is None or held[0] is not controlled or held[1] is not surface_e:
        reaching = [p for p in controlled if p["floor_ft_msl"] <= 0]
        trees = (reaching, STRtree([p["geometry"] for p in reaching]), STRtree([g for g, _ in surface_e]))
        held = _SURFACE_TREES["held"] = (controlled, surface_e, *trees)
    reaching, tree, e_tree = held[2:]
    where = shapely_points([p[1] for p in points], [p[0] for p in points])
    found: list[str | None] = [None] * len(points)
    for i, j in zip(*(a.tolist() for a in tree.query(where, predicate="within"))):
        found[i] = reaching[j]["class"] if found[i] is None else min(found[i], reaching[j]["class"])
    in_e = set(e_tree.query(where, predicate="within")[0].tolist())
    return [cls or ("E" if i in in_e else "G") for i, cls in enumerate(found)]


def is_own_surface_area(polygon: dict, start_point, end_point) -> bool:
    """Whether this airspace polygon is the departure or destination
    airport's own surface area, rather than something the route could go
    round.

    Two conditions, and the floor is the load-bearing one: the airspace
    must reach the surface, and must enclose one end of the route. An
    overlying shelf fails the first test however low it sits.
    """
    if polygon["floor_ft_msl"] > 0:
        return False
    return polygon["geometry"].contains(start_point) or polygon["geometry"].contains(end_point)


def own_class_b(polygons: list, start_point, end_point) -> set[str]:
    """The Class B a route takes off from or lands in, by name: those whose
    surface area holds one of its ends. Landing at O'Hare takes a Class B
    clearance anyway, so no way round Chicago's shelves is offered on the
    way in. A field under a shelf, not in a surface area (Midway under
    Chicago's 3,000), is not in its own Class B."""
    return {p["name"] for p in polygons if p["class"] in CLEARANCE_CLASSES and is_own_surface_area(p, start_point, end_point)}


#: detour_waypoints by leg, altitude and the Class B in its way, bounded.
#: The airspace changes only with the FAA's chart cycle; six hours is well
#: inside one.
_DETOURS: TTLCache = TTLCache(maxsize=256, ttl=6 * 3600)
_DETOURS_LOCK = threading.Lock()


def _shelves(polygons: list, own: set) -> list[dict]:
    """The Class B shelves among `polygons` other than the flight's own
    (own_class_b), as the engine reads them: floor, ceiling and rings of
    [lat, lon] (the shapefile's are lon/lat)."""
    out = []
    for p in polygons:
        if p["class"] not in CLEARANCE_CLASSES or p["name"] in own:
            continue
        geometry = p["geometry"]
        rings = []
        for part in getattr(geometry, "geoms", [geometry]):
            for ring in (part.exterior, *part.interiors):
                rings.append([[float(y), float(x)] for x, y in ring.coords])
        out.append({"floor_ft_msl": p["floor_ft_msl"], "ceiling_ft_msl": p.get("ceiling_ft_msl"), "rings": rings})
    return out


def detour_waypoints(route_start: tuple, route_end: tuple, shp_path, below_ft: float) -> list[dict]:
    """Named fixes to fly through so that neither leg enters the Class B
    airspace whose floor is under `below_ft` -- the lowest altitude the
    route can fly there, so a shelf above it is passed under -- the ones
    adding the least distance first, a VFR waypoint (VPBNG, on the
    sectional) before a GPS fix (wingtip.fixes): the engine's choice
    (class_b_detours, #482 phase 5), the fixes round the Class B read
    here. The route's own surface areas aside (own_class_b). Each as
    {"ident", "kind", "added_nm"}."""
    from . import fixes

    key = (tuple(route_start), tuple(route_end), below_ft)
    with _DETOURS_LOCK:
        if key in _DETOURS:
            return _DETOURS[key]
    start_point, end_point = Point(route_start[1], route_start[0]), Point(route_end[1], route_end[0])
    polygons = load_controlled_airspace(shp_path, geo_boxes.corridor_box(route_start, route_end, buffer_nm=30.0))
    shelves = _shelves(polygons, own_class_b(polygons, start_point, end_point))
    if not shelves:
        return []
    # The fixes within a degree of the Class B, more than any detour the
    # engine offers adds; it takes the ones near enough.
    lats = [pt[0] for shelf in shelves for ring in shelf["rings"] for pt in ring]
    lons = [pt[1] for shelf in shelves for ring in shelf["rings"] for pt in ring]
    near = fixes.within(min(lats) - 1.0, min(lons) - 1.0, max(lats) + 1.0, max(lons) + 1.0)
    ways = engine(
        "class_b_detours",
        start=list(route_start),
        end=list(route_end),
        below_ft=below_ft,
        shelves=shelves,
        fixes=[
            {"ident": f["ident"], "lat": f["lat"], "lon": f["lon"], "vfr": bool(f.get("vfr")), "kind": f.get("kind") or ""} for f in near
        ],
    )
    with _DETOURS_LOCK:
        _DETOURS[key] = ways
    return ways


def class_b_entered(route_start: tuple, route_end: tuple, shp_path, altitude_ft: float) -> bool:
    """Whether a straight leg flown at `altitude_ft` enters Class B other
    than its own fields' (own_class_b), which a flight in or out of them
    enters anyway: the engine's (class_b_entered, 14 CFR 91.131), on the
    shelves read here."""
    start_point, end_point = Point(route_start[1], route_start[0]), Point(route_end[1], route_end[0])
    polygons = load_controlled_airspace(shp_path, geo_boxes.corridor_box(route_start, route_end, buffer_nm=2.0))
    shelves = _shelves(polygons, own_class_b(polygons, start_point, end_point))
    return bool(shelves) and engine(
        "class_b_entered", start=list(route_start), end=list(route_end), altitude_ft=altitude_ft, shelves=shelves
    )


def airspace_transits(route_start: tuple, route_end: tuple, shp_path, fixes: list | None = None) -> list:
    """Controlled airspace the route passes laterally through, in
    along-route order, as {"name", "class", "floor_ft_msl", "requires"}.

    The route is the legs flown -- through `fixes`, the nav log's own
    (lat, lon) points from departure to destination -- when they are
    given. The straight departure-destination line it used to be misses
    airspace a leg bent toward a checkpoint clips, and names airspace
    the legs never enter.

    This is nav-log information rather than a constraint: knowing you will
    cross Des Moines Class C at mile 4 tells you to have approach's
    frequency out and to call before you get there. "requires" says which
    kind of permission it takes -- "two-way radio communication" for C and
    D, "ATC clearance" for B -- because those are meaningfully different
    obligations and only the second one can be refused.

    An airport's own surface area is included: you are going to talk to
    that tower whether or not it constrains the route.
    """
    from .geo import along_track_distance_nm

    path = list(fixes) if fixes and len(fixes) >= 2 else [route_start, route_end]
    # The short way round 180, the line cut there (geo_boxes: Adak to Shemya).
    polygons = load_controlled_airspace(shp_path, geo_boxes.path_box(path, buffer_nm=2.0))
    route_line = geo_boxes.line_across(path)

    transits = []
    # The polygons the route crosses, through their index (STRtree), rather
    # than the whole box's tried one by one.
    crossed = STRtree([p["geometry"] for p in polygons]).query(route_line, predicate="intersects") if polygons else []
    for k in sorted(int(i) for i in crossed):
        p = polygons[k]
        centre = p["geometry"].centroid
        transits.append(
            {
                "name": p["name"],
                "class": p["class"],
                "floor_ft_msl": p["floor_ft_msl"],
                "requires": ("ATC clearance" if p["class"] in CLEARANCE_CLASSES else "two-way radio communication"),
                "along_track_nm": round(along_track_distance_nm(centre.y, centre.x, route_start, route_end), 1),
            }
        )
    # Deduplicated by name+class: a Bravo is filed as several shelf
    # polygons and the route often clips more than one, which would
    # otherwise read as several separate airspaces to call.
    seen, ordered = set(), []
    for t in sorted(transits, key=lambda t: t["along_track_nm"]):
        key = (t["name"], t["class"])
        if key not in seen:
            seen.add(key)
            ordered.append(t)
    return ordered
