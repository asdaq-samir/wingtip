"""The FAA's 56-day chart cycle: the one in effect (current_cycle, from
the FAA's APRA where it answers), the cycles kept on disk, and whether
one may be drawn yet (in_force).
"""

from __future__ import annotations

import logging
import threading
from datetime import date, datetime
from pathlib import Path

from cachetools import TTLCache

from . import apra

log = logging.getLogger(__name__)

# What APRA last said of the sectionals, held six hours (it changes every
# 56 days): a TTLCache of one, so it is asked again when that is up. It
# only cross-checks the schedule: the cycle in force is the engine's.
_cycle_cache: TTLCache = TTLCache(maxsize=1, ttl=6 * 3600)
_cycle_lock = threading.Lock()


def cycle_from_anchor(on: date | datetime | None = None) -> str:
    """The cycle in effect at `on` (now, to the minute: the new one from
    0901Z on its date), by the 56-day charting cycle (the engine's
    `data_cycle`, from the FAA's 28 and 56 Day Product Schedule)."""
    from .data_cycles import start_on

    return start_on("chart", on).strftime("%m-%d-%Y")


def current_cycle(on: date | datetime | None = None, fetch: bool = True) -> str:
    """The cycle whose charts are downloaded and drawn: the one in force at
    `on` (now) by the FAA's schedule, which takes over at 0901Z on its date.
    APRA (wingtip.apra) was taken where it answered and held six hours,
    and both let a new cycle in early -- APRA's edition was compared with
    the UTC day, from 0000Z, and the AWS refresh runs at 0830Z -- and kept
    an old one up to six hours past 0901Z. APRA is now asked only to
    cross-check (`fetch`): an edition it names that the schedule does not is
    logged for the owner, never drawn. `fetch=False` never touches the
    network: the status endpoint's own choice."""
    value = cycle_from_anchor(on)
    if fetch:
        with _cycle_lock:
            asked = _cycle_cache.get("cycle")
        if asked is None:
            found = apra.sectional_cycle()
            asked = found.strftime("%m-%d-%Y") if found else ""
            with _cycle_lock:
                _cycle_cache["cycle"] = asked
        if asked and asked != value:
            log.warning("APRA names the sectionals' current edition %s; the FAA's schedule has %s in force, which is drawn", asked, value)
    return value


def cycles_on_disk(root: Path) -> list[str]:
    """The cycle-named folders under `root`, newest first."""
    if not root.exists():
        return []
    found = []
    for directory in root.iterdir():
        try:
            found.append((datetime.strptime(directory.name, "%m-%d-%Y"), directory.name))
        except ValueError:
            continue
    return [name for _, name in sorted(found, reverse=True)]


def in_force(cycle: str, now: datetime | None = None) -> bool:
    """Whether a cycle on disk may be drawn yet: its effective date has
    come, at 0901Z (the engine's `data_cycle`, asked at `now`, to the
    minute; 14 CFR 91.103 wants the current edition, and an edition is
    current from its date, not before). The next cycle is drawn ahead into
    its own folder beside the one serving (wingtip.chart_next), complete
    days early; this is what keeps the map on the old one until the FAA's
    changeover, and so what swaps them -- the next look after 0901Z on the
    date, a minute at most with the serving cache. A folder whose name is
    no date is in force."""
    from .data_cycles import chart_effective, has_begun

    return has_begun("chart", chart_effective(cycle), now)
