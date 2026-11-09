"""app.chart_refresh: the charts job a cycle's render starts keeps to its
night-time window -- except on a stack with no complete pyramid at all,
which renders at once -- the window arithmetic handles one that runs
past midnight, a request from the Dev console starts at once, and a cycle
pack with no overlay tiles asks the job for them whenever."""
import time

import pytest
from wingtip import charts, cycle_pack, vector_tiles

from app import chart_refresh
from app import dev_services


def _clock(hhmm: str) -> time.struct_time:
    return time.strptime(f"2026-10-29 {hhmm}", "%Y-%m-%d %H:%M")


@pytest.fixture
def started(monkeypatch):
    """The job containers started through the sidecar; no overlays due
    and no render running unless a test says so."""
    names: list = []
    monkeypatch.setattr(dev_services, "start", lambda name: names.append(name) or True)
    monkeypatch.setattr(chart_refresh, "AUTO_REFRESH", True)
    monkeypatch.setattr(chart_refresh, "overlays_due", lambda: False)
    monkeypatch.setattr(charts, "refresh_running", lambda: False)
    return names


def test_refresh_window_arithmetic():
    assert chart_refresh.in_window(_clock("02:30"), "01:00-06:00")
    assert not chart_refresh.in_window(_clock("14:00"), "01:00-06:00")
    assert not chart_refresh.in_window(_clock("06:00"), "01:00-06:00")   # the end is exclusive
    assert chart_refresh.in_window(_clock("23:30"), "22:00-05:00")       # past midnight
    assert chart_refresh.in_window(_clock("04:59"), "22:00-05:00")
    assert not chart_refresh.in_window(_clock("12:00"), "22:00-05:00")
    assert chart_refresh.in_window(_clock("12:00"), "")                   # blank: any time


def test_refresh_waits_for_the_window_while_an_older_cycle_serves(monkeypatch, started):
    monkeypatch.setattr(charts, "refresh_due", lambda: True)
    monkeypatch.setattr(charts, "serving_cycle", lambda: "09-03-2026")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "10-29-2026")
    monkeypatch.setattr(charts, "pyramid_complete", lambda cycle, kinds=None: cycle == "09-03-2026")

    monkeypatch.setattr(chart_refresh, "in_window", lambda *a, **k: False)
    chart_refresh.maybe_refresh()
    assert started == []

    monkeypatch.setattr(chart_refresh, "in_window", lambda *a, **k: True)
    chart_refresh.maybe_refresh()
    assert started == [chart_refresh.CHARTS_SERVICE]


def test_refresh_starts_at_once_when_nothing_complete_is_on_disk(monkeypatch, started):
    monkeypatch.setattr(charts, "refresh_due", lambda: True)
    monkeypatch.setattr(charts, "serving_cycle", lambda: "10-29-2026")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "10-29-2026")
    monkeypatch.setattr(charts, "pyramid_complete", lambda cycle, kinds=None: False)
    monkeypatch.setattr(chart_refresh, "in_window", lambda *a, **k: False)
    chart_refresh.maybe_refresh()
    assert started == [chart_refresh.CHARTS_SERVICE]


def test_nothing_starts_when_the_cycle_is_complete_or_rendering(monkeypatch, started):
    monkeypatch.setattr(charts, "refresh_due", lambda: False)
    chart_refresh.maybe_refresh()
    monkeypatch.setattr(charts, "refresh_due", lambda: True)
    monkeypatch.setattr(charts, "refresh_running", lambda: True)
    chart_refresh.maybe_refresh()
    assert started == []


def test_a_request_starts_the_job_at_once(monkeypatch, started):
    monkeypatch.setattr(chart_refresh, "in_window", lambda *a, **k: False)
    assert chart_refresh.refresh_now() is True
    assert started == [chart_refresh.CHARTS_SERVICE]


def test_a_served_cycle_whose_sectional_is_whole_waits_for_the_window(monkeypatch, started):
    """What serving_cycle serves is decided by the sectional; the check
    that let a refresh wait asked every kind, so one TAC short started a
    render in the middle of the day."""
    monkeypatch.setattr(charts, "refresh_due", lambda: True)
    monkeypatch.setattr(charts, "serving_cycle", lambda: "09-03-2026")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "10-29-2026")
    monkeypatch.setattr(charts, "pyramid_complete", lambda cycle, kinds=None: kinds == ("sec",))
    monkeypatch.setattr(chart_refresh, "in_window", lambda *a, **k: False)

    chart_refresh.maybe_refresh()

    assert started == []


def test_a_new_cycle_pack_asks_for_its_overlay_tiles_at_any_hour(monkeypatch, started):
    monkeypatch.setattr(chart_refresh, "overlays_due", lambda: True)
    monkeypatch.setattr(charts, "refresh_due", lambda: False)
    chart_refresh.maybe_refresh()
    assert started == [chart_refresh.OVERLAYS_SERVICE]
    monkeypatch.setattr(chart_refresh, "AUTO_REFRESH", False)   # a test stack, or AWS's own schedule
    chart_refresh.ask_for_overlays()
    assert started == [chart_refresh.OVERLAYS_SERVICE]


def test_the_overlays_are_due_until_the_index_names_the_pack(tmp_path, monkeypatch):
    class Pack:
        cycle, crc32 = "2026-10-29", 0xABCDEF01

    monkeypatch.setattr(vector_tiles, "TILES_DIR", tmp_path)
    monkeypatch.setattr(cycle_pack, "current", lambda pack_dir=None: None)
    assert not chart_refresh.overlays_due()                    # no pack yet: nothing to build from
    monkeypatch.setattr(cycle_pack, "current", lambda pack_dir=None: Pack())
    assert chart_refresh.overlays_due()
    name = vector_tiles.archive_name(Pack())
    (tmp_path / f"{name}.pmtiles").write_bytes(b"PMTiles")
    (tmp_path / vector_tiles.INDEX).write_text(f'{{"name": "{name}"}}')
    assert not chart_refresh.overlays_due()


def test_no_sidecar_is_none_not_started(monkeypatch):
    monkeypatch.setattr(dev_services, "SIDECAR_URL", None)
    assert chart_refresh.refresh_now() is None
