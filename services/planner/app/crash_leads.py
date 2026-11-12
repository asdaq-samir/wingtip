"""When the crash-leads job (services/jobs/crash, docs/STUDIO-PIPELINE.md)
runs on a machine of one's own: every CRASH_LEADS_EVERY_MIN (30), started
through the dev-services sidecar (app.dev_services) as the charts job is
(app.chart_refresh). The job reads the FAA's statements and notices into
leads, checks their identity and makes the kits; the planner serves what
it wrote (app.routers.studio_drafts) and fetches none of it.

CRASH_LEADS_AUTO=0 turns it off. A deployment with no sidecar (production,
CI) starts nothing here: on AWS the job is a scheduled task of its own,
when the pipeline moves there (#115)."""

import logging
import time

from wingtip.config import get_settings

from . import dev_services

log = logging.getLogger(__name__)

#: The job's container (docker-compose.yml's `crash-leads`).
SERVICE = "crash-leads"


def start_forever() -> None:
    """Start the job now and every CRASH_LEADS_EVERY_MIN after, for as long
    as the planner runs; nothing where it is off or there is no sidecar.
    A start while a run is still going is no start (the sidecar says so)."""
    settings = get_settings()
    if not settings.crash_leads_auto or dev_services.SIDECAR_URL is None:
        return
    every_s = max(5, settings.crash_leads_every_min) * 60
    while True:
        try:
            dev_services.start(SERVICE)
        except Exception:  # noqa: BLE001 -- the next turn tries again
            log.warning("the crash-leads job was not started", exc_info=True)
        time.sleep(every_s)
