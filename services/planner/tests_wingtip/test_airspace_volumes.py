"""wingtip.airspace_volumes: the volumes in a box, whole, for the 3D map --
which are drawn, and what is sent with no pack."""

from types import SimpleNamespace

import numpy as np
import shapely
from shapely.geometry import box as shapely_box

from wingtip import airspace_volumes, cycle_pack


def _volume(klass, floor_ft=0.0, local_type=None):
    return {"class": klass, "local_type": local_type or f"CLASS_{klass}", "floor_ft": floor_ft}


def test_class_b_c_and_d_are_drawn_and_class_a_never():
    for klass in ("B", "C", "D"):
        assert airspace_volumes._drawn_class(_volume(klass), airspace_volumes.CLASSES)
    assert not airspace_volumes._drawn_class(_volume("A"), airspace_volumes.CLASSES)


def test_class_e_only_at_the_surface():
    # 14 CFR 71.71(b): a surface area (E2) and its extensions (E3, E4)
    # from the ground; an E5 from 700 or 1,200 ft is everywhere, not drawn.
    assert airspace_volumes._drawn_class(_volume("E", 0.0, "CLASS_E2"), airspace_volumes.CLASSES)
    assert airspace_volumes._drawn_class(_volume("E", 0.0, "CLASS_E4"), airspace_volumes.CLASSES)
    assert not airspace_volumes._drawn_class(_volume("E", 700.0, "CLASS_E5"), airspace_volumes.CLASSES)
    assert not airspace_volumes._drawn_class(_volume("E", 700.0, "CLASS_E2"), airspace_volumes.CLASSES)


def test_only_the_classes_asked_for():
    assert not airspace_volumes._drawn_class(_volume("D"), ("B",))


def test_no_pack_yet_is_no_volumes(monkeypatch):
    monkeypatch.setattr(cycle_pack, "current", lambda: None)
    assert airspace_volumes.volumes_in((-88.5, 41.5, -87.5, 42.5)) == {"type": "FeatureCollection", "features": [], "cycle": None}


def test_a_shape_is_sent_whole_with_its_label_inside_it():
    # A square a degree across, as the pack holds it: sent as one polygon,
    # outer ring counter-clockwise (RFC 7946), its label a point inside.
    square = shapely_box(-88.0, 41.0, -87.0, 42.0).reverse()
    data = shapely.to_wkb(square)
    pack = SimpleNamespace(offsets=lambda layer: np.array([0, len(data)], dtype="<u8"), section=lambda name: memoryview(data))
    geometry = airspace_volumes._shape(pack, "airspace", 0)
    assert geometry.geom_type == "Polygon"
    assert geometry.exterior.is_ccw
    feature = airspace_volumes._feature({"class": "B"}, geometry)
    lon, lat = feature["properties"]["label"]
    assert -88.0 < lon < -87.0 and 41.0 < lat < 42.0
    assert feature["geometry"]["type"] == "Polygon"
