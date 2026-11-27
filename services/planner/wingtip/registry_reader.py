"""Reading the FAA's registry file (wingtip.registry builds it): read-only
connections kept between lookups, and the Mode S addresses of a list of
N-numbers in one read (the LADD list's, wingtip.traffic.ladd)."""

from __future__ import annotations

import contextlib
import re
import sqlite3
import threading
from pathlib import Path

#: Read-only connections to the file, kept between lookups and handed one
#: to a thread at a time: a lookup opened its own, about 1 ms of each of
#: the radar's per-track LADD checks (88 tracks, 79 ms a poll, 2026-11-27).
#: All of one file as it was (its path, inode and mtime): a rebuild puts a
#: new file in place, and the connections to the old one are closed.
_READERS: dict[str, object] = {"file": None, "idle": []}
_READERS_LOCK = threading.Lock()
#: Idle connections kept at most: a few threads read at once.
READERS_KEPT = 8


def _file(db_path: Path) -> tuple | None:
    try:
        stat = db_path.stat()
    except FileNotFoundError:
        return None
    return (str(db_path), stat.st_ino, stat.st_mtime_ns)


@contextlib.contextmanager
def _reading(db_path: Path):
    """A read-only connection to the registry file, rows as sqlite3.Row:
    an idle one of this file kept from an earlier lookup, else a new one;
    kept again after, up to READERS_KEPT, else closed (sqlite3's own `with`
    never closes, and a connection left to the collector is a
    ResourceWarning since Python 3.13)."""
    file = _file(db_path)
    db = None
    with _READERS_LOCK:
        if _READERS["file"] != file:
            stale, _READERS["idle"], _READERS["file"] = _READERS["idle"], [], file
        else:
            stale = []
            if _READERS["idle"]:
                db = _READERS["idle"].pop()  # type: ignore[union-attr]
    for old in stale:  # type: ignore[union-attr]
        old.close()
    if db is None:
        db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, check_same_thread=False)
        db.row_factory = sqlite3.Row
    try:
        yield db
    finally:
        with _READERS_LOCK:
            keep = _READERS["file"] == file and len(_READERS["idle"]) < READERS_KEPT  # type: ignore[arg-type]
            if keep:
                _READERS["idle"].append(db)  # type: ignore[union-attr]
        if not keep:
            db.close()


def addresses(n_numbers: frozenset[str], db_path: Path) -> frozenset[str]:
    """The Mode S addresses (lower case) of these N-numbers: their
    registrations in effect, and for an address with none in effect the
    canceled ones (DEREG.txt), as `lookup` by address finds them. Empty
    where the registry is not read yet."""
    listed = sorted(n for n in n_numbers if re.fullmatch(r"N[1-9][0-9A-Z]{0,4}", n))
    if not db_path.exists() or not listed:
        return frozenset()
    found: set[str] = set()
    with _reading(db_path) as db:
        for at in range(0, len(listed), 500):
            chunk = listed[at : at + 500]
            marks = ",".join("?" * len(chunk))
            found.update(r[0] for r in db.execute(f"SELECT mode_s_hex FROM aircraft WHERE n_number IN ({marks})", chunk))
            with contextlib.suppress(sqlite3.OperationalError):  # a file of the older shape, without the table
                found.update(
                    r[0]
                    for r in db.execute(
                        f"SELECT mode_s_hex FROM deregistered WHERE n_number IN ({marks}) "
                        "AND mode_s_hex NOT IN (SELECT mode_s_hex FROM aircraft WHERE mode_s_hex IS NOT NULL)",
                        chunk,
                    )
                )
    return frozenset(h.lower() for h in found if h)
