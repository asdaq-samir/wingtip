"""The live feeds' store, shared by two processes (issue #535's first
split). ingest (services/ingest) reads the FAA's terminal radar through
SWIM and asks adsb.fi for the followed airplanes, and writes what it
hears here; the planner reads it for the map, a card and an alert, and
writes where the map looks and which airplanes are followed, which
ingest reads back to know what of the country's radar to keep.

A SQLite file on the data folder both mount, as wingtip.notams' and
wingtip.filed_routes' stores are, in WAL mode: a reader never waits on
the writer, and two processes on one machine (one kernel; Docker's
containers share the VM's) may both write, each write a short
transaction. No message bus: the planner asks for what is there when a
pilot asks, and nothing the pilot waits on is a live fetch.

The tables:
- radar: each airplane's latest report from the FAA's radar, by address,
  with its place and time; kept while it is fresh (STALE_S).
- looked: the regions (adsb.lol's cells, never a view's own middle) the
  map has asked for traffic round in the last minute (radar.LOOKED_S).
- followed: the airplanes whose card has been opened, each with when it
  was last opened; dropped FOLLOW_KEEP_S after that (recorded.py).
- points: each recorded airplane's track, a point a row, kept as long as
  RECORD_KEEP_S (wingtip.traffic.recorded).
Nothing in any table names a pilot or an account. The planner prunes all
three on a schedule (wingtip.traffic.radar.prune, from app.main), not
only when ingest or a request happens to write.
- beats: what ingest last said of each feed and of itself (its health).
"""

from __future__ import annotations

import json
import sqlite3
import threading

from ..config import get_settings

STORE = get_settings().live_store

_LOCK = threading.Lock()
_db: sqlite3.Connection | None = None

_SCHEMA = """
    CREATE TABLE IF NOT EXISTS radar (hex TEXT PRIMARY KEY, lat REAL, lon REAL, at REAL, plane TEXT);
    CREATE INDEX IF NOT EXISTS radar_at ON radar (at);
    CREATE TABLE IF NOT EXISTS looked (place TEXT PRIMARY KEY, lat REAL, lon REAL, radius REAL, at REAL);
    CREATE TABLE IF NOT EXISTS followed (hex TEXT PRIMARY KEY, since REAL);
    CREATE TABLE IF NOT EXISTS points (hex TEXT, t REAL, point TEXT, PRIMARY KEY (hex, t)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS beats (name TEXT PRIMARY KEY, at REAL, state TEXT);
"""


def _connection() -> sqlite3.Connection:
    """This process's one connection, made the first time; called with the
    lock held. Autocommit: each statement is its own transaction unless a
    write opens one, so a reader holds no lock between calls."""
    global _db
    if _db is None:
        STORE.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(STORE, check_same_thread=False, timeout=10.0, isolation_level=None)
        db.execute("PRAGMA journal_mode=WAL")
        # WAL's own safe setting: a power cut may lose the last moment of
        # traffic, never the file.
        db.execute("PRAGMA synchronous=NORMAL")
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


def _query(sql: str, args: tuple = ()) -> list[tuple]:
    with _LOCK:
        return _connection().execute(sql, args).fetchall()


def _write(sql: str, args: tuple = ()) -> int:
    """One write; how many rows it changed."""
    with _LOCK:
        return _connection().execute(sql, args).rowcount


# The radar's airplanes.


def radar_heard(plane: dict, at: float) -> bool:
    """An airplane's report kept as its latest; False where the one kept
    is as new or newer (the radar's messages may come out of order)."""
    return (
        _write(
            "INSERT INTO radar (hex, lat, lon, at, plane) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT (hex) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, at = excluded.at, plane = excluded.plane "
            "WHERE excluded.at > radar.at",
            (plane["hex"], plane["lat"], plane["lon"], at, json.dumps(plane)),
        )
        > 0
    )


def radar_one(hex_id: str, since: float) -> tuple[dict, float] | None:
    """An airplane's latest report heard at or after `since`, and when."""
    rows = _query("SELECT plane, at FROM radar WHERE hex = ? AND at >= ?", (hex_id, since))
    return (json.loads(rows[0][0]), rows[0][1]) if rows else None


