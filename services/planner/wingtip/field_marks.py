"""Each field's map mark as the overlay tiles carry it (services/jobs
charts/airports.py): the engine's field_mark_rank -- the order marks give
way in where they overlap and the step the mark is drawn at -- from the
same NASR facts the tiles read: APT_BASE's SITE_TYPE_CODE and
FACILITY_USE_CODE, the longest hard runway in APT_RWY (the engine's
runway_hard_surface), whether it has a tower and the Class B or C it is
the primary airport of. The planner's own list of the fields in view
(/api/airports/in-view) is what the iPhone draws its marks from, so it
carries the rank the tiles do: a non-towered field with a long hard runway
drew small there, ranked by nothing (2026-11-14).

A field the files do not have is ranked on what the planner knows of it
(its tower, its primary class), with no site type, use or runway: the
engine then puts it last of all, never first on a guess.
"""

from __future__ import annotations

import logging
from functools import lru_cache

import pandas as pd

from . import altitude, faa_data
from .engine import ask as engine
from .single_flight import once

log = logging.getLogger(__name__)


@lru_cache(maxsize=256)
def _hard(surface: str) -> bool:
    """The engine's runway_hard_surface, asked once a NASR code."""
    return bool(engine("runway_hard_surface", surface=surface)["hard"])


@once(maxsize=2)
def _hard_ft_of(rwy_path: str, _rwy_mtime: float) -> dict[str, int]:
    """Each field's longest hard runway in ft by its FAA identifier (APT_RWY's
    ARPT_ID); helipads (RWY_ID H1 and the like) are no runways, as the
    tiles have it, and a field with no hard runway is not listed."""
    rwy = pd.read_csv(rwy_path, dtype=str, usecols=["ARPT_ID", "RWY_ID", "RWY_LEN", "SURFACE_TYPE_CODE"], low_memory=False).fillna("")
    hard_ft: dict[str, int] = {}
    for ident, runway, length, surface in zip(rwy["ARPT_ID"], rwy["RWY_ID"], rwy["RWY_LEN"], rwy["SURFACE_TYPE_CODE"]):
        feet = pd.to_numeric(length, errors="coerce")
        if runway.strip().upper().startswith("H") or pd.isna(feet) or not _hard(surface.strip()):
            continue
        key = ident.strip().upper()
        hard_ft[key] = max(hard_ft.get(key, 0), int(feet))
    return hard_ft


@once(maxsize=2)
def _sites_of(apt_path: str, apt_mtime: float, rwy_path: str, rwy_mtime: float) -> dict[str, tuple[str, str, int]]:
    """Each field's (SITE_TYPE_CODE, FACILITY_USE_CODE, longest hard
    runway ft) by its FAA and its ICAO identifier, the FAA's winning."""
    hard_ft = _hard_ft_of(rwy_path, rwy_mtime)
    base = faa_data._read_apt_base_cached(apt_path, apt_mtime).fillna("")
    out: dict[str, tuple[str, str, int]] = {}
    for faa_id, icao, site, use in zip(base["ARPT_ID"], base["ICAO_ID"], base["SITE_TYPE_CODE"], base["FACILITY_USE_CODE"]):
        found = (site.strip(), use.strip(), hard_ft.get(faa_id.strip().upper(), 0))
        for key in (icao.strip().upper(), faa_id.strip().upper()):
            if key:
                out[key] = found
    return out


def sites(cache_dir=altitude.DEFAULT_FAA_CACHE_DIR) -> dict[str, tuple[str, str, int]]:
    """_sites_of for the cycle on disk; empty where the files cannot be had."""
    try:
        apt = faa_data.ensure_nasr_file("APT_BASE.csv", cache_dir)
        rwy = faa_data.ensure_nasr_file("APT_RWY.csv", cache_dir)
        return _sites_of(str(apt), apt.stat().st_mtime, str(rwy), rwy.stat().st_mtime)
    except Exception:
        log.warning("No APT_BASE.csv or APT_RWY.csv for the marks' ranks; ranked on the tower alone", exc_info=True)
        return {}


def hard_runways(cache_dir=altitude.DEFAULT_FAA_CACHE_DIR) -> dict[str, str]:
    """Each field's longest hard runway in ft, as text, by its FAA
    identifier: the cycle pack's HARD_FT (wingtip.pack_airports). Empty
    where APT_RWY.csv cannot be had: the phones then rank every field as
    having none, below those of its tier that have one, never above."""
    try:
        rwy = faa_data.ensure_nasr_file("APT_RWY.csv", cache_dir)
        return {k: str(v) for k, v in _hard_ft_of(str(rwy), rwy.stat().st_mtime).items()}
    except Exception:
        log.warning("No APT_RWY.csv for the pack's hard runways; none written", exc_info=True)
        return {}


@lru_cache(maxsize=4096)
def _rank(site_type: str | None, use: str | None, towered: bool, hard_ft: int, primary_of: str | None) -> tuple[int, str]:
    rank = engine("field_mark_rank", site_type=site_type, use=use, towered=towered, hard_ft=hard_ft, primary_of=primary_of)
    return int(rank["order"]), str(rank["size"])


def fields(place: dict, towered: bool, primary_of: str | None, known: dict) -> dict:
    """A field's `mark_order` and `mark_size`, the engine's field_mark_rank,
    by its FAA identifier, else the map's, else OurAirports' (`known`,
    sites())."""
    names = [(place.get(k) or "").upper() for k in ("faa_id", "ident", "source_ident")]
    site_type, use, hard_ft = next((known[n] for n in names if n in known), (None, None, 0))
    order, size = _rank(site_type, use, towered, hard_ft, primary_of)
    return {"mark_order": order, "mark_size": size}
