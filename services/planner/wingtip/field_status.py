"""Whether a field is open, as the engine's `field_status` rules it
(engine/crates/flight/src/field.rs): NASR APT_BASE.csv's ARPT_STATUS, "O"
operational the only open one; "CI" closed indefinitely, "CP" closed
permanently and any other code closed. The owner's hard rule (2026-11-13,
decision 0043): a closed field is never shown or offered as an open one --
not on the map, in Nearest, an emergency's or a diversion's candidates, a
fuel stop or an alternate -- and where it appears at all (a search for its
ident, its card) it carries the engine's label, "Closed indefinitely" or
"Closed permanently". The planner carries NASR's code as data and asks the
engine; nothing here decides.

None is no NASR record of the field (a test's airports file with no FAA
file beside it): the engine leaves that to the caller's own source.
"""

from __future__ import annotations

import logging
from functools import lru_cache

import pandas as pd

from .engine import ask as engine
from .single_flight import once

log = logging.getLogger(__name__)


@lru_cache(maxsize=64)
def _asked(code: str | None) -> tuple[bool, str | None]:
    """The engine's answer for one code: there are three in NASR, so each
    is asked once per process."""
    answer = engine("field_status", status=code)
    return bool(answer["open"]), answer["closed"]


def _code(code) -> str | None:
    """A status as the engine takes it: a string, or None for no record
    (pandas' missing value among them)."""
    return code if isinstance(code, str) else None


def is_open(code) -> bool:
    """Whether a field with NASR's ARPT_STATUS `code` may be shown or
    offered as an open one."""
    return _asked(_code(code))[0]


def closed_label(code) -> str | None:
    """A closed field's label ("Closed indefinitely", "Closed
    permanently", "Closed"); None for an open one."""
    return _asked(_code(code))[1]


def open_mask(codes: pd.Series) -> pd.Series:
    """`is_open` for each of a column of codes, asked once per distinct
    code rather than once per row."""
    return codes.map(lambda c: is_open(c)).astype(bool)


def labels(codes: pd.Series) -> pd.Series:
    """`closed_label` for each of a column of codes, None (never NaN, which
    is truthy) where open."""
    return pd.Series([closed_label(c) for c in codes], index=codes.index, dtype=object)


@once(maxsize=1)
def nasr_status(faa_path: str, _faa_mtime: float) -> dict[str, str]:
    """Every field the FAA lists (NASR APT_BASE.csv: airports, heliports,
    seaplane bases and the rest, open, closed or private), its ARPT_STATUS
    by its ICAO and then its FAA identifier, the FAA's winning; "" where
    NASR gives none, which the engine takes as closed."""
    from . import faa_data  # which asks this module of its own fields' status

    df = faa_data._read_apt_base_cached(faa_path, _faa_mtime)
    pairs = [*zip(df["ICAO_ID"], df["ARPT_STATUS"]), *zip(df["ARPT_ID"], df["ARPT_STATUS"])]
    return {i.strip().upper(): s.strip() if isinstance(s, str) else "" for i, s in pairs if isinstance(i, str) and i.strip()}


def closed_fields(cache_dir) -> dict[str, str]:
    """Every field NASR lists as closed, by its FAA and its ICAO identifier,
    with its label: for a list drawn from elsewhere than the field table
    (the TAF stations an IFR alternate is picked from). Empty where the
    file cannot be had, as the field table then has no status either."""
    from . import faa_data

    try:
        path = faa_data.ensure_nasr_file("APT_BASE.csv", cache_dir)
        by_ident = nasr_status(str(path), path.stat().st_mtime)
    except Exception:
        log.warning("No APT_BASE.csv for the closed fields; none known", exc_info=True)
        return {}
    return {ident: label for ident, code in by_ident.items() if (label := closed_label(code))}


#: The idents a field of OurAirports' table goes by, the FAA's own first:
#: NASR's status is looked up by the first of them NASR lists.
_IDENT_COLUMNS = ("local_code", "ident", "icao_code", "gps_code")


def listed(us: pd.DataFrame, faa_path: str, faa_mtime: float) -> pd.DataFrame:
    """OurAirports' US table cut to the fields the FAA lists (the owner,
    2026-10-27: "I would take it out if it's not showing with FAA"), each
    with NASR's ARPT_STATUS (`_status`) and, where the engine rules it
    closed, its label (`_closed`): the planner's every list keeps out a
    `_closed` field and its search and card label one. With no FAA file to
    hand (`faa_path` ""), every field, with no status and none closed."""
    status = pd.Series(None, index=us.index, dtype=object)
    if faa_path and (by_ident := nasr_status(faa_path, faa_mtime)):
        for column in _IDENT_COLUMNS:
            if column in us.columns:
                status = status.fillna(us[column].astype(str).str.strip().str.upper().map(by_ident))
        us, status = us[status.notna()], status[status.notna()]
    us = us.assign(_status=pd.Series([_code(c) for c in status], index=status.index, dtype=object))
    us["_closed"] = labels(us["_status"])
    return us