def radar_within(south: float, north: float, west: float, east: float, since: float) -> list[tuple[dict, float]]:
    """The reports heard since `since` inside a box of latitude and longitude."""
    rows = _query(
        "SELECT plane, at FROM radar WHERE at >= ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?", (since, south, north, west, east)
    )
    return [(json.loads(plane), at) for plane, at in rows]


def radar_forget(before: float) -> int:
    """The reports older than `before` dropped: the airplane is elsewhere."""
    return _write("DELETE FROM radar WHERE at < ?", (before,))


# Where the map looks.


def look(place: str, lat: float, lon: float, radius_nm: float, at: float) -> None:
    """The map's view round a region (one row a region, its latest ask);
    `lat` and `lon` are the region's middle, not the view's."""
    _write(
        "INSERT INTO looked (place, lat, lon, radius, at) VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT (place) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, radius = excluded.radius, at = excluded.at",
        (place, lat, lon, radius_nm, at),
    )


def forget_looks(before: float) -> int:
    """The regions not asked about since `before` dropped; how many."""
    return _write("DELETE FROM looked WHERE at < ?", (before,))


def looked(since: float) -> list[tuple[float, float, float]]:
    """The views asked for since `since`, each (lat, lon, radius nm), in
    the order their places were first looked at; older ones dropped."""
    forget_looks(since)
    return [tuple(row) for row in _query("SELECT lat, lon, radius FROM looked ORDER BY rowid")]


# The followed airplanes and their recorded tracks.


def follow(hex_id: str, at: float) -> None:
    """An airplane followed from now on, or still: `since` is when its card
    was last opened, which its expiry counts from."""
    _write("INSERT INTO followed (hex, since) VALUES (?, ?) ON CONFLICT (hex) DO UPDATE SET since = excluded.since", (hex_id, at))


def unfollow_before(before: float) -> int:
    """The airplanes whose card has not been opened since `before` followed
    no more; how many. Their tracks age out on their own (forget_points)."""
    return _write("DELETE FROM followed WHERE since < ?", (before,))


def forget_points(before: float) -> int:
    """Every track's points older than `before` dropped, whether or not
    its airplane is still heard (record() prunes only the one it adds to);
    how many."""
    return _write("DELETE FROM points WHERE t < ?", (before,))


def is_followed(hex_id: str) -> bool:
    return bool(_query("SELECT 1 FROM followed WHERE hex = ?", (hex_id,)))


def followed() -> set[str]:
    return {row[0] for row in _query("SELECT hex FROM followed")}


def record(hex_id: str, point: dict, oldest: float) -> bool:
    """A point added to an airplane's track where it is later than the
    track's last, and the track's points before `oldest` dropped. Both
    processes record (the planner an open card's airplane, ingest the
    radar's and adsb.fi's), so a point a row: neither writes over the
    other's."""
    with _LOCK:
        db = _connection()
        db.execute("BEGIN IMMEDIATE")
        try:
            added = (
                db.execute(
                    "INSERT INTO points (hex, t, point) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM points WHERE hex = ? AND t >= ?)",
                    (hex_id, point["t"], json.dumps(point), hex_id, point["t"]),
                ).rowcount
                > 0
            )
            db.execute("DELETE FROM points WHERE hex = ? AND t < ?", (hex_id, oldest))
            db.execute("COMMIT")
        except BaseException:
            db.execute("ROLLBACK")
            raise
    return added


def points(hex_id: str) -> list[dict]:
    """An airplane's recorded track, oldest first."""
    return [json.loads(row[0]) for row in _query("SELECT point FROM points WHERE hex = ? ORDER BY t", (hex_id,))]


def last_point(hex_id: str) -> dict | None:
    rows = _query("SELECT point FROM points WHERE hex = ? ORDER BY t DESC LIMIT 1", (hex_id,))
    return json.loads(rows[0][0]) if rows else None


# ingest's health.


def beat(name: str, at: float, state: dict | None = None) -> None:
    """What ingest says of a feed, or of itself (`name` "ingest"), and when."""
    _write(
        "INSERT INTO beats (name, at, state) VALUES (?, ?, ?) ON CONFLICT (name) DO UPDATE SET at = excluded.at, state = excluded.state",
        (name, at, json.dumps(state or {})),
    )


def beats() -> dict[str, dict]:
    """Every feed's and ingest's last word: {name: {"at", **state}}."""
    return {name: {"at": at, **json.loads(state)} for name, at, state in _query("SELECT name, at, state FROM beats")}
