"""A US airplane's FAA registration: who it is registered to, what it is,
its engine and its certificates, from the FAA's Releasable Aircraft
Database (registry.faa.gov/database/ReleasableAircraft.zip; its fields
and codes in the FAA's ardata.pdf, "Aircraft Registration Master File",
dated 5/8/2025). The FAA writes it each night; it is read again here
when the copy on disk is a day old, into a SQLite file beside the
download, so a lookup is one indexed read rather than the 195 MB master
file held in the planner's memory.

Beside the airplanes (MASTER.txt), the file keeps the FAA's reference
files in full (ACFTREF.txt, ENGINE.txt) and its deregistered, document and
reserved files (wingtip.registry_history), all from the one download.

The FAA leaves out of it the names and addresses of owners who asked it
to withhold them (49 U.S.C. 44114(b)); of the rest, the owner's name and
town are given here, not the street.
"""

from __future__ import annotations

import contextlib
import json
import logging
import re
import sqlite3
import threading
import time
import zipfile
from pathlib import Path

from . import outside, registry_history, stores
from .registry_reader import _file, _reading
from .registry_reader import addresses as _addresses
from . import registry_codes as codes
from .atomic import atomic_path
from .config import REGISTRY_HEADERS
from .faa_data import zip_csv

log = logging.getLogger(__name__)

URL = "https://registry.faa.gov/database/ReleasableAircraft.zip"
DEFAULT_DIR = Path(__file__).resolve().parents[3] / "data" / "raw" / "faa_registry"
DB_NAME = "registry.sqlite"
#: The copy on disk is read again once it is this old, s: the FAA's is
#: written each night.
MAX_AGE_S = 24 * 3600

#: The file's shape: user_version, so a copy of an older shape is read
#: again from the FAA's download rather than asked for columns it lacks
#: (2: the reference files in full, every MASTER field and the
#: deregistered, document and reserved files, 2026-11-14; 3: the
#: deregistered rows indexed by address, where a lookup by it read all
#: 383,846 of them, 65 ms, now 0.02 ms, 2026-11-27).
SCHEMA = 3

_LOCK = threading.Lock()
_BUILDING = threading.Event()


_MODELS = """CREATE TABLE models (code TEXT PRIMARY KEY, manufacturer TEXT, model TEXT, aircraft_type TEXT,
    engine_type TEXT, category TEXT, builder_certification TEXT, engines INTEGER, seats INTEGER, weight_class TEXT,
    cruise_mph INTEGER, tc_data_sheet TEXT, tc_holder TEXT)"""
_ENGINES = """CREATE TABLE engines (code TEXT PRIMARY KEY, manufacturer TEXT, model TEXT, engine_type TEXT,
    horsepower INTEGER, thrust_lb INTEGER)"""
_AIRCRAFT = """CREATE TABLE aircraft (n_number TEXT PRIMARY KEY, mode_s_hex TEXT, serial TEXT, manufacturer TEXT,
    model TEXT, year INTEGER, aircraft_type TEXT, engines INTEGER, seats INTEGER, engine TEXT, engine_type TEXT,
    horsepower INTEGER, thrust_lb INTEGER, owner TEXT, owner_type TEXT, co_owners INTEGER, city TEXT, state TEXT,
    country TEXT, status_code TEXT, certificate_issued TEXT, expires TEXT, airworthiness TEXT,
    airworthiness_date TEXT, kit TEXT, fractional INTEGER, model_code TEXT, engine_code TEXT, region TEXT,
    last_action TEXT, mode_s_octal TEXT, unique_id TEXT, certification_code TEXT, co_owner_names TEXT)"""


def _maker(text: str) -> str | None:
    return codes.name_or_none(text if text and text != "NONE" else "", maker=True)


