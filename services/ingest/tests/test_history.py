"""ingest.history and ingest.ntsb: the archive written each turn and the
NTSB's database looked at once a day, a failure of either let go until
the next; the database read again only when its size has changed."""

import json
from pathlib import Path

from wingtip.history import notam_archive, ntsb as ntsb_store

from ingest import history, ntsb


def test_a_turn_archives_and_looks_at_the_ntsb_once_a_day(monkeypatch):
    calls = []
    monkeypatch.setattr(notam_archive, "snapshot", lambda: calls.append("snapshot"))
    monkeypatch.setattr(ntsb, "refresh", lambda: calls.append("ntsb"))
    last = history.turn(0.0, 100_000.0)
    assert last == 100_000.0 and calls == ["snapshot", "ntsb"]
    assert history.turn(last, last + 3600) == last
    assert calls == ["snapshot", "ntsb", "snapshot"]


def test_a_failure_waits_for_the_next_turn(monkeypatch):
    def broken():
        raise OSError("disk full")

    monkeypatch.setattr(notam_archive, "snapshot", broken)
    monkeypatch.setattr(ntsb, "refresh", broken)
    assert history.turn(0.0, 100_000.0) == 100_000.0


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
