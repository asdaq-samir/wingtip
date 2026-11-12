"""wingtip.congested: the towns it reads (the Census urban areas and
gazetteer places) and the engine's answer over them, whether a point is
over a congested area or within 14 CFR 91.119(b)'s "horizontal radius of
2,000 feet" of one -- here a town of a few streets drawn by hand. The
rule's own cases are the engine's (apps/web/src/lib/fixtures/congested.json)."""

import math

import numpy as np
import pytest
import requests
import shapely

from wingtip import congested

LAT, LON = 45.0, -90.0
FT_LAT = 1 / congested.FT_PER_DEG_LAT  # a foot, in degrees of latitude
FT_LON = FT_LAT / math.cos(math.radians(LAT))  # and of longitude at 45 N
# A town a mile on a side, its south-west corner at (LAT, LON).
TOWN = shapely.box(LON, LAT, LON + 5280 * FT_LON, LAT + 5280 * FT_LAT)


@pytest.fixture
def town(monkeypatch):
    monkeypatch.setattr(congested, "_tree", lambda: shapely.STRtree([TOWN]))


def _at(north_ft: float, east_ft: float) -> tuple[float, float]:
    """A point `north_ft` and `east_ft` from the town's south-west corner."""
    return LAT + north_ft * FT_LAT, LON + east_ft * FT_LON


def _congested(*points) -> list:
    lats, lons = zip(*points)
    return congested.congested(np.array(lats), np.array(lons)).tolist()


def test_inside_the_town_is_congested(town):
    assert _congested(_at(2640, 2640)) == [True]


def test_within_2000_ft_south_of_the_town_counts_and_beyond_does_not(town):
    # An airplane over the town's edge is within 2,000 ft of what stands
    # 1,999 ft outside it, and not of what stands 2,001 ft out.
    assert _congested(_at(-1999, 2640), _at(-2001, 2640)) == [True, False]


def test_within_2000_ft_west_of_the_town_counts_and_beyond_does_not(town):
    # East-west by the latitude's own degree of longitude.
    assert _congested(_at(2640, -1999), _at(2640, -2001)) == [True, False]


def test_off_a_corner_the_distance_is_to_the_corner(town):
    # 1,400 ft south and 1,400 west is 1,980 ft from the corner; 1,450
    # each way is 2,051.
    assert _congested(_at(-1400, -1400), _at(-1450, -1450)) == [True, False]


def test_no_points_is_no_answer_needed(town):
    assert congested.congested(np.array([]), np.array([])).tolist() == []


def test_a_gazetteer_place_is_a_circle_of_its_land_area(monkeypatch):
    # A village of a square kilometre: a circle 564 m across its point.
    monkeypatch.setattr(congested.geocode, "_towns", lambda: [["Smallville", "KS", LAT, LON, 1_000_000.0]])
    (circle,) = congested._places()
    radius_m = math.sqrt(1_000_000.0 / math.pi)
    assert shapely.contains_xy(circle, LON, LAT + 0.95 * radius_m / congested.M_PER_DEG_LAT)
    assert not shapely.contains_xy(circle, LON, LAT + 1.05 * radius_m / congested.M_PER_DEG_LAT)


def test_a_place_with_a_county_of_land_is_its_core_alone(monkeypatch):
    monkeypatch.setattr(congested.geocode, "_towns", lambda: [["Greeley County", "KS", LAT, LON, 2.0e9]])
    (circle,) = congested._places()
    north_ft = (circle.bounds[3] - LAT) * congested.FT_PER_DEG_LAT
    assert north_ft == pytest.approx(congested.PLACE_RADIUS_M / 0.3048, rel=0.01)


def test_without_the_census_data_nothing_is_ruled_out(monkeypatch, tmp_path):
    # The caller then takes every point as congested: 91.119(b)'s 1,000 ft.
    monkeypatch.setattr(congested, "_HELD", {})
    monkeypatch.setattr(congested, "_RETRY_AT", 0.0)
    monkeypatch.setattr(congested, "URBAN_AREAS_PATH", tmp_path / "ua.zip")

    def offline(*args, **kwargs):
        raise requests.ConnectionError("offline")

    monkeypatch.setattr(congested.outside, "get", offline)
    assert congested.congested(np.array([LAT]), np.array([LON])) is None


def test_the_urban_areas_are_read_back_from_their_wkb_as_drawn(monkeypatch, tmp_path):
    import zipfile

    import shapefile

    base = tmp_path / "ua"
    with shapefile.Writer(str(base), shapeType=shapefile.POLYGON) as w:
        w.field("NAME", "C")
        w.poly([[[-93.3, 44.9], [-93.2, 44.9], [-93.2, 45.0], [-93.3, 45.0], [-93.3, 44.9]]])
        w.record("Minneapolis")
    archive = tmp_path / "ua.zip"
    with zipfile.ZipFile(archive, "w") as z:
        for part in ("shp", "shx", "dbf"):
            z.write(base.with_suffix(f".{part}"), f"ua.{part}")
    monkeypatch.setattr(congested, "URBAN_AREAS_PATH", archive)
    drawn = congested._urban_areas()
    monkeypatch.setattr(shapefile, "Reader", None)  # the shapefile is not read again
    assert [a.wkt for a in congested._urban_areas()] == [a.wkt for a in drawn]


def test_the_urban_areas_are_read_from_the_cycle_pack_made_of_their_download(monkeypatch, tmp_path):
    import zipfile

    import shapefile

    from wingtip import cycle_pack

    base = tmp_path / "ua"
    with shapefile.Writer(str(base), shapeType=shapefile.POLYGON) as w:
        w.field("NAME", "C")
        w.poly([[[-93.3, 44.9], [-93.2, 44.9], [-93.2, 45.0], [-93.3, 45.0], [-93.3, 44.9]]])
        w.record("Minneapolis")
    archive = tmp_path / "ua.zip"
    with zipfile.ZipFile(archive, "w") as z:
        for part in ("shp", "shx", "dbf"):
            z.write(base.with_suffix(f".{part}"), f"ua.{part}")
    monkeypatch.setattr(congested, "URBAN_AREAS_PATH", archive)
    drawn = congested._urban_areas()
    with shapefile.Writer(str(tmp_path / "empty"), shapeType=shapefile.POLYGON) as w:
        w.field("CLASS", "C")
    cycle_pack.write(
        cycle_pack.PACK_DIR,
        "2026-10-29",
        shp_path=tmp_path / "empty.shp",
        sua_held=[],
        sua_at=0.0,
        urban=drawn,
        urban_path=archive,
        tables={},
    )
    archive.with_suffix(".wkb.pkl").unlink()
    monkeypatch.setattr(shapefile, "Reader", None)  # nor the shapefile, nor its WKB beside it
    assert [a.wkt for a in congested._urban_areas()] == [a.wkt for a in drawn]
