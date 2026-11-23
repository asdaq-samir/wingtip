"""NOTAMs from the FAA NOTAM System's own feed: SWIM's FNS (AIM's NOTAM
Distribution Service, AIXM 5.1 messages, the owner's SCDS subscription of
2026-10-19), each NOTAM as it is issued, replaced or cancelled.

Each message's Event carries one NOTAM: its location, number, effective
times, schedule and text, in the domestic form a briefing gives it
("!BJC 10/060 BJC SVC ...") where it has one, and in the ICAO form where
it is international ("A1645/26 NOTAMN Q) KZDV/..."). The two forms of one
NOTAM come as two messages; they are kept as one, by the domestic
number. A domestic NOTAM cancelled before its end comes again with its
feature lifetime ended (FNS scenario 1005); an ICAO one is ended by a
later NOTAM that names it ("A1644/26 NOTAMC A1643/26", or NOTAMR for a
replacement).

Kept in a SQLite file so a restart forgets none, each until a day after it
ends. The feed brings NOTAMs from the first connection on, never the ones
already in force: `since()` says when that was. The full set comes from
the FAA's NOTAM Management Service API (NMS-API, decision 0059), read by
ingest.nms where its credentials are set: its initial load (`loaded`),
then its changes (`heard`, as the feed's are, and `synced`). Both give a
NOTAM in the same AIXM form, read by the same engine rule, so one heard
from both is one row, kept by its place and number. Until a load is
held and kept up to date, `full_set()` is False and the store is only
what was heard since `since()`, not the whole list for a field.
Only the United States' own are kept: the feed sends the world's
international ones too.
"""

from __future__ import annotations

import html
import json
import re
import sqlite3
import threading
import time

import wingtip_native

from . import stores, utc
from .config import Settings, get_settings
from .engine import ask as engine

STORE = get_settings().notam_store
#: Where the store was kept before NOTAM_STORE moved it (the data
#: folder's default), taken the first time the new path is opened.
FORMER = Settings.model_fields["notam_store"].default
#: How long an ended NOTAM is kept, s: a day, for a briefing read just after.
KEEP_ENDED_S = 24 * 3600

#: The ICAO location prefixes of the United States and its territories
#: (ICAO Doc 7910): the contiguous states K, Alaska PA-PP, Hawaii PH,
#: the Pacific islands PG/PK/PW..., Puerto Rico TJ, the Virgin Islands TI
#: and American Samoa NS (NSTU).
US_PREFIXES = ("K", "P", "TJ", "TI", "NS")
#: The ICAO form's place, its item A) ("A) KBJC"), and the domestic form's
#: location and number ("!BJC 10/060", a military one's "!KEDG M0061/26"):
#: what a store of the earlier layout is kept by again (_upgrade). A
#: message's NOTAMs are read by the engine (notam.rs), by the same patterns.
_ICAO_PLACE = re.compile(r"\bA\)\s*([A-Z]{4})\b")
_DOMESTIC_ID = re.compile(r"^!(\w+)\s+([A-Z]?\d{1,4}/\d{1,4})")
#: How long since NMS's last update the store still holds the full set,
#: s: five of its updates, which it allows one each three minutes
#: (ingest.nms.EVERY_S), a design choice. Longer, and a NOTAM issued since
#: may be missing, so the set is said to be only what was heard.
FULL_SYNC_WITHIN_S = 15 * 60
#: How old NMS's initial load may be when it is fetched, s: it is made
#: once a day (NMS allows one load a day), so a NOTAM issued in the day
#: before it may not be in it. Its changes are first asked from this
#: long before the load (ingest.nms), and a NOTAM is taken as ended for
#: being left out of a load only where it was last heard before that.
LOAD_AGE_S = 24 * 3600
#: The store's layout: 1 since a NOTAM known only by its ICAO number is
#: kept by its place and number, not the number alone (_upgrade).
STORE_VERSION = 2

_LOCK = threading.Lock()
_db: sqlite3.Connection | None = None
#: When the store last let go of NOTAMs past their keep (s), as
#: filed_routes prunes: the DELETE scans the whole table (no index on
#: ends or heard), and it ran on every FNS message, about one a second.
#: A day's keep loses nothing by being pruned once an hour; the readers
#: test ended and ends themselves.
_pruned_at = 0.0
PRUNE_EVERY_S = 3600


