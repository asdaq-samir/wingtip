"""The one scheduler every service's periodic work runs on: APScheduler's
(3.x, its maintained line; 4.0 is an alpha untouched since April 2025,
docs/versions.md), rather than a `while True` and a clock of its own in
each service, which the planner, weather, ingest and the crash-leads job
each had (the code audit's CODE-45, 2026-11-14).

Every job is held to one run at a time (`max_instances=1`): a turn that
comes while the last still runs is skipped, not stacked, and runs that
were missed while the process was busy are run once, not once each
(`coalesce`), however late (`misfire_grace_time=None`). A job that fails
is logged by APScheduler (its `apscheduler.executors` logger, with the
traceback) and runs again at its next turn, so no job catches its own
failures only to keep the loop going."""

from collections.abc import Callable
from datetime import UTC, datetime

from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.schedulers.base import BaseScheduler
from apscheduler.schedulers.blocking import BlockingScheduler

_JOB_DEFAULTS = {"max_instances": 1, "coalesce": True, "misfire_grace_time": None}


def scheduler(*, workers: int = 10, blocking: bool = False) -> BaseScheduler:
    """A scheduler not yet started: in a thread of its own (a service that
    does other work, such as the planner's web server), or `blocking`, in
    the caller's (a process whose only work is its schedule). `workers` is
    how many jobs run at once."""
    kind = BlockingScheduler if blocking else BackgroundScheduler
    return kind(executors={"default": ThreadPoolExecutor(workers)}, job_defaults=_JOB_DEFAULTS, timezone=UTC)


def every(on: BaseScheduler, seconds: float, job: Callable[..., object], *, name: str, now: bool = True, args: tuple = ()) -> None:
    """`job(*args)` every `seconds`: the first turn at once where `now`,
    else one interval from here."""
    first = {"next_run_time": datetime.now(UTC)} if now else {}
    on.add_job(job, "interval", seconds=seconds, args=args, id=name, name=name, **first)
