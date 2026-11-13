"""The map's FAA overlays as vector tiles, one PMTiles archive a cycle: the
Class B, C, D and E airspace, the special-use areas, the airports, the
navaids and the fixes, for a MapLibre map (the web's, Android's, iOS's) to
draw crisp at every zoom, at once and with no network once it holds the
file. The same for every pilot for the cycle, so it is built once, by
this job, beside the cycle pack the planner writes (wingtip.cycle_pack),
and the planner serves it whole with byte ranges (/api/overlay-tiles,
reading it through wingtip.vector_tiles, which keeps the archive's name,
index and layers). The planner built it at its own start until the jobs
split (#535); now it only serves it.

Where each layer comes from -- every feature is a row or a shape of the
FAA's own data set, its attributes the fields named below:

- `airspace`: the NASR Class Airspace shapefile (class_airspace_shape_files.zip,
  Class_Airspace.shp, Class B to E), as the cycle pack holds it: CLASS,
  LOCAL_TYPE, NAME, IDENT, LOWER_VAL/LOWER_CODE (floor, read as
  wingtip.airspace_at reads it), UPPER_VAL (ceiling, ft MSL; the floor of
  Class A, 18,000 ft MSL per 14 CFR 71.33, for "up to but not including"
  it), UPPER_DESC TNI, WKHR_CODE and WKHR_RMK.
- `airspace_labels`: a point a Class B, C or D volume of that file, where
  the map writes its altitudes on its ring, with their figures and the
  text's turn (airspace_label_features).
- `special_use`: the FAA's special use airspace feature service (ADDS),
  as the cycle pack holds it: NAME, TYPE_CODE, LOWER_*/UPPER_*, TIMESOFUSE,
  GMTOFFSET/DST_CODE and CONT_AGENT, read as wingtip.sua reads them.
- `special_use_labels`: a point on each area's edge, its tab (sua_labels).
- `airports`: NASR's APT_BASE.csv (ARPT_ID, ICAO_ID, ARPT_NAME,
  SITE_TYPE_CODE, FACILITY_USE_CODE, OWNERSHIP_TYPE_CODE, TWR_TYPE_CODE,
  ELEV, FUEL_TYPES, LAT_DECIMAL/LONG_DECIMAL; ARPT_STATUS O only), with
  each field's runways from APT_RWY.csv (RWY_ID, RWY_LEN,
  SURFACE_TYPE_CODE) and APT_RWY_END.csv (TRUE_ALIGNMENT), by SITE_NO.
- `navaids`: NASR's NAV_BASE.csv, read as wingtip.fixes reads it (in
  service, the kinds a route flies to), with each one's own remarks from
  NAV_RMK.csv (REMARK, as wingtip.fixes.navaid_remarks reads them), one
  a line.
- `fixes`: NASR's FIX_BASE.csv, read as wingtip.fixes reads it, every row.
- `runways`: each runway with both its ends surveyed, from APT_RWY.csv
  (SITE_NO, RWY_ID, RWY_WIDTH in ft, SURFACE_TYPE_CODE) and
  APT_RWY_END.csv (RWY_END_ID, LAT_DECIMAL/LONG_DECIMAL, the end's own
  position): its surface as a polygon, its centreline, and a point at
  each end with the end's number (09L) and true heading, for the close
  zooms where the chart's own airport symbol is too coarse to land by.

The tiles are made by tippecanoe (felt/tippecanoe, built into the
charts job's image at a pinned tag) into PMTiles, the single-file archive a
browser reads by HTTP range requests (protomaps' pmtiles, spec v3). How
true the lines stay to the FAA's is TOLERANCE_M's comment.
"""

from __future__ import annotations

import csv
import json
import logging
import math
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from wingtip import cycle_pack, geo, vector_tiles
from wingtip.atomic import atomic_path
from wingtip.units import M_PER_FT, M_PER_NM
from wingtip.vector_tiles import INDEX, LAYERS, VERSION, archive_name

log = logging.getLogger(__name__)

#: The tippecanoe to run: the charts job's image has it on its PATH.
TIPPECANOE = os.environ.get("TIPPECANOE", "tippecanoe")

#: The zooms there are tiles of (XYZ zooms, 256-pixel tiles: MapLibre,
#: whose tiles are 512, draws tile z at its own zoom z). From 4, a
#: country on a phone, to 12, where a tile is 9.8 km at the equator;
#: closer in, the map draws zoom 12's tiles larger (overzoom).
MIN_ZOOM = 4
MAX_ZOOM = 12
#: Tile units across a tile (tippecanoe's --detail, its default).
DETAIL = 12

