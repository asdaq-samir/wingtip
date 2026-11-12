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
Bravo"), which may not be granted, and a light aircraft is usually better
off staying beneath the shelf and out of the way of airliners. So Class B
alone imposes a ceiling.

Before this, all of B/C/D imposed one, which forced routes beneath
shelves a pilot would simply have talked their way through -- and for a
Class-C-to-Class-C route left no legal altitude at all.

Class E is excluded entirely: VFR overflight needs neither clearance nor
a radio call, just cloud clearance and visibility minimums.
"""

import pickle
import struct
import threading
from pathlib import Path

import shapefile
from cachetools import LRUCache, TTLCache
from shapely import STRtree, from_wkb, points as shapely_points, to_wkb
from shapely.geometry import LineString, Point, shape as shapely_shape

from .engine import ask as engine
from .faa_data import _is_icloud_evicted, nasr_zip_url, download_and_extract

CONTROLLED_CLASSES = ("B", "C", "D")

# Class E surface areas (E2) and their extensions (E3, E4): controlled
# from the ground, the dashed magenta line the chart draws round a field.
# Read only for an airport's own class (surface_class_at); a route never
# needs them, as nothing about E asks a VFR pilot for a clearance.
SURFACE_E_TYPES = ("CLASS_E2", "CLASS_E3", "CLASS_E4")

# Class B takes an explicit clearance, which can be refused and which a
# light aircraft is usually better off not asking for. This is the only
# class that pushes a route beneath a shelf.
CLEARANCE_CLASSES = ("B",)


# A shapefile is three files, not one, and all three are needed: .shp
# holds the geometry, .shx indexes it, .dbf holds the attributes (CLASS,
# NAME, the altitude fields). Missing any one of them fails at read time.
SHAPEFILE_SUFFIXES = (".shp", ".shx", ".dbf")


def _shapefile_is_complete(shp_path: Path) -> bool:
    """Whether a cached shapefile is whole, not just present.

    Two failure modes, both hit for real on 2026-09-10.

    Truncation: a shapefile header stores the file's own total length (in
    16-bit words, big-endian, at byte 24), so a short download is
    detectable without parsing a single shape. Worth checking because the
    symptom is otherwise baffling -- a partial file opens, reads its first
    177 shapes, then raises KeyError on a garbage shape type from the
    middle of the file. The cached copy was 388,769,780 bytes against a
    true 394,056,164, and since the old code asked only whether the path
    existed, no amount of re-running would ever have replaced it.

    Missing companions: iCloud evicted Class_Airspace.dbf minutes after a
    clean download, which fails much later with pyshp's "DbfReader
    requires a .dbf file" rather than anything about the cache.
    """
    try:
        for suffix in SHAPEFILE_SUFFIXES:
            if not shp_path.with_suffix(suffix).exists():
                return False
        with shp_path.open("rb") as f:
            header = f.read(100)
        if len(header) < 100 or struct.unpack(">i", header[0:4])[0] != 9994:
            return False
        declared = struct.unpack(">i", header[24:28])[0] * 2
        return declared == shp_path.stat().st_size
    except OSError:
        return False


def ensure_class_airspace_shapefile(cache_dir) -> Path:
    """Download+extract the current-cycle Class Airspace shapefile into
    cache_dir if not already cached (same 28-day-cycle, cache-once
    convention as wingtip.faa_data.ensure_nasr_data).

    A cached file that is present but incomplete is re-downloaded rather
    than trusted -- see _shapefile_is_complete.
    """
    cache_dir = Path(cache_dir)
    shp_path = cache_dir / "Shape_Files" / "Class_Airspace.shp"
    if not shp_path.exists() or not _shapefile_is_complete(shp_path):
        download_and_extract(nasr_zip_url("Class_Airspace"), cache_dir)
        if not _shapefile_is_complete(shp_path):
            evicted = [shp_path.with_suffix(x).name for x in SHAPEFILE_SUFFIXES if _is_icloud_evicted(shp_path.with_suffix(x))]
            if evicted:
                raise RuntimeError(
                    f"iCloud evicted {', '.join(evicted)} from {shp_path.parent} right after "
                    "downloading it. Re-downloading will not help while this directory syncs "
                    "to iCloud -- exclude data/raw from syncing (renaming a parent directory "
                    "to end in '.nosync', or keeping the project outside Desktop/Documents)."
                )
            raise RuntimeError(
                f"Class Airspace shapefile at {shp_path} is still incomplete after "
                "re-downloading -- the download is being truncated rather than cached wrong."
            )
    return shp_path


def _ceiling_ft_msl(record: dict) -> float | None:
    """UPPER_VAL -> the top in feet MSL, which every Class B, C and D's
    is; None where it is not a number."""
    try:
        return float(record.get("UPPER_VAL")) if record.get("UPPER_CODE") in ("MSL", None) else None
    except (TypeError, ValueError):
        return None


def _floor_ft_msl(record: dict) -> float:
    """LOWER_VAL/LOWER_CODE -> floor altitude in feet MSL. SFC (surface)
    floors are 0 MSL; anything not plain feet MSL (rare for B/C/D, mostly
    an E-airspace concern) is treated as 0 -- conservative, since a
    lower/unknown floor only makes a shelf a *more* restrictive ceiling
    for us, never a less restrictive one.
    """
    code = record["LOWER_CODE"]
    if code == "SFC":
        return 0.0
    if code == "MSL":
        try:
            return float(record["LOWER_VAL"])
        except (TypeError, ValueError):
            return 0.0
    return 0.0


# The Class B/C/D polygons, parsed once per process and held in memory:
# every altitude selection needs them, and walking Class_Airspace.shp --
# 5,612 PolygonZ records, 394 MB, twelve million vertices -- takes about
# thirty seconds. Held bbox-independent, so every route shares one parse,
# and one edition at a time: a new cycle's replaces the last in memory
# rather than sitting beside it.
_ALL_AIRSPACE_CACHE: LRUCache = LRUCache(maxsize=1)
_ALL_AIRSPACE_LOCK = threading.Lock()

# The same polygons written beside the shapefile as WKB, so a fresh
# process (every planner restart, every agent run) reads them back in
# about a second instead of re-walking the shapefile. Keyed by the
# shapefile's size and mtime, so a new 28-day cycle rebuilds it.
# v2: the cached records gained an "ident" field, and a cache written
# before that has no way to say so -- a new suffix rebuilds rather
# than reading records that are missing a key every caller now reads.
# v4: and an "upper_desc", for the map's labels (the phone pack, the overlay tiles).
# v5: and the "hours_code" and "hours_remark", for the map's cards.
_CONTROLLED_CACHE_SUFFIX = ".controlled.v5.pkl"


def _load_all_controlled_airspace(shp_path) -> list:
    """Every Class B/C/D polygon in the national shapefile, with its
    Shapely geometry built: from memory, else from the WKB cache beside
    the file, else parsed from the shapefile and cached both ways.

    One loader at a time -- a request arriving while the startup
    warm-up is parsing waits for its result rather than parsing again.
    """
    shp_path = Path(shp_path)
    stat = shp_path.stat()
    key = (str(shp_path), stat.st_size, stat.st_mtime)
    with _ALL_AIRSPACE_LOCK:
        if key not in _ALL_AIRSPACE_CACHE:
            polygons = _read_controlled_cache(shp_path, key)
            if polygons is None:
                polygons = _parse_controlled_airspace(shp_path)
                _write_controlled_cache(shp_path, key, polygons)
            _ALL_AIRSPACE_CACHE[key] = polygons
        return _ALL_AIRSPACE_CACHE[key]


def _text(value) -> str | None:
    """A text field of the shapefile, or None where it is empty or the
    file's "<Null>"."""
    value = (value or "").strip()
    return None if value in ("", "<Null>") else value


