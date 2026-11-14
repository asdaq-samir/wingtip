"""crash.cli: only the last LEAD_DAYS' events in the United States are
leads, and a run reads the sources into the store, checks the leads and
makes the kits (each stage stubbed at its edge)."""

import datetime as dt
from types import SimpleNamespace

import pytest
from wingtip import crash_drafts

from crash import cli, identity, kit, notices, statements

TODAY = dt.date(2026, 11, 12)


def test_old_and_foreign_events_are_no_leads():
    events = [
        {"local_date": "2026-11-08", "state": "KY"},
        {"local_date": "2025-03-12", "state": "FL"},
        {"local_date": "2026-11-10", "state": None},
    ]
    assert cli.recent(events, TODAY) == [events[0]]


def test_a_run_reads_checks_and_kits(tmp_path, monkeypatch):
    monkeypatch.setattr(crash_drafts, "_folder", lambda: tmp_path)
    event = {
        "local_date": dt.date.today().isoformat(),
        "local_time": "13:15",
        "city": "Estero",
        "state": "FL",
        "heading": "General Aviation / Estero, Florida",
        "text": "A Kitfox Supersport crashed in Estero, Florida.",
    }
    monkeypatch.setattr(statements, "fetch", lambda session=None: "")
    monkeypatch.setattr(statements, "parse", lambda html: [event])
    monkeypatch.setattr(notices, "dropped", lambda: [])

    def ready(lead, today=None):
        return crash_drafts.update(
            lead["id"], status="ready", track="none", identity={"verdict": "no_track", "checks": []}, identity_by="engine"
        )

    monkeypatch.setattr(identity, "check", ready)
    made = []
    monkeypatch.setattr(kit, "make", lambda lead, track: made.append((lead["id"], track)))
    assert cli.poll() == 0
    (draft,) = crash_drafts.drafts()
    assert draft["status"] == "ready"
    assert made == [(draft["id"], None)]


def test_every_runs_poll_now_and_each_of_its_minutes_on_a_blocking_scheduler(monkeypatch):
    on = cli.schedule.scheduler()
    made = []
    monkeypatch.setattr(cli.schedule, "scheduler", lambda **kw: made.append(kw) or on)
    monkeypatch.setattr(on, "start", lambda: made.append("started"))
    monkeypatch.setattr(cli, "get_settings", lambda: SimpleNamespace(crash_leads_auto=True, crash_leads_every_min=30))
    assert cli.entry(["every"]) == 0
    (job,) = on.get_jobs()
    assert job.func is cli.poll and job.trigger.interval.total_seconds() == 1800 and job.next_run_time is not None
    assert made == [{"workers": 1, "blocking": True}, "started"]


def test_every_runs_nothing_when_switched_off(monkeypatch):
    monkeypatch.setattr(cli, "poll", lambda: pytest.fail("ran"))
    monkeypatch.setattr(cli, "get_settings", lambda: SimpleNamespace(crash_leads_auto=False, crash_leads_every_min=30))
    assert cli.entry(["every"]) == 0
