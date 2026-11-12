"""wingtip.atomic: a file put in place whole, or the old one left as it was."""

import stat

import pytest
from wingtip.atomic import atomic_path


def test_the_file_appears_whole_and_nothing_is_left_beside_it(tmp_path):
    target = tmp_path / "deep" / "store.json"
    with atomic_path(target) as part:
        assert part.parent == target.parent and part.name.startswith(".store.json.") and part.suffix == ".part"
        part.write_text("new")
        assert not target.exists()
    assert target.read_text() == "new"
    assert stat.S_IMODE(target.stat().st_mode) == 0o644
    assert sorted(p.name for p in target.parent.iterdir()) == ["store.json"]


def test_a_failed_write_leaves_the_old_file_and_no_temp(tmp_path):
    target = tmp_path / "store.json"
    target.write_text("old")
    with pytest.raises(RuntimeError), atomic_path(target) as part:
        part.write_text("half")
        raise RuntimeError("killed part-way")
    assert target.read_text() == "old"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["store.json"]


def test_two_writers_of_one_file_never_share_a_temp(tmp_path):
    # The planner and a job wrote one fixed `.tmp`, and one's rename moved
    # the other's half-written bytes into place (the stock audit, 2026-11-12).
    target = tmp_path / "status.json"
    with atomic_path(target) as first, atomic_path(target) as second:
        assert first != second
        first.write_text("first")
        second.write_text("second")
    assert target.read_text() == "first"


def test_a_suffix_for_a_writer_that_reads_the_name(tmp_path):
    with atomic_path(tmp_path / "registry.sqlite", suffix=".sqlite", durable=False) as part:
        assert part.suffix == ".sqlite"
        part.write_bytes(b"db")
    assert (tmp_path / "registry.sqlite").read_bytes() == b"db"
