"""The FAA's 56-day chart cycle: the one in effect (current_cycle, from
the FAA's APRA where it answers), the cycles kept on disk, and whether
one may be drawn yet (in_force).
"""

from __future__ import annotations

import threading
from datetime import date, datetime, timezone
from pathlib import Path

from cachetools import TTLCache

from . import apra


# The cycle asked of APRA, held for six hours (it changes every 56 days):
# a TTLCache of one, so it is asked again when that is up.
_cycle_cache: TTLCache = TTLCache(maxsize=1, ttl=6 * 3600)
_cycle_lock = threading.Lock()


def cycle_from_anchor(today: date) -> str:
    """The cycle date in effect on `today`, by the 56-day charting cycle
    (the engine's `data_cycle`, from the FAA's 28 and 56 Day Product
    Schedule) -- what APRA would say, without asking it."""
    from .data_cycles import start_on

    return start_on("chart", today).strftime("%m-%d-%Y")


def current_cycle(today: date | None = None, fetch: bool = True) -> str:
    """The cycle whose charts are downloaded and drawn: the sectionals'
    current edition by the FAA's APRA (wingtip.apra) where it answers and
    that edition has begun, else the anchor arithmetic. `fetch=False`
    never touches the network: the status endpoint's own choice."""
    today = today or datetime.now(tz=timezone.utc).date()
    with _cycle_lock:
        held = _cycle_cache.get("cycle")
    if held or not fetch:
        return held or cycle_from_anchor(today)
    asked = apra.sectional_cycle(today)
    value = asked.strftime("%m-%d-%Y") if asked else cycle_from_anchor(today)
    with _cycle_lock:
        _cycle_cache["cycle"] = value
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
    come, at 0901Z (wingtip.data_cycles.in_force_day; 14 CFR 91.103 wants
    the current edition, and an edition is current from its date, not
    before). The next cycle is drawn ahead into its own folder beside the
    one serving (wingtip.chart_next), complete days early; this is what
    keeps the map on the old one until the FAA's changeover, and so what
    swaps them -- the next look after 0901Z on the date, a minute at most
    with the serving cache. A folder whose name is no date is in force."""
    from .data_cycles import chart_effective, in_force_day

    effective = chart_effective(cycle)
    return effective is None or effective <= in_force_day(now)
