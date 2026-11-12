"""The flow layer's sources and how a frame is made of them (app.flow,
app.flow_parts, app.flow_awc, app.flow_dafs): AWC's GFA wind and cloud
read from answers recorded 2026-11-12 (tests/flow), the IFI's and GTG's
records found in their recorded .idx, a part held from the same cycle not
fetched again, a source down served from the last good copy, and NOMADS
in AWC's place once AWC's part is past its margin. No network."""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest
from wingtip import weather_store

from app import flow, flow_awc, flow_dafs, flow_grid, flow_nomads, flow_parts

HERE = Path(__file__).parent / "flow"
NOW = datetime(2026, 11, 12, 12, 40, tzinfo=timezone.utc)
LEVELS = {
    "wind": [{"id": "sfc", "ft": None, "isa_hpa": None}, {"id": "060", "ft": 6000.0, "isa_hpa": 812.0}],
    "icing": [{"id": "060", "ft": 6000.0, "isa_hpa": 812.0}],
    "turbulence": [{"id": "max", "ft": None, "isa_hpa": None}],
    "temperature_hpa": [850.0, 800.0],
    "flight_levels_from_ft": 18000.0,
}


@pytest.fixture(autouse=True)
def _fresh(monkeypatch):
    monkeypatch.setattr(flow_parts, "_failed", {})
    monkeypatch.setattr(flow_nomads, "NOT_UP", {})
    monkeypatch.setattr(flow_dafs, "_NOT_UP", {})


def _cell(lat: float, lon: float) -> tuple[int, int]:
    return int(round((flow_grid.NORTH - lat) / 0.25)), int(round((lon - flow_grid.WEST) / 0.25))


def test_awcs_wind_from_280_is_mostly_from_the_west():
    answer = json.loads((HERE / "gfa_wind_sfc.json").read_text())
    grids = flow_awc.wind_grids(answer)
    # The recorded point at 36 N, 103 W: from 280 at 8 kt, so toward 100:
    # east 8 sin(80) = 7.88 kt, north -8 cos(80) = -1.39 kt.
    row, col = _cell(36.0, -103.0)
    assert grids["u"][row, col] == pytest.approx(7.88, abs=0.01)
    assert grids["v"][row, col] == pytest.approx(-1.39, abs=0.01)


def test_a_level_under_the_ground_is_nothing_not_calm():
    answer = {"features": [{"geometry": {"coordinates": [-105.0, 39.5]}, "properties": {"wdir": 999, "wspd": 0}}]}
    grids = flow_awc.wind_grids(answer)
    assert np.isnan(grids["u"]).all()


def test_awcs_cloud_cover_and_tops_are_read_by_the_engine():
    answer = json.loads((HERE / "gfa_cldlayer.json").read_text())
    grids = flow_awc.cloud_grids(answer)
    # The first recorded point, "BKN010/TOP FL450/CI ABV", BKN: six eighths.
    lon, lat = answer["features"][0]["geometry"]["coordinates"]
    row, col = _cell(lat, lon)
    assert grids["cloud"][row, col] == pytest.approx(75.0)
    assert grids["tops"][row, col] == pytest.approx(45000.0)


def test_a_past_hour_is_its_own_analysis_and_a_later_one_the_latest_cycles():
    latest = NOW.replace(minute=0)
    assert flow_awc.cycle_for(latest - timedelta(hours=1), latest) == (latest - timedelta(hours=1), 0)
    assert flow_awc.cycle_for(latest + timedelta(hours=4), latest) == (latest, 4)
    assert flow_awc.cycle_for(latest + timedelta(hours=19), latest) is None


