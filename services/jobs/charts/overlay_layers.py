"""The overlay tiles' feature layers drawn from the cycle pack's shapes
(charts.overlays builds the archive): the `airspace`, `airspace_labels`
and `special_use` layers, each feature one line of GeoJSON for tippecanoe
with its first zoom, and the helpers every layer's lines are written with
(_feature, _meets, _orient) and the zooms each kind of feature starts at.
Where each comes from is charts.overlays' docstring. Split from
charts/overlays.py (2026-11-18), which had grown to 652 lines."""

from __future__ import annotations

import json
import math

from wingtip import airspace_tabs, phone_pack_shapes

from . import map_zoom as zoom


def _tiles(app_zoom: int) -> int:
    """A zoom of the app's (map_zoom, from design/tokens.json's map.zoom)
    in the tiles' own levels, MapLibre's, a zoom less (the web's glZoom)."""
    return app_zoom - 1


#: Each layer's first zoom, by what the feature is, from the zoom every
#: app draws it from (map_zoom). Below it a feature is left out of the
#: tiles; from it on, it is in every tile it touches, and none is ever
#: dropped for a tile's size (--no-feature-limit, --no-tile-size-limit,
#: -r1, --no-tiny-polygon-reduction).
AIRSPACE_MIN_ZOOM = {"B": _tiles(zoom.AIRSPACE_B), "C": _tiles(zoom.AIRSPACE_C), "D": _tiles(zoom.AIRSPACE_D)}
#: Class E by its LOCAL_TYPE: at the surface (E2), the extensions of a
#: Class C's or D's surface area (E3, E4), from 700 or 1,200 ft (E5), and
#: the en route and offshore areas (E6, E7). 14 CFR 71.71, 71.79.
CLASS_E_MIN_ZOOM = dict.fromkeys(("CLASS_E2", "CLASS_E3", "CLASS_E4"), _tiles(zoom.AIRSPACE_E_SURFACE))
CLASS_E_OTHER_MIN_ZOOM = _tiles(zoom.AIRSPACE_E)
SPECIAL_USE_MIN_ZOOM = _tiles(zoom.SPECIAL_USE)
#: Airports by the engine's field_mark_rank's tier: towered, public with a
#: hard runway of 3,000 ft or more, other public, private, then heliports.
AIRPORT_MIN_ZOOM = tuple(
    _tiles(z) for z in (zoom.AIRPORT_TOWERED, zoom.AIRPORT_LONG_HARD, zoom.AIRPORT_PUBLIC, zoom.AIRPORT_PRIVATE, zoom.AIRPORT_HELIPORT)
)
#: The VORs (wingtip.fix_rows.VOR_KINDS) a zoom out; the rest closer in.
VOR_MIN_ZOOM = 5
NAVAID_MIN_ZOOM = 7
#: VFR waypoints and the low enroute chart's fixes; every other fix
#: (RNAV and approach fixes) closer in.
CHARTED_FIX_MIN_ZOOM = 8
FIX_MIN_ZOOM = 10
#: Runways from zoom 10 (a tile 39 km across): the map draws them closer
#: in, past the chart's own detail, where they are a few pixels wide.
RUNWAY_MIN_ZOOM = 10


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

    numbers = phone_pack_shapes._controlled_numbers(pack)
    for record, number, geometry in zip(pack.attrs("airspace"), numbers, pack.geometries("airspace")):
        geometry = _orient(geometry)
        if geometry is None or geometry.is_empty or not _meets(geometry.bounds, bbox):
            continue
        volume = phone_pack_shapes._volume_drawn(record, number)
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
    B, C or D volume with a ceiling, on its ring (_label_place), with `tab`,
    the engine's words the map draws ("49" over "23", airspace_tabs), its
    figures, and `angle`, the text's turn. One a shelf, where the ring's
    own line placement put three round Madison (the owner, 2026-11-08)."""
    numbers = phone_pack_shapes._controlled_numbers(pack)
    volumes = []
    for record, number, geometry in zip(pack.attrs("airspace"), numbers, pack.geometries("airspace")):
        geometry = _orient(geometry)
        if geometry is None or geometry.is_empty:
            continue
        volume = phone_pack_shapes._volume_drawn(record, number)
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
                "tab": airspace_tabs.shelf_tab(volume),
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
