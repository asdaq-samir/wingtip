"""What a search's filters read of a field, beyond what the map's marks
have (the one search's results and its Filters page, the owner's
screenshots of Apple Maps, 2026-11-10): the fuel it sells, its runways'
surfaces and whether it has an instrument approach. Each is read from a
file the planner already holds -- the FAA's airport file (NASR APT_BASE
and APT_RWY) and its coded procedures (the CIFP) -- once per edition,
then looked up per field. None of it is a rule: the FAA's own codes,
grouped into the words a pilot filters by.

A field the files do not have gets no fuel, no surface and an approach
unknown (None), not a guess.
"""

import logging
from pathlib import Path

import pandas as pd

from . import altitude, faa_data, procedures
from .single_flight import once

log = logging.getLogger(__name__)

#: The fuels a search filters by, from NASR APT_BASE's FUEL_TYPES codes as
#: the FAA's APT data layout (NASR subscription, "APT DATA LAYOUT.pdf",
#: FUEL_TYPES) defines them: 100LL "100LL gasoline (low lead) (Blue)"; A
#: "Jet A, Kerosene, without FS-II, FP minus 40 C", A+ with FS-II, A++
#: with FS-II, CI/LI and SDA, A++10 that with the +100 additive; A1 "Jet
#: A-1, Kerosene, without FS-II, FP minus 47 C" and A1+ with FS-II -- Jet
#: A-1 counted as Jet A, the same kerosene with a lower freezing point, the
#: safer side for an airplane that takes Jet A; UL94 "Unleaded Grade 94
#: gasoline". 100 (green), 100R, G100UL, UL91, UL100, MOGAS, hydrogen and
#: the military's J, J5 and J8 are not among the filters and are left out.
FUELS = {"100LL": "100LL", "A": "Jet A", "A+": "Jet A", "A++": "Jet A", "A++10": "Jet A", "A1": "Jet A", "A1+": "Jet A", "UL94": "UL94"}
#: The order a field's fuels are listed in.
FUEL_ORDER = ("100LL", "Jet A", "UL94")

#: A runway's surface as a search filters it, from NASR APT_RWY's
#: SURFACE_TYPE_CODE as the APT data layout defines it: CONC "Portland
#: cement concrete", ASPH "asphalt or bituminous concrete" and PEM
#: "partially concrete, asphalt or bitumen-bound macadam" are paved; TURF
#: "grass; sod" (and the less common GRASS and SOD) turf; WATER water; the
#: rest -- gravel, dirt, mats, treated, roof-top, snow, ice and the like --
#: "other".
_SURFACES = {"ASPH": "paved", "CONC": "paved", "PEM": "paved", "TURF": "turf", "GRASS": "turf", "SOD": "turf", "WATER": "water"}
SURFACE_ORDER = ("paved", "turf", "water", "other")


def surface_of(code: str | None) -> list[str]:
    """A runway's surfaces as a search filters them, from its NASR code;
    none where the FAA gives none. A code of two ("ASPH-TURF") is "a
    combination of two types when the runway is composed of distinct
    sections" (the APT layout), which says nothing of which is the more:
    such a runway is paved only where every section is, and otherwise is
    each unpaved kind it has -- ASPH-TURF is turf, not paved -- so a pilot
    who asks for paved is never shown a runway part turf."""
    parts = [p.strip() for p in (code or "").strip().upper().replace("/", "-").split("-") if p.strip()]
    kinds = {_SURFACES.get(p, "other") for p in parts}
    if kinds != {"paved"}:
        kinds.discard("paved")
    return [k for k in SURFACE_ORDER if k in kinds]


def fuels_of(codes: list[str]) -> list[str]:
    """The fuels a field sells, as a search filters them, from its NASR
    FUEL_TYPES codes: each kind once, in FUEL_ORDER."""
    kinds = {FUELS[c.strip().upper()] for c in codes if c.strip().upper() in FUELS}
    return [k for k in FUEL_ORDER if k in kinds]