#: How far a drawn line may be from the FAA's, in metres on the ground at
#: the deepest zoom. tippecanoe keeps every simplified line within one
#: tile unit of the line it is given (Douglas-Peucker, --simplification=1,
#: its default) and then puts each point on the tile's grid, at most half
#: a unit each way, 0.71 of a unit off: 1.71 units of a 4096-unit tile.
#: At zoom 12 a tile is 40,075,017 m / 2^12 = 9,784 m across at the
#: equator (WGS 84's equator, web mercator), so a unit is 2.39 m and the
#: worst 4.1 m. Measured on Chicago's Class B at 42 N (every point of its
#: six shelves in every zoom-12 tile, both ways round): 3.6 m at worst,
#: a little over the 1.71 units there (3.0 m), as tippecanoe also nudges
#: the shared borders it detects -- so the bound kept and tested is the
#: equator's 4.1 m. At any zoom below 12 the worst is the same two units
#: or so of that zoom's tile, which MapLibre draws 512 px across: about a
#: quarter of a pixel, at every zoom there are tiles of. Overzoomed past
#: 12 it stays 4.1 m, under 2 px at MapLibre's zoom 15. The phones' packs keep their rings
#: within 0.0001 degree, 11 m (wingtip.cycle_pack.PHONE_TOLERANCE_DEG); a
#: sectional's printed airspace line is itself some 100 m wide at
#: 1:500,000. services/jobs/charts/tests/test_overlays.py measures it on Chicago's Class B.
TOLERANCE_M = round((1 + 0.5 * 2**0.5) * geo.WEB_MERCATOR_CIRCUMFERENCE_M / 2**MAX_ZOOM / 2**DETAIL, 1)

#: Each layer's first zoom, by what the feature is. Below it a feature is
#: left out of the tiles; from it on, it is in every tile it touches, and
#: none is ever dropped for a tile's size (--no-feature-limit,
#: --no-tile-size-limit, -r1, --no-tiny-polygon-reduction).
AIRSPACE_MIN_ZOOM = {"B": 4, "C": 5, "D": 6}
#: Class E by its LOCAL_TYPE: at the surface (E2), the extensions of a
#: Class C's or D's surface area (E3, E4), from 700 or 1,200 ft (E5), and
#: the en route and offshore areas (E6, E7). 14 CFR 71.71, 71.79.
CLASS_E_MIN_ZOOM = {"CLASS_E2": 7, "CLASS_E3": 7, "CLASS_E4": 7}
CLASS_E_OTHER_MIN_ZOOM = 8
SPECIAL_USE_MIN_ZOOM = 5
#: Airports by `rank` (airport_rank): towered, public with a hard runway
#: of 3,000 ft or more, other public, private, then heliports and the rest.
AIRPORT_MIN_ZOOM = (5, 6, 7, 9, 10)
#: The VORs (wingtip.fixes.VOR_KINDS) a zoom out; the rest closer in.
VOR_MIN_ZOOM = 5
NAVAID_MIN_ZOOM = 7
#: VFR waypoints and the low enroute chart's fixes; every other fix
#: (RNAV and approach fixes) closer in.
CHARTED_FIX_MIN_ZOOM = 8
FIX_MIN_ZOOM = 10
#: Runways from zoom 10 (a tile 39 km across): the map draws them closer
#: in, past the chart's own detail, where they are a few pixels wide.
RUNWAY_MIN_ZOOM = 10

ATTRIBUTION = "FAA NASR and special use airspace (ADDS), cycle {cycle}"

#: NASR's SITE_TYPE_CODE (APT_BASE).
SITE_TYPES = {"A": "airport", "H": "heliport", "C": "seaplane", "G": "gliderport", "U": "ultralight", "B": "balloonport"}
#: The runway surfaces the sectional's airport symbol counts as hard
#: (FAA Aeronautical Chart User's Guide, VFR Terms and Symbols, Airports:
#: "hard-surfaced runways"), by NASR's SURFACE_TYPE_CODE (APT_RWY):
#: asphalt, concrete, PEM (partially concrete, asphalt or bitumen-bound
#: macadam), porous friction courses and brick. A mixed surface
#: ("ASPH-TURF") counts only when every part is hard ("ASPH-CONC"); TRTD
#: (treated) goes with a hard one and is not one alone.
HARD_SURFACES = frozenset({"ASPH", "CONC", "PEM", "PFC", "BRICK"})
#: The rank a field must reach for its tier: what `rank` sorts symbols by.
LONG_HARD_FT = 3000


