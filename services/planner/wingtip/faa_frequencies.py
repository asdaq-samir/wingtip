"""A field's radio frequencies from NASR's FRQ file, as the card's types
name them (CTAF, UNICOM, tower, ground, clearance, ATIS, approach and
departure, Flight Service outlets), built once per file version.
wingtip.faa_data downloads the files and asks these by identifier."""

import re

import pandas as pd

from .faa_apt_base import _read_apt_base_cached
from .single_flight import once
from .engine import ask as engine


# NASR's FREQ_USE for what a VFR pilot calls on, as the card's types
# (lib/frequencies) name them; the rest -- emergency, military command
# posts, operations, dispatch, the navaids' own -- are left off.
_FREQUENCY_USES = {
    "CTAF": "CTAF",
    "UNICOM": "UNICOM",
    "LCL/P": "TWR",
    "LCL/S": "TWR",
    "GND/P": "GND",
    "GND/S": "GND",
    "CD/P": "CLD",
    "CD/S": "CLD",
    "CD": "CLD",
    "ATIS": "ATIS",
    "D-ATIS": "ATIS",
    "APCH/P DEP/P": "A/D",
    "APCH/S DEP/S": "A/D",
    "APCH/P DEP/P IC": "A/D",
    "APCH/P": "APP",
    "APCH/S": "APP",
    "APCH/P IC": "APP",
    "DEP/P": "DEP",
    "DEP/S": "DEP",
    # Who to call before a Class B, C or a TRSA, and its sector.
    "CLASS B": "APP",
    "CLASS C": "APP",
    "TRSA": "APP",
}
#: The civil aviation VHF band, MHz: what a light airplane's radio tunes.
_VHF = (118.0, 137.0)


def _name_case(text: str) -> str:
    """A facility's name in the FAA's capitals as a name is written:
    "CHICAGO" as "Chicago", "DULUTH RCO" as "Duluth RCO"."""
    return " ".join(w if w in ("RCO", "TWR") else w.capitalize() for w in text.split())


def _sector_case(text: str, idents: frozenset = frozenset()) -> str:
    """A sector as the Chart Supplement gives it, its words in lower case
    and its codes kept -- bearings ("360-179"), runways ("RWY 04R/22L"),
    idents of three letters ("VNY 280-BUR 050, north") and an airport's
    own ICAO ident ("KBUR 050"), which `idents` names."""
    return re.sub(r"[A-Z]{4,}", lambda m: m.group(0) if m.group(0) in idents else m.group(0).lower(), text.strip())


@once(maxsize=2)
def _frequencies_of(path: str, _mtime: float, base: str, _base_mtime: float) -> tuple[dict, frozenset]:
    """FRQ.csv's frequencies by the field they serve, by its FAA and its
    ICAO identifier: [{"type", "description", "frequency_mhz"}]; and the
    FAA identifiers of the fields that have no ICAO identifier of their
    own, the only ones a "K" is OurAirports' addition to."""
    frq = pd.read_csv(path, dtype=str, low_memory=False, keep_default_na=False)
    apt = _read_apt_base_cached(base, _base_mtime)
    idents = frozenset(i.strip().upper() for i in apt["ICAO_ID"] if isinstance(i, str) and i.strip())
    by_id: dict = {}
    for row in frq.to_dict("records"):
        use = row["FREQ_USE"].strip().upper()
        kind = _FREQUENCY_USES.get(use)
        if kind is None and use.endswith(" RCO"):
            # A Flight Service remote outlet near the field, named for it.
            kind = "RCO"
        try:
            mhz = float(row["FREQ"])
        except ValueError:
            continue
        if kind is None or not _VHF[0] <= mhz < _VHF[1]:
            continue
        # Who answers and the sector, as the Chart Supplement sets them:
        # the approach control's name for an approach ("CHICAGO 360-179"),
        # the tower's for the tower, ground and clearance ("O HARE"). A
        # Class B's or C's own words where it is one.
        approach = kind in ("APP", "DEP", "A/D")
        call = (row["PRIMARY_APPROACH_RADIO_CALL"] if approach else row["TOWER_OR_COMM_CALL"]).strip()
        words = " ".join(
            w
            for w in (
                {"CLASS B": "Class B", "CLASS C": "Class C", "TRSA": "TRSA"}.get(use, ""),
                _name_case(use) if kind == "RCO" else "",
                _name_case(call) if kind in ("APP", "DEP", "A/D", "TWR", "GND", "CLD") else "",
                _sector_case(row["SECTORIZATION"], idents),
            )
            if w
        )
        entries = by_id.setdefault(row["SERVICED_FACILITY"].strip().upper(), [])
        entry = {"type": kind, "description": words or None, "frequency_mhz": mhz}
        if entry not in entries:
            entries.append(entry)
    # A CTAF and a UNICOM on one frequency are one row, as the Chart
    # Supplement writes them: "CTAF/UNICOM 123.0"; and a Class B's or C's
    # frequency that is also the approach's sector is that sector's row
    # alone (Madison's 120.1, both "MADISON EAST" and "CLASS C").
    for entries in by_id.values():
        ctaf = {e["frequency_mhz"] for e in entries if e["type"] == "CTAF"}
        approach = {
            e["frequency_mhz"]
            for e in entries
            if e["type"] in ("A/D", "DEP") or (e["type"] == "APP" and not (e["description"] or "").startswith(("Class", "TRSA")))
        }
        for e in entries:
            if e["type"] == "CTAF" and any(u["type"] == "UNICOM" and u["frequency_mhz"] == e["frequency_mhz"] for u in entries):
                e["description"] = "CTAF/UNICOM"
        entries[:] = [
            e
            for e in entries
            if not (
                (e["type"] == "UNICOM" and e["frequency_mhz"] in ctaf)
                or ((e["description"] or "").startswith(("Class", "TRSA")) and e["frequency_mhz"] in approach)
            )
        ]
    for arpt_id, icao_id in zip(apt["ARPT_ID"], apt["ICAO_ID"]):
        if isinstance(icao_id, str) and icao_id.strip() and isinstance(arpt_id, str) and arpt_id.strip().upper() in by_id:
            by_id.setdefault(icao_id.strip().upper(), by_id[arpt_id.strip().upper()])
    no_icao = frozenset(
        a.strip().upper() for a, i in zip(apt["ARPT_ID"], apt["ICAO_ID"]) if isinstance(a, str) and not (isinstance(i, str) and i.strip())
    )
    return by_id, no_icao


def _listed(table: tuple[dict, frozenset], ident: str) -> list[dict] | None:
    """A field's frequencies by the ident asked for, or by its FAA one
    under a "K" OurAirports puts before it: the card asks for Campbell
    Airport as KC81, which the FAA files as C81 and gives no ICAO ident.
    Only a field with no ICAO ident of its own is taken that way, so a
    real ICAO ident the file lacks (KXYZ, no frequencies) never reads
    another airport's list, the one filed as XYZ."""
    by_id, no_icao = table
    ident = ident.strip().upper()
    found = by_id.get(ident)
    bare = engine("bare_field", ident=ident)
    if not found and bare != ident and bare in no_icao:
        found = by_id.get(bare)
    return found
