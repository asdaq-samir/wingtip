"""An airplane's past in the FAA's aircraft registry: its earlier
registrations, the documents filed for recording against its N-number,
and an N-number's reservation, from the same download as its registration
(registry.faa.gov/database/ReleasableAircraft.zip, wingtip.registry),
written into the same SQLite file when it is read.

The files and their fields are the FAA's readme's, "ardata.pdf" (dated
5/8/2025):
- DEREG.txt, the Aircraft Deregistered File: one row per registration
  canceled, with the N-number, serial number, make and model code, the
  status it had, the registrant's name and address, the airworthiness
  date, the Cancel Date (positions 240-247) and the Export Country
  (260-277) of one exported. The readme gives no reason for a
  cancellation beyond these, so the reason is said as the file has it:
  the export country where there is one, and the status the registration
  had when it was canceled. The header names position 258 INDICATOR-GROUP;
  the readme names it Type Registration, with MASTER's Type Registrant
  codes (1 individual ... 9 non-citizen co-owned), which are the only
  values it holds (checked 2026-11-14), and it is read as that.
- DOCINDEX.txt, the Aircraft Document Index File: each document filed for
  recording, by collateral (Type Collateral 1, an aircraft by N-number),
  with its document id, the date the Registry received it, when it was
  entered and corrected, and its type (bill of sale, lien, release...).
  The party's name is withheld by the FAA (49 U.S.C. 44114(b)) and is not
  read. The file holds the documents of about the last month.
- RESERVED.txt, the Reserve N-Number File: who reserved an N-number,
  when, the kind of reservation, and an N-number change in process.

As with the registration, a name and town are kept and given; a street,
zip code and county are not.
"""

from __future__ import annotations

import contextlib
import sqlite3
from collections.abc import Callable, Iterator
from pathlib import Path

from . import registry_codes as codes

_SCHEMA = """
CREATE TABLE deregistered (n_number TEXT, serial TEXT, model_code TEXT, engine_code TEXT, year INTEGER,
    status_code TEXT, owner TEXT, owner_type TEXT, city TEXT, state TEXT, country TEXT, airworthiness TEXT,
    airworthiness_date TEXT, certificate_issued TEXT, last_action TEXT, cancel_date TEXT, export_country TEXT,
    mode_s_hex TEXT, kit TEXT, co_owners INTEGER);
CREATE INDEX deregistered_n ON deregistered (n_number);
CREATE INDEX deregistered_serial ON deregistered (serial);
CREATE TABLE documents (n_number TEXT, document_id TEXT, kind_code TEXT, received TEXT, entered TEXT,
    corrected TEXT, correction TEXT);
CREATE INDEX documents_n ON documents (n_number);
CREATE TABLE reserved (n_number TEXT PRIMARY KEY, registrant TEXT, city TEXT, state TEXT, reserved TEXT,
    kind_code TEXT, expiration_notice TEXT, change_to TEXT, purge TEXT);
"""

Rows = Callable[..., Iterator[dict]]


def _n(text: str) -> str | None:
    return "N" + text if text else None


def _deregistered(r: dict) -> tuple:
    others = sum(1 for i in range(1, 6) if r.get(f"OTHER-NAMES({i})"))
    kit = " ".join(p for p in (r.get("KIT MFR", ""), r.get("KIT MODEL", "")) if p)
    # The registrant's physical town where the file gives one, else the
    # mailing address's.
    city = r.get("CITY-PHYSICAL") or r.get("CITY-MAIL")
    state = r.get("STATE-ABBREV-PHYSICAL") or r.get("STATE-ABBREV-MAIL")
    return (
        _n(r.get("N-NUMBER", "")),
        r.get("SERIAL-NUMBER") or None,
        r.get("MFR-MDL-CODE") or None,
        r.get("ENG-MFR-MDL") or None,
        codes.number(r.get("YEAR-MFR")),
        r.get("STATUS-CODE") or None,
        codes.name_or_none(r.get("NAME")),
        codes.REGISTRANT.get(r.get("INDICATOR-GROUP", "")),
        codes.name_or_none(city),
        state or None,
        r.get("COUNTRY-PHYSICAL") or r.get("COUNTRY-MAIL") or None,
        codes.airworthiness(r.get("CERTIFICATION")),
        codes.date(r.get("AIR-WORTH-DATE")),
        codes.date(r.get("CERT-ISSUE-DATE")),
        codes.date(r.get("LAST-ACT-DATE")),
        codes.date(r.get("CANCEL-DATE")),
        codes.name_or_none(r.get("EXP-COUNTRY")),
        (r.get("MODE S CODE HEX") or "").lower() or None,
        codes.name_or_none(kit, maker=True),
        others,
    )


