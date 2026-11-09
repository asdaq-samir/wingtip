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
    source = sqlite3.connect(f"file:{former}?mode=ro", uri=True)
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


def connect(store: Path, former: Path | None = None) -> sqlite3.Connection:
    """A connection to `store` (made where there is none, from `former`
    where that has one), in WAL mode, waiting up to ten seconds for the
    other process's write."""
    store = Path(store)
    if former is not None:
        adopt(store, former)
    store.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(store, check_same_thread=False, timeout=10.0)
    db.execute("PRAGMA journal_mode=WAL")
    # WAL's own safe setting: a power cut may lose the last write, never the file.
    db.execute("PRAGMA synchronous=NORMAL")
    return db
