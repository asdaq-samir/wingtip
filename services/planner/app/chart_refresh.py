"""When the charts job (services/jobs/charts) is asked to run on a
machine of one's own: the one place that decides it, for the hourly
check (app.main's warm-up loop), a new cycle pack, and the Dev console's
"refresh now" (app.routers.system). The job does the work -- a new FAA
chart cycle's download, render and archives, and the map's overlay tiles
-- in a container of its own, started through the dev-services sidecar
(app.dev_services), so the planner only serves what it built.
wingtip.charts and wingtip.vector_tiles answer what is on disk; this is
only the policy of when.

Rendering a cycle is every sheet of the country, hours of every core it
is given, and on a machine that is also somebody's desk that was felt
as a map that stuttered under the pilot's own finger. So a new cycle's
render starts only inside CHARTS_REFRESH_WINDOW -- "HH:MM-HH:MM" on the
container's own clock (set TZ for a local one), 01:00-06:00 by default,
blank for any time -- and the check runs hourly so as to land in the
window. The one exception is a stack with no complete pyramid on disk at
all, which renders at once: until it does, every tile is drawn on
request. The overlay tiles are a minute or two and start whenever a
cycle pack has none. A request from the Dev console starts at once.

CHARTS_AUTO_REFRESH=0 turns the checks off -- a test stack, or a
deployment that schedules the job itself (AWS: infra/cloudformation for
the chart cycle, the server's cron for the overlays).
"""

import logging
import time

from wingtip import charts, cycle_pack, vector_tiles

from . import dev_services
from .settings import CHARTS_REFRESH_WINDOW, get_settings

log = logging.getLogger(__name__)

# How often to ask whether the FAA has moved to a new chart cycle
# (every 56 days).
CHECK_EVERY_S = 3600
AUTO_REFRESH = get_settings().charts_auto_refresh
#: The charts job's containers (docker-compose.yml): the whole run (the
#: overlays, then the cycle), and the overlays alone.
CHARTS_SERVICE = "charts"
OVERLAYS_SERVICE = "charts-overlays"


def in_window(now: time.struct_time | None = None, window: str = CHARTS_REFRESH_WINDOW) -> bool:
    """Whether the clock is inside `window` ("HH:MM-HH:MM", which may
    run past midnight: "22:00-05:00"); always, for a blank window."""
    if not window:
        return True
    start, _, end = window.partition("-")
    now = now or time.localtime()
    minute = now.tm_hour * 60 + now.tm_min
    to_minutes = lambda hhmm: int(hhmm[:2]) * 60 + int(hhmm[3:5])  # noqa: E731
    lo, hi = to_minutes(start), to_minutes(end)
    return lo <= minute < hi if lo <= hi else minute >= lo or minute < hi


def overlays_due() -> bool:
    """Whether the cycle pack the planner holds has no overlay tiles yet
    (the archive the job names after it, wingtip.vector_tiles)."""
    pack = cycle_pack.current()
    if pack is None:
        return False
    held = vector_tiles.tiles_index()
    return held is None or held.get("name") != vector_tiles.archive_name(pack)


def ask_for_overlays() -> None:
    """The overlays alone, where they are due -- after a new cycle pack.
    Never raises: the hourly check asks again."""
    if not AUTO_REFRESH:
        return
    try:
        if overlays_due() and dev_services.start(OVERLAYS_SERVICE):
            log.info("overlay tiles due for the new cycle pack; the charts job is building them")
    except Exception:  # noqa: BLE001 -- the next check tries again; the map asks the in-view endpoints meanwhile
        log.warning("overlay tiles not asked for", exc_info=True)


def maybe_refresh() -> None:
    """The scheduled check: the overlays where due, and the current
    cycle's render if it is due and either the window is open or nothing
    complete is on disk to serve meanwhile. Never raises -- the next
    check tries again, and the map keeps serving what it has."""
    ask_for_overlays()
    try:
        if not charts.refresh_due() or charts.refresh_running():
            return
        served = charts.serving_cycle()
        # Something whole is being served -- its sectional, the rule
        # serving_cycle itself uses -- so the new cycle can wait for the
        # window.
        if charts.pyramid_complete(served, ("sec",)) and not in_window():
            log.info(
                "chart cycle %s is due; rendering it in the %s window (serving %s until then)",
                charts.current_cycle(),
                CHARTS_REFRESH_WINDOW,
                served,
            )
            return
        if dev_services.start(CHARTS_SERVICE):
            log.info("chart cycle %s is not complete on disk; the charts job is fetching and rendering it", charts.current_cycle())
    except Exception:  # noqa: BLE001 -- the next hourly check tries again; the map keeps serving what it has
        log.warning("chart cycle check failed", exc_info=True)


def refresh_now() -> bool | None:
    """The Dev console's "refresh now": the whole job at once, whatever
    the window says. False when it is running already, None where there
    is no sidecar to start it through."""
    return dev_services.start(CHARTS_SERVICE)
