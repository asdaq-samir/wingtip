"""ingest's history jobs, for the Studio's replay of a real flight: what
is kept of each day as it passes, and what is fetched once a month.

- Each hour, the NOTAM store and the TFR list merged into the day's
  archive (wingtip.history.notam_archive): no one keeps past NOTAMs, so
  this is the only record of them there will be.
- Each day, the NTSB's file directory read (ingest.ntsb): the store made
  again from avall.zip when the NTSB has remade it, then each weekly
  delta since applied once.

Each is a job on ingest's scheduler (wingtip.schedule): a failure is
logged and tried again at the next turn; neither holds up the feeds.
"""

from __future__ import annotations

from apscheduler.schedulers.base import BaseScheduler
from wingtip import schedule
from wingtip.history import notam_archive

from . import ntsb

#: How often the day's archive is brought up to date, s.
SNAPSHOT_EVERY_S = 3600.0
#: How often the NTSB's directory is looked at, s: a delta comes weekly.
NTSB_EVERY_S = 86400.0


def jobs(on: BaseScheduler) -> None:
    """The archive brought up to date each SNAPSHOT_EVERY_S, and the NTSB's
    store each NTSB_EVERY_S, both first now: each a job on `on`."""
    schedule.every(on, SNAPSHOT_EVERY_S, notam_archive.snapshot, name="notam-archive")
    schedule.every(on, NTSB_EVERY_S, ntsb.refresh, name="ntsb")
