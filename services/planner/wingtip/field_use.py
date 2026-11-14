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
  is Python's str.title()).

Each is None or empty where the file cannot be had, never a failure: a
card or a Brief without the line, not one that failed.
"""

from __future__ import annotations

import logging

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
    for row in (
        df[["ARPT_ID", "ICAO_ID", "NOTAM_ID", "ARPT_NAME", "INSPECT_METHOD_CODE", "LAST_INFO_RESPONSE", "LAST_INSPECTION"]]
        .fillna("")
        .itertuples(index=False)
    ):
        method = row.INSPECT_METHOD_CODE.strip().upper()
        record = {
            "data_source": "owner-reported" if method in _OWNER_REPORTED else "inspected" if method in _INSPECTED else None,
            "info_date": _date(row.LAST_INFO_RESPONSE) or _date(row.LAST_INSPECTION),
            "icao_id": row.ICAO_ID.strip().upper(),
            "notam_id": row.NOTAM_ID.strip().upper(),
            "name": row.ARPT_NAME.strip().title() or None,
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
