"""An airport's runways and radio frequencies: NASR's and the FAA's where
they list the field, OurAirports' runways.csv and frequency table
otherwise."""

from pathlib import Path

import pandas as pd

from . import by_airport, faa_data, nasr_fields
from .airport_lookup import _ours
from .airport_tables import FREQUENCIES_CACHE_PATH, FREQUENCIES_URL, RUNWAYS_CACHE_PATH, RUNWAYS_URL, _RAW_DIR, _load_table


# CTAF/UNICOM first -- the one a VFR pilot actually needs before
# anything else -- then tower/ground/approach/departure, then the
# rest. Anything not listed here sorts after, in whatever order the
# source data had it.
_FREQUENCY_TYPE_ORDER = ["CTAF", "UNIC", "UNICOM", "TWR", "GND", "CLD", "ATIS", "AWOS", "ASOS", "A/D", "APP", "DEP", "RCO"]
#: The FAA's files, where the frequencies the card lists come from first (faa_data.airport_frequencies).
FAA_CACHE_DIR = _RAW_DIR / "faa_nasr"
#: OurAirports' weather frequencies, which the FAA's frequency file does not list: kept beside the FAA's.
_WEATHER_TYPES = {"AWOS", "ASOS", "AWOS-3", "AWOS-3PT", "AWOS-A", "ASOS/AWOS"}


def get_runways(ident: str, cache_path: Path = RUNWAYS_CACHE_PATH) -> list[dict]:
    """This airport's runways, NASR's for a field NASR lists
    (wingtip.nasr_fields), OurAirports' runways.csv for one it does not.
    Each runway's `ends` are its two ends' idents, and `end_headings` each
    end's ident and true heading, None where the table has none
    (wingtip.runway_wind turns its number true then). None of OurAirports'
    where its row for the ident is another field's.
    """
    ident = ident.strip().upper()
    _, field, lent = _ours(ident, cache_path)
    listed = nasr_fields.runways(field["faa_id"], cache_path) if field else None
    if listed is not None or lent:
        return listed or []
    return by_airport.runways(by_airport.rows(_load_table(RUNWAYS_URL, cache_path), ident))


def _sorted_frequencies(frequencies: list[dict]) -> list[dict]:
    """CTAF/UNICOM first, then the tower and the ground, the weather, the
    approach -- what a VFR pilot needs first, first."""

    def sort_key(f: dict) -> int:
        try:
            return _FREQUENCY_TYPE_ORDER.index((f["type"] or "").upper())
        except ValueError:
            return len(_FREQUENCY_TYPE_ORDER)

    return sorted(frequencies, key=sort_key)


def _frequency_list(rows: pd.DataFrame) -> list[dict]:
    """One airport's rows of the frequencies table as dicts, CTAF/UNICOM
    first."""
    frequencies = [
        {
            "type": row.get("type") if pd.notna(row.get("type")) else None,
            "description": row.get("description") if pd.notna(row.get("description")) else None,
            "frequency_mhz": float(row["frequency_mhz"]) if pd.notna(row.get("frequency_mhz")) else None,
        }
        for _, row in rows.iterrows()
    ]
    return _sorted_frequencies(frequencies)


#: What a pilot tunes first, by family: a CTAF and a UNICOM answer the same
#: question, so the FAA's row of either covers OurAirports' of either.
_FAMILY = {"CTAF": "CTAF", "UNIC": "CTAF", "UNICOM": "CTAF", "TWR": "TWR", "GND": "GND", "ATIS": "ATIS"}


def _with_faa(ours: list[dict], faa: list[dict] | None) -> list[dict]:
    """The FAA's frequencies for the field where its file lists any (the
    Chart Supplement's), with OurAirports' weather ones it lacks beside
    them, and OurAirports' CTAF, tower, ground or ATIS where the FAA lists
    none of that kind (a field with only its approach there must not lose
    its CTAF); OurAirports' alone where the FAA lists none, or cannot be had."""
    if not faa:
        return ours
    have = {f["frequency_mhz"] for f in faa}
    covered = {_FAMILY[t] for t in ((f["type"] or "").upper() for f in faa) if t in _FAMILY}
    gaps = [
        f
        for f in ours
        if f["frequency_mhz"] not in have
        and ((f["type"] or "").upper() in _WEATHER_TYPES or _FAMILY.get((f["type"] or "").upper(), "") not in covered | {""})
    ]
    return _sorted_frequencies(faa + gaps)


def get_frequencies(ident: str, cache_path: Path = FREQUENCIES_CACHE_PATH, faa_cache_dir=FAA_CACHE_DIR) -> list[dict]:
    """This airport's radio frequencies (CTAF, tower, ATIS, ...), sorted
    with CTAF/UNICOM first since that's what a VFR pilot needs before
    anything else: the FAA's where it lists them, OurAirports' otherwise
    (_with_faa)."""
    ident = ident.strip().upper()
    df = _load_table(FREQUENCIES_URL, cache_path)
    faa = faa_data.airport_frequencies(ident, faa_cache_dir) if faa_cache_dir else None
    return _with_faa([] if _ours(ident, cache_path)[2] else _frequency_list(by_airport.rows(df, ident)), faa)


def get_frequencies_for(idents: list[str], cache_path: Path = FREQUENCIES_CACHE_PATH, faa_cache_dir=FAA_CACHE_DIR) -> dict[str, list[dict]]:
    """The frequencies of several airports from one pass over the table,
    by ident (as given, upper-cased), for a list that would otherwise
    scan the whole table once per row; the FAA's first, as get_frequencies'."""
    wanted = {i.strip().upper() for i in idents}
    df = _load_table(FREQUENCIES_URL, cache_path)
    # None of OurAirports' where its row is another field's (_ours).
    ours = {ident: _frequency_list(by_airport.rows(df, ident)) for ident in wanted if not _ours(ident, cache_path)[2]}
    faa = faa_data.airport_frequencies_for(wanted, faa_cache_dir) if faa_cache_dir else {}
    found = {ident: _with_faa(ours.get(ident, []), faa.get(ident)) for ident in wanted}
    return {ident: freqs for ident, freqs in found.items() if freqs}
