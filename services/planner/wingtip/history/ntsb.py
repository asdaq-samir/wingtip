"""The NTSB's record of an airplane's accident or incident, for the
Studio's replay (app.routers.studio_history): read from the NTSB's
aviation database (avall.mdb, data.ntsb.gov/avdata, every case since
2008, remade each month) into ``ntsb.sqlite`` beside the live store, the
weekly deltas after it written over it case by case (apply), by ingest
(services/ingest/ingest/ntsb.py), and asked here by registration and day.

The tables and columns are the NTSB's own (eADMSPUB, the data
dictionary at data.ntsb.gov/avdata, "eadmspub.pdf", checked 2026-11-12):
``events`` (ev_id, ntsb_no, ev_date, ev_city, ev_state, ev_country,
ev_highest_injury), ``aircraft`` (ev_id, Aircraft_Key, regis_no,
phase_flt_spec), ``narratives`` (narr_accp, the factual narrative;
narr_accf, the summary released with the final report; narr_cause, the
probable cause, "not available until the final report is released") and
``Events_Sequence`` (each occurrence, its phase_no, and Defining_ev for
the one that defines the case).

The words for a code are the NTSB's own, from the file: the injury level
and the pre-2008 phase of flight (aircraft.phase_flt_spec, the Aviation
Coding Manual's Part V) from its data dictionary table
(eADMSPUB_DataDictionary, "meaning"). The phase of today's cases
(Events_Sequence.phase_no) has no meaning there; each occurrence's own
description is its phase's words and then its occurrence's ("Enroute-
descent Loss of engine power (partial)"), so a phase's words are those
every description of that phase begins with, and an occurrence's those
every description of it ends with, across the whole file (phase_words).

Every text is kept and given verbatim, as the NTSB wrote it.
"""

from __future__ import annotations

import re
import sqlite3
from collections import defaultdict
from collections.abc import Callable, Iterable
from pathlib import Path

from ..atomic import atomic_path
from ..config import get_settings

SOURCE = "NTSB aviation accident database (data.ntsb.gov/avdata)"
CREDIT = "Accident and incident records: National Transportation Safety Board."
#: The CAROL report of a case, by the case's own key: the digits of its
#: ev_id after the date (ev_id 20261023204059 is report 204059, checked
#: 2026-11-12 against CEN27LA029), for the ids eADMS gives today.
CAROL_REPORT = "https://data.ntsb.gov/carol-repgen/api/Aviation/ReportMain/GenerateNewestReport/{key}/pdf"
#: CAROL's search, for a case whose report key the file does not give.
CAROL_SEARCH = "https://data.ntsb.gov/carol-main-public/basic-search"
#: The case's public docket page, by its NTSB number; it says so where
#: the docket is not released yet (checked 2026-11-12).
DOCKET = "https://data.ntsb.gov/Docket/?NTSBNumber={ntsb_no}"

_EADMS_ID = re.compile(r"^\d{8}(\d{4,})$")
_N_BODY = re.compile(r"^[1-9][0-9A-Z]{0,4}$")
_SCHEMA = """
CREATE TABLE events (ev_id TEXT PRIMARY KEY, ntsb_no TEXT, date TEXT, city TEXT, state TEXT, country TEXT, highest_injury TEXT);
CREATE TABLE aircraft (ev_id TEXT, aircraft_key TEXT, registration TEXT, phase TEXT, PRIMARY KEY (ev_id, aircraft_key));
CREATE INDEX aircraft_registration ON aircraft (registration);
CREATE TABLE narratives (ev_id TEXT, aircraft_key TEXT, factual TEXT, final TEXT, cause TEXT, PRIMARY KEY (ev_id, aircraft_key));
CREATE TABLE phases (phase_no TEXT PRIMARY KEY, words TEXT);
"""

#: How many columns each case table has, as _SCHEMA makes them.
_COLUMNS = {"events": 7, "aircraft": 4, "narratives": 5}

Rows = Callable[[str], Iterable[dict]]


def store_path() -> Path:
    """The store, beside the live store on the data volume the planner and
    ingest share."""
    return get_settings().live_store.parent / "ntsb.sqlite"


def registration(text: str) -> str:
    """A registration as the store keeps it: capitals, no spaces or
    dashes ("C-GBHZ" is CGBHZ), as the NTSB writes it, the N of a US one
    included."""
    return re.sub(r"[\s-]+", "", text or "").upper()


