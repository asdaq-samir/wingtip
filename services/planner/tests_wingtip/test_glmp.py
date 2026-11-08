"""wingtip.glmp: the NWS's Gridded LAMP as the weather service stores it
(services/weather/app/glmp.py, whose tests read the GRIB2 files): the
National Blend of Models' Lambert conformal grid (R 6,371,200 m, 2,539.703
m cells) cut to four points by three from 42.30 N 88.10 W, round Campbell
Airport (C81), valid 2026-10-10 21:00Z, the values written here."""
from datetime import datetime, timezone

import numpy as np
import pytest
from pyproj import Proj

from wingtip import glmp, weather_store

FIRST = (42.30, -88.10)
DX = 2539.703
PROJ = "+proj=lcc +lon_0=265 +lat_0=25 +lat_1=25 +lat_2=25 +R=6371200 +units=m +no_defs"
NOW = datetime(2026, 10, 10, 22, 40, tzinfo=timezone.utc)
ISSUED = datetime(2026, 10, 10, 21, 30, tzinfo=timezone.utc).timestamp()


def _point(i: int, j: int) -> tuple[float, float]:
    """The grid point i east and j north of the first, (lat, lon)."""
    proj = Proj(proj="lcc", lon_0=265, lat_0=25, lat_1=25, lat_2=25, R=6371200)
    x0, y0 = proj(FIRST[1], FIRST[0])
    lon, lat = proj(x0 + i * DX, y0 + j * DX, inverse=True)
    return lat, lon


def _store(ceiling_m, visibility_m=16128.0) -> None:
    """One issue stored as the service stores it: each field's grid, its
    values south and west first."""
    x0, y0 = Proj(PROJ)(FIRST[1], FIRST[0])
    grids = {}
    for field, values in (("cig", ceiling_m), ("vis", visibility_m)):
        array = np.broadcast_to(np.asarray(values, dtype=np.float32), (3, 4)).copy()
        name = f"glmp-{field}-2026101021"
        weather_store.write_array(name, array)
        grids[field] = {"x0": x0, "dx": DX, "y0": y0, "dy": DX, "nx": 4, "ny": 3, "proj": PROJ,
                        "valid": "2026-10-10T21:00:00Z", "array": name}
    # Served while it is one of the last three issues posted.
    weather_store.write("glmp", grids, fetched_at=ISSUED + 300, until=ISSUED + 3 * 3600 + 300,
                        meta={"issued": "2026-10-10T21:30:00Z"})


@pytest.fixture(autouse=True)
def _nothing_held(monkeypatch):
    monkeypatch.setattr(glmp, "_HELD", {})


def test_the_weather_modelled_at_a_point():
    _store(457.2)
    weather = glmp.at(*_point(1, 1), now=NOW)
    assert weather == {"ceiling_ft": 1500.0, "visibility_sm": 10.0, "flight_category": "MVFR", "valid_at": "2026-10-10T21:00:00Z"}


def test_a_point_is_read_from_its_own_grid_point_rows_south_first():
    _store([[(j * 4 + i + 1) * 100 for i in range(4)] for j in range(3)])
    for i, j in ((0, 0), (2, 1), (3, 2)):
        metres = (j * 4 + i + 1) * 100
        assert glmp.at(*_point(i, j), now=NOW)["ceiling_ft"] == round(metres * 3.28084, -2)


def test_no_ceiling_is_none_and_vfr():
    _store(-100.0)
    weather = glmp.at(*_point(1, 1), now=NOW)
    assert weather["ceiling_ft"] is None and weather["flight_category"] == "VFR"


def test_off_the_grid_is_nothing():
    _store(457.2)
    assert glmp.at(46.8421, -92.1936, now=NOW) is None


def test_with_no_issue_stored_or_one_too_old_it_says_so():
    with pytest.raises(glmp.GlmpUnavailable):
        glmp.at(*_point(1, 1), now=NOW)
    _store(457.2)
    # 23:40, the 23:30 issue due and not stored: the 21:30 is still one of the last three.
    assert glmp.at(*_point(1, 1), now=NOW.replace(hour=23))["valid_at"] == "2026-10-10T21:00:00Z"
    with pytest.raises(glmp.GlmpUnavailable):
        glmp.at(*_point(1, 1), now=datetime(2026, 10, 11, 1, 40, tzinfo=timezone.utc))


@pytest.mark.parametrize("ceiling, visibility, category", [
    (None, 10, "VFR"), (3100, 6, "VFR"),
    (3000, 10, "MVFR"), (None, 5, "MVFR"), (1000, 10, "MVFR"),
    (999, 10, "IFR"), (None, 2.9, "IFR"), (500, 10, "IFR"),
    (499, 10, "LIFR"), (None, 0.9, "LIFR"),
])
def test_flight_categories_are_the_aims(ceiling, visibility, category):
    assert glmp.flight_category(ceiling, visibility) == category
