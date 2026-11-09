"""The planner's hourly check for the next chart cycle, and its status.

The charts job's `next` run (services/jobs/charts/next_cycle.py) is
started here through the dev-services sidecar, as app.chart_refresh starts
the current cycle's: inside the same window (CHARTS_REFRESH_WINDOW), from
CHARTS_CYCLE_LEAD_DAYS before the next cycle's date, so that cycle is
complete on disk before it takes effect and the map goes over to it at
0901Z on the date (wingtip.charts.in_force); and at any hour after the
swap, to delete the cycles before it. Its own switch, CHARTS_CYCLE_AUTO
(on in the compose stack, 0 in production and CI), since the current
cycle's check and this are separate decisions. It waits while the current
cycle is still due: that one first.
"""
import logging

from wingtip import chart_next, charts

from .. import chart_refresh
from ..routers import devservices
from ..settings import CHARTS_REFRESH_WINDOW, get_settings

log = logging.getLogger(__name__)

AUTO = get_settings().charts_cycle_auto
LEAD_DAYS = get_settings().charts_cycle_lead_days
#: The next cycle's run (docker-compose.yml's charts-next: `next`).
SERVICE = "charts-next"


def maybe_stage_next() -> str | None:
    """The `next` run started when it has something to do (wingtip.
    chart_next.question): "stage" in the window once the current cycle is
    done, "prune" at any hour. What was started, or None. Never raises:
    the next hourly check tries again."""
    if not AUTO:
        return None
    try:
        plan, what = chart_next.question(lead_days=LEAD_DAYS)
        if what is None or charts.refresh_running():
            return None
        if what == "stage":
            if charts.refresh_due():
                log.info("next chart cycle %s waits for the current one's render", plan.next_name)
                return None
            if not chart_refresh.in_window():
                log.info("next chart cycle %s is due for staging; it starts in the %s window",
                         plan.next_name, CHARTS_REFRESH_WINDOW)
                return None
        last = chart_next.read_status() or {}
        if last.get("state") == chart_next.FAILED and last.get("cycle") == plan.next_name:
            log.warning("next chart cycle %s failed last time (%s); trying again", plan.next_name, last.get("detail"))
        if devservices.start(SERVICE):
            log.info("next chart cycle %s: the charts job's next run started (%s, takes effect %s)",
                     plan.next_name, what, plan.next.isoformat())
            return what
    except Exception:  # noqa: BLE001 -- the next hourly check tries again; the map keeps serving what it has
        log.warning("next chart cycle check failed", exc_info=True)
    return None


def status() -> dict | None:
    """The next cycle for /api/status (charts.next): the job's word and its
    pyramid so far; None, and logged, where it cannot be read."""
    try:
        report = chart_next.report(AUTO, LEAD_DAYS)
        cycle = report["cycle"]
        report["progress"] = {key: {**record, "complete": charts.pyramid_complete(cycle, (key,)),
                                    "missing": charts.pyramid_missing(cycle, key)}
                              for key, record in charts.pyramid_status(cycle).items()}
        return report
    except Exception:  # noqa: BLE001 -- the rest of the snapshot is still worth having
        log.warning("next chart cycle not read", exc_info=True)
        return None
