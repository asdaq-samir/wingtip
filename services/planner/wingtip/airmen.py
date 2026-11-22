"""The FAA's flight instructors, from its Airmen Certification Releasable
Database, kept for one question: is the instructor signing an
endorsement a flight instructor the FAA knows (the engine's
instructor_verification; the deep security review of 2026-11-21, N1).

The FAA writes the database each month (registry.faa.gov/database,
CSmmyyyy.zip; its layout in "Airman Directory Releasable File, Comma
Delimited", January 2020): PILOT_BASIC.csv, one airman a row with name
and address, and PILOT_CERT.csv, each active certificate a row, joined on
UNIQUE ID. Only certificate type F, flight instructor, is kept, and of
its airman only the id, the two name fields and the certificate's expiry
(given for type F only, MMDDYYYY): no address, no medical, nothing else,
though the file holds them. The file has no certificate numbers, and
leaves out every airman who asked for their address to be withheld
(Public Law 106-181 section 715, as the file's documentation says).

ingest (ingest.airmen) builds the store on the data volume the planner
and ingest share; the planner reads it here, one indexed read by last
name. No rule is decided here: the engine matches the name.
"""

from __future__ import annotations

import csv
import io
import re
import sqlite3
import zipfile
from collections.abc import Iterator
from pathlib import Path

from .atomic import atomic_path
from .config import get_settings

#: A name's suffixes, which the FAA writes after the last name; the key
#: is the last name's last word without them.
_SUFFIXES = {"JR", "SR", "II", "III", "IV", "V"}

_SCHEMA = """CREATE TABLE instructors (id TEXT PRIMARY KEY, first_middle TEXT NOT NULL, last_suffix TEXT NOT NULL,
    last_key TEXT NOT NULL, expires TEXT);
CREATE INDEX instructors_last_key ON instructors (last_key);"""


def store_path() -> Path:
    """The store, beside the live store on the shared data volume."""
    return get_settings().live_store.parent / "airmen.sqlite"


def last_key(name: str) -> str:
    """A name's lookup key: its last word, upper case, letters only,
    suffixes passed over ("Smith Jr." is SMITH)."""
    words = [w for w in (re.sub(r"[^A-Z0-9]", "", w) for w in name.upper().split()) if w and w not in _SUFFIXES]
    return words[-1] if words else ""


def _rows(archive: zipfile.ZipFile, name: str) -> Iterator[dict[str, str]]:
    """A file of the archive as rows by its header's names, stripped (the
    FAA's files carry a byte-order mark, padded fields and a trailing comma)."""
    member = next(n for n in archive.namelist() if n.upper().endswith(name))
    with archive.open(member) as raw:
        reader = csv.reader(io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace"))
        header = [h.strip().upper() for h in next(reader)]
        for row in reader:
            yield dict(zip(header, (cell.strip() for cell in row)))


def _day(mmddyyyy: str) -> str | None:
    """MMDDYYYY as YYYY-MM-DD; None where blank or not a date."""
    return f"{mmddyyyy[4:]}-{mmddyyyy[:2]}-{mmddyyyy[2:4]}" if re.fullmatch(r"\d{8}", mmddyyyy) else None


def build(archive_path: Path) -> int:
    """The store written again from a downloaded CSmmyyyy.zip, in place at
    once (atomic_path); the number of flight instructors kept."""
    with zipfile.ZipFile(archive_path) as archive:
        # The certificates first: a few hundred thousand ids of type F,
        # then the basic file read once for their names.
        expires = {
            r["UNIQUE ID"]: _day(r.get("CERTIFICATE EXPIRE DATE", ""))
            for r in _rows(archive, "PILOT_CERT.CSV")
            if r.get("CERTIFICATE TYPE") == "F" and r.get("UNIQUE ID")
        }
        path = store_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with atomic_path(path) as part:
            db = sqlite3.connect(part)
            try:
                db.executescript(_SCHEMA)
                rows = (
                    (uid, r["FIRST & MIDDLE NAME"], r["LAST NAME & SUFFIX"], last_key(r["LAST NAME & SUFFIX"]), expires[uid])
                    for r in _rows(archive, "PILOT_BASIC.CSV")
                    if (uid := r.get("UNIQUE ID")) in expires
                )
                db.executemany("INSERT OR REPLACE INTO instructors VALUES (?, ?, ?, ?, ?)", rows)
                db.commit()
                kept = db.execute("SELECT count(*) FROM instructors").fetchone()[0]
            finally:
                db.close()
    return kept


def instructors_named(name: str) -> list[dict] | None:
    """The flight instructors whose last name ends as `name`'s does, as the
    engine's instructor_verification reads them; None where the store has
    not been built (the engine then says the registry could not be read)."""
    path = store_path()
    if not path.exists():
        return None
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        rows = db.execute(
            "SELECT id, first_middle, last_suffix, expires FROM instructors WHERE last_key = ?", (last_key(name),)
        ).fetchall()
    except sqlite3.Error:
        return None
    finally:
        db.close()
    return [{"id": i, "first_middle": first, "last_suffix": last, "expires": e} for i, first, last, e in rows]
