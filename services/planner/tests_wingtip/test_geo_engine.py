"""wingtip.geo's figures are the engine's: the shared cases every app
answers (apps/web/src/lib/fixtures/geodesic.json, pyproj's own answers), and
PROJ's geodesic on the WGS-84 ellipsoid (pyproj's Geod(ellps="WGS84"),
Karney's algorithm, as the engine's geographiclib-rs is) as an oracle over
many points at once, scalars and arrays alike, to 1e-6 nm. A nautical mile
is 1,852 m exactly."""

import json
import math
from pathlib import Path

import numpy as np
import pytest
from pyproj import Geod
from scipy.optimize import brentq

from wingtip import geo

CASES = json.loads((Path(__file__).resolve().parents[3] / "apps/web/src/lib/fixtures/geodesic.json").read_text())
#: WGS-84 (NGA TR8350.2), in metres.
WGS84 = Geod(ellps="WGS84")
M_PER_NM = 1852.0
#: The agreement asked: a millionth of a mile, under 2 mm.
NM = 1e-6


@pytest.mark.parametrize("case", CASES["distance"])
def test_distance_is_the_shared_case(case):
    assert geo.distance_nm(case["lat1"], case["lon1"], case["lat2"], case["lon2"]) == pytest.approx(case["nm"], abs=1e-9)


@pytest.mark.parametrize("case", CASES["bearing"])
def test_bearing_is_the_shared_case(case):
    assert geo.bearing_deg(case["lat1"], case["lon1"], case["lat2"], case["lon2"]) == pytest.approx(case["deg"], abs=1e-9)


@pytest.mark.parametrize("case", CASES["destination"])
def test_destination_is_the_shared_case(case):
    lat, lon = geo.destination_point(case["lat"], case["lon"], case["bearing_deg"], case["nm"])
    assert (lat, lon) == pytest.approx((case["to"]["lat"], case["to"]["lon"]), abs=1e-9)


def _points(n=5000, seed=7):
    rng = np.random.default_rng(seed)
    # The lower 48 and round it, where the planner's routes are.
    return rng.uniform(20, 55, n), rng.uniform(-130, -60, n), rng.uniform(20, 55, n), rng.uniform(-130, -60, n)


def _angle(a, b):
    return (a - b + 180.0) % 360.0 - 180.0


def test_arrays_agree_with_proj_on_wgs84():
    lat1, lon1, lat2, lon2 = _points()
    azimuth, _, metres = WGS84.inv(lon1, lat1, lon2, lat2)
    assert np.abs(geo.distance_nm(lat1, lon1, lat2, lon2) - metres / M_PER_NM).max() < NM
    assert np.abs(_angle(geo.bearing_deg(lat1, lon1, lat2, lon2), np.mod(azimuth, 360.0))).max() < 1e-9
    courses = np.random.default_rng(3).uniform(0, 360, lat1.size)
    miles = metres / M_PER_NM
    lon, lat, _ = WGS84.fwd(lon1, lat1, courses, metres)
    got_lat, got_lon = geo.destination_point(lat1, lon1, courses, miles)
    assert np.abs(got_lat - lat).max() < 1e-9 and np.abs(_angle(got_lon, lon)).max() < 1e-9


def _track_oracle(lat, lon, a, b):
    """(cross, along) nm by another road than the engine's: the foot of
    the perpendicular as the root of its right-angle condition, Brent's
    method over Geod.fwd along the line and Geod.inv to the point."""
    course = WGS84.inv(a[1], a[0], b[1], b[0])[0]

    def at(s):
        lon_x, lat_x, back = WGS84.fwd(a[1], a[0], course, s)
        azimuth, _, d = WGS84.inv(lon_x, lat_x, lon, lat)
        turn = math.radians(azimuth - (back + 180.0))
        return math.cos(turn), d, math.sin(turn)

    reach = WGS84.inv(a[1], a[0], lon, lat)[2] + 1.0
    s = brentq(lambda s: at(s)[0], -reach, reach, xtol=1e-7, rtol=1e-15, maxiter=200)
    _, d, side = at(s)
    return math.copysign(d, side) / M_PER_NM, s / M_PER_NM


def test_cross_and_along_track_agree_with_proj_on_wgs84():
    # Legs up to a few hundred miles and points up to 300 nm off them,
    # ahead, abeam and behind: the corridor's and the nav log's cases.
    rng = np.random.default_rng(19)
    for _ in range(200):
        a = (rng.uniform(25, 49), rng.uniform(-124, -67))
        b = (a[0] + rng.uniform(-4, 4), a[1] + rng.uniform(-4, 4))
        p = (a[0] + rng.uniform(-5, 5), a[1] + rng.uniform(-5, 5))
        cross, along = geo.track_distances_nm(*p, a, b)
        want = _track_oracle(*p, a, b)
        assert (cross, along) == pytest.approx(want, abs=NM)


def test_a_corridor_is_each_point_alone():
    lat1, lon1, _, _ = _points(300)
    start, end = (46.8421, -92.1936), (38.7487, -90.37)
    cross, along = geo.track_distances_nm(lat1, lon1, start, end)
    for i in (0, 77, 299):
        assert (cross[i], along[i]) == pytest.approx(geo.track_distances_nm(float(lat1[i]), float(lon1[i]), start, end), abs=1e-12)


def test_one_start_broadcasts_against_many_points():
    _, _, lat2, lon2 = _points(200)
    got = geo.distance_nm(42.0, -88.0, lat2, lon2)
    assert got.shape == (200,)
    assert got[17] == pytest.approx(geo.distance_nm(42.0, -88.0, float(lat2[17]), float(lon2[17])), abs=1e-12)
    grid = geo.distance_nm(42.0, -88.0, lat2.reshape(20, 10), lon2.reshape(20, 10))
    assert grid.shape == (20, 10)


def test_scalars_come_back_as_floats():
    assert type(geo.distance_nm(42, -88, 43, -88)) is float
    assert type(geo.bearing_deg(np.float64(42), -88, 43, -88)) is float
    assert geo.bearing_deg(45.0, -93.0, 45.0, -93.0) == 0.0


def test_intermediate_points_agree_with_proj():
    start, end = (46.8421, -92.1936), (38.7487, -90.37)
    lats, lons = geo.great_circle_points(start, end, 50)
    want = WGS84.inv_intermediate(start[1], start[0], end[1], end[0], npts=50, initial_idx=0, terminus_idx=0)
    assert np.allclose(lats, want.lats, atol=1e-9) and np.allclose(lons, want.lons, atol=1e-9)
    assert (lats[0], lons[0]) == pytest.approx(start) and (lats[-1], lons[-1]) == pytest.approx(end, abs=1e-9)