def _orient(geometry):
    """Polygons with their outer rings counter-clockwise and holes
    clockwise, as RFC 7946 GeoJSON has them and tippecanoe reads them:
    the shapefile's are the other way round."""
    import shapely
    from shapely.geometry.polygon import orient

    if geometry.geom_type == "Polygon":
        return orient(geometry, sign=1.0)
    if geometry.geom_type == "MultiPolygon":
        return shapely.MultiPolygon([orient(p, sign=1.0) for p in geometry.geoms])
    return None


def _meets(box, bbox) -> bool:
    """Whether a (west, south, east, north) box meets bbox; any without one."""
    return bbox is None or not (box[2] < bbox[0] or box[0] > bbox[2] or box[3] < bbox[1] or box[1] > bbox[3])


def _feature(properties: dict, geometry: str, minzoom: int) -> str:
    """One line of GeoJSON for tippecanoe, its first zoom in its own
    `tippecanoe` member; fields with no value left out, as a vector tile
    has no null."""
    props = {k: v for k, v in properties.items() if v is not None and v != ""}
    return (
        f'{{"type":"Feature","tippecanoe":{{"minzoom":{minzoom}}},'
        f'"properties":{json.dumps(props, separators=(",", ":"))},"geometry":{geometry}}}\n'
    )


def airspace_features(pack, bbox=None):
    """The `airspace` layer's lines of GeoJSON from the cycle pack: each
    Class B, C, D and E volume as wingtip.cycle_pack's phone packs describe it."""
    import shapely

    numbers = cycle_pack._controlled_numbers(pack)
    for record, number, geometry in zip(pack.attrs("airspace"), numbers, pack.geometries("airspace")):
        geometry = _orient(geometry)
        if geometry is None or geometry.is_empty or not _meets(geometry.bounds, bbox):
            continue
        volume = cycle_pack._volume_drawn(record, number)
        cls = volume["class"]
        minzoom = AIRSPACE_MIN_ZOOM.get(cls) or CLASS_E_MIN_ZOOM.get(volume["local_type"], CLASS_E_OTHER_MIN_ZOOM)
        yield _feature(
            {
                "class": cls,
                "local_type": volume["local_type"],
                "name": volume["name"],
                "ident": volume["ident"],
                "floor_ft": volume["floor_ft"],
                "floor_ref": volume["floor_ref"],
                "ceiling_ft": volume["ceiling_ft"],
                "ceiling_excluded": volume["ceiling_excluded"],
                "number": number,
                "hours_code": volume["hours_code"],
                "hours_remark": volume["hours_remark"],
            },
            shapely.to_geojson(geometry),
            minzoom,
        )


#: The classes whose altitudes the map writes on their rings, as the
#: sectional prints a Class B or C shelf's and a Class D's (FAA
#: Aeronautical Chart User's Guide, VFR Terms and Symbols, Airspace).
LABELLED_CLASSES = ("B", "C", "D")
#: Where on a round ring its label sits: the azimuth from the airspace's
#: centre, degrees true, a little west of north -- where ForeFlight puts
#: Madison's Class C tab (the owner's screenshot, 2026-11-08), clear of
#: the field's own name, which the chart prints beside the field.
LABEL_AZIMUTH = 330.0
#: How close to a shelf's farthest point from the centre a point of its
#: ring must be to count as its outer edge, the part the label goes on.
OUTER_EDGE = 0.97