def _reference(archive: zipfile.ZipFile, db: sqlite3.Connection) -> tuple[dict, dict]:
    """ACFTREF and ENGINE in full into their tables (ardata.pdf, "Aircraft
    Reference File" and "Engine Reference File"), and what each airplane's
    row takes of them, as tuples: ACFTREF's ninety thousand models as
    dicts were a hundred megabytes of the planner's. Each table's rows go
    in as they are read (executemany over a generator), never held whole
    beside the look-up (round 4's audit: the 94,241 models were held twice)."""
    db.execute(_MODELS)
    db.execute(_ENGINES)
    models, engines = {}, {}

    def model_rows():
        for r in zip_csv(archive, "ACFTREF.txt"):
            models[r["CODE"]] = (r["MFR"], r["MODEL"], r["NO-ENG"], r["NO-SEATS"])
            yield (
                r["CODE"],
                _maker(r["MFR"]),
                r["MODEL"] or None,
                codes.AIRCRAFT.get(r.get("TYPE-ACFT", "")),
                codes.ENGINE.get(r.get("TYPE-ENG", "")),
                codes.CATEGORY.get(r.get("AC-CAT", "")),
                codes.BUILDER.get(r.get("BUILD-CERT-IND", "")),
                codes.number(r["NO-ENG"]),
                codes.number(r["NO-SEATS"]),
                codes.WEIGHT.get(r.get("AC-WEIGHT", "")),
                # "Not present on all records": 0000 where it is not.
                codes.number(r.get("SPEED")) or None,
                r.get("TC-DATA-SHEET") or None,
                _maker(r.get("TC-DATA-HOLDER", "")),
            )

    def engine_rows():
        for r in zip_csv(archive, "ENGINE.txt"):
            engines[r["CODE"]] = (r["MFR"], r["MODEL"], r["HORSEPOWER"], r["THRUST"])
            yield (
                r["CODE"],
                _maker(r["MFR"]),
                r["MODEL"] if r["MODEL"] and r["MODEL"] != "NONE" else None,
                codes.ENGINE.get(r.get("TYPE", "")),
                codes.number(r["HORSEPOWER"]) or None,
                codes.number(r["THRUST"]) or None,
            )

    db.executemany(f"INSERT OR REPLACE INTO models VALUES ({','.join('?' * 13)})", model_rows())
    db.executemany(f"INSERT OR REPLACE INTO engines VALUES ({','.join('?' * 6)})", engine_rows())
    return models, engines


def _airplane(r: dict, models: dict, engines: dict) -> tuple:
    """A MASTER row as the aircraft table's: every field the readme gives
    but the street, second street, zip code and county of the address,
    which the app does not show (the owner's town, not the street)."""
    maker, model, engine_count, seats = models.get(r.get("MFR MDL CODE", ""), ("", "", "", ""))
    engine_maker, engine_model, horsepower, thrust = engines.get(r.get("ENG MFR MDL", ""), ("", "", "", ""))
    kit = " ".join(p for p in (r.get("KIT MFR", ""), r.get("KIT MODEL", "")) if p)
    engine_name = " ".join(p for p in (engine_maker, engine_model) if p and p != "NONE")
    others = [codes.name_case(r[k]) for k in (f"OTHER NAMES({i})" for i in range(1, 6)) if r.get(k)]
    return (
        "N" + r["N-NUMBER"],
        (r.get("MODE S CODE HEX") or "").lower() or None,
        r.get("SERIAL NUMBER") or None,
        _maker(maker),
        model or None,
        codes.number(r.get("YEAR MFR")),
        codes.AIRCRAFT.get(r.get("TYPE AIRCRAFT", "")),
        codes.number(engine_count),
        codes.number(seats),
        _maker(engine_name),
        codes.ENGINE.get(r.get("TYPE ENGINE", "")),
        codes.number(horsepower) or None,
        codes.number(thrust) or None,
        codes.name_or_none(r.get("NAME")),
        codes.REGISTRANT.get(r.get("TYPE REGISTRANT", "")),
        len(others),
        codes.name_or_none(r.get("CITY")),
        r.get("STATE") or None,
        r.get("COUNTRY") or None,
        r.get("STATUS CODE") or None,
        codes.date(r.get("CERT ISSUE DATE")),
        codes.date(r.get("EXPIRATION DATE")),
        codes.airworthiness(r.get("CERTIFICATION")),
        codes.date(r.get("AIR WORTH DATE")),
        _maker(kit),
        1 if r.get("FRACT OWNER") == "Y" else 0,
        r.get("MFR MDL CODE") or None,
        r.get("ENG MFR MDL") or None,
        codes.REGION.get(r.get("REGION", "")),
        codes.date(r.get("LAST ACTION DATE")),
        r.get("MODE S CODE") or None,
        r.get("UNIQUE ID") or None,
        r.get("CERTIFICATION") or None,
        json.dumps(others) if others else None,
    )


