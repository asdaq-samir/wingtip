"""The cycle pack's airports table's columns besides NASR's APT_BASE ones
(wingtip.cycle_pack's COLUMNS), each by the field's ICAO or FAA ident:

- SIZE, OurAirports' size of the field (airport_sizes), what the phone's
  map sizes a pin by;
- HARD_FT, its longest hard-surfaced runway in ft (wingtip.field_marks'
  hard_runways: APT_RWY's RWY_LEN over the surfaces the engine's
  runway_hard_surface calls hard, helipads left out), since 2026-11-14:
  with the table's own SITE_TYPE_CODE, FACILITY_USE_CODE and
  TWR_TYPE_CODE and the pack's airspace, what the engine's
  field_mark_rank ranks the field's mark by on a phone with no network,
  as the overlay tiles and /api/airports/in-view rank it.
"""

from __future__ import annotations

import logging

from . import field_marks

log = logging.getLogger(__name__)


def airport_sizes() -> dict[str, str]:
    """OurAirports' size of every US landing field (wingtip.airports'
    large, medium and small, which NASR has no column for) by each ident
    it goes by, for the airports table's SIZE: what the phone's map sizes
    a pin by, as the planner's /api/airports/in-view does. Empty where
    OurAirports cannot be had, and every pin is then drawn alike."""
    from . import airports

    try:
        us = airports._us_airports(airports.DEFAULT_CACHE_PATH)
    except Exception:
        log.warning("No OurAirports table for the pack's airport sizes; none written", exc_info=True)
        return {}
    kinds = us["type"].map(airports._FIELD_KINDS)
    found: dict[str, str] = {}
    for column in ("ident", "local_code", "icao_code", "gps_code"):
        if column in us.columns:
            for ident, kind in zip(us[column], kinds):
                if isinstance(kind, str) and isinstance(ident, str) and ident.strip():
                    found.setdefault(ident.strip().upper(), kind)
    return found


def columns(cache_dir) -> dict[str, dict[str, str]]:
    """The airports table's added columns, by name, for cycle_pack.write."""
    return {"SIZE": airport_sizes(), "HARD_FT": field_marks.hard_runways(cache_dir)}