def _parse_controlled_airspace(shp_path: Path) -> list:
    sf = shapefile.Reader(str(shp_path))
    polygons = []
    for sr in sf.iterShapeRecords():
        record = sr.record.as_dict()
        if record["CLASS"] not in CONTROLLED_CLASSES:
            continue
        polygons.append(
            {
                # The primary airport's own identifier (MSY, ORD): what
                # a Class B is named for, and what its weather is
                # looked up by. See wingtip.classb.
                "ident": (record.get("IDENT") or "").strip().upper(),
                "name": record["NAME"],
                "class": record["CLASS"],
                "floor_ft_msl": _floor_ft_msl(record),
                "ceiling_ft_msl": _ceiling_ft_msl(record),
                # "TI" where the top is in the volume, "TNI" where it is
                # up to but not including it -- a Class D under a Class B
                # shelf, which the sectional prints as "-30" (FAA
                # Aeronautical Chart User's Guide, VFR Terms and Symbols,
                # Class D: "a minus ceiling value indicates surface up to
                # but not including that value").
                "upper_desc": (record.get("UPPER_DESC") or "").strip().upper() or None,
                # When the volume is in effect, as the FAA's NASR Class
                # Airspace shapefile has it: WKHR_CODE "H24" (continuous),
                # "NOTAM" (part-time, its hours set by NOTAM and kept in
                # the Chart Supplement) or "RMK" (said in WKHR_RMK, the
                # remark). The file writes an empty remark as "<Null>".
                "hours_code": _text(record.get("WKHR_CODE")),
                "hours_remark": _text(record.get("WKHR_RMK")),
                "geometry": shapely_shape(sr.shape.__geo_interface__),
                "bbox": tuple(sr.shape.bbox),  # (min_lon, min_lat, max_lon, max_lat)
            }
        )
    return polygons


