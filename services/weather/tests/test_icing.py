"""The forecast icing the planner reads along a route (app.icing): the IFI's
severity from DAFS on NOMADS put on the stored grid, each cell the worst
of the 3 km points in it and -1 where none falls; one Range request a file
for the levels kept; a whole cycle stored once, the one before kept and
older ones gone. The fixtures: tests/icing/ifi.idx, the 15Z cycle's hour 3
of 2026-11-27 as NOMADS listed it, and its first two severity records
(500 and 1,000 ft MSL) as NOMADS sent them."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest
from wingtip import weather_store

from app import flow_dafs, icing

FIXTURES = Path(__file__).parent / "icing"
BODY = (FIXTURES / "ifi_500_1000ft.grib2").read_bytes()
RECORDS = flow_dafs.parse_index((FIXTURES / "ifi.idx").read_text())
NOW = datetime(2026, 11, 27, 18, 10, tzinfo=timezone.utc)


def _cell(lat: float, lon: float) -> tuple[int, int]:
    return round((lat - icing.SOUTH) / icing.STEP_DEG), round((lon - icing.WEST) / icing.STEP_DEG)


def test_the_levels_kept_are_the_planners_up_to_the_ifis_top():
    kept = icing.levels_kept()
    assert kept[:3] == [500, 1000, 2000] and kept[-3:] == [26000, 28000, 30000]
    assert len(kept) == 29


def test_a_point_falls_in_its_cell_and_one_off_the_grid_in_none():
    lats = np.array([icing.SOUTH, icing.SOUTH + icing.STEP_DEG, 10.0])
    lons = np.array([icing.WEST, icing.WEST + 2 * icing.STEP_DEG, -100.0])
    assert icing.cells(lats, lons).tolist() == [0, icing.COLS + 2, -1]


def test_the_severity_is_the_worst_in_each_cell_and_none_off_the_domain():
    grid = icing.read_levels(BODY, [500, 1000, 2000])
    assert grid.shape == (3, icing.ROWS, icing.COLS) and grid.dtype == np.int8
    # At 500 ft the file has 380 trace points and 19 light (the fixture's
    # counts, read straight from it): the light ones survive the worst.
    assert grid[0].max() == 2 and (grid[0] >= 1).sum() > 0
    # At 1,000 ft, 51 points moderate.
    assert grid[1].max() == 3
    # Kansas is on the IFI's domain and clear at 500 ft; the far north-west
    # corner of the stored grid is off it: no forecast, never "none".
    assert grid[0][_cell(38.0, -98.0)] == 0
    assert grid[0][_cell(53.0, -134.25)] == icing.NONE
    # A level the block lacks is no forecast everywhere.
    assert (grid[2] == icing.NONE).all()


def test_one_request_takes_the_levels_kept():
    span = icing._span(RECORDS, icing.levels_kept())
    assert span == (28085694, None)  # the 500 ft record to the file's end
    assert icing._span(RECORDS[:120], icing.levels_kept()) is None  # no severity at all


@pytest.fixture
def nomads(monkeypatch):
    """NOMADS with the 15Z cycle whole (17Z and 16Z not yet): every hour
    the fixture's records, each Range answered with the fixture body."""
    asked = []
    whole = {datetime(2026, 11, 27, 15, tzinfo=timezone.utc)}

    def index(product, cycle, step):
        return RECORDS if cycle in whole else None

    def get(url, span):
        asked.append(url)
        return BODY

    monkeypatch.setattr(flow_dafs, "_index", index)
    monkeypatch.setattr(flow_dafs, "_range", get)
    return asked, whole


def test_a_whole_cycle_is_stored_once(nomads):
    asked, _ = nomads
    assert icing.fetch_latest(NOW) is True
    record = weather_store.read(icing.STORE_NAME)
    assert record.data["cycle"] == "2026-11-27T15:00:00Z"
    assert record.data["levels_ft"] == icing.levels_kept()
    assert record.data["grid"]["rows"] == icing.ROWS and record.data["grid"]["step_deg"] == icing.STEP_DEG
    hours = record.data["hours"]
    assert len(hours) == icing.LAST_STEP + 1 and len(asked) == icing.LAST_STEP + 1
    assert hours[3]["valid"] == "2026-11-27T18:00:00Z"
    assert weather_store.read_array(hours[3]["array"]).shape == (29, icing.ROWS, icing.COLS)
    assert record.until == (datetime(2026, 11, 27, 15, tzinfo=timezone.utc) + timedelta(hours=icing.LAST_STEP, minutes=30)).timestamp()
    # The same cycle again is not fetched again.
    assert icing.fetch_latest(NOW + timedelta(minutes=15)) is False
    assert len(asked) == icing.LAST_STEP + 1


def test_a_newer_cycle_keeps_the_one_before_and_drops_older(nomads):
    _, whole = nomads
    stale = weather_store.write_array(f"{icing.ARRAY_PREFIX}2026112712-00", np.zeros((1, 1, 1), dtype=np.int8))
    icing.fetch_latest(NOW)
    whole.add(datetime(2026, 11, 27, 16, tzinfo=timezone.utc))
    assert icing.fetch_latest(NOW + timedelta(hours=1)) is True
    names = {p.stem for p in weather_store.store_dir().glob(f"{icing.ARRAY_PREFIX}*.npy")}
    assert f"{icing.ARRAY_PREFIX}2026112716-00" in names and f"{icing.ARRAY_PREFIX}2026112715-00" in names
    assert not stale.exists()


def test_no_whole_cycle_and_none_stored_is_unavailable(nomads):
    _, whole = nomads
    whole.clear()
    with pytest.raises(icing.IcingUnavailable):
        icing.fetch_latest(NOW)


def test_nomads_down_is_unavailable(monkeypatch):
    def down(product, cycle, step):
        raise flow_dafs.DafsUnavailable("NOMADS did not answer")

    monkeypatch.setattr(flow_dafs, "_index", down)
    with pytest.raises(icing.IcingUnavailable, match="NOMADS"):
        icing.fetch_latest(NOW)
