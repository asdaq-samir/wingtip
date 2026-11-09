"""charts.next_cycle: the `next` run against a disk of cycles -- waiting
before the lead, the FAA's files not up, no turn on the machine, staged
with the old cycle kept and served, nothing more before the date, and
after the swap the old cycle deleted -- a failure said and raised, and
the FAA asked by one sectional's zip."""
from contextlib import contextmanager
from datetime import datetime, timezone

import pytest

from charts import next_cycle
from wingtip import chart_next, charts


def utc(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)


@pytest.fixture
def disk(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "CHARTS_DIR", tmp_path / "charts")
    monkeypatch.setattr(charts, "_serving_cache", {"value": None, "at": 0.0})
    monkeypatch.setattr(charts, "_kind_serving", {})
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "10-29-2026")
    return tmp_path


def _complete(cycle):
    for kind in charts.KINDS:
        charts._write_pyramid_status(cycle, {"kind": kind, "zooms": [3], "sheets": sorted(charts.COVERAGE[kind]),
                                             "finished_at": "t", "tiles": 1, "renderer": charts.RENDERER_VERSION})


def test_the_jobs_run_through_a_cycle(disk, monkeypatch):
    _complete("10-29-2026")
    built = []

    def build(cycle, workers=None, step=None):
        step("rendering the sec pyramid")
        assert chart_next.read_status()["state"] == chart_next.STAGING
        built.append(cycle)
        _complete(cycle)
        return True

    monkeypatch.setattr(charts, "build_cycle", build)
    monkeypatch.setattr(charts, "pack_complete", lambda cycle, kinds=None: {})

    # Before the lead: nothing but the word of when.
    assert next_cycle.run(now=utc("2026-11-09T12:00")) == chart_next.WAITING
    assert chart_next.read_status()["detail"].startswith("staging starts 2026-12-17")
    # In the lead, the FAA's files not up: said, nothing built.
    assert next_cycle.run(now=utc("2026-12-18T12:00"), is_published=lambda c: False) == chart_next.NOT_PUBLISHED
    assert built == []
    # No turn on the machine: said, nothing built.
    @contextmanager
    def no_turn():
        yield False

    assert next_cycle.run(now=utc("2026-12-18T12:00"), is_published=lambda c: True, turn=no_turn) == chart_next.NO_TURN
    assert built == []
    # Up, and a turn: staged, the old cycle kept and still served.
    assert next_cycle.run(now=utc("2026-12-18T12:00"), is_published=lambda c: True) == chart_next.STAGED
    assert built == ["12-24-2026"]
    assert (disk / "tiles" / "10-29-2026").exists()
    report = chart_next.report(True, now=utc("2026-12-18T12:00"))
    assert report["state"] == chart_next.STAGED and report["effective"] == "2026-12-24" and report["auto"]
    # Again before the date: nothing more to do.
    assert next_cycle.run(now=utc("2026-12-20T12:00"), is_published=lambda c: True) == chart_next.STAGED
    assert built == ["12-24-2026"]
    # After the swap: the old cycle deleted, and the swap said.
    assert next_cycle.run(now=utc("2026-12-25T12:00")) == chart_next.WAITING
    assert not (disk / "tiles" / "10-29-2026").exists()
    assert chart_next.read_status()["state"] == chart_next.SWAPPED
    report = chart_next.report(True, now=utc("2026-12-25T12:00"))
    assert report["cycle"] == "02-18-2027" and report["state"] == chart_next.WAITING
    assert report["detail"].startswith("12-24-2026 swapped in")


def test_a_failed_build_is_said_and_raised(disk, monkeypatch):
    def broken(cycle, workers=None, step=None):
        raise OSError("No space left on device")

    monkeypatch.setattr(charts, "build_cycle", broken)
    with pytest.raises(OSError):
        next_cycle.run(now=utc("2026-12-18T12:00"), is_published=lambda c: True)
    status = chart_next.read_status()
    assert status["state"] == chart_next.FAILED and "No space left" in status["detail"]


def test_published_asks_the_faa_for_one_sectional():
    asked = []

    class Response:
        status_code = 404

    assert not next_cycle.published("12-24-2026", get=lambda url, **kw: asked.append(url) or Response())
    assert asked and "aeronav.faa.gov/visual/12-24-2026/sectional-files/" in asked[0]
    Response.status_code = 200
    assert next_cycle.published("12-24-2026", get=lambda url, **kw: Response())