def _controlled_cache_path(shp_path: Path) -> Path:
    return shp_path.with_suffix(_CONTROLLED_CACHE_SUFFIX)


def _read_controlled_cache(shp_path: Path, key: tuple) -> list | None:
    path = _controlled_cache_path(shp_path)
    if not path.exists():
        return None
    try:
        with path.open("rb") as f:
            cached = pickle.load(f)
    except Exception:  # noqa: BLE001 -- a damaged cache is rebuilt, never fatal
        return None
    if cached.get("key") != key:
        return None
    return [
        {
            "ident": p.get("ident", ""),
            "name": p["name"],
            "class": p["class"],
            "floor_ft_msl": p["floor_ft_msl"],
            "ceiling_ft_msl": p.get("ceiling_ft_msl"),
            "upper_desc": p.get("upper_desc"),
            "hours_code": p.get("hours_code"),
            "hours_remark": p.get("hours_remark"),
            "bbox": tuple(p["bbox"]),
            "geometry": from_wkb(p["wkb"]),
        }
        for p in cached["polygons"]
    ]


def _write_controlled_cache(shp_path: Path, key: tuple, polygons: list) -> None:
    path = _controlled_cache_path(shp_path)
    payload = {
        "key": key,
        "polygons": [
            {
                "ident": p.get("ident", ""),
                "name": p["name"],
                "class": p["class"],
                "floor_ft_msl": p["floor_ft_msl"],
                "ceiling_ft_msl": p.get("ceiling_ft_msl"),
                "upper_desc": p.get("upper_desc"),
                "hours_code": p.get("hours_code"),
                "hours_remark": p.get("hours_remark"),
                "bbox": p["bbox"],
                "wkb": to_wkb(p["geometry"]),
            }
            for p in polygons
        ],
    }
    part = path.with_suffix(path.suffix + ".part")
    try:
        with part.open("wb") as f:
            pickle.dump(payload, f, protocol=pickle.HIGHEST_PROTOCOL)
        part.replace(path)
    except OSError:
        # A read-only data directory only loses the speed-up, never the
        # answer: the parse just runs again next process.
        part.unlink(missing_ok=True)


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
    min_lat, min_lon, max_lat, max_lon = bbox
    return [
        p
        for p in _load_all_controlled_airspace(shp_path)
        if not (p["bbox"][3] < min_lat or p["bbox"][1] > max_lat or p["bbox"][2] < min_lon or p["bbox"][0] > max_lon)
    ]


