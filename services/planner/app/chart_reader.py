"""What a chart reader's process runs (app.chart_model's pool): one
corridor read and kept on disk, as app.detection reads one.

A module of its own, importing app.detection and no more, because a
spawned process imports the module its work is in before it starts:
app.chart_model's imports -- FastAPI by way of app.router_basics, pandas, the
chart model's features -- were 4.8 s of a new reader's start, every
first new route after the pool had been let go (measured 2026-10-07),
where app.detection's are 3.8. (And app.landmarks, which imports no
more than app.detection does.)"""

import functools
import logging

from wingtip import chartvision

from . import detection, landmarks
from .detection import detect_job

log = logging.getLogger(__name__)


def _logged(read):
    """The chart's corridor reader, its failure logged with its traceback
    before it goes on: app.detection keeps only "Type: message" for the
    pages that follow the read, and is not edited (a kept read is hashed
    against its source, CLAUDE.md), so the traceback is logged here, at
    the one place detection reads through (the 2026-11-14 audit's CODE-29;
    the owner took option (c), log at the caller)."""

    @functools.wraps(read)
    def along(start, end, *args, **kwargs):
        try:
            yield from read(start, end, *args, **kwargs)
        except Exception:
            log.exception("The chart along %s to %s could not be read", start, end)
            raise

    along.logs_failures = True
    return along


# Once per process, in the planner's (app.chart_model imports this module)
# and in each chart reader's.
if not getattr(chartvision.iter_landmarks_along_route, "logs_failures", False):
    chartvision.iter_landmarks_along_route = _logged(chartvision.iter_landmarks_along_route)


def read_corridor(key: tuple, start: tuple, end: tuple, half_width_nm: float) -> str | None:
    """The corridor read and kept on disk; what went wrong, else None.
    Its lakes and towns from the cycle's cells where they are built
    (app.landmarks), the same read to the digit in less than half the
    time; else, or should that go wrong, read as app.detection reads."""
    kept = detection._kept_path(key)
    if not kept.exists():
        try:
            blocks = landmarks.read_blocks(start, end, half_width_nm)
        except Exception as err:  # noqa: BLE001 -- the reader's own read below is the answer then
            log.warning("the corridor %s was not read with the chart's cells: %s", key[0], err)
            blocks = None
        if blocks is not None:
            detection._keep(kept, blocks)
            if kept.exists():
                return None
    job = detect_job(key, start, end, half_width_nm)
    with job["cond"]:
        job["cond"].wait_for(lambda: job["done"])
    return job["error"]


def ready() -> bool:
    """Nothing: given to each new process as the planner starts, for it to
    import the above before the first route's read (app.chart_model)."""
    return True