def _connection() -> sqlite3.Connection:
    global _db
    if _db is None:
        _db = stores.connect(STORE, former=FORMER)
        _db.executescript("""
            CREATE TABLE IF NOT EXISTS notams (
                id TEXT PRIMARY KEY, icao_id TEXT, location TEXT, icao_location TEXT,
                classification TEXT, issued TEXT, starts TEXT, ends TEXT, estimated INTEGER,
                schedule TEXT, text TEXT, raw TEXT, ended INTEGER DEFAULT 0, heard REAL);
            CREATE INDEX IF NOT EXISTS notams_location ON notams (location);
            CREATE INDEX IF NOT EXISTS notams_icao_location ON notams (icao_location);
            CREATE INDEX IF NOT EXISTS notams_icao_id ON notams (icao_id);
            CREATE TABLE IF NOT EXISTS heard (since REAL);
            CREATE TABLE IF NOT EXISTS nms (loaded REAL, synced REAL);
        """)
        _upgrade(_db)
    return _db


def _upgrade(db: sqlite3.Connection) -> None:
    """A store kept by an earlier layout, put in this one.

    Before version 1 a NOTAM with no domestic form, or a military one
    ("!KEDG M0061/26", whose number the domestic pattern did not take), was
    kept by its ICAO number alone. Those numbers are each issuer's own: a
    base's M series, a country's A series, so KEDG's M0061/26 was written
    over KAPG's, a row with one's place and the other's words (15 of the
    4,011 kept so on 2026-11-02). Each is kept again by its place and
    number, its place read from its own words where they give one; the
    NOTAM it was written over is gone until the feed sends it again.

    Before version 2 a NOTAM's text was kept with the HTML entities the
    FAA's feed puts inside its XML ("O&apos;HARE"), which notam_read took for
    someone's own words; the engine's reader now decodes them (from_fns),
    and those kept are decoded here."""
    version = db.execute("PRAGMA user_version").fetchone()[0]
    if version >= STORE_VERSION:
        return
    if version < 1:
        _keep_by_place(db)
    for key, raw, text in db.execute("SELECT id, raw, text FROM notams WHERE raw LIKE '%&%' OR text LIKE '%&%'").fetchall():
        db.execute("UPDATE notams SET raw = ?, text = ? WHERE id = ?", (html.unescape(raw or ""), html.unescape(text or ""), key))
    db.execute(f"PRAGMA user_version = {STORE_VERSION}")
    db.commit()


def _keep_by_place(db: sqlite3.Connection) -> None:
    """Version 1: each NOTAM kept by its place and number (_upgrade)."""
    rows = db.execute("SELECT id, location, icao_location, raw FROM notams WHERE id NOT LIKE '% %'").fetchall()
    for old, location, icao_location, raw in rows:
        domestic = _DOMESTIC_ID.match(raw or "")
        place = _ICAO_PLACE.search(raw or "")
        if domestic:
            key, fix = (f"{domestic.group(1)} {domestic.group(2)}", {"icao_location": domestic.group(1)})
            # Its location is the word after the number, as the domestic form writes it.
            words = (raw or "").split()
            if len(words) > 2:
                fix["location"] = words[2]
        elif place:
            key, fix = f"{place.group(1)} {old}", {"icao_location": place.group(1)}
        else:
            key, fix = f"{icao_location or location} {old}", {}
        db.execute("DELETE FROM notams WHERE id = ? AND EXISTS (SELECT 1 FROM notams WHERE id = ?)", (old, key))
        db.execute(
            "UPDATE notams SET id = ?, location = COALESCE(?, location), icao_location = COALESCE(?, icao_location) WHERE id = ?",
            (key, fix.get("location"), fix.get("icao_location"), old),
        )


def reset() -> None:
    """The connection closed, for a test to point STORE at its own file."""
    global _db, _pruned_at
    with _LOCK:
        if _db is not None:
            _db.close()
        _db = None
        _pruned_at = 0.0


def _stamp(now: float) -> str:
    """A moment as the store's times are written, to compare with them."""
    return utc.iso(now)


def notams(xml: str) -> list[dict]:
    """The NOTAMs of one FNS message, each {"id", "icao_id", "names",
    "type", "location", "icao_location", "classification", "issued",
    "starts", "ends", "estimated", "schedule", "text", "raw"}: `names` is
    the NOTAM a NOTAMR or NOTAMC ends. `ends` is the sooner of its own end
    and its feature lifetime's, for one cancelled early. Each is kept by
    its domestic place and number, else its place and ICAO number. Read by
    the engine (notam.rs, `notams_fns`), as a phone reads one; none where
    the message is not XML."""
    return json.loads(wingtip_native.call("notams_fns", json.dumps({"text": xml})))


