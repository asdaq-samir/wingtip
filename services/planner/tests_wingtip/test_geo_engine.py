"""wingtip.geo's figures are the engine's: the shared cases every app
answers (apps/web/src/lib/fixtures/sphere.json), and PROJ's own geodesic
on the same sphere (pyproj's Geod with a = 3,440.065 nm, f = 0) as an
oracle over many points at once, scalars and arrays alike. And how far
the sphere is from the WGS-84 ellipsoid the FAA's data are on, the
simplification the engine's geo.rs states."""

import json
from pathlib import Path

import numpy as np
import pytest
from pyproj import Geod

from wingtip import geo

SPHERE = json.loads((Path(__file__).resolve().parents[3] / "apps/web/src/lib/fixtures/sphere.json").read_text())
ORACLE = Geod(a=geo.EARTH_RADIUS_NM, f=0.0)
#: WGS-84, in metres; a nautical mile is 1,852 m exactly.
WGS84 = Geod(ellps="WGS84")


@pytest.mark.parametrize("case", SPHERE["distance"])
def test_distance_is_the_shared_case(case):
    assert geo.distance_nm(case["lat1"], case["lon1"], case["lat2"], case["lon2"]) == pytest.approx(case["nm"], abs=1e-9)


@pytest.mark.parametrize("case", SPHERE["bearing"])
def test_bearing_is_the_shared_case(case):
    assert geo.bearing_deg(case["lat1"], case["lon1"], case["lat2"], case["lon2"]) == pytest.approx(case["deg"], abs=1e-9)


@pytest.mark.parametrize("case", SPHERE["destination"])
def test_destination_is_the_shared_case(case):
    lat, lon = geo.destination_point(case["lat"], case["lon"], case["bearing_deg"], case["nm"])
    assert (lat, lon) == pytest.approx((case["to"]["lat"], case["to"]["lon"]), abs=1e-9)


def _points(n=5000, seed=7):
    rng = np.random.default_rng(seed)
    # The lower 48 and round it, where the planner's routes are.
    return rng.uniform(20, 55, n), rng.uniform(-130, -60, n), rng.uniform(20, 55, n), rng.uniform(-130, -60, n)


def test_arrays_agree_with_proj_on_the_sphere():
    lat1, lon1, lat2, lon2 = _points()
    azimuth, _, nm = ORACLE.inv(lon1, lat1, lon2, lat2)
    assert np.allclose(geo.distance_nm(lat1, lon1, lat2, lon2), nm, rtol=0, atol=1e-6)
    off = (geo.bearing_deg(lat1, lon1, lat2, lon2) - np.mod(azimuth, 360.0) + 180.0) % 360.0 - 180.0
    assert np.abs(off).max() < 1e-7


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
    want = ORACLE.inv_intermediate(start[1], start[0], end[1], end[0], npts=50, initial_idx=0, terminus_idx=0)
    assert np.allclose(lats, want.lats, atol=1e-9) and np.allclose(lons, want.lons, atol=1e-9)
    assert (lats[0], lons[0]) == pytest.approx(start) and (lats[-1], lons[-1]) == pytest.approx(end, abs=1e-9)


def test_the_sphere_is_within_half_a_percent_of_wgs84():
    # geo.rs: the sphere is a stated simplification of WGS-84, 0.086% on
    # Duluth to St Louis (0.42 nm in 492) and about 0.5% at most; its
    # initial course within a fifth of a degree on a route the planner
    # plans. A figure past either is a different model, not this one.
    lat1, lon1, lat2, lon2 = _points()
    azimuth, _, metres = WGS84.inv(lon1, lat1, lon2, lat2)
    sphere = geo.distance_nm(lat1, lon1, lat2, lon2)
    assert np.abs(sphere / (metres / 1852.0) - 1.0).max() < 0.0056
    off = (geo.bearing_deg(lat1, lon1, lat2, lon2) - np.mod(azimuth, 360.0) + 180.0) % 360.0 - 180.0
    assert np.abs(off).max() < 0.2
