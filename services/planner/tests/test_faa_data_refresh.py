"""The FAA's NASR and obstacle files are fetched again on their own switch
(FAA_DATA_AUTO_REFRESH), not the charts': production draws no charts
(CHARTS_AUTO_REFRESH=0), and gated on that it never fetched a new NASR
cycle -- airports, frequencies, navaids, Class B/C/D -- or obstacle file."""

import pytest
from app import chart_refresh, warm_up as main
from wingtip import faa_editions
from wingtip.config import Settings


@pytest.fixture
def editions(monkeypatch):
    """The folders refresh_editions was asked about; nothing new found."""
    asked: list = []
    monkeypatch.setattr(faa_editions, "refresh_editions", lambda folder: asked.append(folder) or [])
    return asked


def test_the_editions_are_checked_with_the_charts_off_and_the_switch_on(monkeypatch, editions):
    monkeypatch.setattr(chart_refresh, "AUTO_REFRESH", False)
    monkeypatch.setattr(main, "FAA_DATA_AUTO_REFRESH", True)
    main.check_faa_editions()
    assert editions == [main.altitude.DEFAULT_FAA_CACHE_DIR]


def test_the_checks_are_jobs_on_the_planners_scheduler(monkeypatch):
    """Each check a job every EDITIONS_CHECK_EVERY_S (the chart cycle every
    CHECK_EVERY_S)."""
    monkeypatch.setattr(main, "REGISTRY_REFRESH", True)
    on = main.schedule.scheduler()
    main._schedule_checks(on)
    jobs = {job.id: job for job in on.get_jobs()}
    # The next cycle's NASR and CIFP put in place at 0902Z (faa-changeover, faa-procedures: data-cycles),
    # and the documents library once a day (faa-library: documents).
    faa = {"faa-data-cycles", "faa-editions", "faa-procedures", "faa-changeover", "faa-library"}
    assert set(jobs) == faa | {"aircraft-registry", "chart-cycle"}
    assert jobs["faa-editions"].trigger.interval.total_seconds() == main.EDITIONS_CHECK_EVERY_S
    assert jobs["chart-cycle"].trigger.interval.total_seconds() == chart_refresh.CHECK_EVERY_S


def test_the_switch_off_checks_nothing(monkeypatch, editions):
    monkeypatch.setattr(chart_refresh, "AUTO_REFRESH", True)
    monkeypatch.setattr(main, "FAA_DATA_AUTO_REFRESH", False)
    main.check_faa_editions()
    assert editions == []


def test_the_switch_is_on_unless_set_off(monkeypatch):
    monkeypatch.delenv("FAA_DATA_AUTO_REFRESH", raising=False)
    monkeypatch.setenv("CHARTS_AUTO_REFRESH", "0")
    assert Settings().faa_data_auto_refresh is True
    monkeypatch.setenv("FAA_DATA_AUTO_REFRESH", "0")
    assert Settings().faa_data_auto_refresh is False