def _label_place(geometry, centre: tuple[float, float]) -> tuple[tuple[float, float], float]:
    """Where a volume's label goes and how it is turned: a point of its
    outer ring on the shelf's outer edge (the points farthest from its
    airspace's centre), in the middle of that edge, or at LABEL_AZIMUTH
    where the edge goes all the way round (a ring); and the ring's
    direction there as the text's clockwise turn, kept upright
    (-90 to 90), so the label lies along the line as ForeFlight's do. In a
    plane tangent at the centre (east scaled by the cosine of the
    latitude), which is the web map's own angle near it: Mercator is
    conformal."""
    polygon = max(getattr(geometry, "geoms", [geometry]), key=lambda p: p.area)
    ring = list(polygon.exterior.coords)[:-1]
    lon0, lat0 = centre
    k = math.cos(math.radians(lat0))
    xy = [((lon - lon0) * k, lat - lat0) for lon, lat in ring]
    far = max(math.hypot(x, y) for x, y in xy)
    edge = [i for i, (x, y) in enumerate(xy) if far > 0 and math.hypot(x, y) >= OUTER_EDGE * far]
    if not edge:
        edge = list(range(len(xy)))
    units = [(xy[i][0] / (math.hypot(*xy[i]) or 1), xy[i][1] / (math.hypot(*xy[i]) or 1)) for i in edge]
    sx, sy = sum(u[0] for u in units), sum(u[1] for u in units)
    if math.hypot(sx, sy) < 0.5 * len(units):
        # All the way round: the label at LABEL_AZIMUTH.
        az = math.radians(LABEL_AZIMUTH)
        sx, sy = math.sin(az), math.cos(az)
    best = max(range(len(edge)), key=lambda j: units[j][0] * sx + units[j][1] * sy)
    i = edge[best]
    (ax, ay), (bx, by) = xy[i - 1], xy[(i + 1) % len(xy)]
    bearing = math.degrees(math.atan2(bx - ax, by - ay))
    turn = bearing - 90.0
    while turn > 90.0:
        turn -= 180.0
    while turn <= -90.0:
        turn += 180.0
    return ring[i], round(turn, 1)


