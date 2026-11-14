"""What an airport's card lists of it beyond its runways and radio
(app.routers.airports airport_place): each phone the FAA holds for it,
its part-time surface airspace's hours and the time zone they are kept
in, with the phone and street address the card's Call and Address use
(faa_data.airport_contact). From NASR, the files the card already reads,
and the zone from where the field is: no live fetch.

- Phones: APT_CON's PHONE_NO for the field's MANAGER and OWNER, each
  labelled by whose it is, a number listed for both once. NASR carries no
  FBO's or tower's number as such (an FBO's is in a remark's words).
- Airspace hours: CLS_ARSP's AIRSPACE_HRS as sent, the Chart Supplement's
  AIRSPACE line ("CLASS D SVC 0600-2200 MON-FRI, 0700-2200 SAT-SUN; OTHER
  TIMES CLASS E", KPWK), which the engine's surface_hours reads at the
  field's local time (AIM 3-2-5a1).
- Time zone: wingtip.time_zone's IANA name, for the apps' local clock.
"""

from __future__ import annotations

import csv
import logging
from pathlib import Path

from . import faa_data, time_zone
from .pattern import faa_ids
from .config import DATA_DIR
from .single_flight import once

log = logging.getLogger(__name__)

FAA_CACHE_DIR = DATA_DIR / "raw" / "faa_nasr"
#: APT_CON's titles a pilot calls, in the order listed, as the card says them.
_WHO = {"MANAGER": "Manager", "OWNER": "Owner"}


def _rows(path: str) -> list[dict]:
    """A NASR CSV's rows; read as cp1252 where it is not UTF-8 (APT_CON of
    2026-10-29 has a 0xA0 byte, faa_data._contacts_of)."""
    try:
        with open(path, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))
    except UnicodeDecodeError:
        with open(path, newline="", encoding="cp1252") as f:
            return list(csv.DictReader(f))


@once(maxsize=2)
def _phones_of(path: str, _mtime: float) -> dict[str, list[dict]]:
    by_id: dict[str, list[dict]] = {}
    for row in _rows(path):
        who, number = _WHO.get((row.get("TITLE") or "").strip()), (row.get("PHONE_NO") or "").strip()
        listed = by_id.setdefault((row.get("ARPT_ID") or "").strip().upper(), [])
        if who and number and number not in (p["number"] for p in listed):
            listed.append({"who": who, "number": number})
    return by_id


@once(maxsize=2)
def _hours_of(path: str, _mtime: float) -> dict[str, str]:
    return {(r.get("ARPT_ID") or "").strip().upper(): h for r in _rows(path) if (h := (r.get("AIRSPACE_HRS") or "").strip())}


def _table(name: str, reader, cache_dir) -> dict:
    """One NASR file's table by FAA identifier; empty where it cannot be
    had, a card without it rather than one that failed."""
    try:
        path = faa_data.ensure_nasr_file(name, cache_dir)
        return reader(str(path), Path(path).stat().st_mtime)
    except Exception:
        log.warning("No %s for the airport card's details", name, exc_info=True)
        return {}


def of(place: dict, cache_dir=FAA_CACHE_DIR) -> dict:
    """The card's details of a field (an airports.find_place dict):
    {"phone", "address", "phones", "airspace_hours", "time_zone"}."""
    ids = faa_ids(place["ident"])
    phones, hours = _table("APT_CON.csv", _phones_of, cache_dir), _table("CLS_ARSP.csv", _hours_of, cache_dir)
    return {
        **faa_data.airport_contact(place["ident"], cache_dir),
        "phones": next((phones[i] for i in ids if phones.get(i)), []),
        "airspace_hours": next((hours[i] for i in ids if i in hours), None),
        "time_zone": time_zone.at(place["lat"], place["lon"]),
    }
