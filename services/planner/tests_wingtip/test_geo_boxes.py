"""Search boxes across the antimeridian (wingtip.geo_boxes; the
edge-places audit's S10): a route from Adak (PADK, 51.88 N 176.65 W) to
Shemya (PASY, 52.71 N 174.11 E) is 378 nm the short way across 180, and
its boxes are read there, not some 350 degrees the long way round; a
route in the Midwest is boxed as it always was, to the bit."""

import numpy as np
import pandas as pd

from wingtip import dof, forecast_run, geo, geo_boxes, ifr, osm

ADAK = (51.878, -176.646)
SHEMYA = (52.712, 174.114)
MSN, OSH = (43.1399, -89.3375), (43.9844, -88.5570)


def test_a_leg_across_180_is_boxed_the_short_way():
    box = geo_boxes.corridor_box(ADAK, SHEMYA, 10.0)
    # West of Adak past -180: Shemya's 174.11 E read as 185.89 W.
    assert box[1] < -185.886 < -176.646 < box[3] < -176.0
    halves = geo_boxes.split_box(box)
    assert len(halves) == 2 and halves[0][3] == 180.0 and halves[1][1] == -180.0
    assert geo_boxes.in_box(box, *SHEMYA) and geo_boxes.in_box(box, *ADAK)
    # Not the long way round: nothing over the North Sea or the Midwest.
    assert not geo_boxes.in_box(box, 52.0, 2.0) and not geo_boxes.in_box(box, 52.0, -93.0)
    # Either way round, the same ground.
    back = geo_boxes.corridor_box(SHEMYA, ADAK, 10.0)
    assert back[3] > 180.0 and geo_boxes.in_box(back, *ADAK) and not geo_boxes.in_box(back, 52.0, 2.0)


def test_a_point_by_180_reaches_across_it():
    box = geo.box_around(*SHEMYA, 200.0)
    assert box[3] > 180.0
    assert geo_boxes.in_box(box, 52.5, -179.95) and geo_boxes.in_box(box, 52.5, 179.5)
    assert geo_boxes.meets(box, 52.0, -179.9, 53.0, -179.0)
    assert not geo_boxes.meets(box, 52.0, -170.0, 53.0, -169.0)


def test_a_box_nowhere_near_180_is_the_one_it_always_was():
    assert geo_boxes.corridor_box(MSN, OSH, 10.0) == geo.corridor_bbox(MSN, OSH, 10.0)
    assert geo_boxes.split_box(geo.corridor_bbox(MSN, OSH, 10.0)) == [geo.corridor_bbox(MSN, OSH, 10.0)]
    lats, lons = np.array([MSN[0], OSH[0]]), np.array([MSN[1], OSH[1]])
    assert geo_boxes.box_over(lats, lons, 5.0) == geo.corridor_bbox((lats.min(), lons.min()), (lats.max(), lons.max()), 5.0)
    assert geo_boxes.lon_near(-88.07, -92.19) == -88.07
    assert list(geo_boxes.line_across([MSN, OSH]).coords) == [(MSN[1], MSN[0]), (OSH[1], OSH[0])]
    assert geo_boxes.split_box((50.0, -200.0, 54.0, 170.0)) == [(50.0, -180.0, 54.0, 180.0)]


def test_a_line_across_180_is_cut_there():
    line = geo_boxes.line_across([ADAK, SHEMYA])
    assert line.geom_type == "MultiLineString"
    (west, east) = line.geoms
    assert west.coords[0] == (ADAK[1], ADAK[0]) and west.coords[-1][0] == -180.0
    assert east.coords[0][0] == 180.0 and np.allclose(east.coords[-1], (SHEMYA[1], SHEMYA[0]), atol=1e-9)
    # Cut at the same latitude on both sides, between the two fields'.
    assert west.coords[-1][1] == east.coords[0][1] and ADAK[0] < west.coords[-1][1] < SHEMYA[0]
    # Nowhere near the North Sea.
    assert line.bounds[0] >= -180.0 and not line.intersects(geo_boxes.shape_of((51.0, 0.0, 54.0, 4.0)))


def test_the_obstacles_across_180_are_read(monkeypatch):
    table = pd.DataFrame({"lat": [52.72, 52.0, 52.5, 43.5], "lon": [174.10, -176.65, 2.0, -89.0], "agl_ft": [300.0, 300.0, 300.0, 300.0]})
    monkeypatch.setattr(dof, "_load_all_obstacles", lambda path: table)
    found = dof.load_obstacles("DOF.DAT", geo_boxes.corridor_box(ADAK, SHEMYA, 20.0), min_agl_ft=200)
    assert sorted(found["lon"].tolist()) == [-176.65, 174.10]
    midwest = dof.load_obstacles("DOF.DAT", geo.corridor_bbox(MSN, OSH, 30.0), min_agl_ft=200)
    assert midwest["lon"].tolist() == [-89.0]


def test_the_ifr_floor_asks_no_tile_past_the_grid():
    z = 10
    tiles = ifr._tiles_over(geo_boxes.corridor_box((52.70, 179.95), (52.72, -179.95), 5.0), z)
    xs = {x for x, _ in tiles}
    assert max(xs) == 2**z - 1 and 0 in xs
    # Two tiles wide either side of 180, not the world's row of them.
    assert len(xs) <= 4


def test_overpass_is_asked_both_halves():
    box = geo_boxes.corridor_box(ADAK, SHEMYA, 5.0)
    statement = osm.overpass_statement("way[waterway]", box)
    assert statement.startswith("(way[waterway](") and statement.count("way[waterway](") == 2
    assert ",180.0)" in statement and ",-180.0," in statement


def test_a_runs_tafs_are_read_across_180():
    box = forecast_run._box([ADAK, SHEMYA], 25.0)
    assert forecast_run._in_box(52.71, 174.11, box) and forecast_run._in_box(51.88, -176.65, box)
    assert not forecast_run._in_box(52.0, 2.0, box)
    assert forecast_run._ring_in_box([[52.0, 179.5], [53.0, 179.5], [53.0, 179.9]], box)