def test_the_idx_finds_each_level_by_its_metres_msl():
    ifi = flow_dafs.parse_index((HERE / "ifi.idx").read_text())
    # 3,000 ft is 914.4 m: the record after 762 m.
    start, end = flow_dafs.find(ifi, flow_dafs.ICING_VAR, 3000.0)
    assert start == 27061587 and end == 27158231 - 1
    gtg = flow_dafs.parse_index((HERE / "gtg.idx").read_text())
    # The GTG writes 6,000 ft as 1828 m, not 1828.8.
    assert flow_dafs.find(gtg, flow_dafs.TURBULENCE_VAR, 6000.0)[0] == 7478713
    assert flow_dafs.find(gtg, flow_dafs.TURBULENCE_MAX[0], None)[0] == 0
    assert flow_dafs.find(gtg, flow_dafs.TURBULENCE_VAR, 6500.0) is None


def _held_awc(cycle: datetime) -> dict:
    name = "flow-2026111214-wind-held"
    weather_store.write_blob(name, b"png", ".png")
    return {"key": {"cycle": flow_nomads.iso(cycle), "forecast_hour": 2}, "files": {"wind": name}}


def test_an_awc_part_from_a_cycle_within_three_hours_is_not_fetched_again(monkeypatch):
    asked = []
    monkeypatch.setattr(flow_awc, "frame", lambda *a: asked.append(a))
    latest = NOW.replace(minute=0)
    held = _held_awc(latest - timedelta(hours=1))
    valid = latest + timedelta(hours=2)
    assert flow_parts.awc(valid, latest, LEVELS, held) is held
    assert asked == []
    # Three hours newer, it is.
    flow_parts.awc(valid, latest + timedelta(hours=2), LEVELS, held)
    assert len(asked) == 1


def test_awc_down_serves_the_last_good_copy_and_backs_off(monkeypatch):
    calls = []

    def down(*_):
        calls.append(1)
        raise flow_awc.AwcUnavailable("aviationweather.gov answered 503")

    monkeypatch.setattr(flow_awc, "frame", down)
    latest = NOW.replace(minute=0)
    held = _held_awc(latest - timedelta(hours=5))
    valid = latest + timedelta(hours=2)
    assert flow_parts.awc(valid, latest, LEVELS, held) is held
    assert flow_parts.backed_off("awc")
    # Backed off: the next fetch does not ask, and still serves the copy.
    assert flow_parts.awc(valid, latest, LEVELS, held) is held
    assert len(calls) == 1


def test_noaas_wind_stands_in_once_awcs_is_past_its_margin(monkeypatch):
    latest = NOW.replace(minute=0)
    stale = _held_awc(latest - timedelta(hours=4))
    asked = {}

    def nomads_part(valid, now, held, fallback=False):
        asked["fallback"] = fallback
        weather_store.write_blob("flow-n-wind", b"png", ".png")
        return {
            "key": {"gfs": {"run": "2026-11-12T06:00:00Z", "forecast_hour": 8}, "hrrr": None, "fallback": fallback},
            "files": {"wind": "flow-n-wind"},
        }

    monkeypatch.setattr(flow_parts, "awc", lambda *a: stale)
    monkeypatch.setattr(flow_parts, "dafs", lambda *a: None)
    monkeypatch.setattr(flow_parts, "aloft", lambda *a, **k: None)
    monkeypatch.setattr(flow_nomads, "part", nomads_part)
    frame = flow._frame(latest + timedelta(hours=2), NOW, None, None, LEVELS)
    assert asked["fallback"] is True
    assert frame["sources"]["wind"] == "nomads" and frame["files"]["wind"] == "flow-n-wind"


def test_a_fresh_awc_part_is_drawn_over_noaas(monkeypatch):
    latest = NOW.replace(minute=0)
    fresh = _held_awc(latest)
    monkeypatch.setattr(flow_parts, "awc", lambda *a: fresh)
    monkeypatch.setattr(flow_parts, "dafs", lambda *a: None)
    monkeypatch.setattr(flow_parts, "aloft", lambda *a, **k: None)
    monkeypatch.setattr(flow_nomads, "part", lambda valid, now, held, fallback=False: None)
    frame = flow._frame(latest + timedelta(hours=2), NOW, None, latest, LEVELS)
    assert frame["sources"]["wind"] == "awc"
