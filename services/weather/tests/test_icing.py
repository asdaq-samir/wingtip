"""The icing the planner reads along a route (app.icing, app.icing_cip,
app.icing_grid): the NWS's severity put on the stored grid, each cell the
worst of the 3 km points in it and -1 where none falls; the IFI's hours 1
to 15 one Range request a file; the CIP's severity found at the end of its
file without an index; each stored when newer, one failing leaving the
other stored. The fixtures (tests/icing), as NOMADS sent them 2026-11-27:
the IFI's 15Z hour 3 .idx and its first two severity records (500 and
1,000 ft MSL); the CIP's 18Z last two SLD records and last two severity
records (29,500 and 30,000 ft)."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest
from wingtip import weather_store

from app import flow_dafs, icing, icing_cip, icing_grid

FIXTURES = Path(__file__).parent / "icing"
BODY = (FIXTURES / "ifi_500_1000ft.grib2").read_bytes()
CIP = (FIXTURES / "cip_sld_and_severity_top.grib2").read_bytes()
RECORDS = flow_dafs.parse_index((FIXTURES / "ifi.idx").read_text())
NOW = datetime(2026, 11, 27, 18, 20, tzinfo=timezone.utc)
G = icing_grid


def _cell(lat: float, lon: float) -> tuple[int, int]:
    return round((lat - G.SOUTH) / G.STEP_DEG), round((lon - G.WEST) / G.STEP_DEG)


def test_the_levels_kept_are_the_planners_up_to_the_products_top():
    kept = G.levels_kept()
    assert kept[:3] == [500, 1000, 2000] and kept[-3:] == [26000, 28000, 30000]
    assert len(kept) == 29


def test_a_point_falls_in_its_cell_and_one_off_the_grid_in_none():
    lats = np.array([G.SOUTH, G.SOUTH + G.STEP_DEG, 10.0])
    lons = np.array([G.WEST, G.WEST + 2 * G.STEP_DEG, -100.0])
    assert G.cells(lats, lons).tolist() == [0, G.COLS + 2, -1]


def test_the_severity_is_the_worst_in_each_cell_and_none_off_the_domain():
    grid = G.read_levels(BODY, [500, 1000, 2000])
    assert grid.shape == (3, G.ROWS, G.COLS) and grid.dtype == np.int8
    # At 500 ft the file has 380 trace points and 19 light: the light survive.
    assert grid[0].max() == 2 and (grid[0] >= 1).sum() > 0
    assert grid[1].max() == 3  # at 1,000 ft, 51 points moderate
    # Kansas is on the domain and clear at 500 ft; the far north-west
    # corner of the stored grid is off it: no forecast, never "none".
    assert grid[0][_cell(38.0, -98.0)] == 0
    assert grid[0][_cell(53.0, -134.25)] == G.NONE
    assert (grid[2] == G.NONE).all() and not G.complete(grid)  # a level the run lacks


def test_the_cips_severity_is_found_at_the_end_of_its_file_with_no_index():
    # From the file's whole end, and from a tail that starts inside a record.
    for body in (CIP, CIP[100:]):
        run = icing_cip.severity_run(body)
        assert run is not None and G.parameter(run, 0) == G.SEVERITY and len(run) == len(CIP) - 341 - 190
    grid = G.read_levels(icing_cip.severity_run(CIP), [30000])
    assert G.complete(grid) and grid.max() >= 0
    # Its bitmap: no value is no forecast, never "none".
    assert icing_cip.severity_run(b"not grib") is None


def test_a_cip_tail_short_of_every_level_takes_the_whole_file(monkeypatch):
    asked = []

    def get(url, tail):
        asked.append(tail)
        return CIP[-3000:] if tail else CIP

    monkeypatch.setattr(icing_cip, "TAIL_BYTES", 3000)
    monkeypatch.setattr(icing_cip, "_get", get)
    assert G.complete(icing_cip._read("u", [29500, 30000]))
    assert asked == [3000, None]
    with pytest.raises(icing_cip.CipUnavailable):
        icing_cip._read("u", [500, 30000])


def test_one_request_takes_the_ifis_levels_kept():
    assert icing._span(RECORDS, G.levels_kept()) == (28085694, None)  # 500 ft to the end
    assert icing._span(RECORDS[:120], G.levels_kept()) is None


@pytest.fixture
def nomads(monkeypatch):
    """NOMADS with the IFI's 15Z cycle whole and the CIP's 17Z hour: each
    IFI Range answered with the fixture, the CIP's grid made here."""
    asked, posted = [], {"ifi": {datetime(2026, 11, 27, 15, tzinfo=timezone.utc)}, "cip": {datetime(2026, 11, 27, 17, tzinfo=timezone.utc)}}

    def index(product, cycle, step):
        return RECORDS if cycle in posted["ifi"] else None

    def get(url, span):
        asked.append(url)
        return BODY

    def cip(now, held, levels):
        hour = max(posted["cip"], default=None)
        if hour is None or (held is not None and hour <= held):
            return None
        return hour, np.zeros((len(levels), G.ROWS, G.COLS), dtype=np.int8)

    monkeypatch.setattr(flow_dafs, "_index", index)
    monkeypatch.setattr(flow_dafs, "_range", get)
    monkeypatch.setattr(icing_cip, "newest", cip)
    return asked, posted