def build(zip_path: Path, db_path: Path) -> int:
    """The registry's SQLite file from the FAA's archive, written beside
    and then put in place whole; how many airplanes it holds."""
    insert = f"INSERT OR REPLACE INTO aircraft VALUES ({','.join('?' * 34)})"
    with zipfile.ZipFile(zip_path) as archive, atomic_path(db_path, suffix=".sqlite") as tmp:
        db = sqlite3.connect(tmp)
        try:
            models, engines = _reference(archive, db)
            db.execute(_AIRCRAFT)
            airplanes = (_airplane(r, models, engines) for r in zip_csv(archive, "MASTER.txt") if r.get("N-NUMBER"))
            count = db.executemany(insert, airplanes).rowcount
            db.execute("CREATE INDEX aircraft_mode_s ON aircraft (mode_s_hex)")
            # DEREG, DOCINDEX and RESERVED, where the archive has them.
            registry_history.build(archive, db, zip_csv)
            db.execute(f"PRAGMA user_version = {SCHEMA}")
            db.commit()
        finally:
            db.close()
    return count


def schema(db_path: Path) -> int:
    """The shape of the registry file on disk (SCHEMA), 0 where there is none."""
    if not db_path.exists():
        return 0
    with contextlib.closing(stores.read_only(db_path)) as db:
        return db.execute("PRAGMA user_version").fetchone()[0]


def refresh(directory: Path = DEFAULT_DIR, force: bool = False) -> bool:
    """The FAA's registry downloaded and read again where the copy on disk
    is a day old or missing; whether it was. One at a time: a second
    caller while one reads it returns at once."""
    directory = Path(directory)
    db_path = directory / DB_NAME
    fresh = db_path.exists() and time.time() - db_path.stat().st_mtime < MAX_AGE_S
    if not force and fresh and schema(db_path) == SCHEMA:
        return False
    with _LOCK:
        if _BUILDING.is_set():
            return False
        _BUILDING.set()
    try:
        directory.mkdir(parents=True, exist_ok=True)
        zip_path = directory / "ReleasableAircraft.zip"
        resp = outside.get(URL, headers=REGISTRY_HEADERS, timeout=300, stream=True)
        resp.raise_for_status()
        with open(zip_path, "wb") as out:
            for chunk in resp.iter_content(1 << 20):
                out.write(chunk)
        count = build(zip_path, db_path)
        zip_path.unlink(missing_ok=True)
        log.info("FAA aircraft registry read: %d airplanes", count)
        return True
    finally:
        _BUILDING.clear()


def addresses(n_numbers: frozenset[str], directory: Path = DEFAULT_DIR) -> frozenset[str]:
    """The Mode S addresses of these N-numbers (registry_reader.addresses)."""
    return _addresses(n_numbers, Path(directory) / DB_NAME)


def version(directory: Path = DEFAULT_DIR) -> tuple | None:
    """Which registry file is on disk (its path, inode and mtime); None where none is."""
    return _file(Path(directory) / DB_NAME)


