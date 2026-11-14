"""ingest.history and ingest.ntsb: the archive written each hour and the
NTSB's database looked at once a day, each a job on ingest's scheduler; the database read again only when its size has changed."""

import json
from pathlib import Path

from wingtip import schedule
from wingtip.history import notam_archive, ntsb as ntsb_store

from ingest import history, ntsb


def test_the_archive_is_a_job_each_hour_and_the_ntsb_each_day_both_first_now():
    on = schedule.scheduler()
    history.jobs(on)
    jobs = {job.id: job for job in on.get_jobs()}
    assert jobs["notam-archive"].func is notam_archive.snapshot and jobs["ntsb"].func is ntsb.refresh
    assert jobs["notam-archive"].trigger.interval.total_seconds() == history.SNAPSHOT_EVERY_S
    assert jobs["ntsb"].trigger.interval.total_seconds() == history.NTSB_EVERY_S
    assert all(job.next_run_time is not None for job in jobs.values())


PAGE = (Path(__file__).parent / "fixtures" / "avdata_2026-11-12.html").read_text()


def test_the_directory_gives_each_files_date_and_size():
    files = ntsb.read_directory(PAGE)
    assert files["avall.zip"] == {"date": "2026-11-01T06:50:07", "size": 97_140_358}
    assert files["up15NOV.zip"]["date"] == "2025-11-15T03:00:46"


def test_avall_is_read_again_only_when_its_date_or_size_changes(monkeypatch, tmp_path):
    store = tmp_path / "ntsb.sqlite"
    monkeypatch.setattr(ntsb_store, "store_path", lambda: store)
    avall = ntsb.read_directory(PAGE)["avall.zip"]
    assert ntsb.due(avall, {})
    store.write_bytes(b"")
    assert not ntsb.due(avall, {"avall": avall})
    assert ntsb.due({**avall, "size": 97_200_000}, {"avall": avall})


def test_the_deltas_after_avall_not_yet_applied_oldest_first():
    files = ntsb.read_directory(PAGE)
    state = {"avall": files["avall.zip"], "applied": []}
    # up01NOV was made before avall that morning; up15NOV and up22OCT are of an earlier year or month.
    assert ntsb.deltas_due(files, state) == ["up08NOV.zip"]
    state["applied"].append({"name": "up08NOV.zip", "date": files["up08NOV.zip"]["date"]})
    assert ntsb.deltas_due(files, state) == []
    # Next year's up08NOV, by the same name, is due again.
    files["up08NOV.zip"] = {"date": "2027-11-08T03:00:00", "size": 1}
    assert ntsb.deltas_due(files, state) == ["up08NOV.zip"]


def test_a_refresh_builds_then_applies_each_delta_once(monkeypatch, tmp_path):
    store = tmp_path / "ntsb.sqlite"
    monkeypatch.setattr(ntsb_store, "store_path", lambda: store)
    monkeypatch.setattr(ntsb, "directory", lambda: ntsb.read_directory(PAGE))
    read = []

    def fake_read(name, write):
        read.append(name)
        if name == ntsb.AVALL:
            store.write_bytes(b"")
        return 1

    monkeypatch.setattr(ntsb, "_read", fake_read)
    assert ntsb.refresh() == {"built": 1, "deltas": ["up08NOV.zip"]}
    assert ntsb.refresh() == {"built": None, "deltas": []}
    assert read == ["avall.zip", "up08NOV.zip"]
    assert json.loads(store.with_suffix(".json").read_text())["applied"][0]["name"] == "up08NOV.zip"