@once(maxsize=2)
def _surfaces_of(path: str, _mtime: float) -> dict[str, list[str]]:
    df = pd.read_csv(path, dtype=str, usecols=["ARPT_ID", "SURFACE_TYPE_CODE"], low_memory=False).fillna("")
    found: dict[str, set] = {}
    for ident, code in zip(df["ARPT_ID"], df["SURFACE_TYPE_CODE"]):
        found.setdefault(ident.strip().upper(), set()).update(surface_of(code))
    return {ident: [k for k in SURFACE_ORDER if k in kinds] for ident, kinds in found.items() if kinds}


def runway_surfaces(cache_dir=altitude.DEFAULT_FAA_CACHE_DIR) -> dict[str, list[str]]:
    """Each field's runways' surfaces, by its FAA identifier (APT_RWY's
    ARPT_ID: C81, DLH). Empty where the file cannot be had."""
    try:
        path = faa_data.ensure_nasr_file("APT_RWY.csv", cache_dir)
        return _surfaces_of(str(path), path.stat().st_mtime)
    except Exception:
        log.warning("No APT_RWY.csv for runway surfaces; none given", exc_info=True)
        return {}


def fuel_table(cache_dir=altitude.DEFAULT_FAA_CACHE_DIR) -> dict[str, dict]:
    """Each field's services (faa_data.airport_services'), by its FAA and
    ICAO identifiers, read once for a whole list: with the file missing
    each field's own lookup would try the download again."""
    try:
        path = faa_data.ensure_nasr_file("APT_BASE.csv", cache_dir)
        return faa_data._services_of(str(path), path.stat().st_mtime)
    except Exception:
        log.warning("No APT_BASE.csv for fuel; none given", exc_info=True)
        return {}


@once(maxsize=2)
def _approach_fields_of(path: Path) -> frozenset:
    """Every airport the CIFP codes an approach for: its airport section's
    records (ARINC 424-18 section P, column 5-6) of subsection F, the
    approaches (column 13), by the airport's ident (columns 7-10)."""
    found = set()
    with path.open("rb") as f:
        for raw in f:
            if raw[:1] == b"S" and raw[4:6] == b"P " and raw[12:13] == b"F":
                found.add(raw[6:10].decode("latin-1").strip())
    return frozenset(found)


def approach_fields() -> frozenset | None:
    """The airports with an instrument approach coded in the FAA's CIFP for
    the cycle in force. A procedure the CIFP does not code is not seen
    here, so the filter can leave out a field with an approach but never
    put in one without. None where the file cannot be had: not known,
    rather than none."""
    try:
        return _approach_fields_of(procedures.cifp_path())
    except Exception:
        log.warning("No CIFP for instrument approaches; not given", exc_info=True)
        return None


def _names(place: dict) -> list[str]:
    """A field's identifiers, as the files may name it: the FAA's own
    first (DLH, C81: APT_RWY knows no other), the map's (KDLH), OurAirports'
    (KC81), and the FAA's with a K (the CIFP's KDLH)."""
    faa = (place.get("faa_id") or "").upper()
    names = [faa, place.get("ident", ""), place.get("source_ident", ""), f"K{faa}" if len(faa) == 3 and faa.isalpha() else ""]
    return [n.upper() for n in names if n]


def facts_for(places: list[dict]) -> list[dict]:
    """Each field's fuel, runway surfaces and instrument approach, for the
    search's filters: {"fuel": [...], "runway_surfaces": [...],
    "instrument_approach": bool | None}. The tables are each read once
    for the whole list."""
    services = fuel_table()
    surfaces = runway_surfaces()
    approaches = approach_fields()
    out = []
    for place in places:
        names = _names(place)
        own = next((services[n] for n in names if n in services), None)
        runways = next((surfaces[n] for n in names if n in surfaces), [])
        out.append(
            {
                "fuel": fuels_of(own["fuel_types"]) if own else [],
                "runway_surfaces": runways,
                "instrument_approach": None if approaches is None else any(n in approaches for n in names),
            }
        )
    return out