def surface_class_at(lat: float, lon: float, shp_path) -> str:
    """The class of the airspace at the surface at a point, an airport's
    own asked at the airport: "B", "C" or "D", the most restrictive where
    they overlap; "E" in a Class E surface area or its extension; "G"
    anywhere else, uncontrolled at the ground -- the classes the chart
    draws solid blue, solid magenta, dashed blue, dashed magenta and, for
    G, none at all, the field under the shaded edge of the E above it."""
    return surface_classes([(lat, lon)], shp_path)[0]


def surface_classes(points: list[tuple[float, float]], shp_path) -> list[str]:
    """surface_class_at for many (lat, lon) points at once -- every field
    in the map's view, for its mark -- the airspace about them read once
    and indexed (shapely's STRtree) rather than searched a point at a
    time."""
    if not points:
        return []
    lats, lons = [p[0] for p in points], [p[1] for p in points]
    margin = 0.01
    south, west, north, east = min(lats) - margin, min(lons) - margin, max(lats) + margin, max(lons) + margin
    where = shapely_points(lons, lats)
    found: list[str | None] = [None] * len(points)
    reaching = [p for p in load_controlled_airspace(shp_path, (south, west, north, east)) if p["floor_ft_msl"] <= 0]
    if reaching:
        inside, polygon = STRtree([p["geometry"] for p in reaching]).query(where, predicate="within")
        for i, j in zip(inside.tolist(), polygon.tolist()):
            cls = reaching[j]["class"]
            found[i] = cls if found[i] is None else min(found[i], cls)
    surface_e = [
        geometry
        for geometry, (min_lon, min_lat, max_lon, max_lat) in _load_surface_e(shp_path)
        if not (max_lat < south or min_lat > north or max_lon < west or min_lon > east)
    ]
    in_e = set(STRtree(surface_e).query(where, predicate="within")[0].tolist()) if surface_e else set()
    return [cls or ("E" if i in in_e else "G") for i, cls in enumerate(found)]


def is_own_surface_area(polygon: dict, start_point, end_point) -> bool:
    """Whether this airspace polygon is the departure or destination
    airport's own surface area, rather than something the route has to
    route around.

    Two conditions, and the floor is the load-bearing one: the airspace
    must reach the surface, and must enclose one end of the route. An
    overlying shelf fails the first test however low it sits, which is
    what keeps it a real constraint.
    """
    if polygon["floor_ft_msl"] > 0:
        return False
    return polygon["geometry"].contains(start_point) or polygon["geometry"].contains(end_point)


def own_class_b(polygons: list, start_point, end_point) -> set[str]:
    """The Class B a route takes off from or lands in, by name: those whose
    surface area holds one of its ends. Landing at O'Hare takes a Class B
    clearance anyway, so none of Chicago's shelves is a ceiling on the way
    in -- Midway to O'Hare had no legal altitude under the 1,900 ft shelf
    between them, only the surface area round O'Hare itself being left
    out. A field under a shelf, not in a surface area (Midway under
    Chicago's 3,000), is flown out of under it as before."""
    return {p["name"] for p in polygons if p["class"] in CLEARANCE_CLASSES and is_own_surface_area(p, start_point, end_point)}