def test_the_cip_hour_and_the_ifis_hours_one_to_fifteen_are_stored_once(nomads):
    asked, _ = nomads
    assert icing.fetch_latest(NOW) is True
    record = weather_store.read(icing.STORE_NAME)
    assert record.data["cycle"] == "2026-11-27T15:00:00Z" and record.data["analysis"] == "2026-11-27T17:00:00Z"
    hours = record.data["hours"]
    assert [(h["valid"][11:13], h["source"]) for h in hours[:3]] == [("16", "ifi"), ("17", "cip"), ("17", "ifi")]
    assert len(asked) == icing.LAST_STEP and len(hours) == icing.LAST_STEP + 1
    assert all("/dafs.t15z.ifi.3km.conus.f000" not in u for u in asked)  # the IFI has no hour 0
    assert weather_store.read_array(hours[0]["array"]).shape == (29, G.ROWS, G.COLS)
    assert record.until == (datetime(2026, 11, 27, 15, tzinfo=timezone.utc) + timedelta(hours=icing.LAST_STEP, minutes=30)).timestamp()
    assert icing.fetch_latest(NOW + timedelta(minutes=15)) is False
    assert len(asked) == icing.LAST_STEP


def test_a_newer_cip_alone_is_stored_with_the_ifi_held(nomads):
    asked, posted = nomads
    stale = weather_store.write_array(f"{icing.ARRAY_PREFIX}2026112712-01", np.zeros((1, 1, 1), dtype=np.int8))
    icing.fetch_latest(NOW)
    posted["cip"].add(datetime(2026, 11, 27, 18, tzinfo=timezone.utc))
    assert icing.fetch_latest(NOW + timedelta(minutes=30)) is True
    record = weather_store.read(icing.STORE_NAME)
    assert record.data["analysis"] == "2026-11-27T18:00:00Z" and record.data["cycle"] == "2026-11-27T15:00:00Z"
    assert len(asked) == icing.LAST_STEP  # the IFI not fetched again
    names = {p.stem for p in weather_store.store_dir().glob(f"{icing.ARRAY_PREFIX}*.npy")}
    assert {f"{icing.ARRAY_PREFIX}cip-2026112718", f"{icing.ARRAY_PREFIX}cip-2026112717"} <= names
    assert not stale.exists()


def test_the_ifi_down_still_stores_the_cip(nomads, monkeypatch):
    def down(product, cycle, step):
        raise flow_dafs.DafsUnavailable("NOMADS did not answer")

    monkeypatch.setattr(flow_dafs, "_index", down)
    assert icing.fetch_latest(NOW) is True
    record = weather_store.read(icing.STORE_NAME)
    assert record.data["cycle"] is None and [h["source"] for h in record.data["hours"]] == ["cip"]


def test_both_down_is_unavailable(nomads, monkeypatch):
    def down(*args):
        raise flow_dafs.DafsUnavailable("NOMADS did not answer")

    def cip_down(*args):
        raise icing_cip.CipUnavailable("NOMADS did not answer")

    monkeypatch.setattr(flow_dafs, "_index", down)
    monkeypatch.setattr(icing_cip, "newest", cip_down)
    with pytest.raises(icing.IcingUnavailable, match="NOMADS"):
        icing.fetch_latest(NOW)
