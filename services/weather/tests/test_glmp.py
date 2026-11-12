"""GLMP fetched from NOMADS, read and stored (app.glmp), and read back as the
planner reads it (wingtip.glmp): GRIB2 files in GLMP's own shape
(tests/glmp) -- the National Blend of Models' Lambert conformal grid
(R 6,371,200 m, 2,539.703 m cells) cut to four points by three from 42.30 N
88.10 W, round Campbell Airport (C81), packed as GLMP packs (complex
packing with spatial differencing), valid 2026-10-10 21:00Z -- written with
ECMWF's eccodes 2.49. NOMADS is stubbed. Moved from the planner's tests
(#535).

- cig_1500ft: every point 457.2 m, 1,500 ft.
- cig_none: every point -100, GLMP's no ceiling.
- cig_rows: 100 to 1,200 m, west to east and south to north.
- vis_10sm: every point 16,128 m, GLMP's most (10 sm).
"""

from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from pyproj import Proj
from wingtip import glmp as planner_glmp
from wingtip import weather_store

from app import glmp

FIXTURES = Path(__file__).parent / "glmp"
FIRST = (42.30, -88.10)
DX = 2539.703
NOW = datetime(2026, 10, 10, 22, 40, tzinfo=timezone.utc)


def _grib(name: str) -> bytes:
    return (FIXTURES / f"{name}.grib2").read_bytes()


def _point(i: int, j: int) -> tuple[float, float]:
    """The grid point i east and j north of the first, (lat, lon)."""
    proj = Proj(proj="lcc", lon_0=265, lat_0=25, lat_1=25, lat_2=25, R=6371200)
    x0, y0 = proj(FIRST[1], FIRST[0])
    lon, lat = proj(x0 + i * DX, y0 + j * DX, inverse=True)
    return lat, lon


@pytest.fixture
def nomads(monkeypatch):
    """NOMADS with the issues in `up` (by their hour), each answering the
    grids in `grids`; the URLs asked for, in `asked`."""
    monkeypatch.setattr(glmp, "_NOT_UP", {})
    monkeypatch.setattr(planner_glmp, "_HELD", {})
    state = {"up": {"21"}, "asked": [], "grids": {"cig": _grib("cig_1500ft"), "vis": _grib("vis_10sm")}}

    class Answer:
        def __init__(self, status, content=b""):
            self.status_code, self.content, self.ok = status, content, status < 400

    def get(url, headers=None, timeout=None):
        state["asked"].append(url)
        hour = url.split(".t")[1][:2]
        field = url.split("hr00_")[1].split(".")[0]
        if state.get("down"):
            raise requests.ConnectionError("no route to NOMADS")
        return Answer(200, state["grids"][field]) if hour in state["up"] else Answer(404)

    monkeypatch.setattr(glmp.outside, "get", get)
    return state


def test_the_weather_modelled_at_a_point(nomads):
    assert glmp.fetch_latest(NOW)
    weather = planner_glmp.at(*_point(1, 1), now=NOW)
    assert weather == {"ceiling_ft": 1500.0, "visibility_sm": 10.0, "flight_category": "MVFR", "valid_at": "2026-10-10T21:00:00Z"}


def test_a_point_is_read_from_its_own_grid_point_rows_south_first(nomads):
    nomads["grids"]["cig"] = _grib("cig_rows")
    glmp.fetch_latest(NOW)
    for i, j in ((0, 0), (2, 1), (3, 2)):
        metres = (j * 4 + i + 1) * 100
        assert planner_glmp.at(*_point(i, j), now=NOW)["ceiling_ft"] == round(metres * 3.28084, -2)


def test_no_ceiling_is_none_and_vfr(nomads):
    nomads["grids"]["cig"] = _grib("cig_none")
    glmp.fetch_latest(NOW)
    weather = planner_glmp.at(*_point(1, 1), now=NOW)
    assert weather["ceiling_ft"] is None and weather["flight_category"] == "VFR"


def test_the_latest_issue_posted_is_fetched_once(nomads):
    nomads["up"] = {"22", "21"}
    assert glmp.fetch_latest(NOW)
    assert not glmp.fetch_latest(NOW)
    # 22:40: the 22:30 issue, up since about 22:32; asked for once.
    assert [u.split("/")[-1] for u in nomads["asked"]] == ["glmp.t2230z.hr00_cig.g.co.grib2", "glmp.t2230z.hr00_vis.g.co.grib2"]
    assert weather_store.read("glmp").meta["issued"] == "2026-10-10T22:30Z"


def test_an_issue_not_up_yet_falls_back_to_the_one_before_and_is_not_asked_for_at_every_look(nomads):
    glmp.fetch_latest(NOW)
    assert nomads["asked"][0].endswith("t2230z.hr00_cig.g.co.grib2") and nomads["asked"][-1].endswith("t2130z.hr00_vis.g.co.grib2")
    asked = len(nomads["asked"])
    glmp.fetch_latest(NOW)
    assert len(nomads["asked"]) == asked


def test_with_no_recent_issue_or_no_nomads_it_says_so(nomads):
    nomads["up"] = set()
    with pytest.raises(glmp.GlmpUnavailable):
        glmp.fetch_latest(NOW)
    nomads["down"] = True
    glmp._NOT_UP.clear()
    with pytest.raises(glmp.GlmpUnavailable):
        glmp.fetch_latest(NOW)
    with pytest.raises(planner_glmp.GlmpUnavailable):
        planner_glmp.at(*_point(1, 1), now=NOW)


def test_with_nomads_down_the_issue_stored_is_served_while_it_is_one_of_the_last_three(nomads):
    """A momentary loss of NOMADS used to leave a field with no modelled
    weather as soon as a newer issue was due; the stored one is served on,
    its valid time said, until it is as old as a late issue may be."""
    glmp.fetch_latest(NOW)  # the 21:30 issue, stored
    nomads["down"] = True
    later = NOW.replace(hour=23)  # 23:40: the 23:30 issue is due
    with pytest.raises(glmp.GlmpUnavailable):
        glmp.fetch_latest(later)
    assert planner_glmp.at(*_point(1, 1), now=later)["valid_at"] == "2026-10-10T21:00:00Z"
    with pytest.raises(planner_glmp.GlmpUnavailable):
        planner_glmp.at(*_point(1, 1), now=datetime(2026, 10, 11, 1, 40, tzinfo=timezone.utc))


def test_an_older_issues_grids_are_removed_once_a_newer_one_is_stored(nomads):
    glmp.fetch_latest(NOW.replace(hour=21, minute=40))  # the 21:30 issue
    nomads["up"] = {"22", "21", "20", "19"}
    glmp.fetch_latest(NOW.replace(hour=23, minute=40))  # the 22:30 one (23:30 not up): 21:30's kept beside it
    nomads["up"].add("23")
    glmp.fetch_latest(NOW.replace(hour=23, minute=50))
    kept = sorted(p.stem for p in weather_store.store_dir().glob("glmp-*.npy"))
    assert kept == ["glmp-cig-2026101022", "glmp-cig-2026101023", "glmp-vis-2026101022", "glmp-vis-2026101023"]
