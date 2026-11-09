"""The charts job's commands, `python -m charts <command>` (the image's
entry point):

- `run`: what the local stack starts (app.chart_refresh, through the
  dev-services sidecar): the overlay tiles where the planner's cycle pack
  has none, then the FAA's current chart cycle fetched and rendered where
  it is not complete on disk.
- `overlays`: the overlay tiles alone (overlays.ensure), a minute or two
  of tippecanoe once the planner has written a new cycle pack; a no-op
  otherwise. The production server runs it from cron.
- `next`: the FAA's next chart cycle staged ahead of its date
  (charts.next_cycle, by wingtip.chart_next's dates): from CHARTS_CYCLE_LEAD_DAYS before it, its sheets
  fetched, its pyramid rendered and packed into its own folder, which the
  map takes at 0901Z on its date; once it is in force and complete, the
  cycles before it deleted. It takes a turn among the machine's heavy
  work first (charts.turn). The planner starts it (app.chart_refresh,
  CHARTS_CYCLE_AUTO) through the dev-services sidecar.
- `refresh`: the chart cycle alone (wingtip.charts.refresh), published to
  CHART_TILES_BUCKET where one is set: the AWS scheduled task.
- `pack`: every finished kind's loose tiles into its archives
  (wingtip.charts.pack_complete), which `refresh` does at the end of its
  passes; on its own, the one-off conversion of a cycle drawn before
  there were archives.
- `prepare` fetches every sheet, `pyramid` renders every tile, `check`
  looks for daylight between adjacent sheets, `publish` uploads a
  complete cycle's archives, and `unmask` takes the masked lines out of
  sheets prepared before `prepare` did it itself and renders their tiles
  again.

Every one resumes where a stopped one left off. They were
`python -m wingtip.charts` in the planner's image until the jobs split
(#535); wingtip.charts keeps the work, this keeps the asking.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from wingtip import altitude, chart_next, charts
from wingtip.config import CHART_TILES_BUCKET, get_settings

from . import next_cycle, overlays, turn

log = logging.getLogger(__name__)

#: How far the renders step back for everything else on the machine: they
#: are hours of every core they are given, and on a machine that is also
#: somebody's desk the planner serving tiles and the browser showing them
#: come first. Raising one's own niceness needs no privilege.
NICE = 10
#: The commands that render, and so step back.
RENDERS = ("run", "pyramid", "refresh", "unmask", "next")


def entry() -> int:
    """The image's entry point: niced where it renders, then main. Here
    rather than in main, which the tests call in their own process."""
    if sys.argv[1:2] and sys.argv[1] in RENDERS and hasattr(os, "nice"):
        os.nice(NICE)
    return main()


def _overlays() -> int:
    """The overlay tiles of the planner's cycle pack, where they are not
    built yet."""
    index = overlays.ensure(altitude.DEFAULT_FAA_CACHE_DIR)
    if index is None:
        log.info("overlay tiles are of the current cycle pack, or there is no pack yet: nothing to build")
    return 0


def main(argv: list | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m charts",
                                     description="FAA charts: fetch every sheet, render every tile, build the overlays.")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("run", "overlays", "prepare", "pyramid", "refresh", "check", "publish", "unmask", "pack", "next"):
        p = sub.add_parser(name)
        if name in ("prepare", "pyramid"):
            p.add_argument("--kind", nargs="+", choices=list(charts.KINDS), default=list(charts.KINDS))
        if name == "prepare":
            p.add_argument("--redetect", action="store_true", help="run the face detection again on sheets already on disk")
        if name in ("run", "pyramid", "refresh", "unmask"):
            # A pyramid's default comes from the memory there is
            # (wingtip.charts.pyramid_workers): a fixed 4 was killed for
            # memory at @2x.
            p.add_argument("--workers", type=int, default=None if name == "pyramid" else 2)
        if name == "next":
            # From the memory there is, as a pyramid's (pyramid_workers).
            p.add_argument("--workers", type=int, default=None)
            p.add_argument("--lead-days", type=int, default=get_settings().charts_cycle_lead_days,
                           help="how many days before its date the next cycle is staged (CHARTS_CYCLE_LEAD_DAYS)")
        if name == "unmask":
            p.add_argument("--cycle", help="the cycle whose sheets and tiles to clean; the served one by default")
            p.add_argument("--again", action="store_true",
                           help="look again at sheets already cleaned, along the borders of what was taken out")
        if name == "pyramid":
            p.add_argument("--zooms", help="e.g. 5-12; the kind's own range by default")
            p.add_argument("--scales", default=",".join(map(str, charts.TILE_SCALES)),
                           help="the densities to draw, e.g. 2 to add the high-density tiles to a finished pyramid")
            p.add_argument("--tiles-dir", help="render into this folder instead of the tile cache -- a staging "
                                               "pyramid to swap in whole while the old one keeps serving")
        if name in ("run", "refresh", "publish"):
            p.add_argument("--bucket", default=CHART_TILES_BUCKET,
                           help="S3 bucket to publish the complete cycle to (CHART_TILES_BUCKET by default)")
        if name == "publish":
            p.add_argument("--cycle", help="the cycle to publish; the served one by default")
        if name == "pack":
            p.add_argument("--cycle", nargs="+", help="the cycles whose finished kinds to pack; every one on disk by default")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if getattr(args, "tiles_dir", None):
        charts.CHART_TILE_CACHE_DIR = Path(args.tiles_dir)

    if args.command == "overlays":
        return _overlays()
    if args.command == "run":
        # The overlays first: a minute, and what the map draws its
        # airspace and airports from; the cycle's render can be hours.
        status = 0
        try:
            _overlays()
        except Exception:  # noqa: BLE001 -- the chart cycle is still worth rendering; the next run tries again
            log.exception("overlay tiles not built")
            status = 1
        args.command = "refresh"
        return _locked(args, parser) or status
    return _locked(args, parser)


def _locked(args, parser) -> int:
    """The runs that write the cycle's tiles, or its publish ledger, hold
    the refresh lock (wingtip.charts.refresh_lock) for their whole life. A
    refresh or a pyramid that finds it held leaves the running one to it;
    an unmask waits, then renders its tiles again on what that run left; a
    publish waits rather than write back a ledger an unmask has struck
    tiles off."""
    if args.command in ("refresh", "pyramid", "unmask", "publish", "pack", "next"):
        wait = args.command in ("unmask", "publish", "pack")
        with charts.refresh_lock(wait=wait) as got:
            if not got:
                log.info("a refresh, pyramid or unmask is already running on %s; leaving it to that",
                         charts.CHART_TILE_CACHE_DIR)
                return 0 if args.command in ("refresh", "next") else 1
            return _run(args, parser)
    return _run(args, parser)


def _run(args, parser) -> int:
    if args.command == "prepare":
        prepared = charts.prepare_all(tuple(args.kind), redetect=args.redetect)
        log.info("%d charts ready under %s", len(prepared), charts.CHARTS_DIR)
        return 0
    if args.command == "unmask":
        changed = charts.unmask_prepared(args.cycle, workers=args.workers, again=args.again)
        log.info("masked lines removed: %s", {k: len(v) for k, v in changed.items()} or "none left to remove")
        return 0
    if args.command == "next":
        label = "charts job: the next chart cycle"
        state = next_cycle.run(workers=args.workers, lead_days=args.lead_days, turn=lambda: turn.turn(label))
        log.info("next cycle: %s", state)
        return 1 if state == chart_next.FAILED else 0
    if args.command == "refresh":
        cycle = charts.refresh(workers=args.workers, publish_bucket=args.bucket)
        log.info("cycle %s complete; serving %s", cycle, charts.serving_cycle())
        return 0
    if args.command == "publish":
        if not args.bucket:
            parser.error("publish needs --bucket or CHART_TILES_BUCKET")
        count = charts.publish(args.cycle or charts.serving_cycle(), args.bucket)
        log.info("%d tiles uploaded", count)
        return 0
    if args.command == "pack":
        for cycle in args.cycle or charts._cycles_on_disk(charts.CHART_TILE_CACHE_DIR):
            log.info("%s: packed %s", cycle, charts.pack_complete(cycle) or "nothing (no finished kind with loose tiles)")
        return 0
    if args.command == "check":
        gaps = charts.face_gaps()
        for a, b, gap in gaps:
            print(f"GAP {gap:.3f} deg between {a} and {b}")
        print(f"{len(gaps)} gaps between adjacent sheets ({charts.serving_cycle()})")
        return 1 if gaps else 0
    zooms = None
    if args.zooms:
        lo, _, hi = args.zooms.partition("-")
        zooms = tuple(range(int(lo), int(hi or lo) + 1))
    for key in args.kind:
        kind = charts.KINDS[key]
        scales = tuple(int(s) for s in args.scales.split(",") if int(s) in charts.TILE_SCALES)
        count = charts.render_pyramid(kind, zooms=zooms and tuple(z for z in zooms if kind.min_zoom <= z <= kind.max_zoom),
                                      workers=args.workers, scales=scales)
        log.info("%s: %d tiles written under %s", key, count, charts.CHART_TILE_CACHE_DIR)
    return 0
