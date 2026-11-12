"""The charts job's `next` run: the FAA's next chart cycle staged before
its date, and the cycles before it deleted once it is in force. The dates
and what is due are wingtip.chart_next's; this is the doing -- asking the
FAA whether the cycle's files are up, taking a turn among the machine's
heavy work (charts.turn), and charts.build_cycle -- with each step written
to chart_next's status file for the planner and the console.
"""

from __future__ import annotations

import contextlib
import logging
from datetime import datetime

import requests

from wingtip import charts, outside
from wingtip.chart_next import (
    FAILED,
    NO_TURN,
    NOT_PUBLISHED,
    RETRY_AFTER_S,
    STAGED,
    STAGING,
    SWAPPED,
    WAITING,
    older_cycles,
    plan,
    read_status,
    write_status,
)
from wingtip.config import REQUEST_HEADERS

log = logging.getLogger(__name__)


def published(cycle: str, get=outside.head) -> bool:
    """Whether the FAA has put up the cycle's sectionals yet: one sheet's
    zip asked for by a HEAD, as the download will ask for it."""
    name = sorted(charts.COVERAGE["sec"])[0]
    url = charts.zip_url(charts.SECTIONAL, name, cycle)
    try:
        resp = get(url, headers=REQUEST_HEADERS, timeout=30, allow_redirects=True)
    except requests.RequestException as err:
        log.info("could not ask the FAA for %s: %s", url, err)
        return False
    return resp.status_code == 200


def run(workers: int | None = None, now: datetime | None = None, lead_days: int = 7, turn=None, is_published=published) -> str:
    """The `next` command: the cycle in force's predecessors deleted
    once it is complete (after the swap), then the next cycle staged if
    its lead has begun. `turn()` is a context manager that yields whether
    this run has a turn among the machine's heavy work (charts.turn), held
    while it renders. The caller holds the refresh lock. Returns the state
    it wrote."""
    p = plan(now, lead_days)
    if charts.pyramid_complete(p.in_force_name):
        old = older_cycles(p.in_force_name)
        if old:
            removed = charts.prune_cycles(keep=p.in_force_name)
            log.info("cycle %s is in force and complete; removed %s", p.in_force_name, removed)
            last = read_status()
            if last and last.get("cycle") == p.in_force_name:
                write_status(p.in_force_name, SWAPPED, f"in force since {p.in_force.isoformat()} 0901Z; removed " + ", ".join(old))
    name = p.next_name
    if not p.staging:
        detail = f"staging starts {p.stage_from.isoformat()}, {p.lead_days} days before it takes effect"
        if (read_status() or {}).get("state") != SWAPPED:
            write_status(name, WAITING, detail)
        log.info("cycle %s: %s", name, detail)
        return WAITING
    if not charts.pyramid_due(name):
        charts.pack_complete(name)
        write_status(name, STAGED, f"complete; the map takes it at 0901Z on {p.next.isoformat()}")
        return STAGED
    if not is_published(name):
        write_status(name, NOT_PUBLISHED, f"the FAA has not put up the {name} charts yet; asking again in {RETRY_AFTER_S // 3600} h")
        log.info("cycle %s is not on aeronav.faa.gov yet", name)
        return NOT_PUBLISHED
    with turn() if turn else contextlib.nullcontext(True) as got:
        if not got:
            write_status(name, NO_TURN, "the machine's heavy work had every turn; asking again later")
            return NO_TURN
        write_status(name, STAGING, "starting")
        try:
            complete = charts.build_cycle(name, workers=workers, step=lambda text: write_status(name, STAGING, text))
        except Exception as err:  # noqa: BLE001 -- said in the status, then raised for the job's exit code
            write_status(name, FAILED, f"{type(err).__name__}: {err}"[:500])
            raise
    if not complete:
        missing = {k: charts.pyramid_missing(name, k) for k in charts.KINDS}
        said = "; ".join(f"{k}: {', '.join(v[:3])}{'...' if len(v) > 3 else ''}" for k, v in missing.items() if v)
        write_status(name, FAILED, f"sheets missing, tried again later ({said or 'a kind incomplete'})")
        return FAILED
    write_status(name, STAGED, f"complete; the map takes it at 0901Z on {p.next.isoformat()}")
    return STAGED