def _blank(value) -> str | None:
    return value if value not in (None, "") else None


def _common(texts: set[str], from_end: bool) -> str | None:
    """The words every text begins (or ends) with; None for fewer than two
    texts, or none in common."""
    if len(texts) < 2:
        return None
    words = [t.split(" ") for t in texts]
    if from_end:
        words = [w[::-1] for w in words]
    same = []
    for column in zip(*words):
        if len(set(column)) > 1:
            break
        same.append(column[0])
    # All the words of the shortest in common is no split at all.
    if not same or len(same) == min(len(w) for w in words):
        return None
    return " ".join(same[::-1] if from_end else same)


def phase_words(sequence: Iterable[dict]) -> dict[str, str]:
    """Each phase_no's words, from every occurrence's description: those
    its descriptions all begin with, or failing that, a description less
    the words its occurrence's descriptions all end with; the shorter
    where both are known."""
    by_phase: dict[str, set[str]] = defaultdict(set)
    by_event: dict[str, set[str]] = defaultdict(set)
    seen: list[tuple[str, str, str]] = []
    for row in sequence:
        phase, event, words = row.get("phase_no") or "", row.get("eventsoe_no") or "", (row.get("Occurrence_Description") or "").strip()
        if phase and words:
            by_phase[phase].add(words)
            by_event[event].add(words)
            seen.append((phase, event, words))
    starts = {p: _common(ws, False) for p, ws in by_phase.items()}
    ends = {e: _common(ws, True) for e, ws in by_event.items()}
    out: dict[str, str] = {}
    for phase, event, words in seen:
        found = []
        if starts.get(phase):
            found.append(starts[phase])
        tail = ends.get(event)
        if tail and words.endswith(" " + tail):
            found.append(words[: -len(tail) - 1])
        if found:
            best = min(found, key=len)
            out[phase] = min(out.get(phase, best), best, key=len)
    return out


def _meanings(dictionary: Iterable[dict]) -> dict[tuple[str, str], dict[str, str]]:
    """The data dictionary's meaning of each code, by (table, column)."""
    out: dict[tuple[str, str], dict[str, str]] = defaultdict(dict)
    for row in dictionary:
        code = (row.get("code_iaids") or "").strip()
        if code and row.get("meaning"):
            out[(row.get("Table") or "", row.get("Column") or "")][code] = row["meaning"]
    return out


def _load(db: sqlite3.Connection, rows: Rows, known: dict[str, str], replace: bool) -> int:
    """The tables written into the store: each case's rows, and with
    `replace` (a weekly delta) every row the store had of a case in a
    table first removed from that table, so the delta's word of it is the
    only one. A phase's words are those the store already knows, from the
    whole database, else the file's own (a delta's few occurrences seldom
    tell them). How many
    aircraft were written."""
    meanings = _meanings(rows("eADMSPUB_DataDictionary"))
    injuries = meanings[("events", "ev_highest_injury")]
    old_phases = meanings[("aircraft", "phase_flt_spec")]
    sequence = list(rows("Events_Sequence"))
    phases = {**phase_words(sequence), **known}
    db.executemany("INSERT OR REPLACE INTO phases VALUES (?, ?)", phases.items())
    defining = {(r["ev_id"], r["Aircraft_Key"]): phases.get(r.get("phase_no") or "") for r in sequence if r.get("Defining_ev") == "1"}
    tables = {
        "events": lambda r: (
            r["ev_id"],
            r.get("ntsb_no"),
            (r.get("ev_date") or "")[:10],
            _blank(r.get("ev_city")),
            _blank(r.get("ev_state")),
            _blank(r.get("ev_country")),
            injuries.get(r.get("ev_highest_injury") or "", _blank(r.get("ev_highest_injury"))),
        ),
        "aircraft": lambda r: (
            r["ev_id"],
            r["Aircraft_Key"],
            registration(r.get("regis_no") or ""),
            defining.get((r["ev_id"], r["Aircraft_Key"])) or old_phases.get(r.get("phase_flt_spec") or ""),
        ),
        "narratives": lambda r: (
            r["ev_id"],
            r["Aircraft_Key"],
            _blank(r.get("narr_accp")),
            _blank(r.get("narr_accf")),
            _blank(r.get("narr_cause")),
        ),
    }
    written = 0
    for table, row_of in tables.items():
        insert = f"INSERT OR REPLACE INTO {table} VALUES ({','.join('?' * _COLUMNS[table])})"
        if replace:
            # A delta is a few hundred rows: held, so its cases are known first.
            values = [row_of(r) for r in rows(table)]
            db.executemany(f"DELETE FROM {table} WHERE ev_id = ?", [(ev_id,) for ev_id in {v[0] for v in values}])
            db.executemany(insert, values)
            count = len(values)
        else:
            # The whole database is streamed: its narratives alone are 135 MB.
            count = 0
            for r in rows(table):
                db.execute(insert, row_of(r))
                count += 1
        if table == "aircraft":
            written = count
    return written


