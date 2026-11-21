"""Keeping up with the FAA's 56-day chart cycle, and what the Dev console
says of it.

A new edition every 56 days, and a map that shows nothing but the chart,
means somebody has to fetch and render the new one before its date or
the map quietly flies stale charts. `refresh` is that job: the whole
prepare-and-render for the FAA's current cycle when it is not complete
on disk yet (build_cycle), published if there is a bucket, then the
previous cycle's files go. The charts job runs it (services/jobs/charts:
on AWS a scheduled task, on a machine of one's own a container the
planner starts through the dev-services sidecar), so the serving process
stays the size it is; the tile endpoints switch to the new cycle only
when wingtip.chart_serving sees its pyramid complete. Every run that
renders a cycle's tiles holds the refresh lock (refresh_lock).
"""

from __future__ import annotations

import contextlib
import logging
import shutil
from collections import Counter
from datetime import datetime


from . import chart_archives, chart_cycle, chart_prepare, chart_publish, chart_pyramid, chart_serving, chart_sheets, config
from .chart_kinds import KINDS

log = logging.getLogger(__name__)

_REFRESH_LOCK = "refresh.lock"


@contextlib.contextmanager
def refresh_lock(wait: bool = False):
    """The lock every run that renders the cycle's tiles holds for its
    whole life -- `refresh`, `pyramid` and `unmask`, from the charts job's
    container or a shell in another one -- yielding whether it
    got it. `wait` blocks until it is free; otherwise it yields False at
    once when another run holds it. The kernel lets go when the process
    ends, however it ends.

    What "a refresh is running" used to be read from: a pid written into
    this file (never deleted, and alive as a zombie -- the planner never
    reaped its child -- so one refresh read as running until the planner
    restarted), and failing that a pyramid status file touched in the
    last ten minutes, which missed a shell refresh's hours of preparing
    and a sheet slower than ten minutes."""
    import fcntl

    config.CHART_TILE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with (config.CHART_TILE_CACHE_DIR / _REFRESH_LOCK).open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX if wait else fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
            return
        try:
            yield True
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def refresh(kinds: tuple = tuple(KINDS), workers: int = 2, prune: bool = True, publish_bucket: str | None = None, client=None) -> str:
    """Bring the FAA's current cycle to a complete pyramid, publish it
    to `publish_bucket` if one is given (the AWS refresh task's job),
    then drop older cycles; with a bucket, the next cycle staged there
    too in its lead (`_stage_next`). Returns the cycle. Idempotent: a complete,
    published cycle costs one status read and one listing."""
    cycle = chart_cycle.current_cycle()
    # The AWS refresh task starts on an empty disk every day, which would
    # read as a cycle never drawn: the bucket's own pointer says whether
    # it is done. Only a complete cycle is ever published, so the 55 days
    # between the FAA's cycles cost that one read.
    if publish_bucket and chart_publish.bucket_cycle(publish_bucket, client=client) == cycle:
        log.info("cycle %s is already published to %s", cycle, publish_bucket)
        return cycle
    build_cycle(cycle, kinds, workers)
    if publish_bucket and chart_serving.pyramid_complete(cycle, kinds):
        chart_publish.publish(cycle, publish_bucket, client=client)
    # Never before the cycle is in force: the FAA's page names a cycle
    # from 0000Z on its date, and the one it replaces is the map's until
    # 0901Z (chart_cycle.in_force).
    if prune and chart_serving.pyramid_complete(cycle, kinds) and chart_cycle.in_force(cycle):
        prune_cycles(keep=cycle)
    if publish_bucket:
        _stage_next(kinds, workers, publish_bucket, client)
    return cycle


def _stage_next(kinds: tuple, workers: int, bucket: str, client=None) -> None:
    """The next cycle drawn and published into serving.json's `next` once
    its lead has begun (wingtip.chart_next's plan, a week before its date),
    where it is not there yet: the AWS task runs at 0830Z, and drawing the
    new cycle only once it was in force put it on the map hours after
    0901Z, or a day after where the render missed the morning's run. The
    planners go over to it at 0901Z by their own clock
    (chart_serving.served_of). The FAA puts a cycle up 20 days ahead (its
    VFR charts page: "Next editions will be available 20 days prior to
    their effective date"); a run before then finds its sheets missing and
    publishes nothing, and the next day's tries again."""
    from . import chart_next

    plan = chart_next.plan()
    if not plan.staging or chart_publish.bucket_next(bucket, client=client) == plan.next_name:
        return
    if build_cycle(plan.next_name, kinds, workers):
        chart_publish.publish(plan.next_name, bucket, client=client)
    else:
        log.warning("cycle %s is not complete yet; not staged in %s", plan.next_name, bucket)


