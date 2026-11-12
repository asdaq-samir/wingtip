"""The FAA's Preliminary Accident and Incident Notices
(faa.gov/data_research/accident_incident/preliminary_data): a day or two
after an event, each with its N-number, its place and whether anyone
died -- what the statements seldom give.

The notices are a Tableau dashboard on explore.dot.gov, whose CSV
export (…/PrelimininaryAccidentandIncidentReportData/SummaryViews.csv)
answers 403 to a scripted request and to a headless Chromium's request
after loading the dashboard alike (checked 2026-11-12, Akamai in front of
it). So the job does not fetch it, and no browser is added to its image
for it: a CSV a person saves from the dashboard (Download, Crosstab) is
dropped in data/raw/faa_prelim/, and each run reads every file there.
TODO: a fetch of its own, once a way in the FAA allows is found.

The columns are read by name, in either the ASIAS preliminary report's
spelling (EVENT_LCL_DATE, LOC_CITY_NAME, REGIST_NBR, FATAL_FLAG ...) or
the dashboard's words ("Event Local Date", "Registration Number" ...),
as both have been seen; a file with neither is skipped with a line in the
log, never guessed at."""

from __future__ import annotations

import csv
import datetime as dt
import io
import logging
import re
from pathlib import Path

from wingtip.config import DATA_DIR

from . import places, statements

log = logging.getLogger(__name__)

DROP = DATA_DIR / "raw" / "faa_prelim"
SOURCE = "faa_notice"

#: Each field by the names it has been given, normalised (upper case,
#: anything else an underscore).
_NAMES = {
    "date": ("EVENT_LCL_DATE", "EVENT_LOCAL_DATE", "EVENT_DATE", "LOCAL_EVENT_DATE"),
    "time": ("EVENT_LCL_TIME", "EVENT_LOCAL_TIME", "EVENT_TIME", "LOCAL_EVENT_TIME"),
    "city": ("LOC_CITY_NAME", "LOCATION_CITY", "CITY", "EVENT_CITY"),
    "state": ("LOC_STATE_NAME", "LOCATION_STATE", "STATE", "EVENT_STATE"),
    "n_number": ("REGIST_NBR", "REGISTRATION_NUMBER", "N_NUMBER", "AIRCRAFT_REGISTRATION"),
    "make": ("ACFT_MAKE_NAME", "AIRCRAFT_MAKE", "MAKE"),
    "model": ("ACFT_MODEL_NAME", "AIRCRAFT_MODEL", "MODEL"),
    "fatal": ("FATAL_FLAG", "FATAL", "FATALITY"),
    "kind": ("EVENT_TYPE_DESC", "EVENT_TYPE"),
    "remark": ("RMK_TEXT", "REMARK_TEXT", "REMARKS", "NARRATIVE"),
}
_DATES = ("%d-%b-%y", "%d-%b-%Y", "%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y")


def _norm(name: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", name.strip().upper()).strip("_")


def _date(text: str) -> str | None:
    t = text.strip().split(" ")[0]
    for form in _DATES:
        try:
            return dt.datetime.strptime(t, form).date().isoformat()
        except ValueError:
            continue
    return None


def _time(text: str) -> str | None:
    """ "14:25", "14:25:00", "1425" or "1425Z" as "14:25". A time written
    with a Z is still the notice's local time, as its column says."""
    m = re.fullmatch(r"(\d{1,2}):?(\d{2})(?::\d{2})?Z?", text.strip().upper())
    if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
        return None
    return f"{int(m.group(1)):02d}:{m.group(2)}"


def _n_number(text: str) -> str | None:
    t = re.sub(r"[\s-]+", "", text).upper()
    t = t if t.startswith("N") else f"N{t}"
    return t if statements.N_NUMBER.fullmatch(t) else None


def parse(text: str) -> list[dict]:
    """Each accident in the CSV, in the statements' shape (statements.parse):
    {"local_date", "local_time", "city", "state", "aircraft", "n_number",
    "fatal" (True, False, or None where it is not said), "heading", "text"
    (the notice's remark, as written)}. Incidents are left out: no film."""
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    columns = {_norm(c): c for c in reader.fieldnames or []}
    found = {field: next((columns[n] for n in names if n in columns), None) for field, names in _NAMES.items()}
    if not found["date"] or not found["n_number"]:
        log.warning("a notices CSV with no date or registration column (%s): skipped", ", ".join(columns) or "no header")
        return []
    out = []
    for row in reader:
        get = lambda f: (row.get(found[f]) or "").strip() if found[f] else ""  # noqa: E731
        kind = get("kind").lower()
        if kind and "accident" not in kind:
            continue
        local_date = _date(get("date"))
        if not local_date:
            continue
        fatal = get("fatal").lower()
        aircraft = " ".join(w for w in (get("make").title(), get("model")) if w) or None
        city = get("city").title() or None
        out.append(
            {
                "local_date": local_date,
                "local_time": _time(get("time")) if get("time") else None,
                "city": city,
                "state": places.state_code(get("state")),
                "aircraft": aircraft,
                "n_number": _n_number(get("n_number")) if get("n_number") else None,
                "fatal": True if fatal in ("yes", "y", "fatal", "true") else False if fatal in ("no", "n", "false") else None,
                "heading": f"Preliminary notice / {city or 'Unknown'}, {get('state')}",
                "text": get("remark"),
            }
        )
    return out


def dropped(folder: Path = DROP) -> list[tuple[Path, list[dict]]]:
    """Each CSV saved in the drop folder, read."""
    return [(path, parse(path.read_text(errors="replace"))) for path in sorted(folder.glob("*.csv"))] if folder.is_dir() else []