def airspace_ceiling_profile(route_start: tuple, route_end: tuple, fixes: list, shp_path) -> list:
    """The airspace ceiling of each leg of the nav log -- the lowest
    Class B shelf floor the leg between consecutive `fixes` ((lat, lon)
    pairs, the route's ends included) passes laterally under, or None
    where it passes under none. Where the whole route's ceiling is the
    lowest shelf anywhere along it, this is the shelf over each leg, so
    a route can cruise low under the Bravo by the departure and climb
    once past it. The route's own surface areas are excluded on the
    whole route's ends: a leg that
    starts at the departure begins inside that airport's airspace just
    as the route does -- and with them the whole Class B they are part
    of (own_class_b): a route into or out of it is cleared through it.

    A leg's ceiling is the highest it can cruise staying beneath every
    Class B shelf it laterally passes through -- transiting *under* the
    Bravo rather than asking for a clearance through it, the usual choice
    for a light aircraft.

    Class C and D impose nothing here. Entering either needs only two-way
    radio communication established, which is routine, so they are
    reported by airspace_transits() rather than treated as a lid. See the
    module docstring for what this used to do and why it was wrong.

    A *surface area* containing the departure or destination point is
    deliberately excluded: landing at or departing from your own airport
    inherently means transiting its local airspace to reach the runway
    (with whatever clearance or coordination that requires), which isn't
    a *routing* conflict the way an unrelated shelf along the way would
    be. Without the exclusion, a route ending at any towered airport
    trivially produces a ~0 ft "ceiling" from that airport's own
    airspace, and no legal cruising altitude at all.

    What identifies "its own airspace" is the floor being at the surface,
    not the airspace class. This was Class-D-only until 2026-09-10, on
    the reasoning that a compact D ring reliably means "that airport's
    shelf" while B and C are larger and often sit over an unrelated
    field. The second half of that is true but the rule drawn from it was
    wrong: KDSM->KOMA is Class C at both ends, so the route began and
    ended inside surface areas with SFC floors and select_cruise_altitude
    returned None for an ordinary 100 nm cross-country.

    Testing the floor instead keeps every case the class test got right.
    An overlying shelf is still a hard constraint, because its floor is
    not the surface -- C81/Grayslake sits laterally under Chicago's Class
    B, whose floor there is a few thousand feet, so it still imposes a
    ceiling exactly as before.
    """
    from .geo import corridor_bbox

    bbox = corridor_bbox(route_start, route_end, buffer_nm=2.0)
    start_point = Point(route_start[1], route_start[0])
    end_point = Point(route_end[1], route_end[0])
    polygons = load_controlled_airspace(shp_path, bbox)
    own = own_class_b(polygons, start_point, end_point)
    shelves = [p for p in polygons if p["class"] in CLEARANCE_CLASSES and p["name"] not in own]

    # Every leg against the shelves at once, through their index (STRtree):
    # each leg tried against each shelf by hand was 12.5 s of a cold Seattle
    # to Miami plan, the corridor's box holding a country's worth of them.
    ceilings: list = [None] * max(0, len(fixes) - 1)
    if not shelves or not ceilings:
        return ceilings
    legs = [LineString([(lon1, lat1), (lon2, lat2)]) for (lat1, lon1), (lat2, lon2) in zip(fixes, fixes[1:])]
    leg_at, shelf_at = STRtree([p["geometry"] for p in shelves]).query(legs, predicate="intersects")
    for i, j in zip(leg_at.tolist(), shelf_at.tolist()):
        floor = shelves[j]["floor_ft_msl"]
        ceilings[i] = floor if ceilings[i] is None else min(ceilings[i], floor)
    return ceilings


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
    here. The route's own surface areas aside, as for the ceiling. Each as
    {"ident", "kind", "added_nm"}."""
    from . import fixes
    from .geo import corridor_bbox

    key = (tuple(route_start), tuple(route_end), below_ft)
    with _DETOURS_LOCK:
        if key in _DETOURS:
            return _DETOURS[key]
    start_point, end_point = Point(route_start[1], route_start[0]), Point(route_end[1], route_end[0])
    polygons = load_controlled_airspace(shp_path, corridor_bbox(route_start, route_end, buffer_nm=30.0))
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
    from .geo import corridor_bbox

    start_point, end_point = Point(route_start[1], route_start[0]), Point(route_end[1], route_end[0])
    polygons = load_controlled_airspace(shp_path, corridor_bbox(route_start, route_end, buffer_nm=2.0))
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
    from .geo import along_track_distance_nm, corridor_bbox

    path = list(fixes) if fixes and len(fixes) >= 2 else [route_start, route_end]
    boxes = [corridor_bbox(a, b, buffer_nm=2.0) for a, b in zip(path, path[1:])]
    bbox = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    polygons = load_controlled_airspace(shp_path, bbox)
    route_line = LineString([(lon, lat) for lat, lon in path])

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