def build_cycle(cycle: str, kinds: tuple = tuple(KINDS), workers: int | None = 2, step=None) -> bool:
    """A cycle's sheets fetched and prepared, its pyramid rendered and
    each finished kind packed into its archives: what `refresh` does for
    the cycle in force and wingtip.chart_next for the next one, ahead of
    its date. `step(text)` hears each stage as it starts, for a status
    file. Whether every kind is complete at the end."""
    say = step or (lambda _text: None)
    # Only the kinds due: a finished kind is not rendered again unless
    # the renderer has changed since, and one with a sheet missing is
    # tried again every run -- it used to read complete, and nothing
    # ever retried it.
    todo = chart_serving.pyramid_due(cycle, kinds)
    if todo:
        log.info("cycle %s: preparing sheets", cycle)
        say(f"fetching and preparing sheets ({', '.join(todo)})")
        chart_prepare.prepare_all(todo, cycle)
        for key in todo:
            log.info("cycle %s: rendering the %s pyramid", cycle, key)
            say(f"rendering the {key} pyramid")
            chart_pyramid.render_pyramid(KINDS[key], workers=workers, cycle=cycle)
    # Each finished kind's loose tiles into its archives.
    say("packing")
    chart_archives.pack_complete(cycle, kinds)
    return chart_serving.pyramid_complete(cycle, kinds)


def prune_cycles(keep: str) -> list[str]:
    """Delete every cycle's sheets and tiles but `keep`'s (and any
    newer, which a refresh in progress may be building)."""
    removed = []
    keep_date = datetime.strptime(keep, "%m-%d-%Y")
    for root in (config.CHARTS_DIR, config.CHART_TILE_CACHE_DIR):
        for cycle in chart_cycle.cycles_on_disk(root):
            if cycle == keep or datetime.strptime(cycle, "%m-%d-%Y") > keep_date:
                continue
            shutil.rmtree(root / cycle, ignore_errors=True)
            removed.append(f"{root.name}/{cycle}")
            log.info("removed %s/%s", root.name, cycle)
    chart_serving.forget_serving()
    return removed


def refresh_running() -> bool:
    """Whether a run that renders tiles -- a refresh, a `pyramid` or an
    `unmask`, from anywhere -- holds the refresh lock. Two renders of the
    same cycle at once would race each other on the seam tiles."""
    with refresh_lock() as got:
        return not got


def refresh_due() -> bool:
    """Whether the FAA's current cycle is not yet complete on disk, or
    was drawn under another renderer."""
    return bool(chart_serving.pyramid_due(chart_cycle.current_cycle()))


def status() -> dict:
    """What the Dev console shows: the cycle being served and the one
    the FAA is on, how many charts of each kind are prepared (any
    cycle), how many tiles have been rendered, how far the served
    cycle's pyramid got and whether a newer one is being built. Never
    touches the network."""
    # Counted from the marker each prepared chart leaves, not by loading
    # them: reading every chart's description (its faces, its mask
    # lines) was two thirds of the status endpoint's time, and each
    # chart's name, cycle and rasters made up 19 of its 24 KB -- for a
    # console that shows a count per kind.
    prepared = Counter(
        ready.parent.parent.name for ready in config.CHARTS_DIR.glob(f"*/*/*/{chart_sheets.READY}") if ready.parent.parent.name in KINDS
    )
    serving, current = chart_serving.serving_cycle(), chart_cycle.current_cycle(fetch=False)

    def described(cycle: str) -> dict:
        return {
            key: {**record, "complete": chart_serving.pyramid_complete(cycle, (key,)), "missing": chart_serving.pyramid_missing(cycle, key)}
            for key, record in chart_serving.pyramid_status(cycle).items()
        }

    pyramid = described(serving)
    # What the pyramid wrote, not a walk of the cache: counting three
    # hundred thousand files on a bind mount took the status endpoint
    # (and the Dev console behind it) tens of seconds.
    tiles = sum(p["tiles"] for p in pyramid.values())
    building = described(current) if current != serving else {}
    return {
        "cycle": serving,
        "current_cycle": current,
        "prepared": dict(prepared),
        "tiles_cached": tiles,
        "pyramid": pyramid,
        "building": building,
        "refresh_running": refresh_running(),
    }
