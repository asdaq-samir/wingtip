"""wingtip.chart_next: the next 56-day chart cycle's dates (the engine's
data_cycle, from the FAA's 28 and 56 Day Product Schedule), the lead
before it, the swap at 0901Z on its date, what the planner's check asks
the job to do, and the job's status read back as the planner reports it.
The job's run is services/jobs/charts/tests/test_next_cycle.py's."""

from datetime import date, datetime, timezone

import pytest

from wingtip import chart_next, charts, data_cycles


def utc(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)


def test_the_cycle_after_29_october_2026_is_24_december():
    # 3 Sep 2026 + 56 = 29 Oct 2026, + 56 = 24 Dec 2026, + 56 = 18 Feb 2027:
    # the FAA's schedule's "56-day airspace cycle" dates.
    p = chart_next.plan(utc("2026-11-09T12:00"))
    assert p.in_force == date(2026, 10, 29)
    assert p.next == date(2026, 12, 24) and p.next_name == "12-24-2026"
    assert p.stage_from == date(2026, 12, 17) and p.lead_days == 7
    assert not p.staging
    assert (p.next - p.in_force).days == 56


def test_staging_starts_lead_days_ahead_by_the_0901z_day():
    # The day is the in-force day, so the lead's first day begins at 0901Z.
    assert not chart_next.plan(utc("2026-12-17T09:00")).staging
    assert chart_next.plan(utc("2026-12-17T09:01")).staging
    assert chart_next.plan(utc("2026-12-23T23:59")).staging
    assert chart_next.plan(utc("2026-11-09T12:00"), lead_days=45).staging  # from 9 Nov
    assert not chart_next.plan(utc("2026-11-09T12:00"), lead_days=44).staging


def test_the_swap_is_at_0901z_on_the_effective_date():
    before = chart_next.plan(utc("2026-12-24T09:00"))
    assert before.in_force == date(2026, 10, 29) and before.next == date(2026, 12, 24) and before.staging
    after = chart_next.plan(utc("2026-12-24T09:01"))
    assert after.in_force == date(2026, 12, 24) and after.next == date(2027, 2, 18)
    assert not after.staging
    assert not charts.in_force("12-24-2026", utc("2026-12-24T09:00"))
    assert charts.in_force("12-24-2026", utc("2026-12-24T09:01"))
    assert charts.in_force("10-29-2026", utc("2026-12-24T09:00"))
    assert charts.in_force("not-a-cycle")


@pytest.mark.parametrize("asked, held", [(60, 55), (56, 55), (-3, 0), (0, 0), (14, 14)])
def test_the_lead_is_held_inside_one_cycle(asked, held):
    p = chart_next.plan(utc("2026-11-09T12:00"), lead_days=asked)
    assert p.lead_days == held
    assert p.in_force < p.stage_from <= p.next


def _plan(staging=True):
    return chart_next.Plan(
        in_force=date(2026, 10, 29), next=date(2026, 12, 24), stage_from=date(2026, 12, 17), lead_days=7, staging=staging
    )


def test_what_the_planners_check_asks_for():
    now = 1_000_000.0
    assert chart_next.due(_plan(False), None, True, True, False, now) is None
    assert chart_next.due(_plan(), None, True, True, False, now) == "stage"
    assert chart_next.due(_plan(), None, False, True, False, now) is None  # staged already
    # After the swap: the old cycle deleted, at any point of the lead.
    assert chart_next.due(_plan(False), None, False, True, True, now) == "prune"
    # Nothing the last run could do: asked again only after RETRY_AFTER_S.
    for state in (chart_next.NOT_PUBLISHED, chart_next.NO_TURN, chart_next.FAILED):
        last = {"cycle": "12-24-2026", "state": state, "at": now - 60}
        assert chart_next.due(_plan(), last, True, True, False, now) is None
        assert chart_next.due(_plan(), last, True, True, False, now + chart_next.RETRY_AFTER_S) == "stage"
        # The word of another cycle does not hold this one back.
        assert chart_next.due(_plan(), {**last, "cycle": "10-29-2026"}, True, True, False, now) == "stage"
    # A run that was staging (killed part-way) is started again to resume.
    assert chart_next.due(_plan(), {"cycle": "12-24-2026", "state": chart_next.STAGING, "at": now}, True, True, False, now) == "stage"


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
        charts._write_pyramid_status(
            cycle,
            {
                "kind": kind,
                "zooms": [3],
                "sheets": sorted(charts.COVERAGE[kind]),
                "finished_at": "t",
                "tiles": 1,
                "renderer": charts.RENDERER_VERSION,
            },
        )


def test_a_staged_cycle_is_not_served_before_its_date(disk, monkeypatch):
    _complete("10-29-2026")
    _complete("12-24-2026")
    monkeypatch.setattr(data_cycles, "in_force_day", lambda now=None: date(2026, 12, 23))
    assert charts.serving_cycle() == "10-29-2026"
    assert charts.serving_cycle_of("ifr_low") == "10-29-2026"
    assert data_cycles._charts_edition(charts) == "10-29-2026"
    # On its date, past 0901Z: the map goes over at its next look.
    monkeypatch.setattr(data_cycles, "in_force_day", lambda now=None: date(2026, 12, 24))
    monkeypatch.setattr(charts, "_serving_cache", {"value": None, "at": 0.0})
    monkeypatch.setattr(charts, "_kind_serving", {})
    assert charts.serving_cycle() == "12-24-2026"
    assert charts.serving_cycle_of("ifr_low") == "12-24-2026"


def test_a_refresh_does_not_prune_before_the_cycle_is_in_force(disk, monkeypatch):
    # The FAA's page names the new cycle from 0000Z; the old one is the
    # map's until 0901Z.
    _complete("10-29-2026")
    _complete("12-24-2026")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "12-24-2026")
    monkeypatch.setattr(charts, "pack_complete", lambda cycle, kinds=None: {})
    monkeypatch.setattr(data_cycles, "in_force_day", lambda now=None: date(2026, 12, 23))
    charts.refresh(publish_bucket=None)
    assert (disk / "tiles" / "10-29-2026").exists()
    monkeypatch.setattr(data_cycles, "in_force_day", lambda now=None: date(2026, 12, 24))
    charts.refresh(publish_bucket=None)
    assert not (disk / "tiles" / "10-29-2026").exists()


def test_the_report_reads_the_jobs_word_for_the_next_cycle(disk):
    chart_next.write_status("12-24-2026", chart_next.NOT_PUBLISHED, "not up yet")
    report = chart_next.report(True, now=utc("2026-12-18T12:00"))
    assert report["cycle"] == "12-24-2026" and report["state"] == chart_next.NOT_PUBLISHED
    assert report["stage_from"] == "2026-12-17" and report["updated_at"]
    # Before the lead, with no word: waiting, and when staging starts.
    chart_next.write_status("10-29-2026", chart_next.STAGED, "old")
    report = chart_next.report(False, now=utc("2026-11-09T12:00"))
    assert report["state"] == chart_next.WAITING and report["detail"] == "staging starts 2026-12-17"
    assert report["auto"] is False
