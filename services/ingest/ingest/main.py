"""ingest: the live feeds, read always, into the stores the planner reads
(issue #535's first split from the planner).

- The FAA's SWIM feeds (ingest.swim): STDDS's terminal radar into the live
  store (wingtip.traffic.store), FNS's NOTAMs into wingtip.notams' store,
  TFMS's flight plans into wingtip.filed_routes'.
- The followed airplanes asked of adsb.fi each half minute
  (wingtip.traffic.follow_forever), their tracks recorded in the live store.
- The Studio's history (ingest.history): each hour the day's NOTAMs and
  TFRs archived, and each month the NTSB's database read.

The planner's own traffic, the map's region asked of adsb.lol and an open
card's airplane, is asked as a pilot asks and stays there; what is read
here is what runs whether anyone asks or not. It fetches and stores only:
no figure is worked out here.

Run as `python -m ingest.main`; it ends on SIGTERM (compose's stop). Each
beat (BEAT_EVERY_S) writes its own and each feed's state to the store,
which `python -m ingest.health` (the image's health check) reads back.
"""

import logging
import signal
import threading
import time

from wingtip import traffic, tracing
from wingtip.traffic import store

from . import history, swim
from .settings import get_settings

log = logging.getLogger("ingest")


def beat(feeds: list[str]) -> None:
    """ingest's beat, each feed's state, and the radar's stale reports dropped."""
    now = time.time()
    for feed in feeds:
        store.beat(feed, now, swim.STATE[feed])
    traffic.forget_stale()
    store.beat("ingest", now, {"feeds": feeds})


def run(stop: threading.Event) -> None:
    """The feeds and the following started, and the beat kept until `stop`."""
    feeds = swim.start(stop)
    log.info("SWIM feeds: %s", ", ".join(feeds) or "none set up")
    threading.Thread(target=traffic.follow_forever, args=(stop,), name="adsb-follow", daemon=True).start()
    if get_settings().history:
        threading.Thread(target=history.run, args=(stop,), name="history", daemon=True).start()
    every = get_settings().beat_every_s
    while not stop.is_set():
        try:
            beat(feeds)
        except Exception:  # noqa: BLE001 -- the next beat tries again; the health check sees a long gap
            log.warning("ingest's beat not written", exc_info=True)
        stop.wait(every)


def main() -> None:
    logging.basicConfig(level=get_settings().log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # Traces with TRACING=1 (docs/LOCAL-DEV.md, "Tracing"): each round of
    # following a trace, its adsb.fi asks under it; nothing otherwise.
    tracing.start("ingest")
    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    run(stop)
    log.info("ingest stopped")


if __name__ == "__main__":
    main()
