"""The `special_use_labels` layer of the map's overlay tiles: a point on
each special-use area's boundary where the map writes its tab, as
ForeFlight does over the sectional (the owner's screenshot near Brady,
TX, 2026-11-12): "M-BRNWD 2 W*: 7000-17999", "M-BRADY LOW:
500AGL-5999". The tiles carry the tab's name and its limits as figures
with their references; the map writes the altitudes' words, as it does
for the Class B, C and D tabs (`airspace_labels`, overlays.py).

The tab's words -- the name cut as ForeFlight cuts it and the limits as
the FAA's CIFP writes them ("to but not including" FL180 as 17999 MSL,
14 CFR 71.33) -- are the engine's `special_use_tab`, the one copy the
iPhone's map asks too (engine/crates/airspace/src/sua_tab.rs), from the
FAA's special use airspace feature service (ADDS) as the cycle pack holds
it and wingtip.sua `_area` reads it: NAME, TYPE_CODE, each limit's figure,
CODE and DESC, and EXCLUSION. A pack written before wingtip.sua asked for
the DESC fields and EXCLUSION has none of them: its limits are then read
as coded and every piece is labelled, until the next pack.
"""

from __future__ import annotations

import json
import math

import wingtip_native

from .overlays import SPECIAL_USE_MIN_ZOOM, _feature, _meets, _orient


def tab_words(area: dict) -> dict | None:
    """The engine's tab for one area as wingtip.sua `_area` describes it:
    {"name", "floor_ft", "floor_ref", "ceiling_ft", "ceiling_ref"}, or None
    for a piece cut out of its area or a limit with no figure."""
    asked = {
        "name": area["name"],
        "type": area["type"].strip(),
        "floor": {"ft": area["floor_ft"], "code": area["floor_ref"], "desc": area.get("floor_desc")},
        "ceiling": {"ft": area["ceiling_ft"], "code": area["ceiling_ref"], "desc": area.get("ceiling_desc")},
        "excluded": bool(area.get("excluded")),
    }
    return json.loads(wingtip_native.call("special_use_tab", json.dumps(asked)))


def _edge_place(geometry) -> tuple[tuple[float, float], float, int]:
    """Where an area's tab goes: the middle of the longest side of its
    largest polygon's outer ring, turned along it and kept upright (-90 to
    90, clockwise), as ForeFlight's lie along a MOA's straight edges; and
    which side of the text the area is on, 1 below and -1 above, for the
    map to set the tab just inside the line. In a plane tangent at the
    side's middle (east scaled by the cosine of the latitude), the web
    map's own angle near it (Mercator is conformal). The outer ring runs
    counter-clockwise (overlays._orient), so the area is on its left."""
    polygon = max(getattr(geometry, "geoms", [geometry]), key=lambda p: p.area)
    ring = list(polygon.exterior.coords)
    k = math.cos(math.radians(polygon.centroid.y))
    a, b = max(zip(ring, ring[1:]), key=lambda s: math.hypot((s[1][0] - s[0][0]) * k, s[1][1] - s[0][1]))
    dx, dy = (b[0] - a[0]) * k, b[1] - a[1]
    turn = math.degrees(math.atan2(dx, dy)) - 90.0
    flipped = False
    while turn > 90.0:
        turn, flipped = turn - 180.0, not flipped
    while turn <= -90.0:
        turn, flipped = turn + 180.0, not flipped
    # Along the side the area is on the left, the text's top; read the
    # other way it is below.
    side = 1 if flipped else -1
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), round(turn, 1), side


def special_use_label_features(pack, bbox=None):
    """The `special_use_labels` layer's lines of GeoJSON: one point an
    area's polygon (_edge_place) with `label`, `type`, its floor and
    ceiling as `floor_ft`/`floor_ref` and `ceiling_ft`/`ceiling_ref`
    (tab_words), `angle` and `side`. A piece the FAA marks as cut out of
    its area (EXCLUSION 1: Brady Low's parts below 1,500 ft AGL) is no area
    of its own and has none."""
    from wingtip import sua

    if "sua.attr" not in pack.sections:
        return
    for props, geometry in zip(pack.attrs("sua"), pack.geometries("sua")):
        geometry = _orient(geometry)
        if geometry is None or geometry.is_empty or not _meets(geometry.bounds, bbox):
            continue
        area = sua._area(props or {})
        tab = tab_words(area)
        if tab is None:
            continue
        (lon, lat), angle, side = _edge_place(geometry)
        yield _feature(
            {
                "label": tab["name"],
                "type": area["type"].strip(),
                "floor_ft": tab["floor_ft"],
                "floor_ref": tab["floor_ref"],
                "ceiling_ft": tab["ceiling_ft"],
                "ceiling_ref": tab["ceiling_ref"],
                "angle": angle,
                "side": side,
            },
            json.dumps({"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}),
            SPECIAL_USE_MIN_ZOOM,
        )
