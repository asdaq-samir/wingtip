"""Outside sources' answers kept to each one's own time: an airplane's photo
(wingtip.aircraft_photo, Planespotters.net's day at most), a flight
number's route (wingtip.traffic.routes). An answer of "it has none" is
kept too, so a restart or the other process asks again for none.

Not traffic's own store, though it is a table in the same live store file
(LIVE_STORE, wingtip.traffic.store's): a photo is a card's, not the
map's, and neither needs the traffic package to be kept. One connection
per process, autocommit, in WAL mode (wingtip.stores), so a reader holds
no lock between calls. The planner prunes it with the live store
(wingtip.traffic.radar.prune).
"""

from __future__ import annotations

import json
import sqlite3
import threading

from . import stores
from .config import get_settings

STORE = get_settings().live_store

_LOCK = threading.Lock()
_db: sqlite3.Connection | None = None

_SCHEMA = """
    CREATE TABLE IF NOT EXISTS answers (source TEXT, key TEXT, until REAL, body TEXT, PRIMARY KEY (source, key)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS answers_until ON answers (until);
"""


def _connection() -> sqlite3.Connection:
    """This process's one connection, made the first time; called with the lock held."""
    global _db
    if _db is None:
        db = stores.connect(STORE, autocommit=True)
        db.executescript(_SCHEMA)
        _db = db
    return _db


def reset() -> None:
    """The connection closed, so the next call opens STORE again (a test's own)."""
    global _db
    with _LOCK:
        if _db is not None:
            _db.close()
        _db = None


def keep(source: str, key: str, body, until: float) -> None:
    """A source's answer (JSON, None for "it has none") kept until `until`, wall seconds."""
    with _LOCK:
        _connection().execute(
            "INSERT INTO answers (source, key, until, body) VALUES (?, ?, ?, ?) "
            "ON CONFLICT (source, key) DO UPDATE SET until = excluded.until, body = excluded.body",
            (source, key, until, json.dumps(body)),
        )


def kept(source: str, key: str, now: float) -> tuple[bool, object]:
    """(True, the answer) where one is kept and not past its time, else (False, None)."""
    with _LOCK:
        rows = _connection().execute("SELECT body FROM answers WHERE source = ? AND key = ? AND until > ?", (source, key, now)).fetchall()
    return (True, json.loads(rows[0][0])) if rows else (False, None)


def forget(now: float) -> int:
    """The answers past their time dropped; how many."""
    with _LOCK:
        return _connection().execute("DELETE FROM answers WHERE until <= ?", (now,)).rowcount