def airspace_label_features(pack, bbox=None):
    """The `airspace_labels` layer's lines of GeoJSON: one point a Class
    B, C or D volume with a ceiling, on its ring (_label_place), with
    the figures its label is written from (the map writes the words) and
    `angle`, the text's turn. One a shelf, where the ring's own line
    placement put a label every few hundred pixels and one in each tile
    the ring crossed: three "C: 49–23" round Madison (the owner,
    2026-11-08)."""
    numbers = cycle_pack._controlled_numbers(pack)
    volumes = []
    for record, number, geometry in zip(pack.attrs("airspace"), numbers, pack.geometries("airspace")):
        geometry = _orient(geometry)
        if geometry is None or geometry.is_empty:
            continue
        volume = cycle_pack._volume_drawn(record, number)
        if volume["class"] in LABELLED_CLASSES and volume["ceiling_ft"] is not None:
            volumes.append((volume, number, geometry))
    # Each airspace's centre: the middle of its volumes' bounds, by its
    # class and ident (or name): a Class C's surface area and shelf, a
    # Class B's shelves.
    bounds: dict[tuple, list[float]] = {}
    for volume, _, geometry in volumes:
        key = (volume["class"], volume["ident"] or volume["name"])
        w, s, e, n = geometry.bounds
        held = bounds.setdefault(key, [w, s, e, n])
        held[:] = [min(held[0], w), min(held[1], s), max(held[2], e), max(held[3], n)]
    for volume, number, geometry in volumes:
        if not _meets(geometry.bounds, bbox):
            continue
        w, s, e, n = bounds[(volume["class"], volume["ident"] or volume["name"])]
        (lon, lat), angle = _label_place(geometry, ((w + e) / 2, (s + n) / 2))
        yield _feature(
            {
                "class": volume["class"],
                "floor_ft": volume["floor_ft"],
                "ceiling_ft": volume["ceiling_ft"],
                "ceiling_excluded": volume["ceiling_excluded"],
                "number": number,
                "angle": angle,
            },
            json.dumps({"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}),
            AIRSPACE_MIN_ZOOM[volume["class"]],
        )


def special_use_features(pack, bbox=None):
    """The `special_use` layer's lines: each area as wingtip.sua reads it."""
    import shapely

    from wingtip import sua

    if "sua.attr" not in pack.sections:
        return
    for props, geometry in zip(pack.attrs("sua"), pack.geometries("sua")):
        geometry = _orient(geometry)
        if geometry is None or geometry.is_empty or not _meets(geometry.bounds, bbox):
            continue
        area = sua._area(props or {})
        yield _feature(
            {
                "type": area["type"],
                "kind": area["kind"],
                "name": area["name"],
                "floor_ft": area["floor_ft"],
                "floor_ref": area["floor_ref"],
                "ceiling_ft": area["ceiling_ft"],
                "ceiling_ref": area["ceiling_ref"],
                "times_of_use": area["times_of_use"],
                "time_zone": area["time_zone"],
                "controlling_agency": area["controlling_agency"],
            },
            shapely.to_geojson(geometry),
            SPECIAL_USE_MIN_ZOOM,
        )


def _rows(path: Path):
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        yield from csv.DictReader(f)


def _number(text) -> float | None:
    try:
        return float((text or "").strip())
    except ValueError:
        return None


def _hard(surface: str) -> bool:
    parts = [p for p in re.split(r"[-/]", (surface or "").strip().upper()) if p]
    return bool(parts) and all(p in HARD_SURFACES or p == "TRTD" for p in parts) and any(p in HARD_SURFACES for p in parts)


def runways_by_site(rwy_path: Path, rwy_end_path: Path | None) -> dict[str, dict]:
    """Each field's runways, by NASR's SITE_NO: its longest (RWY_LEN, ft),
    its longest hard-surfaced one (HARD_SURFACES), and the true alignment
    of its longest's first end (APT_RWY_END's TRUE_ALIGNMENT, degrees).
    Helipads (RWY_ID H1 and the like) are no runways here."""
    found: dict[str, dict] = {}
    for row in _rows(rwy_path):
        site, rwy = (row.get("SITE_NO") or "").strip(), (row.get("RWY_ID") or "").strip().upper()
        length = _number(row.get("RWY_LEN"))
        if not site or not rwy or rwy.startswith("H") or not length:
            continue
        held = found.setdefault(site, {"longest_ft": 0, "hard_ft": 0, "longest_id": None})
        if length > held["longest_ft"]:
            held["longest_ft"], held["longest_id"] = int(length), rwy
        if _hard(row.get("SURFACE_TYPE_CODE") or "") and length > held["hard_ft"]:
            held["hard_ft"] = int(length)
    if rwy_end_path is not None:
        for row in _rows(rwy_end_path):
            held = found.get((row.get("SITE_NO") or "").strip())
            if held is None or "runway_true" in held or (row.get("RWY_ID") or "").strip().upper() != held["longest_id"]:
                continue
            alignment = _number(row.get("TRUE_ALIGNMENT"))
            if alignment is not None:
                held["runway_true"] = int(alignment) % 360
    return found


def airport_rank(site_type: str, use: str, towered: bool, hard_ft: int) -> int:
    """What a field's symbol is sorted and first shown by (AIRPORT_MIN_ZOOM):
    0 towered, 1 public with a hard runway of LONG_HARD_FT or more, 2 other
    public airports, 3 private airports, 4 heliports and the rest."""
    if site_type not in ("A", "C", "G", "U", "B"):
        return 4
    if towered:
        return 0
    if use == "PU":
        return 1 if hard_ft >= LONG_HARD_FT and site_type == "A" else 2
    return 3


def airport_features(apt_path: Path, rwy_path: Path | None, rwy_end_path: Path | None, bbox=None):
    """The `airports` layer's lines: every operational field in APT_BASE
    (ARPT_STATUS O; the closed ones, CI and CP, are not drawn as fields),
    with its runways (runways_by_site)."""
    from wingtip.faa_data import MILITARY_OWNERS

    runways = runways_by_site(rwy_path, rwy_end_path) if rwy_path is not None else {}
    for row in _rows(apt_path):
        if (row.get("ARPT_STATUS") or "").strip() != "O":
            continue
        lat, lon = _number(row.get("LAT_DECIMAL")), _number(row.get("LONG_DECIMAL"))
        if lat is None or lon is None or not _meets((lon, lat, lon, lat), bbox):
            continue
        faa_id = (row.get("ARPT_ID") or "").strip().upper()
        icao = (row.get("ICAO_ID") or "").strip().upper()
        site_type = (row.get("SITE_TYPE_CODE") or "").strip()
        use = (row.get("FACILITY_USE_CODE") or "").strip()
        # ATCT, ATCT-A/C, ATCT-TRACON and the rest; NON-ATCT is none.
        towered = (row.get("TWR_TYPE_CODE") or "").strip().upper().startswith("ATCT")
        ways = runways.get((row.get("SITE_NO") or "").strip(), {})
        military = (row.get("OWNERSHIP_TYPE_CODE") or "").strip() in MILITARY_OWNERS
        rank = airport_rank(site_type, use, towered, ways.get("hard_ft", 0))
        yield _feature(
            {
                "ident": icao or faa_id,
                "faa_id": faa_id,
                "name": (row.get("ARPT_NAME") or "").strip(),
                "type": SITE_TYPES.get(site_type, site_type.lower()),
                "use": {"PU": "public", "PR": "private"}.get(use, use.lower()),
                # As wingtip.faa_data.military_fields: a field the armed services
                # own, "joint" where it is open to the public as well.
                "military": ("joint" if use == "PU" else "military") if military else None,
                "towered": towered,
                "elevation_ft": _number(row.get("ELEV")),
                "longest_ft": ways.get("longest_ft"),
                "hard_ft": ways.get("hard_ft"),
                "runway_true": ways.get("runway_true"),
                "fuel": (row.get("FUEL_TYPES") or "").strip(),
                "rank": rank,
            },
            f'{{"type":"Point","coordinates":[{lon},{lat}]}}',
            AIRPORT_MIN_ZOOM[rank],
        )


def navaid_features(nav_path: Path, bbox=None, rmk_path: Path | None = None):
    """The `navaids` layer's lines: wingtip.fixes's navaids in service,
    with their own remarks from NAV_RMK.csv where rmk_path is given
    (wingtip.fixes.navaid_remarks: where the signal is unusable, the Chart
    Supplement's service volume restrictions, AIM 1-1-8), one a line, for
    a VOR's card to show without asking the planner."""
    from wingtip import fixes

    for found in fixes._read_navaids(nav_path).values():
        for n in found:
            if not _meets((n["lon"], n["lat"], n["lon"], n["lat"]), bbox):
                continue
            said = fixes.navaid_remarks(n["ident"], n["kind"], rmk_path.parent) if rmk_path is not None else []
            yield _feature(
                {
                    "ident": n["ident"],
                    "name": n["name"],
                    "kind": n["kind"],
                    "freq": n["freq"],
                    "channel": n["channel"],
                    "service_volume": n["service_volume"],
                    "mag_var": n["mag_var"],
                    "elevation_ft": n["elevation_ft"],
                    "hours": n["hours"],
                    "restricted": n["restricted"],
                    "remarks": "\n".join(said) or None,
                },
                f'{{"type":"Point","coordinates":[{n["lon"]},{n["lat"]}]}}',
                VOR_MIN_ZOOM if n["kind"] in fixes.VOR_KINDS else NAVAID_MIN_ZOOM,
            )


def fix_features(fix_path: Path, bbox=None):
    """The `fixes` layer's lines: every row of FIX_BASE (wingtip.fixes.read_rows)."""
    from wingtip import fixes

    for f in fixes.read_rows(fix_path):
        if not _meets((f["lon"], f["lat"], f["lon"], f["lat"]), bbox):
            continue
        yield _feature(
            {"ident": f["ident"], "kind": f["kind"], "vfr": f["vfr"], "enroute_low": f["enroute_low"]},
            f'{{"type":"Point","coordinates":[{f["lon"]},{f["lat"]}]}}',
            CHARTED_FIX_MIN_ZOOM if f["vfr"] or f["enroute_low"] else FIX_MIN_ZOOM,
        )


def _runway_corners(a, b, width_m: float) -> list[list[float]]:
    """The four corners of a runway's surface, (lon, lat), from its two
    ends' positions and its width: half the width square off each end's
    true course to the other (wingtip.geo), as a closed counter-clockwise
    ring (RFC 7946)."""
    half_nm = width_m / 2 / M_PER_NM

    def beside(end, other, side: float) -> list[float]:
        lat, lon = geo.destination_point(end[1], end[0], geo.bearing_deg(end[1], end[0], other[1], other[0]) + side, half_nm)
        return [round(lon, 7), round(lat, 7)]

    ring = [beside(a, b, 90.0), beside(b, a, -90.0), beside(b, a, 90.0), beside(a, b, -90.0)]
    if (ring[1][0] - ring[0][0]) * (ring[2][1] - ring[0][1]) - (ring[1][1] - ring[0][1]) * (ring[2][0] - ring[0][0]) < 0:
        ring.reverse()
    return [*ring, ring[0]]


def _true_bearing(a, b) -> int:
    """The initial great-circle bearing from a to b, (lon, lat), degrees
    true, whole: the heading of an airplane landing on a's end towards b
    (wingtip.geo.bearing_deg, PROJ's on the planner's sphere)."""
    return round(geo.bearing_deg(a[1], a[0], b[1], b[0])) % 360


def runway_features(rwy_path: Path, rwy_end_path: Path, bbox=None):
    """The `runways` layer's lines: for each runway whose two ends NASR
    surveys (APT_RWY_END LAT_DECIMAL/LONG_DECIMAL), its surface (`part`
    surface, a polygon RWY_WIDTH wide), its centreline (`part`
    centreline) and each end (`part` end: RWY_END_ID and the true heading
    along the runway from it). Helipads (RWY_ID H1 and the like) and
    runways with an end unsurveyed are left out: no shape is guessed."""
    widths: dict[tuple[str, str], tuple[float | None, str]] = {}
    for row in _rows(rwy_path):
        key = ((row.get("SITE_NO") or "").strip(), (row.get("RWY_ID") or "").strip().upper())
        widths[key] = (_number(row.get("RWY_WIDTH")), (row.get("SURFACE_TYPE_CODE") or "").strip().upper())
    ends: dict[tuple[str, str], list[tuple[str, tuple[float, float]]]] = {}
    for row in _rows(rwy_end_path):
        key = ((row.get("SITE_NO") or "").strip(), (row.get("RWY_ID") or "").strip().upper())
        lat, lon = _number(row.get("LAT_DECIMAL")), _number(row.get("LONG_DECIMAL"))
        if not key[0] or key[1].startswith("H") or lat is None or lon is None:
            continue
        ends.setdefault(key, []).append(((row.get("RWY_END_ID") or "").strip().upper(), (lon, lat)))
    for key, pair in ends.items():
        if len(pair) != 2:
            continue
        (id_a, a), (id_b, b) = pair
        box = (min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1]))
        if not _meets(box, bbox):
            continue
        width_ft, surface = widths.get(key, (None, ""))
        props = {"site_no": key[0], "runway": key[1], "width_ft": width_ft, "surface": surface, "hard": _hard(surface)}
        ring = _runway_corners(a, b, (width_ft or 75) * M_PER_FT)
        yield _feature({**props, "part": "surface"}, json.dumps({"type": "Polygon", "coordinates": [ring]}), RUNWAY_MIN_ZOOM)
        yield _feature(
            {**props, "part": "centreline"}, json.dumps({"type": "LineString", "coordinates": [list(a), list(b)]}), RUNWAY_MIN_ZOOM
        )
        for end_id, here, there in ((id_a, a, b), (id_b, b, a)):
            yield _feature(
                {**props, "part": "end", "end_id": end_id, "heading": _true_bearing(here, there)},
                json.dumps({"type": "Point", "coordinates": list(here)}),
                RUNWAY_MIN_ZOOM,
            )


