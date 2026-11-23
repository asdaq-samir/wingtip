"""How many calls each of the planner's routes answered each day, kept on
disk: the totals the owner reads the growth of the app by (routes planned a
day, ForeFlight packs downloaded, kneeboards printed), where
app.route_metrics' figures live in memory and go with every restart or Spot
replacement (the product audit of 2026-11-23, H2; the owner took its
recommendation: totals only).

A day's row is (UTC day, route template, method, status, calls): the same
labels route_metrics counts by, a route's template ("/api/airport/{ident}")
and never its address, so no point, ident, query, pilot, device or address
is in it. Counted in memory as each call ends, added to the file every
FLUSH_EVERY_S and at shutdown, and kept KEEP_DAYS. The finished days are
served (`days`, /api/usage/daily) for the gateway's nightly rollup into
Postgres, which is backed up; docs/privacy-inventory.md says what is kept.
"""

from __future__ import annotations

import sqlite3
import threading
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from wingtip import stores
from wingtip.config import DATA_DIR

STORE = DATA_DIR / "raw" / "usage" / "usage.sqlite"
#: How often the day's counts so far are added to the file, s: a crash
#: loses at most this much.
FLUSH_EVERY_S = 300.0
#: How long a day's totals are kept here, days: the gateway holds them for
#: good once read, so this is only a margin for its nights missed.
KEEP_DAYS = 90

_PENDING: Counter = Counter()
_LOCK = threading.Lock()

_SCHEMA = """
    CREATE TABLE IF NOT EXISTS daily (
        day TEXT, route TEXT, method TEXT, status INTEGER, calls INTEGER,
        PRIMARY KEY (day, route, method, status)
    ) WITHOUT ROWID
"""


def _today() -> date:
    return datetime.now(timezone.utc).date()


def count(route: str, method: str, status: int) -> None:
    """One call ended: counted in memory, a dict's add, under a lock held
    for no more than that."""
    key = (_today().isoformat(), route, method, status)
    with _LOCK:
        _PENDING[key] += 1


def _open(path: Path) -> sqlite3.Connection:
    # WAL and synchronous=NORMAL, as every store here (wingtip.stores).
    db = stores.connect(path)
    db.execute(_SCHEMA)
    return db


def flush(path: Path | None = None) -> int:
    """The counts since the last flush added to the file, and days past
    KEEP_DAYS dropped from it; how many rows were added to."""
    with _LOCK:
        pending = dict(_PENDING)
        _PENDING.clear()
    db = _open(path or STORE)
    try:
        with db:
            db.executemany(
                "INSERT INTO daily VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET calls = calls + excluded.calls",
                [(*key, calls) for key, calls in pending.items()],
            )
            db.execute("DELETE FROM daily WHERE day < ?", ((_today() - timedelta(days=KEEP_DAYS)).isoformat(),))
    finally:
        db.close()
    return len(pending)


def days(since: date, path: Path | None = None) -> list[dict]:
    """Each finished day's totals from `since` on, today's left out until
    it is over: [{"day", "route", "method", "status", "calls"}], oldest
    first."""
    flush(path)
    db = _open(path or STORE)
    try:
        rows = db.execute(
            "SELECT day, route, method, status, calls FROM daily WHERE day >= ? AND day < ? ORDER BY day, route, method, status",
            (since.isoformat(), _today().isoformat()),
        ).fetchall()
    finally:
        db.close()
    return [{"day": d, "route": r, "method": m, "status": s, "calls": c} for d, r, m, s, c in rows]
