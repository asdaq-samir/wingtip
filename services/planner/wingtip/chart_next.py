"""The FAA's next chart cycle, drawn before its date and swapped in on it.

The sectional, terminal area and IFR enroute charts change every 56 days
(the FAA's "28 and 56 Day Product Schedule"; the engine's `data_cycle`,
engine/crates/weather/src/cycles.rs, counts them from the 3 Sep 2026
edition: 29 Oct 2026, then 24 Dec 2026, 18 Feb 2027). Drawing a cycle is
hours of every core it is given, and the planner's own refresh
(app.chart_refresh) used to start it only once the new cycle was in
force, so the map either drew the old charts past their date while the
new ones rendered, or drew the new ones a tile at a time on request.

So the next cycle is staged: from CHARTS_CYCLE_LEAD_DAYS (7) before its
effective date the charts job's `next` run fetches its sheets, renders
its pyramid and packs its archives into its own folder beside the one
serving (`<tiles>/<MM-DD-YYYY>/`), and charts.in_force keeps the map off
it until 0901Z on its date, when the map takes it at its next look --
the swap. The old cycle stays on disk until then, and the first `next`
run after the swap deletes it. The FAA posts a cycle's files about three
weeks ahead (the 29 Oct 2026 sectionals' zips are dated 8 Oct), so a
week's lead finds them there; a run that finds them missing says so and
the planner asks again later.

The rule of the dates is the engine's; this module holds only the policy
of when to draw -- the lead, the swap day by the 0901Z changeover, what is
due -- and the job's word of what it did (`next.json` beside the tiles),
which the planner's status and the developer console show. The run itself
is the charts job's (services/jobs/charts/next_cycle.py); the planner's
check that starts it is app.chart_cycle.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import charts, data_cycles
from .atomic import atomic_path

log = logging.getLogger(__name__)

#: A cycle is 56 days, so a lead of 56 or more would stage the cycle
#: after next; the job is held to the one coming.
MAX_LEAD_DAYS = 55
#: How long after a run that found nothing to do yet (the FAA's files
#: not up, no turn on the machine, a failure) the planner starts it again.
RETRY_AFTER_S = 6 * 3600
#: The job's word of what it did last, beside the cycles' tile folders.
STATUS_FILE = "next.json"

#: What the job last did, as `next.json`'s "state" says.
WAITING = "waiting"  # before the lead: nothing to do yet
NOT_PUBLISHED = "not_published"  # in the lead, the FAA's files not up yet
NO_TURN = "no_turn"  # the machine's heavy work had every turn
STAGING = "staging"  # fetching, rendering, packing
STAGED = "staged"  # complete, waiting for its date
FAILED = "failed"  # stopped with an error; tried again later
SWAPPED = "swapped"  # in force and served; the old one deleted


@dataclass(frozen=True)
class Plan:
    """Where the chart cycles stand on a day: the one in force (the map's),
    the next one's effective date, and the day its staging may start."""

    in_force: date
    next: date
    stage_from: date
    lead_days: int
    #: Whether the next cycle may be staged now: its lead has begun.
    staging: bool

    @property
    def next_name(self) -> str:
        return cycle_name(self.next)

    @property
    def in_force_name(self) -> str:
        return cycle_name(self.in_force)


def cycle_name(day: date) -> str:
    """A cycle's folder name, as the FAA's URLs have it: "12-24-2026"."""
    return day.strftime("%m-%d-%Y")


def plan(now: datetime | None = None, lead_days: int = 7) -> Plan:
    """The cycles as they stand at `now` (UTC). The day is the in-force
    day (data_cycles.in_force_day: an edition counts from 0901Z on its
    date), so before 0901Z on a changeover day the cycle coming in is
    still the next one and the swap has not happened; at 0901Z it is the
    one in force. Staging starts on `lead_days` before the next date, by
    the same day, and `lead_days` is held between 0 and MAX_LEAD_DAYS."""
    lead = max(0, min(int(lead_days), MAX_LEAD_DAYS))
    day = data_cycles.in_force_day(now)
    answer = data_cycles.cycle("chart", None, day)
    current, upcoming = date.fromisoformat(answer["current"]), date.fromisoformat(answer["next"])
    stage_from = upcoming - timedelta(days=lead)
    return Plan(in_force=current, next=upcoming, stage_from=stage_from, lead_days=lead, staging=day >= stage_from)


# ---------------------------------------------------------------------------
# What the job last said
# ---------------------------------------------------------------------------


def _status_path(root: Path | None = None) -> Path:
    return (root or charts.CHART_TILE_CACHE_DIR) / STATUS_FILE


def read_status(root: Path | None = None) -> dict | None:
    """`next.json`: {"cycle", "state", "detail", "at" (UNIX seconds)}, or
    None before the job's first run."""
    try:
        record = json.loads(_status_path(root).read_text())
    except (OSError, ValueError):
        return None
    return record if isinstance(record, dict) and record.get("state") else None


def write_status(cycle: str, state: str, detail: str | None = None, root: Path | None = None) -> dict:
    record = {"cycle": cycle, "state": state, "detail": detail, "at": time.time()}
    path = _status_path(root)
    with atomic_path(path) as tmp:
        tmp.write_text(json.dumps(record))
    return record


# ---------------------------------------------------------------------------
# The planner's question: is there anything for the job to do?
# ---------------------------------------------------------------------------


def older_cycles(keep: str) -> list[str]:
    """The cycles on disk, sheets or tiles, older than `keep`."""
    keep_day = data_cycles.chart_effective(keep)
    found = set()
    for root in (charts.CHARTS_DIR, charts.CHART_TILE_CACHE_DIR):
        for name in charts._cycles_on_disk(root):
            day = data_cycles.chart_effective(name)
            if day and keep_day and day < keep_day:
                found.add(name)
    return sorted(found)


def due(p: Plan, last: dict | None, next_due: bool, in_force_complete: bool, old_on_disk: bool, now: float | None = None) -> str | None:
    """What the `next` run has to do, or None: "prune" once the cycle in
    force is complete and older ones are still on disk (after the swap);
    "stage" while the next cycle is in its lead and not complete -- unless
    the last run, for this cycle, found nothing it could do (the files
    not up, no turn, a failure) less than RETRY_AFTER_S ago. Pure, so the
    planner's check and the tests share it."""
    now = time.time() if now is None else now
    if in_force_complete and old_on_disk:
        return "prune"
    if not p.staging or not next_due:
        return None
    if (
        last
        and last.get("cycle") == p.next_name
        and last.get("state") in (NOT_PUBLISHED, NO_TURN, FAILED)
        and now - float(last.get("at") or 0) < RETRY_AFTER_S
    ):
        return None
    return "stage"


def question(now: datetime | None = None, lead_days: int = 7) -> tuple[Plan, str | None]:
    """The plan and what is due, from what is on disk now."""
    p = plan(now, lead_days)
    in_force_complete = charts.pyramid_complete(p.in_force_name)
    return p, due(
        p,
        read_status(),
        bool(charts.pyramid_due(p.next_name)),
        in_force_complete,
        bool(in_force_complete and older_cycles(p.in_force_name)),
    )


def report(auto: bool, lead_days: int = 7, now: datetime | None = None) -> dict:
    """The next cycle for the planner's status: its dates, the switch, what
    the job last said of it and how far its pyramid has got."""
    p = plan(now, lead_days)
    last = read_status() or {}
    if last.get("cycle") == p.next_name:
        state, detail, at = last.get("state"), last.get("detail"), last.get("at")
    else:
        state = STAGED if p.staging and not charts.pyramid_due(p.next_name) else WAITING
        detail = (
            f"staging starts {p.stage_from.isoformat()}" if not p.staging else "waiting for the planner's next check in the render window"
        )
        at = None
        if last.get("state") == SWAPPED:
            detail = f"{last.get('cycle')} swapped in ({last.get('detail')}); {detail}"
            at = last.get("at")
    return {
        "cycle": p.next_name,
        "effective": p.next.isoformat(),
        "stage_from": p.stage_from.isoformat(),
        "lead_days": p.lead_days,
        "auto": auto,
        "state": state,
        "detail": detail,
        "updated_at": datetime.fromtimestamp(at, tz=timezone.utc).isoformat() if at else None,
    }
