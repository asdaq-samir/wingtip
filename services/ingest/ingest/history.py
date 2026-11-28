"""ingest's history jobs, for an airplane's history (its card's NTSB
cases): what is kept of each day as it passes, and what is fetched once a
month.

- Each hour, the NOTAM store and the TFR list merged into the day's
  archive (wingtip.history.notam_archive): no one keeps past NOTAMs, so
  this is the only record of them there will be.
- Each day, the NTSB's file directory read (ingest.ntsb): the store made
  again from avall.zip when the NTSB has remade it, then each weekly
  delta since applied once.
- Each day, the FAA's monthly airmen file asked for (ingest.airmen): the
  flight instructors' store made again from a month's file once, for
  the endorsements' instructor check (wingtip.airmen).
- Every six hours, the FAA's aircraft registry read again where the copy
  on disk is a day old (wingtip.registry), for an airplane's card and the
  radar's LADD check: 73 MB from the FAA and some 40 s of CPU, which ran
  in the planner's one process beside the pilots' requests until
  2026-11-27, and here runs beside the feeds' threads instead.

Each is a job on ingest's scheduler (wingtip.schedule): a failure is
logged and tried again at the next turn; neither holds up the feeds. The
three heavy ones take their first turns FIRST_TURNS_APART_S apart, the
registry first: all three at start-up, a rebuild of the registry beside
the NTSB's and the airmen's, held ingest's 384 MB at once.
A store on disk of an older shape than the planner reads goes first,
whatever that order: the planner reads it as none until it is built
again, and the NTSB's waited 300 s behind the registry.
"""

from __future__ import annotations


from apscheduler.schedulers.base import BaseScheduler
from wingtip import registry, schedule, stores
from wingtip.config import get_settings
from wingtip.history import notam_archive

from . import airmen, ntsb

#: How often the day's archive is brought up to date, s.
SNAPSHOT_EVERY_S = 3600.0
#: How often the NTSB's directory is looked at, s: a delta comes weekly.
NTSB_EVERY_S = 86400.0
#: How often the FAA's airmen file is asked for, s: it comes monthly.
AIRMEN_EVERY_S = 86400.0
#: How often the registry's age is looked at, s: it is read again once it
#: is a day old (registry.MAX_AGE_S), so within six hours of that.
REGISTRY_EVERY_S = 6 * 3600.0
#: How far apart the registry's, the NTSB's and the airmen's first turns
#: are, s: longer than a registry rebuild (some 40 s of CPU and the 73 MB
#: download) takes.
FIRST_TURNS_APART_S = 300.0


def jobs(on: BaseScheduler) -> None:
    """The archive brought up to date each SNAPSHOT_EVERY_S, the NTSB's
    store each NTSB_EVERY_S, the airmen's each AIRMEN_EVERY_S and the
    registry's age looked at each REGISTRY_EVERY_S, the archive's first
    now and the registry's, the NTSB's and the airmen's FIRST_TURNS_APART_S
    apart, a store of an older shape first (stores.older): each a job on `on`."""
    schedule.every(on, SNAPSHOT_EVERY_S, notam_archive.snapshot, name="notam-archive")
    heavy = [("ntsb", NTSB_EVERY_S, ntsb.refresh, ntsb.older_shape())]
    heavy.append(("airmen", AIRMEN_EVERY_S, airmen.refresh, False))
    # Off on a stack that downloads nothing it need not (REGISTRY_REFRESH=0);
    # an older registry file there reads as none in the planner.
    if get_settings().registry_refresh:
        older = stores.older(registry.DEFAULT_DIR / registry.DB_NAME, registry.SCHEMA)
        heavy.insert(0, ("aircraft-registry", REGISTRY_EVERY_S, registry.refresh, older))
    # sorted keeps the order among equals: the stale first, then as listed.
    for turn, (name, every_s, job, _) in enumerate(sorted(heavy, key=lambda h: not h[3])):
        schedule.every(on, every_s, job, name=name, after=turn * FIRST_TURNS_APART_S)