def _ours(notam: dict) -> bool:
    if notam["classification"] != "INTL":
        return True
    return any((place or "").startswith(US_PREFIXES) for place in (notam["location"], notam["icao_location"]))


def _keep(db: sqlite3.Connection, xml: str, now: float) -> list[dict]:
    """One message's NOTAMs kept: added or updated, and the ones they
    replace or cancel ended. The NOTAMs it gave."""
    found = [n for n in notams(xml) if _ours(n)]
    if db.execute("SELECT 1 FROM heard").fetchone() is None:
        db.execute("INSERT INTO heard VALUES (?)", (now,))
    for n in found:
        if n["names"]:
            # The one it names at its own place: another place's NOTAM
            # may have the same number.
            db.execute(
                "UPDATE notams SET ended = 1 WHERE icao_id = ? AND (location = ? OR icao_location = ?)",
                (n["names"], n["location"], n["icao_location"]),
            )
        if n["type"] == "C":
            # A cancellation is no NOTAM a pilot reads: it ends the one it names.
            continue
        # The other form of one NOTAM already kept keeps what it has
        # that this one lacks (its ICAO number, its domestic words).
        db.execute(
            """
            INSERT INTO notams (id, icao_id, location, icao_location, classification, issued, starts,
                                ends, estimated, schedule, text, raw, ended, heard)
            VALUES (:id, :icao_id, :location, :icao_location, :classification, :issued, :starts,
                    :ends, :estimated, :schedule, :text, :raw, 0, :heard)
            ON CONFLICT (id) DO UPDATE SET
                icao_id = COALESCE(excluded.icao_id, icao_id),
                location = COALESCE(excluded.location, location),
                icao_location = COALESCE(excluded.icao_location, icao_location),
                issued = excluded.issued, starts = excluded.starts, ends = excluded.ends,
                estimated = excluded.estimated, schedule = excluded.schedule, text = excluded.text,
                raw = CASE WHEN raw LIKE '!%' AND excluded.raw NOT LIKE '!%' THEN raw ELSE excluded.raw END,
                heard = excluded.heard
        """,
            {**n, "estimated": int(n["estimated"]), "heard": now},
        )
    return found


def _let_go(db: sqlite3.Connection, now: float) -> None:
    """Those a day past their end, or a day after they were ended, let go."""
    db.execute(
        "DELETE FROM notams WHERE (ends IS NOT NULL AND ends < ?) OR (ended = 1 AND heard < ?)",
        (_stamp(now - KEEP_ENDED_S), now - KEEP_ENDED_S),
    )


def heard(xml: str, now: float | None = None) -> int:
    """One FNS or NMS message kept: its NOTAMs added or updated, the ones
    they replace or cancel ended, and those a day past their end let go, at
    most once every PRUNE_EVERY_S. How many NOTAMs it gave."""
    global _pruned_at
    now = time.time() if now is None else now
    with _LOCK:
        db = _connection()
        found = _keep(db, xml, now)
        if abs(now - _pruned_at) >= PRUNE_EVERY_S:
            _let_go(db, now)
            _pruned_at = now
        db.commit()
    return len(found)


def loaded(messages, asked: float | None = None, now: float | None = None) -> int:
    """NMS's initial load kept, asked for at `asked`: every NOTAM in force,
    its messages each read as `heard` reads one. It is the whole set, so a
    NOTAM of a classification it holds, last heard LOAD_AGE_S before it was
    asked for, that it does not list has ended (its cancellation missed
    while the feed was down); one heard since may be newer than the load,
    and one of a classification it holds none of is left as it was. The
    load's time is kept; the store is not up to date until its changes
    since have been asked (`synced`). How many NOTAMs it gave."""
    now = time.time() if now is None else now
    asked = now if asked is None else asked
    ids: set[str] = set()
    kinds: set[str] = set()
    with _LOCK:
        db = _connection()
        for xml in messages:
            for n in _keep(db, xml, now):
                ids.add(n["id"])
                kinds.add(n["classification"])
        db.execute("CREATE TEMP TABLE IF NOT EXISTS in_load (id TEXT PRIMARY KEY)")
        db.execute("DELETE FROM in_load")
        db.executemany("INSERT OR IGNORE INTO in_load VALUES (?)", [(i,) for i in ids])
        marks = ",".join("?" * len(kinds))
        if kinds:
            db.execute(
                f"""UPDATE notams SET ended = 1, heard = ? WHERE heard < ? AND ended = 0
                    AND classification IN ({marks}) AND id NOT IN (SELECT id FROM in_load)""",
                (now, asked - LOAD_AGE_S, *sorted(kinds)),
            )
        db.execute("DELETE FROM nms")
        db.execute("INSERT INTO nms VALUES (?, NULL)", (now,))
        _let_go(db, now)
        db.commit()
    return len(ids)


