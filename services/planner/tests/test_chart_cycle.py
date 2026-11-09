"""app.chart_cycle: the next chart cycle's run is started in the window
once the current cycle is done and no render is running, at any hour to
prune after the swap, never with CHARTS_CYCLE_AUTO off; and its status
carries the next cycle's pyramid."""
from datetime import date

import pytest
from wingtip import chart_next, charts

from app import chart_refresh
from app.chart_cycle import check
from app import dev_services


def _plan(staging=True):
    return chart_next.Plan(in_force=date(2026, 10, 29), next=date(2026, 12, 24),
                           stage_from=date(2026, 12, 17), lead_days=7, staging=staging)


@pytest.fixture
def started(monkeypatch):
    names: list = []
    monkeypatch.setattr(dev_services, "start", lambda name: names.append(name) or True)
    monkeypatch.setattr(check, "AUTO", True)
    monkeypatch.setattr(charts, "refresh_running", lambda: False)
    monkeypatch.setattr(chart_next, "read_status", lambda root=None: None)
    return names


def test_staged_in_the_window_once_the_current_cycle_is_done(monkeypatch, started):
    monkeypatch.setattr(chart_next, "question", lambda **kw: (_plan(), "stage"))
    monkeypatch.setattr(charts, "refresh_due", lambda: False)

    monkeypatch.setattr(chart_refresh, "in_window", lambda *a, **k: False)
    assert check.maybe_stage_next() is None and started == []
    # The current cycle still due: that one first.
    monkeypatch.setattr(chart_refresh, "in_window", lambda *a, **k: True)
    monkeypatch.setattr(charts, "refresh_due", lambda: True)
    assert check.maybe_stage_next() is None and started == []
    # A render running: left to it.
    monkeypatch.setattr(charts, "refresh_due", lambda: False)
    monkeypatch.setattr(charts, "refresh_running", lambda: True)
    assert check.maybe_stage_next() is None and started == []
    monkeypatch.setattr(charts, "refresh_running", lambda: False)
    assert check.maybe_stage_next() == "stage"
    assert started == [check.SERVICE]


def test_after_the_swap_the_old_cycle_is_deleted_at_any_hour(monkeypatch, started):
    monkeypatch.setattr(chart_next, "question", lambda **kw: (_plan(False), "prune"))
    monkeypatch.setattr(chart_refresh, "in_window", lambda *a, **k: False)
    assert check.maybe_stage_next() == "prune"
    assert started == [check.SERVICE]


def test_the_switch_off_starts_nothing(monkeypatch, started):
    monkeypatch.setattr(check, "AUTO", False)
    monkeypatch.setattr(chart_next, "question", lambda **kw: pytest.fail("asked with the switch off"))
    assert check.maybe_stage_next() is None and started == []


def test_the_status_carries_the_next_cycles_pyramid(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(chart_next, "report", lambda auto, lead: {"cycle": "12-24-2026", "state": "staging"})
    charts._write_pyramid_status("12-24-2026", {"kind": "sec", "zooms": [3], "sheets": [], "finished_at": None,
                                                "tiles": 0, "current_pass": {"done": 3, "total": 53}})
    status = check.status()
    assert status["state"] == "staging" and status["progress"]["sec"]["complete"] is False
