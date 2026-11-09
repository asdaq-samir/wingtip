"""What the FAA's SWIM feeds say now of airports and airspace, as ingest
hears it and the planner asks for it: ITWS's wind shear and microburst
alerts (wingtip.itws), SFDPS's special activity airspace status
(wingtip.saa), STDDS's runway visual range (wingtip.rvr), D-ATIS
(wingtip.datis) and tower departure events (wingtip.departures), and
TFMS's traffic management programs (wingtip.flow).

One SQLite file (REPORTS_STORE; on the live-store volume beside the live
store in the development stack, wingtip.stores), one table: each report
by its kind and key, with the place it is of (an airport's FAA ident, an
airspace's designator), when it starts and ends, and when it was heard.
A report is written over by the next of the same key, so the store holds
each thing's latest word; one past its end is never given and is dropped
after KEEP_ENDED_S. Each reader module says what its key and report are.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time

from . import stores
from .config import get_settings

STORE = get_settings().reports_store
#: How long a report is kept past its end, s, for one asked just after.
KEEP_ENDED_S = 3600
#: How often ended reports are dropped, s.
PRUNE_EVERY_S = 300

_LOCK = threading.Lock()
_db: sqlite3.Connection | None = None
_pruned_at = 0.0


def _connection() -> sqlite3.Connection:
    global _db
    if _db is None:
        _db = stores.connect(STORE)
        _db.executescript("""
            CREATE TABLE IF NOT EXISTS reports (
                kind TEXT, key TEXT, place TEXT, starts REAL, ends REAL, heard REAL, report TEXT,
                PRIMARY KEY (kind, key));
            CREATE INDEX IF NOT EXISTS reports_place ON reports (kind, place);
        """)
    return _db


def reset() -> None:
    """The connection closed, for a test to point STORE at its own file."""
    global _db
    with _LOCK:
        if _db is not None:
            _db.close()
        _db = None


def ident(place: str) -> str:
    """A place as the store keeps it: upper case, and an airport's FAA
    ident for a contiguous-states ICAO one (KORD is ORD), as ITWS, TFMS
    and the RVR messages' own idents are reduced to."""
    s = (place or "").strip().upper()
    return s[1:] if len(s) == 4 and s.startswith("K") and s.isalpha() else s


def put(kind: str, key: str, report: dict, *, place: str | None, starts: float | None = None,
        ends: float | None = None, now: float | None = None) -> None:
    """A report kept as the latest of its kind and key."""
    now = time.time() if now is None else now
    with _LOCK:
        db = _connection()
        db.execute("INSERT INTO reports (kind, key, place, starts, ends, heard, report) VALUES (?, ?, ?, ?, ?, ?, ?) "
                   "ON CONFLICT (kind, key) DO UPDATE SET place = excluded.place, starts = excluded.starts, "
                   "ends = excluded.ends, heard = excluded.heard, report = excluded.report",
                   (kind, key, ident(place) if place else None, starts, ends, now, json.dumps(report)))
        _prune(db, now)
        db.commit()


def drop(kind: str, key: str) -> None:
    """A report taken away: the thing it said is over (an alert ended)."""
    with _LOCK:
        db = _connection()
        db.execute("DELETE FROM reports WHERE kind = ? AND key = ?", (kind, key))
        db.commit()


def _prune(db: sqlite3.Connection, now: float) -> None:
    global _pruned_at
    if now - _pruned_at > PRUNE_EVERY_S:
        db.execute("DELETE FROM reports WHERE ends IS NOT NULL AND ends < ?", (now - KEEP_ENDED_S,))
        _pruned_at = now


def _rows(sql: str, args: tuple) -> list[dict]:
    if _db is None and not STORE.exists():
        return []
    with _LOCK:
        rows = _connection().execute(sql, args).fetchall()
    return [{**json.loads(report), "heard": heard} for report, heard in rows]


def at(kind: str, places: list[str], now: float | None = None) -> list[dict]:
    """The reports of a kind at these places not yet ended, each as kept
    with when it was heard ("heard", s), oldest place first."""
    now = time.time() if now is None else now
    keys = sorted({ident(p) for p in places if p})
    if not keys:
        return []
    marks = ",".join("?" * len(keys))
    return _rows(f"SELECT report, heard FROM reports WHERE kind = ? AND place IN ({marks}) "
                 "AND (ends IS NULL OR ends > ?) ORDER BY place, key", (kind, *keys, now))


def every(kind: str, now: float | None = None) -> list[dict]:
    """Every report of a kind not yet ended."""
    now = time.time() if now is None else now
    return _rows("SELECT report, heard FROM reports WHERE kind = ? AND (ends IS NULL OR ends > ?) ORDER BY place, key",
                 (kind, now))