def build(rows: Rows, path: Path | None = None) -> int:
    """The store made anew from the NTSB's tables, `rows(table)` giving
    each table's rows as dicts (mdb-export's CSV, its dates as
    YYYY-MM-DD), and put in place of the old one at once, so a reader never
    sees half of it. How many aircraft it holds."""
    path = path or store_path()
    with atomic_path(path, suffix=".building") as fresh:
        db = sqlite3.connect(fresh)
        try:
            db.executescript(_SCHEMA)
            count = _load(db, rows, {}, replace=False)
            db.commit()
        finally:
            db.close()
    return count


def apply(rows: Rows, path: Path | None = None) -> int:
    """A weekly delta's tables (as build's) written over the store, case by
    case (ev_id): a case it has replaces the store's, a new one is added,
    the rest are left. One transaction, so a reader sees all of it or none.
    How many aircraft it wrote."""
    path = path or store_path()
    db = sqlite3.connect(path)
    try:
        known = dict(db.execute("SELECT phase_no, words FROM phases").fetchall())
        count = _load(db, rows, known, replace=True)
        db.commit()
    finally:
        db.close()
    return count


def _carol(ev_id: str) -> str:
    key = _EADMS_ID.match(ev_id or "")
    return CAROL_REPORT.format(key=int(key.group(1))) if key else CAROL_SEARCH


def events(reg: str, day: str, path: Path | None = None) -> list[dict]:
    """The cases of the airplane `reg` dated within a day either side of
    `day` (YYYY-MM-DD; the NTSB's date is the local one where it happened,
    the replay's the UTC day), oldest first, each as app.schemas'
    NtsbEvent. None where the store is not built yet."""
    path = path or store_path()
    if not path.exists():
        return []
    wanted = registration(reg)
    names = {wanted} | ({"N" + wanted} if _N_BODY.match(wanted) else set())
    marks = ",".join("?" * len(names))
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        rows = db.execute(
            f"""
            SELECT e.ev_id, e.ntsb_no, e.date, e.city, e.state, e.country, a.phase, e.highest_injury, n.factual, n.final, n.cause
            FROM aircraft a JOIN events e ON e.ev_id = a.ev_id
            LEFT JOIN narratives n ON n.ev_id = a.ev_id AND n.aircraft_key = a.aircraft_key
            WHERE a.registration IN ({marks}) AND e.date BETWEEN date(?, '-1 day') AND date(?, '+1 day')
            ORDER BY e.date, e.ntsb_no
            """,
            (*sorted(names), day, day),
        ).fetchall()
    finally:
        db.close()
    out = []
    for ev_id, ntsb_no, date, city, state, country, phase, injury, factual, final, cause in rows:
        # The summary released with the final report where there is one,
        # else the factual narrative, which is the preliminary's until then.
        is_final = bool(final or cause)
        narrative = final or factual
        out.append(
            {
                "ntsb_no": ntsb_no,
                "ev_id": ev_id,
                "date": date,
                "city": city,
                "state": state,
                "country": country,
                "phase": phase,
                "highest_injury": injury,
                "probable_cause": cause,
                "narrative": narrative,
                "narrative_kind": ("final" if is_final else "preliminary") if narrative or cause else None,
                "carol_url": _carol(ev_id),
                "docket_url": DOCKET.format(ntsb_no=ntsb_no) if ntsb_no else None,
            }
        )
    return out


__all__ = ["CREDIT", "SOURCE", "apply", "build", "events", "phase_words", "registration", "store_path"]
