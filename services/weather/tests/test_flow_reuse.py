"""The flow layer's model files are not downloaded or decoded again for
what is already held (waste-server.md E and F): a model's file on the
output grid is kept in the store, so a frame where only the other model
has a new run blends the kept grid in; and the GFS's aloft files, which
neighbouring hours round to the same 3-hourly step of, are made once for
the frames that share them. NOMADS is stubbed."""

from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from wingtip import weather_store

from app import flow, flow_aloft, flow_grid, flow_nomads, flow_parts

NOW = datetime(2026, 11, 12, 12, 40, tzinfo=timezone.utc)
LEVELS = {"wind": [{"id": "060", "ft": 6000.0, "isa_hpa": 812.0}], "temperature_hpa": [850.0, 800.0], "flight_levels_from_ft": 18000.0}


@pytest.fixture(autouse=True)
def _fresh(monkeypatch):
    monkeypatch.setattr(flow_parts, "_failed", {})
    monkeypatch.setattr(flow_parts, "_ALOFT_MADE", flow_parts.LRUCache(maxsize=2))
    monkeypatch.setattr(flow_nomads, "NOT_UP", {})


def _grid(value: float) -> dict:
    return {"temp": np.full((flow_grid.ROWS, flow_grid.COLS), value, dtype=np.float32)}


def test_a_model_held_from_its_run_is_read_back_not_fetched_again(monkeypatch):
    asked, decoded = [], []

    def get(model):
        def fetch(run, step, groups):
            asked.append((model, run, step))
            return f"{model}-{run:%H}-{step}".encode()

        return fetch

    def model_grid(model, source, body):
        decoded.append(body)
        return _grid(280.0 if model == "gfs" else 290.0)

    monkeypatch.setattr(flow_nomads, "GET", {"gfs": get("gfs"), "hrrr": get("hrrr")})
    monkeypatch.setattr(flow_nomads, "_model_grid", model_grid)
    monkeypatch.setattr(flow_grid, "png", lambda field, kept: b"png")
    valid = NOW.replace(minute=0)
    first = flow_nomads.part(valid, NOW, None)
    assert {m for m, *_ in asked} == {"gfs", "hrrr"} and len(decoded) == 2
    assert len(first["grids"]) == 2
    # An hour on, a newer HRRR run and the same GFS run: only the HRRR's
    # file is asked for and decoded; the GFS's grid is read back.
    later = NOW + timedelta(hours=1)
    asked.clear()
    decoded.clear()
    second = flow_nomads.part(valid, later, first)
    assert [m for m, *_ in asked] == ["hrrr"] and len(decoded) == 1
    assert second["key"]["gfs"] == first["key"]["gfs"] and second["key"]["hrrr"] != first["key"]["hrrr"]
    assert flow_nomads.grid_name("gfs", first["key"]["gfs"], False) in second["grids"]


def test_the_pass_keeps_only_the_grids_its_frames_name(monkeypatch):
    kept = flow_nomads.grid_name("gfs", {"run": "2026-11-12T06:00:00Z", "forecast_hour": 6}, False)
    gone = flow_nomads.grid_name("gfs", {"run": "2026-11-11T06:00:00Z", "forecast_hour": 6}, False)
    for name in (kept, gone):
        flow_nomads._keep_grid(name, _grid(280.0))
    frame = {"valid": "2026-11-12T12:00:00Z", "parts": {"nomads": {"files": {}, "grids": [kept]}}, "files": {}}
    monkeypatch.setattr(flow, "ask", lambda name: {**LEVELS, "icing": [], "turbulence": []})
    monkeypatch.setattr(flow, "_frame", lambda *a: frame)
    monkeypatch.setattr(flow_parts, "backed_off", lambda source: True)
    flow.fetch(NOW)
    assert flow_nomads._held_grid(kept) is not None and flow_nomads._held_grid(gone) is None
    assert not weather_store.blob_exists(gone, flow_nomads.GRID_FIELDS)


def test_hours_that_share_a_gfs_step_download_its_aloft_files_once(monkeypatch):
    asked = []
    half = {"temp-060": np.full((flow_grid.HALF_ROWS, flow_grid.HALF_COLS), 5.0, dtype=np.float32)}

    def column(grouped, run, step, hpa, wind=False):
        asked.append(("column", run, step))
        return b"column"

    def world(grouped, run, step):
        asked.append(("world", run, step))
        return None

    monkeypatch.setattr(flow_aloft, "column_body", column)
    monkeypatch.setattr(flow_aloft, "world_body", world)
    monkeypatch.setattr(flow_aloft, "at_levels_half", lambda *_: half)

    def step(valid):
        return flow_aloft.nearest_step(flow_nomads.tries(valid, NOW)["gfs"][0][1])

    hour = NOW.replace(minute=0)
    valid = next(hour + timedelta(hours=h) for h in range(6) if step(hour + timedelta(hours=h)) == step(hour + timedelta(hours=h + 1)))
    one = flow_parts.aloft(valid, NOW, LEVELS, None)
    two = flow_parts.aloft(valid + timedelta(hours=1), NOW, LEVELS, None)
    assert [a[0] for a in asked] == ["column", "world"]
    assert one["key"] == two["key"] and one["files"] != two["files"]
    assert weather_store.blob_exists(two["files"]["temp-060"], ".png")
