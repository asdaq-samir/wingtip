"""Who may use a field and what NASR says of its own record, by the field's
FAA or ICAO identifier, from APT_BASE.csv (the 28-day NASR cycle the
planner has cached): what the airport card, search, the Brief and the IFR
alternate hand the engine, whose rules word them (wingtip_brief::
airport_use, gonogo::permission).

- use: `private` (FACILITY_USE_CODE PR and not the armed services', as
  faa_data.private_fields) and `military` ("military" or "joint", as
  faa_data.military_fields);
- the record: `data_source`, "owner-reported" where INSPECT_METHOD_CODE is
  1 or 2 (the 5010-1 and 5010-2 mailouts: the owner's figures, never
  inspected) and "inspected" where it is F, S or C (the FAA, a state, a
  contractor), None where NASR gives none; `info_date`, the last info
  response or else the last inspection, YYYY-MM-DD; `icao_id` and
  `notam_id` as NASR lists them ("" where it lists none: filed_zzzz and
  airport_notams_none tell "none" from "not known" by it); `name`, NASR's
  ARPT_NAME title-cased as the phones' packs write it (engine spoken::title
  is Python's str.title()); `status`, NASR's ARPT_STATUS, which the engine's
  field_status rules on (wingtip.field_status, decision 0043).

Each is None or empty where the file cannot be had, never a failure: a
card or a Brief without the line, not one that failed.
"""

from __future__ import annotations

import logging

import pandas as pd

from . import faa_data
from .single_flight import once
from .terrain import DEFAULT_FAA_CACHE_DIR

log = logging.getLogger(__name__)

#: NASR's INSPECT_METHOD_CODE: the mailouts (the owner's own report) and
#: the inspections.
_OWNER_REPORTED = frozenset({"1", "2"})
_INSPECTED = frozenset({"F", "S", "C"})


def use_of(ident: str, cache_dir=DEFAULT_FAA_CACHE_DIR) -> dict:
    """{"private": bool, "military": "military" | "joint" | None}."""
    key = (ident or "").strip().upper()
    return {"private": key in faa_data.private_fields(cache_dir), "military": faa_data.military_fields(cache_dir).get(key)}


def _date(text) -> str | None:
    """NASR's "2023/08/23" as "2023-08-23"; None for none."""
    text = (text or "").strip() if isinstance(text, str) else ""
    return text.replace("/", "-") if len(text) == 10 else None


@once(maxsize=2)
def _records_of(path: str, _mtime: float) -> dict:
    df = faa_data._read_apt_base_cached(path, _mtime)
    by_ident: dict = {}
    # Each column NASR files; one a file lacks (a test's few columns) is blank.
    columns = ["ARPT_ID", "ICAO_ID", "NOTAM_ID", "ARPT_NAME", "INSPECT_METHOD_CODE", "LAST_INFO_RESPONSE", "LAST_INSPECTION", "ARPT_STATUS"]
    for row in df.reindex(columns=columns).astype(object).fillna("").itertuples(index=False):
        method = row.INSPECT_METHOD_CODE.strip().upper()
        record = {
            "data_source": "owner-reported" if method in _OWNER_REPORTED else "inspected" if method in _INSPECTED else None,
            "info_date": _date(row.LAST_INFO_RESPONSE) or _date(row.LAST_INSPECTION),
            "icao_id": row.ICAO_ID.strip().upper(),
            "notam_id": row.NOTAM_ID.strip().upper(),
            "name": row.ARPT_NAME.strip().title() or None,
            "status": row.ARPT_STATUS.strip().upper() or None,
        }
        for ident in (row.ARPT_ID, row.ICAO_ID):
            if ident.strip():
                by_ident.setdefault(ident.strip().upper(), record)
    return by_ident


def record_of(ident: str, cache_dir=DEFAULT_FAA_CACHE_DIR) -> dict | None:
    """NASR's record of the field (the module's doc), None where APT_BASE
    lists no such field or cannot be had."""
    try:
        path = faa_data.ensure_nasr_file("APT_BASE.csv", cache_dir)
        records = _records_of(str(path), path.stat().st_mtime)
    except Exception:
        log.warning("No APT_BASE.csv for %s's record", ident, exc_info=True)
        return None
    return records.get((ident or "").strip().upper())


def nasr_name(ident: str, cache_dir=DEFAULT_FAA_CACHE_DIR) -> str | None:
    """The field's name as NASR files it, title-cased ("Ravenwood" for
    IL02, where OurAirports has an older one); None where NASR has none."""
    record = record_of(ident, cache_dir)
    return record["name"] if record else None


#: The idents a field of OurAirports' table goes by, the FAA's own first
#: (as wingtip.field_status reads NASR's status by).
_IDENT_COLUMNS = ("local_code", "ident", "icao_code", "gps_code")


def _by_idents(us: pd.DataFrame, by_ident: dict) -> pd.Series:
    """Each row's value in `by_ident` under the first of its idents listed."""
    found = pd.Series(None, index=us.index, dtype=object)
    for column in _IDENT_COLUMNS:
        if column in us.columns:
            found = found.fillna(us[column].astype(str).str.strip().str.upper().map(by_ident))
    return found


def named(us: pd.DataFrame, faa_path: str, faa_mtime: float) -> pd.DataFrame:
    """OurAirports' US table with each field NASR lists named as NASR files
    it (ARPT_NAME, title-cased as the phones' packs write it: IL02 is
    "Ravenwood", where OurAirports kept "Herbert C. Maas Airport"), and its
    use (`_use`: "private", "military", "joint" or None for public), so the
    planner's lists, its search and the packs name and mark a field alike.
    With no FAA file to hand, OurAirports' names and no use."""
    us = us.copy()
    us["_use"] = None
    if not faa_path:
        return us
    records = _records_of(faa_path, faa_mtime)
    names = _by_idents(us, {ident: r["name"] for ident, r in records.items() if r["name"]})
    us["name"] = names.fillna(us["name"])
    try:
        private = faa_data._private_of(faa_path, faa_mtime)
        uses = {**{ident: "private" for ident in private}, **faa_data._military_of(faa_path, faa_mtime)}
    except KeyError:  # a file without the use and ownership codes
        return us
    us["_use"] = _by_idents(us, uses).astype(object).where(lambda u: u.notna(), None)
    return us


def index_uses(us: pd.DataFrame) -> dict:
    """The search index's `use`: each field not open to every pilot, by the
    ident it is shown by, "private", "military" or "joint"."""
    return {d: u for d, u in zip(us["_display_ident"].astype(str), us["_use"]) if u}
