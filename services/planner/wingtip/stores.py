"""The SQLite stores ingest writes and the planner reads, opened alike.

Each is one file both processes open, in WAL mode: a reader never waits
on the writer, and each write is a short transaction. In the development
stack they sit on the `live-store` Docker volume (/live), not the Mac's
shared folder: SQLite's locks and its write-ahead log's shared memory
need one kernel's file system under both containers, which macOS's file
sharing into Docker does not give (ingest's writes hung, 2026-11-08). The
paths are settings (LIVE_STORE, NOTAM_STORE, FILED_STORE, REPORTS_STORE),
the data folder by default, as on the server, where both containers mount
one Linux disk.

A store's shape is its PRAGMA user_version, which its builder sets: a
file of another shape reads as none until it is built again (`version`,
`older`), the one check the registry, the NTSB's store, the NOTAMs' and
ingest's turns each wrote their own way (round 6's common-code audit, 4).

A store first opened at a new path takes the one kept at its old path
(adopt): the NOTAMs heard since 19 Oct 2026 are the briefing's whole
record (wingtip.notams.since), and the feed sends none of them again.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path


def adopt(store: Path, former: Path) -> bool:
    """The store at `former` copied to `store`, where `store` has none
    yet: SQLite's backup, so a copy taken while ingest writes is whole,
    into a file beside it put in place by a link, which never writes over
    a store another process made meanwhile. Whether it was copied."""
    store, former = Path(store), Path(former)
    if store == former or store.exists() or not former.exists():
        return False
    store.parent.mkdir(parents=True, exist_ok=True)
    part = store.with_name(f"{store.name}.{os.getpid()}.part")
    source = read_only(former)
    try:
        copy = sqlite3.connect(part)
        try:
            source.backup(copy)
        finally:
            copy.close()
    finally:
        source.close()
    try:
        os.link(part, store)
        return True
    except FileExistsError:
        return False
    finally:
        part.unlink(missing_ok=True)


def connect(store: Path, former: Path | None = None, autocommit: bool = False) -> sqlite3.Connection:
    """A connection to `store` (made where there is none, from `former`
    where that has one), in WAL mode, waiting up to ten seconds for the
    other process's write; each statement its own transaction where
    `autocommit` (a store whose readers must hold no lock between calls),
    else Python's own transactions."""
    store = Path(store)
    if former is not None:
        adopt(store, former)
    store.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(store, check_same_thread=False, timeout=10.0, **({"isolation_level": None} if autocommit else {}))
    db.execute("PRAGMA journal_mode=WAL")
    # WAL's own safe setting: a power cut may lose the last write, never the file.
    db.execute("PRAGMA synchronous=NORMAL")
    return db


#: The shape `version` gives a file SQLite cannot read: no store's.
UNREADABLE = -1


def user_version(db: sqlite3.Connection) -> int:
    """An open store's shape, its PRAGMA user_version; UNREADABLE where
    SQLite cannot read the file."""
    try:
        return db.execute("PRAGMA user_version").fetchone()[0]
    except sqlite3.DatabaseError:
        return UNREADABLE


def stamp(db: sqlite3.Connection, schema: int) -> None:
    """Mark an open store as of shape `schema`, its PRAGMA user_version,
    the one `user_version` reads back: a builder's last step before its
    commit. A PRAGMA takes no bound parameter, so the int is checked here."""
    db.execute(f"PRAGMA user_version = {int(schema)}")


def version(path: Path) -> int:
    """The shape of the store at `path`: 0 where there is none,
    UNREADABLE where SQLite cannot read it."""
    path = Path(path)
    if not path.exists():
        return 0
    try:
        db = read_only(path)
    except sqlite3.DatabaseError:
        return UNREADABLE
    try:
        return user_version(db)
    finally:
        db.close()


def older(path: Path, schema: int) -> bool:
    """Whether a store is there and of a shape other than `schema`, one
    SQLite cannot read among them: its builder's first turn (ingest.history)."""
    return version(path) not in (0, schema)


def read_only(path: Path) -> sqlite3.Connection:
    """A read-only connection to a file another process or a rebuild
    writes (the registry, the NTSB's and the airmen's stores), usable from
    any thread one at a time; it never makes the file or writes to it."""
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True, check_same_thread=False)
