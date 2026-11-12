"""The airspace's volumes in a box, each whole, for the map's 3D view
(apps/web features/plan/map/terrain/AirspaceVolumesGl, which stands them
up with deck.gl between their floors and ceilings).

The 2D chart draws its airspace from the cycle's vector tiles, and a tile
holds only its own piece of a volume, cut at the tile's edge. Stood up in
3D those pieces showed the cuts as walls and each piece's own top (the
owner's iPhone, 2026-11-12), so the 3D view asks for the volumes here
instead: every polygon as the FAA draws it, from the cycle pack the shared
store holds (wingtip.cycle_pack) -- never a live fetch on a pilot's ask.

What is sent, with the same fields as the tiles' `airspace` and
`special_use` layers (services/jobs/charts/overlays.py), so a tap opens
the same card:

- Class B, C and D from the NASR Class Airspace shapefile, a "to but not
  including" ceiling (UPPER_DESC TNI) at its figure;
- Class E only where it is at the surface (LOCAL_TYPE CLASS_E2, a surface
  area designated for an airport, 14 CFR 71.71(b), and E3/E4, its
  extensions, with a floor the file gives as the surface): the rest of
  Class E, from 700 or 1,200 ft (71.71(c), (e)), is everywhere and no
  volume to see; Class A (from 18,000 ft MSL, 71.33) is never sent;
- the special use areas the chart draws (wingtip.sua's TYPE_CODEs:
  prohibited, restricted, warning, danger, MOAs and alert areas), as
  wingtip.sua reads them.

Each with `label`, one point inside its largest polygon where the map
writes its name, so an area drawn as several polygons, or crossing many
tiles, is named once.
"""

from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import shapely
from shapely.geometry.polygon import orient

from . import airspace, cycle_pack, sua

#: The classes drawn as volumes, by the shapefile's CLASS.
CLASSES = ("B", "C", "D", "E")
#: The special use kinds the chart draws (lib/map/gl/glSuaLabels'
#: RESTRICTED and the MOAs and alert areas), by wingtip.sua's TYPE_CODE.
SUA_TYPES = ("P", "R", "W", "D", "MOA", "A")
#: How far a drawn ring may stray from the FAA's, degrees (Douglas and
#: Peucker's, shapely's simplify): about 30 m, a pixel at the zooms the
#: 3D view is looked at, where the file draws its arcs a point every few
#: feet. The cards and every figure are the planner's own, from the full
#: rings; this is only the picture.
TOLERANCE_DEG = 0.0003
#: Decimal places a coordinate is sent to: about a metre.
PLACES = 5
#: The largest box answered, degrees a side: a state's width, more than
#: a phone's tilted view shows to its haze.
MAX_SPAN_DEG = 12.0


@lru_cache(maxsize=4)
def _attrs(pack: cycle_pack.Pack, layer: str) -> list:
    """A layer's fields, read once a pack (the pack itself is mapped once
    a file, cycle_pack.current)."""
    return pack.attrs(layer)


@lru_cache(maxsize=2)
def _numbers(pack: cycle_pack.Pack) -> list:
    return cycle_pack._controlled_numbers(pack)


def _drawn_class(volume: dict, classes: tuple[str, ...]) -> bool:
    cls = volume["class"]
    if cls not in classes:
        return False
    if cls == "E":
        return volume["local_type"] in airspace.SURFACE_E_TYPES and not volume["floor_ft"]
    return cls in ("B", "C", "D")


def _shape(pack, layer: str, k: int):
    """Shape k of a layer, simplified, outer rings counter-clockwise as
    RFC 7946 has them, its coordinates rounded."""
    offsets = pack.offsets(layer)
    geometry = shapely.from_wkb(bytes(pack.section(f"{layer}.wkb")[int(offsets[k]) : int(offsets[k + 1])]))
    geometry = geometry.simplify(TOLERANCE_DEG, preserve_topology=True)
    if geometry.geom_type == "Polygon":
        geometry = orient(geometry, sign=1.0)
    elif geometry.geom_type == "MultiPolygon":
        geometry = shapely.MultiPolygon([orient(p, sign=1.0) for p in geometry.geoms])
    else:
        return None
    return None if geometry.is_empty else shapely.transform(geometry, lambda xy: np.round(xy, PLACES))


def _feature(properties: dict, geometry) -> dict:
    largest = max(getattr(geometry, "geoms", [geometry]), key=lambda p: p.area)
    label = largest.representative_point()
    return {
        "type": "Feature",
        "geometry": json.loads(shapely.to_geojson(geometry)),
        "properties": {**properties, "label": [round(label.x, PLACES), round(label.y, PLACES)]},
    }


def _in_box(pack, layer: str, box: tuple[float, float, float, float]) -> np.ndarray:
    """The indices of a layer's shapes whose bounds meet box (west,
    south, east, north)."""
    w, s, e, n = box
    b = pack.boxes(layer)
    return np.flatnonzero((b[:, 0] <= e) & (b[:, 2] >= w) & (b[:, 1] <= n) & (b[:, 3] >= s))


def volumes_in(box: tuple[float, float, float, float], classes: tuple[str, ...] = CLASSES, special_use: bool = True) -> dict:
    """The volumes meeting box (west, south, east, north), as a GeoJSON
    FeatureCollection with the pack's `cycle`; none where the shared
    store holds no pack yet. Each feature's `layer` is "airspace" or
    "special_use", the tiles' layer its fields are those of."""
    w, s, e, n = box
    box = (w, s, min(e, w + MAX_SPAN_DEG), min(n, s + MAX_SPAN_DEG))
    pack = cycle_pack.current()
    if pack is None:
        return {"type": "FeatureCollection", "features": [], "cycle": None}
    features = []
    records, numbers = _attrs(pack, "airspace"), _numbers(pack)
    for k in _in_box(pack, "airspace", box):
        volume = cycle_pack._volume_drawn(records[k], numbers[k])
        if not _drawn_class(volume, classes):
            continue
        geometry = _shape(pack, "airspace", int(k))
        if geometry is not None:
            features.append(_feature({**volume, "layer": "airspace"}, geometry))
    if special_use and "sua.attr" in pack.sections:
        areas = _attrs(pack, "sua")
        for k in _in_box(pack, "sua", box):
            area = sua._area(areas[k] or {})
            if area["type"] not in SUA_TYPES:
                continue
            geometry = _shape(pack, "sua", int(k))
            if geometry is not None:
                features.append(_feature({**area, "layer": "special_use"}, geometry))
    return {"type": "FeatureCollection", "features": features, "cycle": pack.cycle}