def lookup(hex_id: str | None = None, n_number: str | None = None, directory: Path = DEFAULT_DIR) -> dict | None:
    """An airplane's registration by its transponder's ICAO address or its
    N-number; None where the registry is not read yet or has no such
    airplane (one registered abroad among them). "status" is the FAA's
    status in words, "standing" whether it is valid, not in effect
    ("lapsed") or something between ("other": a form not returned, a
    sale reported, a renewal notice)."""
    db_path = Path(directory) / DB_NAME
    if not db_path.exists():
        return None
    n = (n_number or "").strip().upper().replace("-", "")
    with _reading(db_path) as db:
        row = None
        # adsb.lol marks a TIS-B / ADS-R pseudo-address with "~": it is not a
        # Mode S code the FAA assigned, so it must not match an owner's.
        if hex_id and not hex_id.startswith("~"):
            row = db.execute("SELECT * FROM aircraft WHERE mode_s_hex = ?", (hex_id.lower(),)).fetchone()
        if row is None and re.fullmatch(r"N[1-9][0-9A-Z]{0,4}", n):
            row = db.execute("SELECT * FROM aircraft WHERE n_number = ?", (n,)).fetchone()
        if row is None:
            return _last_registration(db, hex_id, n)
    found = dict(row)
    code = found.pop("status_code") or ""
    found["standing"] = codes.standing(code)
    found["status"] = codes.status(code)
    found["fractional"] = bool(found["fractional"])
    found["co_owner_names"] = json.loads(found.get("co_owner_names") or "[]")
    return codes.short_type(found)


def _last_registration(db: sqlite3.Connection, hex_id: str | None, n: str) -> dict | None:
    """An airplane with no registration in effect, by its last canceled one
    (DEREG.txt), newest canceled first: its make, model, year and address
    as the FAA last had them, "Deregistered" its status and "lapsed" its
    standing. The owner's N6460R, a 1966 PA-28-140 canceled 2024-03-09 with
    its registration pending, read "Not registered" and nothing more
    (2026-11-27): it is public data, shown (the owner, 2026-11-26)."""
    row = db.execute(
        """SELECT d.*, m.manufacturer, m.model, m.aircraft_type, m.engines, m.seats,
                  e.manufacturer || ' ' || e.model AS engine, e.engine_type, e.horsepower, e.thrust_lb
           FROM deregistered d LEFT JOIN models m ON m.code = d.model_code LEFT JOIN engines e ON e.code = d.engine_code
           WHERE d.n_number = ? OR (? != '' AND d.mode_s_hex = ?) ORDER BY d.cancel_date DESC LIMIT 1""",
        (n, (hex_id or "").lower(), (hex_id or "").lower()),
    ).fetchone()
    if row is None:
        return None
    found = dict(row)
    found.pop("status_code", None)
    found.pop("export_country", None)
    cancelled = found.pop("cancel_date", None)
    return codes.short_type(
        {
            **found,
            "status": "Deregistered",
            "standing": "lapsed",
            "fractional": False,
            "co_owner_names": [],
            "expires": None,
            "last_action": cancelled or found.get("last_action"),
        }
    )


def _one(db_path: Path, table: str, code: str | None) -> dict | None:
    if not code or not db_path.exists():
        return None
    with _reading(db_path) as db:
        row = db.execute(f"SELECT * FROM {table} WHERE code = ?", (code,)).fetchone()
    return dict(row) if row else None


def model(code: str | None, directory: Path = DEFAULT_DIR) -> dict | None:
    """The FAA's reference record of an airplane's make, model and series
    (ACFTREF, by MASTER's MFR MDL CODE), as the models table keeps it;
    None where there is none. Its cruise_mph is the FAA's "average cruising
    speed" (ardata.pdf), a reference figure, not one to plan with."""
    return _one(Path(directory) / DB_NAME, "models", code)


def engine_model(code: str | None, directory: Path = DEFAULT_DIR) -> dict | None:
    """The FAA's reference record of an engine (ENGINE, by MASTER's ENG MFR
    MDL); horsepower for the piston and turbine-shaft types, thrust for
    the jets (ardata.pdf)."""
    return _one(Path(directory) / DB_NAME, "engines", code)
