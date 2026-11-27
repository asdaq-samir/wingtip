"""ingest.history and ingest.ntsb: the archive written each hour and the
NTSB's database looked at once a day, each a job on ingest's scheduler; the database read again only when its size has changed."""

import json
import sqlite3
from contextlib import closing
from pathlib import Path

from wingtip import registry, schedule
from wingtip.history import notam_archive, ntsb as ntsb_store

from ingest import history, ntsb


def _stamp(store: Path, version: int) -> None:
    """The store given a schema version, its connection closed. A sqlite3
    connection used as a context manager commits and stays open; left to
    the collector it is an unclosed-database warning in whichever test is
    running then, which failed test_main's in CI run 43726455655."""
    with closing(sqlite3.connect(store)) as db:
        db.execute(f"PRAGMA user_version = {version}")


def _shapes(monkeypatch, registry_shape: int, ntsb_shape: int) -> None:
    """The registry's file and the NTSB's store on disk of these shapes (0: none)."""
    monkeypatch.setattr(registry, "schema", lambda path: registry_shape)
    monkeypatch.setattr(ntsb_store, "schema", lambda: ntsb_shape)


def test_the_archive_is_a_job_each_hour_and_the_ntsb_each_day_both_first_now(monkeypatch):
    _shapes(monkeypatch, registry.SCHEMA, ntsb_store.SCHEMA)
    on = schedule.scheduler()
    history.jobs(on)
    jobs = {job.id: job for job in on.get_jobs()}
    assert jobs["notam-archive"].func is notam_archive.snapshot and jobs["ntsb"].func is ntsb.refresh
    assert jobs["notam-archive"].trigger.interval.total_seconds() == history.SNAPSHOT_EVERY_S
    assert jobs["ntsb"].trigger.interval.total_seconds() == history.NTSB_EVERY_S
    assert all(job.next_run_time is not None for job in jobs.values())
    # The FAA's aircraft registry, read here rather than in the planner's one process.
    assert jobs["aircraft-registry"].func is registry.refresh
    assert jobs["aircraft-registry"].trigger.interval.total_seconds() == history.REGISTRY_EVERY_S
    # The heavy first turns apart, the registry's first (round 4: all three at start-up).
    apart = [(jobs[n].next_run_time - jobs["aircraft-registry"].next_run_time).total_seconds() for n in ("ntsb", "airmen")]
    assert [round(s) for s in apart] == [history.FIRST_TURNS_APART_S, 2 * history.FIRST_TURNS_APART_S]


def test_a_store_of_an_older_shape_takes_the_first_turn(monkeypatch):
    """Round 5's audit: an NTSB store of an older shape waited 300 s behind
    the registry, every card's NTSB cases none meanwhile (the planner reads
    it as none)."""
    _shapes(monkeypatch, registry.SCHEMA, ntsb_store.SCHEMA - 1)
    on = schedule.scheduler()
    history.jobs(on)
    order = sorted(("ntsb", "aircraft-registry", "airmen"), key=lambda n: on.get_job(n).next_run_time)
    assert order == ["ntsb", "aircraft-registry", "airmen"]
    # A store not there yet is no older shape: the registry first, as before.
    _shapes(monkeypatch, 0, 0)
    on = schedule.scheduler()
    history.jobs(on)
    assert sorted(("ntsb", "aircraft-registry", "airmen"), key=lambda n: on.get_job(n).next_run_time)[0] == "aircraft-registry"


PAGE = (Path(__file__).parent / "fixtures" / "avdata_2026-11-12.html").read_text()


def test_the_directory_gives_each_files_date_and_size():
    files = ntsb.read_directory(PAGE)
    assert files["avall.zip"] == {"date": "2026-11-01T06:50:07", "size": 97_140_358}
    assert files["up15NOV.zip"]["date"] == "2025-11-15T03:00:46"


def test_avall_is_read_again_only_when_its_date_size_or_the_stores_shape_changes(monkeypatch, tmp_path):
    store = tmp_path / "ntsb.sqlite"
    monkeypatch.setattr(ntsb_store, "store_path", lambda: store)
    avall = ntsb.read_directory(PAGE)["avall.zip"]
    assert ntsb.due(avall, {})
    # A store of the shape the planner reads: only a new avall remakes it.
    _stamp(store, ntsb_store.SCHEMA)
    assert not ntsb.due(avall, {"avall": avall})
    assert ntsb.due({**avall, "size": 97_200_000}, {"avall": avall})
    # One of an older shape is made again from the same avall.
    _stamp(store, 1)
    assert ntsb.due(avall, {"avall": avall})


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
            # A store of the shape the planner reads, as ntsb.build leaves it.
            _stamp(store, ntsb_store.SCHEMA)
        return 1

    monkeypatch.setattr(ntsb, "_read", fake_read)
    assert ntsb.refresh() == {"built": 1, "deltas": ["up08NOV.zip"]}
    assert ntsb.refresh() == {"built": None, "deltas": []}
    assert read == ["avall.zip", "up08NOV.zip"]
    assert json.loads(store.with_suffix(".json").read_text())["applied"][0]["name"] == "up08NOV.zip"