def write_layers(
    folder: Path,
    pack,
    *,
    apt_path: Path,
    rwy_path: Path | None,
    rwy_end_path: Path | None,
    nav_path: Path,
    fix_path: Path,
    bbox=None,
    nav_rmk_path: Path | None = None,
) -> dict[str, int]:
    """Each layer's GeoJSON, a feature a line, into folder/<layer>.geojsonl;
    how many features each holds."""
    from .sua_labels import special_use_label_features

    sources = {
        "airspace": airspace_features(pack, bbox),
        "airspace_labels": airspace_label_features(pack, bbox),
        "special_use": special_use_features(pack, bbox),
        "special_use_labels": special_use_label_features(pack, bbox),
        "airports": airport_features(apt_path, rwy_path, rwy_end_path, bbox),
        "navaids": navaid_features(nav_path, bbox, nav_rmk_path),
        "fixes": fix_features(fix_path, bbox),
        "runways": runway_features(rwy_path, rwy_end_path, bbox) if rwy_path and rwy_end_path else iter(()),
    }
    counts = {}
    for layer, lines in sources.items():
        n = 0
        with open(folder / f"{layer}.geojsonl", "w") as out:
            for line in lines:
                out.write(line)
                n += 1
        counts[layer] = n
    return counts


def tippecanoe_args(folder: Path, out: Path, cycle: str, tippecanoe: str = TIPPECANOE) -> list[str]:
    """tippecanoe's command for the layers in folder. Nothing is dropped
    to keep a tile small, a polygon too small to see included; adjacent
    volumes' shared borders (a Class B's shelves) simplified alike, so no
    sliver opens between them; each feature an id, for the map's state
    (hover, the one tapped)."""
    args = [
        tippecanoe,
        "-o",
        str(out),
        "--force",
        "--quiet",
        "-Z",
        str(MIN_ZOOM),
        "-z",
        str(MAX_ZOOM),
        "--full-detail",
        str(DETAIL),
        "--low-detail",
        str(DETAIL),
        "--simplification",
        "1",
        "--no-feature-limit",
        "--no-tile-size-limit",
        "--no-tiny-polygon-reduction",
        "--drop-rate",
        "1",
        "--detect-shared-borders",
        "--generate-ids",
        "--read-parallel",
        "--temporary-directory",
        str(folder),
        *("--name", f"Wingtip FAA overlays {cycle}", "--attribution", ATTRIBUTION.format(cycle=cycle)),
        *("--description", f"Airspace, special use, airports, navaids, fixes and runways, FAA cycle {cycle}"),
    ]
    for layer in LAYERS:
        args += ["-L", f"{layer}:{folder / f'{layer}.geojsonl'}"]
    return args


