"""wingtip.stores: a store's shape, the one check the registry, the NTSB's
store, the NOTAMs' and ingest's turns each wrote their own way."""

import sqlite3
from contextlib import closing

from wingtip import stores


def test_a_stores_shape_is_none_where_missing_its_version_and_unreadable_for_a_file_that_is_not_one(tmp_path):
    missing, built, junk = tmp_path / "none.sqlite", tmp_path / "built.sqlite", tmp_path / "junk.sqlite"
    with closing(sqlite3.connect(built)) as db:
        stores.stamp(db, 3)
    junk.write_bytes(b"not a database, a half-copied file" * 100)
    assert [stores.version(p) for p in (missing, built, junk)] == [0, 3, stores.UNREADABLE]
    # Older: there and not the shape the reader wants; a store not there yet is not.
    assert [stores.older(p, 3) for p in (missing, built, junk)] == [False, False, True]
    assert stores.older(built, 4)


def test_a_store_stamped_reads_back_its_shape(tmp_path):
    with closing(sqlite3.connect(tmp_path / "s.sqlite")) as db:
        stores.stamp(db, 7)
        assert stores.user_version(db) == 7
