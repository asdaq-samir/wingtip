"""The live feeds' store, shared by two processes (issue #535's first
split). ingest (services/ingest) reads the FAA's terminal radar through
SWIM and asks adsb.lol for the followed airplanes, and writes what it
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
- following: the airplanes whose card has been opened, each with when it
  was last opened and by whose share (`who`, a short one-way hash of the
  pilot's id, never the id: recorded.share_of); dropped FOLLOW_KEEP_S
  after that (recorded.py).
- points: each recorded airplane's track, a point a row, kept as long as
  RECORD_KEEP_S (wingtip.traffic.recorded), pruned by `t`, which is indexed.
Nothing in any table names a pilot or an account; `following` counts
each pilot's share by a hash it cannot be read back from. The planner prunes all
three on a schedule (wingtip.traffic.radar.prune, from app.main), not
only when ingest or a request happens to write.
- beats: what ingest last said of each feed and of itself (its health).
- opensky: an airplane's past flights of a UTC day (key "day:<ISO day>")
  and a flight's path (key "path:<its id>") as the OpenSky Network gave
  them (wingtip.traffic.opensky), kept a day and a bit: ingest's nightly
  prefetch and a pilot's card both write them, and both read them before
  asking OpenSky again; pruned by `at`, which is indexed.
The key the shares are hashed with is never kept here, beside them
(FOLLOW_SHARE_KEY, recorded._share_key; the round 7 audit, P-M1).
"""

from __future__ import annotations

import json
import sqlite3
import threading

from .. import stores
from ..config import get_settings

STORE = get_settings().live_store

_LOCK = threading.Lock()
_db: sqlite3.Connection | None = None

_SCHEMA = """
    CREATE TABLE IF NOT EXISTS radar (hex TEXT PRIMARY KEY, lat REAL, lon REAL, at REAL, plane TEXT);
    CREATE INDEX IF NOT EXISTS radar_at ON radar (at);
    CREATE TABLE IF NOT EXISTS looked (place TEXT PRIMARY KEY, lat REAL, lon REAL, radius REAL, at REAL);
    DROP TABLE IF EXISTS followed;
    CREATE TABLE IF NOT EXISTS following (who TEXT, hex TEXT, since REAL, PRIMARY KEY (who, hex));
    CREATE INDEX IF NOT EXISTS following_hex ON following (hex);
    CREATE TABLE IF NOT EXISTS points (hex TEXT, t REAL, point TEXT, PRIMARY KEY (hex, t)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS points_t ON points (t);
    CREATE TABLE IF NOT EXISTS beats (name TEXT PRIMARY KEY, at REAL, state TEXT);
    DROP TABLE IF EXISTS opensky_days;
    DROP TABLE IF EXISTS opensky_paths;
    CREATE TABLE IF NOT EXISTS opensky (hex TEXT, key TEXT, at REAL, body TEXT, PRIMARY KEY (hex, key)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS opensky_at ON opensky (at);
"""


def _connection() -> sqlite3.Connection:
    """This process's one connection, made the first time; called with the
    lock held. Autocommit: each statement is its own transaction unless a
    write opens one, so a reader holds no lock between calls."""
    global _db
    if _db is None:
        # WAL, synchronous NORMAL (a power cut may lose the last moment of
        # traffic, never the file), as every store ingest and the planner share.
        db = stores.connect(STORE, autocommit=True)
        db.executescript(_SCHEMA)
        _drop_the_store_key(db)
        _db = db
    return _db


def _drop_the_store_key(db: sqlite3.Connection) -> None:
    """Once, where a store still holds the key round 6 kept in it: the key
    deleted, and with it every pilot's follows, whose shares were hashed
    with it (or, before it, with no key at all) and would otherwise sit
    orphaned in the largest-share eviction until they expired (the round 7
    audit, P-L1). A pilot's next card opened follows again under the new
    key; the follows no pilot asked (share "") stay."""
    db.execute("BEGIN IMMEDIATE")
    try:
        if db.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'keys'").fetchone():
            db.execute("DELETE FROM following WHERE who != ''")
            db.execute("DROP TABLE keys")
        db.execute("COMMIT")
    except BaseException:
        db.execute("ROLLBACK")
        raise


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


def radar_heard_many(reports: list[tuple[dict, float]]) -> list[bool]:
    """radar_heard for each of a message's reports, (plane, at), in one
    transaction: a STARS message carries some twenty tracks, and each as
    its own autocommit write was a WAL commit of its own, hundreds a
    second while a map shows traffic. Whether each was kept, in order."""
    if not reports:
        return []
    with _LOCK:
        db = _connection()
        db.execute("BEGIN IMMEDIATE")
        try:
            kept = [
                db.execute(
                    "INSERT INTO radar (hex, lat, lon, at, plane) VALUES (?, ?, ?, ?, ?) "
                    "ON CONFLICT (hex) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, at = excluded.at, plane = excluded.plane "
                    "WHERE excluded.at > radar.at",
                    (plane["hex"], plane["lat"], plane["lon"], at, json.dumps(plane)),
                ).rowcount
                > 0
                for plane, at in reports
            ]
            db.execute("COMMIT")
        except BaseException:
            db.execute("ROLLBACK")
            raise
    return kept


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