def build(archive, db: sqlite3.Connection, rows: Rows) -> dict[str, int]:
    """DEREG, DOCINDEX and RESERVED from the archive into their tables
    (those the archive has; a test's may have none); how many rows each."""
    db.executescript(_SCHEMA)
    names = set(archive.namelist())
    counts = {}
    if "DEREG.txt" in names:
        insert = f"INSERT INTO deregistered VALUES ({','.join('?' * 20)})"
        batch, count = [], 0
        for r in rows(archive, "DEREG.txt"):
            batch.append(_deregistered(r))
            if len(batch) >= 5000:
                db.executemany(insert, batch)
                count += len(batch)
                batch = []
        db.executemany(insert, batch)
        counts["deregistered"] = count + len(batch)
    if "DOCINDEX.txt" in names:
        # Type Collateral 1 alone: an aircraft, by its N-number.
        docs = [
            (
                _n(r.get("COLLATERAL", "")),
                r.get("DOC-ID") or None,
                r.get("DOC-TYPE") or None,
                codes.date(r.get("DRDATE")),
                codes.date(r.get("PROCESSING-DATE")),
                codes.date(r.get("CORR-DATE")),
                r.get("CORR-ID") or None,
            )
            for r in rows(archive, "DOCINDEX.txt")
            if r.get("TYPE-COLLATERAL") == "1" and r.get("COLLATERAL")
        ]
        db.executemany("INSERT INTO documents VALUES (?,?,?,?,?,?,?)", docs)
        counts["documents"] = len(docs)
    if "RESERVED.txt" in names:
        held = [
            (
                _n(r.get("N-NUMBER", "")),
                codes.name_or_none(r.get("REGISTRANT")),
                codes.name_or_none(r.get("CITY")),
                r.get("STATE") or None,
                codes.date(r.get("RSV DATE")),
                r.get("TR") or None,
                codes.date(r.get("EXP DATE")),
                _n(r.get("N-NUM-CHG", "")),
                codes.date(r.get("PURGE DATE")),
            )
            for r in rows(archive, "RESERVED.txt")
            if r.get("N-NUMBER")
        ]
        db.executemany("INSERT OR REPLACE INTO reserved VALUES (?,?,?,?,?,?,?,?,?)", held)
        counts["reserved"] = len(held)
    return counts


def _read(db_path: Path, sql: str, args: tuple) -> list[dict]:
    """Rows of a query, [] where the file or its table (an older shape's,
    until the next read) is not there."""
    if not db_path.exists():
        return []
    with contextlib.closing(sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)) as db:
        db.row_factory = sqlite3.Row
        try:
            return [dict(r) for r in db.execute(sql, args).fetchall()]
        except sqlite3.OperationalError:
            return []


#: The fewest characters of a serial number matched to another
#: registration's: an amateur builder's "1" or "01" is shared by hundreds
#: of airplanes of the one maker code (056, checked 2026-11-14).
SERIAL_MIN_CHARS = 3


def past_registrations(db_path: Path, n_number: str, serial: str | None, model_code: str | None, year: int | None) -> list[dict]:
    """The canceled registrations of this N-number and of this airframe,
    newest canceled first. `same_airframe` says which are this airplane's
    own and which another airplane's that once had the N-number: the same
    serial number (at least SERIAL_MIN_CHARS long), the same make and model
    (the code's first five characters, ardata.pdf's Manufacturer and Model
    Codes; the series may change), and the same year built where both say
    one. A short serial or a maker's alone matched other airplanes by the
    hundred."""
    found = _read(
        db_path,
        """SELECT d.*, m.manufacturer, m.model FROM deregistered d LEFT JOIN models m ON m.code = d.model_code
        WHERE d.n_number = ? OR d.serial = ?""",
        (n_number, serial if serial and len(serial) >= SERIAL_MIN_CHARS else "\0"),
    )

    def same(row: dict) -> bool:
        return bool(
            serial
            and len(serial) >= SERIAL_MIN_CHARS
            and row["serial"] == serial
            and model_code
            and (row["model_code"] or "")[:5] == model_code[:5]
            and (row["year"] is None or year is None or row["year"] == year)
        )

    out = []
    for row in found:
        airframe = same(row)
        if row["n_number"] != n_number and not airframe:
            continue  # another airplane with the same serial
        code = row.pop("status_code") or ""
        row["status"] = codes.status(code)
        row["same_airframe"] = airframe
        out.append(row)
    out.sort(key=lambda r: r["cancel_date"] or "", reverse=True)
    return out


def documents(db_path: Path, n_number: str) -> list[dict]:
    """The documents filed for recording against this N-number, newest
    received first, each with its kind in words."""
    rows = _read(db_path, "SELECT * FROM documents WHERE n_number = ? ORDER BY received DESC, document_id", (n_number,))
    for row in rows:
        row["kind"] = codes.DOCUMENT.get(row["kind_code"] or "")
    return rows


def reservation(db_path: Path, n_number: str) -> dict | None:
    """The N-number's reservation, where it is reserved; None where not."""
    rows = _read(db_path, "SELECT * FROM reserved WHERE n_number = ?", (n_number,))
    if not rows:
        return None
    row = rows[0]
    row["kind"] = codes.RESERVATION.get(row["kind_code"] or "")
    return row
