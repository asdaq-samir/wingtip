"""The planner's lookups that an index or a kept copy now answers, held
to what they answered before by a scan at every ask: an airport's rows
of OurAirports' tables (wingtip.by_airport), the airspace at the surface
(wingtip.airspace.surface_classes) and the map's VFR waypoints
(wingtip.vfr_waypoints). Same answers, figure for figure, in the same
order."""

import numpy as np
import pandas as pd
from shapely import STRtree
from shapely import points as shapely_points
from shapely.geometry import Polygon

from wingtip import airspace, by_airport, fixes, places, vfr_waypoints


def test_an_airports_rows_are_the_rows_a_scan_of_the_table_finds():
    table = pd.DataFrame(
        {
            "airport_ident": ["KDLH", "kdlh", None, "C81", "KDLH", "00A", 7, "c81"],
            "le_ident": ["09", "27", "18", "06", "03", "01", "02", "24"],
            "length_ft": [10162, 5718, None, 2400, 5699, 1200, 900, 2400],
        }
    )
    for ident in ["KDLH", "C81", "00A", "KXXX", "7"]:
        pd.testing.assert_frame_equal(by_airport.rows(table, ident), table[table["airport_ident"].str.upper() == ident])


def _square(lon, lat, half):
    return Polygon([(lon - half, lat - half), (lon + half, lat - half), (lon + half, lat + half), (lon - half, lat + half)])


def _surface_classes_by_scan(points, controlled, surface_e):
    """surface_classes as it was: the shapes about the points cut by their
    box, and trees made of them at each ask."""
    lats, lons = [p[0] for p in points], [p[1] for p in points]
    margin = 0.01
    south, west, north, east = min(lats) - margin, min(lons) - margin, max(lats) + margin, max(lons) + margin
    where = shapely_points(lons, lats)
    found = [None] * len(points)
    reaching = [
        p
        for p in controlled
        if not (p["bbox"][3] < south or p["bbox"][1] > north or p["bbox"][2] < west or p["bbox"][0] > east) and p["floor_ft_msl"] <= 0
    ]
    if reaching:
        inside, polygon = STRtree([p["geometry"] for p in reaching]).query(where, predicate="within")
        for i, j in zip(inside.tolist(), polygon.tolist()):
            cls = reaching[j]["class"]
            found[i] = cls if found[i] is None else min(found[i], cls)
    near_e = [g for g, (w, s, e, n) in surface_e if not (n < south or s > north or e < west or w > east)]
    in_e = set(STRtree(near_e).query(where, predicate="within")[0].tolist()) if near_e else set()
    return [cls or ("E" if i in in_e else "G") for i, cls in enumerate(found)]


def test_the_surface_classes_from_the_countrys_trees_are_those_of_the_trees_made_at_each_ask(monkeypatch):
    rng = np.random.default_rng(7)
    controlled = []
    for i in range(60):
        lon, lat = -95 + rng.uniform(0, 6), 40 + rng.uniform(0, 4)
        geometry = _square(lon, lat, rng.uniform(0.05, 0.4))
        floor = float(rng.choice([0.0, 0.0, 1500.0, 3000.0]))
        controlled.append({"class": str(rng.choice(["B", "C", "D"])), "floor_ft_msl": floor, "geometry": geometry, "bbox": geometry.bounds})
    surface_e = [(g, g.bounds) for g in (_square(-95 + rng.uniform(0, 6), 40 + rng.uniform(0, 4), 0.1) for _ in range(40))]
    monkeypatch.setattr(airspace, "_load_all_controlled_airspace", lambda shp: controlled)
    monkeypatch.setattr(airspace, "_load_surface_e", lambda shp: surface_e)
    for _ in range(20):
        points = [(40 + rng.uniform(0, 4), -95 + rng.uniform(0, 6)) for _ in range(int(rng.integers(1, 30)))]
        assert airspace.surface_classes(points, "airspace.shp") == _surface_classes_by_scan(points, controlled, surface_e)


def _fix(ident, lat, lon, vfr):
    return {"ident": ident, "lat": lat, "lon": lon, "kind": "VFR waypoint" if vfr else "GPS waypoint", "vfr": vfr}


def test_the_vfr_waypoints_in_view_are_those_a_scan_of_every_fix_finds_each_described_once(monkeypatch):
    rng = np.random.default_rng(11)
    found = {}
    for i in range(400):
        ident = f"VP{i:03d}" if i % 3 else f"FIX{i:02d}"
        found[ident] = _fix(ident, 41 + rng.uniform(0, 3), -89 + rng.uniform(0, 3), vfr=bool(i % 3) and i % 7 != 0)
    navaids = {"RFD": [{**_fix("RFD", 42.2, -89.1, False), "navaid": True}]}
    table = fixes._Table(found, navaids)
    monkeypatch.setattr(fixes, "_table", lambda cache_dir=None: table)
    asked = []
    monkeypatch.setattr(places, "loaded", lambda: {"loaded": True})
    monkeypatch.setattr(places, "describe", lambda lat, lon, table=None: asked.append((lat, lon)) or f"{lat:.3f} {lon:.3f}")
    vfr_waypoints._DESCRIBED.clear()
    for box in [(41.5, -88.5, 42.5, -87.5), (41.0, -89.0, 44.0, -86.0), (42.0, -88.0, 42.1, -87.9)]:
        before = sorted((f for f in fixes.within(*box) if f["vfr"]), key=lambda f: f["ident"])
        assert fixes.within(*box, vfr=True) == [f for f in fixes.within(*box) if f["vfr"]]
        want = [
            {"ident": f["ident"], "lat": f["lat"], "lon": f["lon"], "description": places.describe(f["lat"], f["lon"])}
            for f in before[:150]
        ]
        assert vfr_waypoints.in_view(*box, 150) == want
    # Each waypoint's words worked out once by in_view, however often asked.
    asked.clear()
    vfr_waypoints.in_view(41.0, -89.0, 44.0, -86.0, 150)
    assert asked == []