def follow(hex_id: str, who: str, at: float, each: int, most: int) -> None:
    """An airplane followed from now on, or still, in `who`'s share: `since`
    is when its card was last opened, which its expiry counts from. At most
    `each` in one share, its own card opened longest ago going, so one
    account opening cards cannot push every other pilot's airplanes out
    (the safety audit of 2026-11-23, M5). Past `most` in all, the follows
    go from the largest share first, its card opened longest ago, so
    accounts filling the store between them lose their own before a pilot
    who follows fewer loses any (the round 6 audit, P1). One transaction,
    as both processes write."""
    with _LOCK:
        db = _connection()
        db.execute("BEGIN IMMEDIATE")
        try:
            db.execute(
                "INSERT INTO following (who, hex, since) VALUES (?, ?, ?) ON CONFLICT (who, hex) DO UPDATE SET since = excluded.since",
                (who, hex_id, at),
            )
            db.execute(
                "DELETE FROM following WHERE who = ? AND hex IN "
                "(SELECT hex FROM following WHERE who = ? ORDER BY since DESC LIMIT -1 OFFSET ?)",
                (who, who, each),
            )
            (count,) = db.execute("SELECT COUNT(*) FROM following").fetchone()
            for _ in range(max(0, count - most)):
                db.execute(
                    "DELETE FROM following WHERE rowid = (SELECT rowid FROM following WHERE who = "
                    "(SELECT who FROM following GROUP BY who ORDER BY COUNT(*) DESC, MIN(since) LIMIT 1) ORDER BY since LIMIT 1)"
                )
            db.execute("COMMIT")
        except BaseException:
            db.execute("ROLLBACK")
            raise


def unfollow_before(before: float) -> int:
    """The follows whose card has not been opened since `before` dropped;
    how many. Their tracks age out on their own (forget_points)."""
    return _write("DELETE FROM following WHERE since < ?", (before,))


def unfollow_unheard(before: float) -> int:
    """The airplanes followed since before `before` that no source has
    been heard from at all, followed no more; how many."""
    return _write("DELETE FROM following WHERE since < ? AND NOT EXISTS (SELECT 1 FROM points WHERE points.hex = following.hex)", (before,))


def forget_points(before: float) -> int:
    """Every track's points older than `before` dropped, whether or not
    its airplane is still heard (record() prunes only the one it adds to);
    how many."""
    return _write("DELETE FROM points WHERE t < ?", (before,))


def is_followed(hex_id: str) -> bool:
    return bool(_query("SELECT 1 FROM following WHERE hex = ?", (hex_id,)))


def followed() -> list[str]:
    """The followed airplanes' addresses, the card opened latest first."""
    return [row[0] for row in _query("SELECT hex FROM following GROUP BY hex ORDER BY MAX(since) DESC, hex")]


def record(hex_id: str, point: dict, oldest: float) -> bool:
    """A point added to an airplane's track where it is later than the
    track's last, and the track's points before `oldest` dropped. Both
    processes record (the planner an open card's airplane, ingest the
    radar's and adsb.lol's), so a point a row: neither writes over the
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


# The OpenSky Network's past flights and paths.


def _opensky_keep(hex_id: str, key: str, body: list[dict], at: float) -> None:
    _write(
        "INSERT INTO opensky (hex, key, at, body) VALUES (?, ?, ?, ?) "
        "ON CONFLICT (hex, key) DO UPDATE SET at = excluded.at, body = excluded.body",
        (hex_id, key, at, json.dumps(body)),
    )


def _opensky_kept(hex_id: str, key: str, since: float) -> list[dict] | None:
    rows = _query("SELECT body FROM opensky WHERE hex = ? AND key = ? AND at >= ?", (hex_id, key, since))
    return json.loads(rows[0][0]) if rows else None


def opensky_keep_day(hex_id: str, day: str, flights: list[dict], at: float) -> None:
    """An airplane's flights on a UTC day (ISO), as OpenSky listed them."""
    _opensky_keep(hex_id, f"day:{day}", flights, at)


def opensky_day(hex_id: str, day: str, since: float) -> list[dict] | None:
    """The flights kept for that day since `since`; None where none are."""
    return _opensky_kept(hex_id, f"day:{day}", since)


def opensky_keep_path(hex_id: str, flight_id: int, path: list[dict], at: float) -> None:
    """A flight's path as OpenSky gave it, an empty one too."""
    _opensky_keep(hex_id, f"path:{flight_id}", path, at)


def opensky_path(hex_id: str, flight_id: int, since: float) -> list[dict] | None:
    """The path kept for that flight since `since`; None where none is."""
    return _opensky_kept(hex_id, f"path:{flight_id}", since)


def forget_opensky(before: float) -> int:
    """OpenSky's days and paths kept before `before` dropped; how many."""
    return _write("DELETE FROM opensky WHERE at < ?", (before,))