def synced(now: float | None = None) -> None:
    """NMS's changes asked and kept (each message by `heard`): the store
    is up to date to `now`."""
    now = time.time() if now is None else now
    with _LOCK:
        _connection().execute("UPDATE nms SET synced = ?", (now,))
        _connection().commit()


def nms_state() -> tuple[float | None, float | None]:
    """When NMS's initial load was kept, and when the store was last
    brought up to date from it (None until its first changes are asked);
    (None, None) before any load."""
    with _LOCK:
        row = _connection().execute("SELECT loaded, synced FROM nms").fetchone()
    return (row[0], row[1]) if row else (None, None)


def full_set(now: float | None = None) -> bool:
    """Whether the store holds every NOTAM in force: NMS's initial load
    held and brought up to date within FULL_SYNC_WITHIN_S. False, and the
    store is only what was heard since `since()`."""
    now = time.time() if now is None else now
    loaded_at, synced_at = nms_state()
    return loaded_at is not None and synced_at is not None and now - synced_at <= FULL_SYNC_WITHIN_S


def since() -> float | None:
    """When the store first heard the feed, s; None before it has."""
    with _LOCK:
        row = _connection().execute("SELECT since FROM heard").fetchone()
    return row[0] if row else None


def every() -> list[dict]:
    """Every NOTAM kept, ended ones included (a day after their end), each
    {"id", "location", "icao_location", "starts", "ends", "text", "raw"}:
    what the day's archive keeps (wingtip.history.notam_archive)."""
    with _LOCK:
        rows = _connection().execute("SELECT id, location, icao_location, starts, ends, text, raw FROM notams").fetchall()
    keys = ("id", "location", "icao_location", "starts", "ends", "text", "raw")
    return [dict(zip(keys, r)) for r in rows]


def _places(field: str) -> set[str]:
    """A field's identifiers as NOTAMs give them: the domestic location
    drops the K of a contiguous-states ICAO one (KBJC is BJC): the
    engine's field_names."""
    return set(engine("field_names", ident=field))


def at_fields(fields: list[str], now: float | None = None) -> list[dict]:
    """The NOTAMs in force at these fields or yet to come, soonest first:
    not ended, cancelled or replaced. Each {"id", "location", "starts",
    "ends", "estimated", "schedule", "text", "raw"}.

    An ICAO-form NOTAM is at the place its A) item names (icao_location),
    not by its kept location: a row kept by its number alone before
    version 1 kept one field's location under another's words (KSHV's
    A0917/26, "RWY 06/24 CLSD EXC XNG", listed under KORD on the owner's
    card, 2026-11-11)."""
    now = time.time() if now is None else now
    places = sorted(set().union(*(_places(f) for f in fields))) if fields else []
    if not places:
        return []
    marks = ",".join("?" * len(places))
    with _LOCK:
        rows = (
            _connection()
            .execute(
                f"""
            SELECT id, location, starts, ends, estimated, schedule, text, raw FROM notams
            WHERE ended = 0 AND (ends IS NULL OR ends > ?)
              AND ((location IN ({marks}) AND (raw LIKE '!%' OR icao_location IS NULL)) OR icao_location IN ({marks}))
            ORDER BY starts, id
        """,
                (_stamp(now), *places, *places),
            )
            .fetchall()
        )
    # One NOTAM sent in both forms, each in a message of its own, is two
    # numbers with nothing to tie them but their place, words and times:
    # given once, in the domestic form a briefing reads.
    found: dict[tuple, dict] = {}
    for r in rows:
        notam = {
            "id": r[0],
            "location": r[1],
            "starts": r[2],
            "ends": r[3],
            "estimated": bool(r[4]),
            "schedule": r[5],
            "text": r[6],
            "raw": r[7],
        }
        same = (r[1], " ".join((r[6] or "").split()), r[2], r[3])
        if same not in found or (notam["raw"] or "").startswith("!"):
            found[same] = notam
    return list(found.values())
