"""The whole country, ahead of time: every tile of a kind rendered into the
tile cache, a sheet at a time.

Rendering on first request is fine for a corridor; it is not what a
map that has no street layer under it wants. A sheet that is not on
disk costs the first pilot to look at it half a minute, and every
cold tile a quarter of a second -- the open-warp-encode of one tile
is mostly fixed overhead (opening the raster and setting up the
reprojection, ~70 ms of ~90), so a row of tiles warped in one go is
twenty times cheaper per tile. `chart_prepare.prepare_all` fetches every sheet;
`render_pyramid` walks each sheet's face a tile row at a time and
writes the same files `chart_tiles.tile_png` would, so nothing changes for the
tile endpoint except that it stops rendering.
"""

from __future__ import annotations

import logging
import os
import time
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import chart_cycle, chart_grid, chart_render, chart_serving, chart_sheets, chart_warp, chart_workers, config
from .chart_coverage import COVERAGE
from .chart_grid import TILE_PX
from .chart_kinds import ChartKind, KINDS

log = logging.getLogger(__name__)


def _render_row(args: tuple) -> int:
    """One tile row of one raster at one zoom: warped in a single
    strip, cut into tiles, each clipped to the face, composited over
    whatever another sheet already drew there, and written. Returns
    the number of tiles written. A top-level function because it runs
    in a worker process.

    A tile the composite leaves unfinished -- a seam another sheet has
    yet to draw its side of, or the edge of the country -- goes to a
    `.partial` beside the served file, kept lossless, and becomes the
    tile only when finished or when the pass ends
    (_promote_partials). The served file used to be the blend buffer
    too: a half-drawn seam tile was served, and kept by browsers for
    weeks, while the pass went on. `since`, for a pass under a new
    renderer, is when it began: a tile on disk from before then is drawn
    again rather than kept. `scale` is the tiles' density (chart_grid.TILE_SCALES),
    and `root` the tile cache the pass writes into, handed over rather
    than read from the module: a worker under Python 3.14's forkserver
    imports this module afresh, and a staging folder set by `--tiles-dir`
    was not in it."""
    path, face, kind_key, cycle, zoom, y, x0, x1, mask, since, scale, root = args
    kind = KINDS[kind_key]
    root = Path(root)
    px = TILE_PX * scale
    lats = chart_grid.tile_lats(y, zoom, px)

    def current(p: Path) -> bool:
        return p.exists() and (since is None or p.stat().st_mtime >= since)

    # What this row still owes, before the warp: on a resumed or
    # repeated render most rows owe nothing, and the warp is the cost.
    owed = []
    for x in range(x0, x1 + 1):
        covered = chart_grid.face_mask(face, lats, chart_grid.tile_lons(x, zoom, px))
        if not covered.any():
            continue
        tile_path = chart_render.tile_path(kind, cycle, x, y, zoom, scale, root)
        partial = tile_path.with_suffix(".partial")
        source = partial if current(partial) else tile_path if current(tile_path) else None
        rgba = None
        if source is not None:
            try:
                rgba = chart_render.decode_rgba(source.read_bytes())
            except OSError:
                rgba = None
        if rgba is None:
            rgba = np.zeros((px, px, 4), dtype=np.uint8)
        fill = covered & (rgba[:, :, 3] < 255)
        if fill.any():
            owed.append((x, tile_path, rgba, fill))
    if not owed:
        return 0

    xmin = chart_grid.tile_bbox_3857(x0, y, zoom)[0]
    _, ymin, xmax, ymax = chart_grid.tile_bbox_3857(x1, y, zoom)
    width = (x1 - x0 + 1) * px
    strip, coverage = chart_warp.warp_rgb(
        Path(path), (xmin, ymin, xmax, ymax), width, px, float(lats[px // 2]), Path(mask) if mask else None, face
    )

    written = 0
    for x, tile_path, rgba, fill in owed:
        columns = slice((x - x0) * px, (x - x0 + 1) * px)
        share = coverage[:, columns] * fill
        if not (share > 0).any():
            continue  # the face runs past this sheet's own edge here; the neighbour draws it
        rgba = chart_render.composite(rgba, strip[:, columns], share)
        tile_path.parent.mkdir(parents=True, exist_ok=True)
        partial = tile_path.with_suffix(".partial")
        if (rgba[:, :, 3] == 255).all():
            chart_render.write_atomically(tile_path, chart_render.encode_png(rgba))
            partial.unlink(missing_ok=True)
        else:
            chart_render.write_atomically(partial, chart_render.encode_lossless(rgba))
        tile_path.with_suffix(".none").unlink(missing_ok=True)
        written += 1
    return written


def _promote_partials(kind: ChartKind, cycle: str, since: float | None = None) -> int:
    """Every tile a pass left unfinished made the served tile, once the
    last sheet has drawn: what is not drawn by now is where no sheet
    reaches. One older than `since` is another renderer's that this
    pass never touched, and goes. Returns how many were made tiles."""
    root = config.CHART_TILE_CACHE_DIR / cycle / kind.key
    count = 0
    for partial in sorted(root.rglob("*.partial")) if root.exists() else []:
        if since is None or partial.stat().st_mtime >= since:
            chart_render.write_atomically(
                partial.with_suffix(".png"), chart_render.encode_png(chart_render.decode_rgba(partial.read_bytes()))
            )
            count += 1
        partial.unlink(missing_ok=True)
    return count


def render_pyramid(
    kind: ChartKind,
    zooms: tuple | None = None,
    workers: int | None = None,
    charts: list | None = None,
    cycle: str | None = None,
    scales: tuple | None = None,
) -> int:
    """Every tile of every prepared chart of `kind` in `cycle` (the
    FAA's current one by default), at each zoom of the kind's own
    range, written into the tile cache. Sheets are done one at a time
    -- their tile rows in parallel across `workers` processes -- so two
    sheets never race for the same seam tile. Returns the number of
    tiles written. Re-runnable: a tile already complete on disk is left
    alone, so an interrupted render resumes where it stopped (an
    already-rendered sheet costs a scan) -- unless the last finished
    pass was under another chart_render.RENDERER_VERSION, when every tile is drawn
    again and the cycle's revision bumped at the end. Each tile is drawn
    at every one of `scales` (chart_grid.TILE_SCALES): a pass of `scales=(2,)` adds
    the high-density tiles to a pyramid drawn before they were, leaving
    the others as they are. `workers` None chooses from the memory there
    is (chart_workers.pyramid_workers); 0 renders in this process."""
    zooms = tuple(zooms or range(kind.min_zoom, kind.max_zoom + 1))
    scales = tuple(sorted(set(scales or chart_grid.TILE_SCALES)))
    if workers is None:
        available = chart_workers.available_memory()
        workers = chart_workers.pyramid_workers(scales, available, os.cpu_count())
        log.info(
            "%s: %d render worker(s) for scales %s, from %s available (--workers to choose)",
            kind.key,
            workers,
            ",".join(map(str, scales)),
            f"{available / 2**30:.1f} GB" if available is not None else "an unknown amount of memory",
        )
    if charts is None:
        cycle = cycle or chart_cycle.current_cycle()
        charts = chart_sheets.prepared_charts(cycle)
    charts = [c for c in charts if c.kind is kind]
    order = {name: i for i, name in enumerate(chart_render.draw_order({c.name for c in charts}))}
    charts = sorted(charts, key=lambda c: order[c.name])  # the first sheet written into a tile wins it
    cycle = cycle or (charts[0].cycle if charts else chart_cycle.current_cycle())
    rasters = [(chart, raster) for chart in charts for raster in chart.rasters]
    total = 0
    before = chart_serving.pyramid_status(cycle).get(kind.key) or {"sheets": [], "finished_at": None, "tiles": 0}
    started = datetime.now(tz=timezone.utc)
    # Tiles on disk from a pass under another renderer are drawn again:
    # `since`, the time before which a tile does not count as drawn. A
    # pass under this one that was cut short is resumed with its own.
    cut_short = before.get("current_pass") or {}
    if cut_short and cut_short.get("renderer", 1) == chart_render.RENDERER_VERSION:
        since = cut_short.get("since")
    elif cut_short or (before["finished_at"] and before.get("renderer", 1) != chart_render.RENDERER_VERSION):
        # A little before now: a file's time comes from the kernel's
        # coarser clock, which can read a few milliseconds behind this.
        since = time.time() - 0.05
    else:
        since = None
    record = {
        "kind": kind.key,
        "zooms": list(zooms),
        "sheets": before["sheets"],
        "finished_at": before["finished_at"],
        "tiles": before["tiles"],
        "renderer": before.get("renderer", 1),
        "current_pass": {
            "started_at": started.isoformat(),
            "done": 0,
            "total": len(rasters),
            "current": None,
            "renderer": chart_render.RENDERER_VERSION,
            "since": since,
        },
    }
    chart_serving.write_pyramid_status(cycle, record)

    pool = ProcessPoolExecutor(max_workers=workers) if workers > 0 else None
    try:
        for i, (chart, raster) in enumerate(rasters):
            record["current_pass"]["current"] = raster.path.stem
            chart_serving.write_pyramid_status(cycle, record)
            sheet_started = time.time()
            sheet_tiles = 0
            for zoom in zooms:
                x0, x1, y0, y1 = chart_grid.tile_range(raster.face, zoom)
                jobs = [
                    (
                        str(raster.path),
                        raster.face,
                        kind.key,
                        chart.cycle,
                        zoom,
                        y,
                        x0,
                        x1,
                        str(raster.mask) if raster.mask else None,
                        since,
                        scale,
                        str(config.CHART_TILE_CACHE_DIR),
                    )
                    for scale in scales
                    for y in range(y0, y1 + 1)
                ]
                if pool is None:
                    sheet_tiles += sum(map(_render_row, jobs))
                else:
                    sheet_tiles += sum(pool.map(_render_row, jobs, chunksize=1))
            total += sheet_tiles
            record["current_pass"]["done"] = i + 1
            chart_serving.write_pyramid_status(cycle, record)
            log.info(
                "%s: %d tiles in %.0f s (%d of %d sheets, %d tiles so far)",
                raster.path.stem,
                sheet_tiles,
                time.time() - sheet_started,
                i + 1,
                len(rasters),
                total,
            )
    finally:
        if pool is not None:
            pool.shutdown()
    promoted = _promote_partials(kind, cycle, since)
    # The permanent part, at the end of the pass only: the sheets it
    # rendered join those before it.
    # The scales too, which the map asks for only once a pass has drawn
    # them (chart_serving.tile_scales): a pass of the high-density tiles alone joins
    # them to the ones drawn before.
    record.update(
        sheets=sorted(set(record["sheets"]) | {c.name for c in charts}),
        finished_at=datetime.now(tz=timezone.utc).isoformat(),
        tiles=record["tiles"] + total,
        current_pass=None,
        renderer=chart_render.RENDERER_VERSION,
        scales=sorted(set(before.get("scales", [1])) | set(scales)),
    )
    chart_serving.write_pyramid_status(cycle, record)
    if since is not None:
        # Every tile drawn again, under URLs browsers hold for weeks: a
        # new revision. The kind's archive, packed again from them, is
        # published under a new name (publish).
        chart_serving.bump_revision(cycle)
    log.info("%s %s: pass finished, %d tiles written, %d finished at its end", cycle, kind.key, total, promoted)
    missing = sorted(set(COVERAGE.get(kind.key, {})) - set(record["sheets"]))
    if missing:
        log.warning("%s %s: not complete, %d sheet(s) never rendered: %s", cycle, kind.key, len(missing), ", ".join(missing))
    return total