def build(pack, cache_dir, out_dir=None, *, bbox=None, tippecanoe: str = TIPPECANOE) -> dict:
    """The archive of the pack's shapes and the NASR files in cache_dir,
    written whole into out_dir with its index (what /api/overlay-tiles
    gives), and any older archive removed. With bbox, (west, south, east,
    north), only the features that meet it: a sample."""
    from wingtip import faa_data

    cache_dir, out_dir = Path(cache_dir), Path(out_dir or vector_tiles.TILES_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    name = archive_name(pack)
    path = out_dir / f"{name}.pmtiles"
    started = time.monotonic()

    def nasr(file: str) -> Path:
        return faa_data.ensure_nasr_file(file, cache_dir)

    # The layers and tippecanoe's own temporary files are worked on the
    # container's disk (the system's temporary folder, TMPDIR), never in
    # out_dir: on the owner's Mac out_dir is the data folder bind-mounted
    # from macOS, and tippecanoe opens each temporary file twice, unlinks
    # it, and asks its size back through the other descriptor (fstat),
    # which Docker Desktop's file share can answer with "No such file or
    # directory" once the file is gone on the Mac's side: "tippecanoe
    # failed (117): stat geom" on a whole-country build, 2026-11-08, with a
    # second build and a stack restart under way (two builds side by side
    # there passed after, so it comes and goes). Only the finished archive
    # is copied over, beside its final name, and renamed into place.
    with tempfile.TemporaryDirectory(prefix="wingtip-overlays-") as tmp:
        folder = Path(tmp)
        counts = write_layers(
            folder,
            pack,
            apt_path=nasr("APT_BASE.csv"),
            rwy_path=nasr("APT_RWY.csv"),
            rwy_end_path=nasr("APT_RWY_END.csv"),
            nav_path=nasr("NAV_BASE.csv"),
            nav_rmk_path=nasr("NAV_RMK.csv"),
            fix_path=nasr("FIX_BASE.csv"),
            bbox=bbox,
        )
        built = folder / "out.pmtiles"
        run = subprocess.run(tippecanoe_args(folder, built, pack.cycle, tippecanoe), capture_output=True, text=True)
        if run.returncode != 0:
            raise RuntimeError(f"tippecanoe failed ({run.returncode}): {run.stderr[-2000:]}")
        with atomic_path(path) as part:
            shutil.copyfile(built, part)
    index = {
        "cycle": pack.cycle,
        "name": name,
        "version": VERSION,
        "bytes": path.stat().st_size,
        "built_at": time.time(),
        "min_zoom": MIN_ZOOM,
        "max_zoom": MAX_ZOOM,
        "tolerance_m": TOLERANCE_M,
        "layers": [{"name": layer, "features": counts[layer]} for layer in LAYERS],
    }
    with atomic_path(out_dir / INDEX) as part:
        part.write_text(json.dumps(index, separators=(",", ":")))
    for old in out_dir.glob("*.pmtiles"):
        if old != path:
            old.unlink(missing_ok=True)
    log.info(
        "Overlay tiles %s built in %.1f s, %.1f MB: %s",
        name,
        time.monotonic() - started,
        index["bytes"] / 1e6,
        ", ".join(f"{k} {v}" for k, v in counts.items()),
    )
    return index


def due(pack_dir=None, out_dir=None) -> bool:
    """Whether there is a cycle pack whose archive is not on disk: the
    planner writes the pack (wingtip.cycle_pack) and asks this job for its
    tiles (app.chart_refresh)."""
    pack = cycle_pack.current(pack_dir)
    if pack is None:
        return False
    held = vector_tiles.tiles_index(out_dir)
    return held is None or held.get("name") != archive_name(pack)


def ensure(cache_dir, pack_dir=None, out_dir=None) -> dict | None:
    """The archive built where the one on disk is not of the cycle pack
    the planner holds now (archive_name); None where it already is, or
    there is no pack yet -- the planner writes it on its first start of a
    cycle, and the next run of this job builds its tiles. Without a
    tippecanoe it fails, as this job has nothing else to do."""
    if not due(pack_dir, out_dir):
        return None
    if shutil.which(TIPPECANOE) is None:
        raise RuntimeError(f"No {TIPPECANOE} on the PATH: the overlay tiles are built in the charts job's image")
    return build(cycle_pack.current(pack_dir), cache_dir, out_dir)
