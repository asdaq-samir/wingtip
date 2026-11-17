"""What the FAA's airport file says about reaching a field and what it
offers there: NASR's APT_CON contacts (a phone and a street address) and
APT_BASE's services (fuel, fees, parking, repair, oxygen), each built once
per file version. wingtip.faa_data downloads the files and asks these by
identifier."""

import re

import pandas as pd

from .faa_apt_base import _read_apt_base_cached
from .single_flight import once


#: A box number, not a street a pilot can be driven to.
_PO_BOX = re.compile(r"^\s*P\.?\s*O\.?\s*BOX\b", re.IGNORECASE)


def _street_case(text: str) -> str:
    """The FAA's capitals set as an address is written: "2627 HOLLYWOOD
    WAY" as "2627 Hollywood Way", its compass points (NE) and ordinals
    (1st) as they are written."""
    words = text.strip().title()
    words = re.sub(r"\b(Ne|Nw|Se|Sw)\b", lambda m: m.group(1).upper(), words)
    return re.sub(r"(\d)(St|Nd|Rd|Th)\b", lambda m: m.group(1) + m.group(2).lower(), words)


def _address_of(row) -> str | None:
    """One line a map can find: the street (not a box number), the town,
    the state and the ZIP code -- None where it has no street."""
    street = next((a for a in (row["ADDRESS1"], row["ADDRESS2"]) if a.strip() and not _PO_BOX.match(a)), None)
    if not street:
        return None
    town = _street_case(row["TITLE_CITY"]) if row["TITLE_CITY"].strip() else None
    place = " ".join(p for p in (row["STATE"].strip(), row["ZIP_CODE"].strip()) if p)
    return ", ".join(p for p in (_street_case(street), town, place) if p)


@once(maxsize=2)
def _contacts_of(path: str, _mtime: float, base: str, _base_mtime: float) -> dict:
    try:
        con = pd.read_csv(path, dtype=str, low_memory=False, keep_default_na=False)
    except UnicodeDecodeError:
        # The 2026-10-29 edition has a byte that is no UTF-8 (0xA0, a
        # no-break space in Windows' code page): read as UTF-8 alone, the
        # whole file failed and every card lost its phone and address.
        con = pd.read_csv(path, dtype=str, low_memory=False, keep_default_na=False, encoding="cp1252")
    # The manager's first, the airport's own office as a rule, and the
    # owner's where there is no manager -- a county's or a company's.
    rank = {"MANAGER": 0, "OWNER": 1}
    con = con[con["TITLE"].isin(rank)].assign(rank=lambda d: d["TITLE"].map(rank)).sort_values("rank", kind="stable")
    by_id: dict = {}
    for row in con.to_dict("records"):
        mine = by_id.setdefault(row["ARPT_ID"].strip().upper(), {"phone": None, "address": None})
        if mine["phone"] is None and row["PHONE_NO"].strip():
            mine["phone"] = row["PHONE_NO"].strip()
        if mine["address"] is None:
            mine["address"] = _address_of(row)
    # And by the ICAO identifier pilots use (KBUR for BUR), from APT_BASE.
    apt = _read_apt_base_cached(base, _base_mtime)
    for arpt_id, icao_id in zip(apt["ARPT_ID"], apt["ICAO_ID"]):
        if isinstance(icao_id, str) and icao_id.strip() and isinstance(arpt_id, str) and arpt_id.strip().upper() in by_id:
            by_id.setdefault(icao_id.strip().upper(), by_id[arpt_id.strip().upper()])
    return by_id


#: NASR's repair codes a pilot reads as service: "NONE" and blank are none.
_REPAIRS = {"MAJOR": "major", "MINOR": "minor"}
NO_SERVICES = {
    "fuel_types": [],
    "landing_fee": None,
    "tie_down": False,
    "hangar": False,
    "airframe_repair": None,
    "powerplant_repair": None,
    "oxygen": False,
}


@once(maxsize=2)
def _services_of(base: str, _mtime: float) -> dict:
    apt = _read_apt_base_cached(base, _mtime).fillna("")
    by_id: dict = {}
    for row in apt.to_dict("records"):
        flag = row["LNDG_FEE_FLAG"].strip()
        services = {
            "fuel_types": [t.strip() for t in row["FUEL_TYPES"].split(",") if t.strip()],
            "landing_fee": True if flag == "Y" else False if flag == "N" else None,
            "tie_down": row["TRNS_STRG_TIE_FLAG"].strip() == "Y",
            "hangar": row["TRNS_STRG_HGR_FLAG"].strip() == "Y",
            "airframe_repair": _REPAIRS.get(row["AIRFRAME_REPAIR_SER_CODE"].strip()),
            "powerplant_repair": _REPAIRS.get(row["PWR_PLANT_REPAIR_SER"].strip()),
            "oxygen": any(row[c].strip() not in ("", "NONE") for c in ("BOTTLED_OXY_TYPE", "BULK_OXY_TYPE")),
        }
        by_id[row["ARPT_ID"].strip().upper()] = services
        if row["ICAO_ID"].strip():
            by_id.setdefault(row["ICAO_ID"].strip().upper(), services)
    return by_id
