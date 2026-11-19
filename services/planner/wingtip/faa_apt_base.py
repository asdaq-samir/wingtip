"""NASR's APT_BASE table read once per file version, and the sets of fields
it says things about (a published traffic pattern, the services' own
fields, private use, a control tower). wingtip.faa_data downloads the file
and asks these by identifier; they take the path it gives them."""

import pandas as pd
from pathlib import Path

from . import field_status
from .single_flight import once


@once(maxsize=2)
def _read_apt_base_cached(path: str, _mtime: float) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str, low_memory=False)


def _read_apt_base(apt_csv_path) -> pd.DataFrame:
    """APT_BASE.csv, parsed once per file version, like NAV_BASE below.

    It is a large national table and a route request only ever wants a
    bounding box out of it, so re-reading it per call was 2.1 s of pure
    waste -- and on a streamed route that was the whole time-to-first
    result, since airports are the cheap thing shown first. Keyed by
    mtime too, so a new NASR cycle is read without a restart; two
    entries, so the one it replaces is dropped rather than held.
    """
    return _read_apt_base_cached(str(apt_csv_path), Path(apt_csv_path).stat().st_mtime)


@once(maxsize=2)
def _patterns_of(path: str, _mtime: float) -> dict:
    df = _read_apt_base_cached(path, _mtime)
    df = df[df["TPA"].notna() & (df["TPA"].str.strip() != "")]
    by_ident = {}
    for arpt_id, icao_id, tpa in zip(df["ARPT_ID"], df["ICAO_ID"], df["TPA"]):
        for ident in (arpt_id, icao_id):
            if isinstance(ident, str) and ident.strip():
                by_ident[ident.strip().upper()] = float(tpa)
    return by_ident


@once(maxsize=2)
def _military_of(path: str, _mtime: float) -> dict:
    df = _read_apt_base_cached(path, _mtime)
    # The engine's field_military: the services' own fields, "joint" where
    # open to the public as well (a civil airport on a military one, Libby
    # AAF and Sierra Vista Municipal, where a civil pilot may land).
    kinds = field_status.military_column(df["OWNERSHIP_TYPE_CODE"], df["FACILITY_USE_CODE"])
    by_ident = {}
    for arpt_id, icao_id, kind in zip(df["ARPT_ID"], df["ICAO_ID"], kinds):
        if kind is None:
            continue
        for ident in (arpt_id, icao_id):
            if isinstance(ident, str) and ident.strip():
                by_ident[ident.strip().upper()] = kind
    return by_ident


@once(maxsize=2)
def _private_of(path: str, _mtime: float) -> frozenset:
    df = _read_apt_base_cached(path, _mtime)
    # Private use, and not the services' own: theirs are "military".
    df = df[(df["FACILITY_USE_CODE"] == "PR") & field_status.military_column(df["OWNERSHIP_TYPE_CODE"], df["FACILITY_USE_CODE"]).isna()]
    return frozenset(ident.strip().upper() for ident in [*df["ARPT_ID"], *df["ICAO_ID"]] if isinstance(ident, str) and ident.strip())


@once(maxsize=2)
def _towered_of(path: str, _mtime: float) -> frozenset:
    df = _read_apt_base_cached(path, _mtime)
    df = df[df["TWR_TYPE_CODE"].fillna("").str.strip().str.upper().str.startswith("ATCT")]
    return frozenset(ident.strip().upper() for ident in [*df["ARPT_ID"], *df["ICAO_ID"]] if isinstance(ident, str) and ident.strip())
