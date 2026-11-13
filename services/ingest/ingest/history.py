"""ingest's history thread, for the Studio's replay of a real flight: what
is kept of each day as it passes, and what is fetched once a month.

- Each hour, the NOTAM store and the TFR list merged into the day's
  archive (wingtip.history.notam_archive): no one keeps past NOTAMs, so
  this is the only record of them there will be.
- Each day, the NTSB's file directory read (ingest.ntsb): the store made
  again from avall.zip when the NTSB has remade it, then each weekly
  delta since applied once.

A failure is logged and tried again at the next turn; neither holds up
the feeds.
"""

from __future__ import annotations

import logging
import threading
import time

from wingtip.history import notam_archive

from . import ntsb

log = logging.getLogger(__name__)

#: How often the day's archive is brought up to date, s.
SNAPSHOT_EVERY_S = 3600.0
#: How often the NTSB's directory is looked at, s: a delta comes weekly.
NTSB_EVERY_S = 86400.0


def turn(last_ntsb: float, now: float) -> float:
    """One turn: the archive brought up to date, and the NTSB's store when
    a day has passed since it was last looked at. When it was last looked at."""
    try:
        notam_archive.snapshot()
    except Exception:  # noqa: BLE001 -- the next hour tries again
        log.warning("the day's NOTAM and TFR archive not written", exc_info=True)
    if now - last_ntsb < NTSB_EVERY_S:
        return last_ntsb
    try:
        ntsb.refresh()
    except Exception:  # noqa: BLE001 -- tomorrow's look tries again
        log.warning("the NTSB's database not read", exc_info=True)
    return now


def run(stop: threading.Event) -> None:
    """Turns each SNAPSHOT_EVERY_S until `stop`."""
    last_ntsb = 0.0
    while not stop.is_set():
        last_ntsb = turn(last_ntsb, time.time())
        stop.wait(SNAPSHOT_EVERY_S)
