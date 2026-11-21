"""Tiles drawn again after a sheet changed on disk: those already drawn
over the boxes that changed, loose or in an archive, under a new tile
revision so browsers ask for them afresh (rerender_tiles); and the
masked lines taken out of sheets prepared before preparing did it
(unmask_prepared).
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ProcessPoolExecutor


from . import chart_faces, tile_archive
from . import chart_archives, chart_grid, chart_render, chart_serving, chart_sheets, chart_tiles
from .chart_kinds import ChartKind, KINDS
from .chart_sheets import Chart, Raster

log = logging.getLogger(__name__)


def _rerender_tile(args: tuple) -> bytes | None | bool:
    """One tile rendered again from the sheets as they are now, the same
    way `chart_tiles.tile_bytes` would render it: its PNG, None where no sheet draws it
    any more, or False where a sheet it needs could not be had. A
    top-level function because it runs in a worker process."""
    kind_key, cycle, x, y, zoom, scale = args
    kind = KINDS[kind_key]
    rasters, complete = chart_tiles.rasters_covering(kind, chart_grid.tile_bbox_wgs84(x, y, zoom), cycle)
    if not complete:
        # A sheet this tile needs could not be had. Drawn without it, the
        # tile would go out under the bumped revision -- which browsers
        # then keep for weeks -- missing that sheet; `chart_tiles.tile_bytes` never
        # caches such a tile either. The old tile stays until a run that
        # has every sheet.
        return False
    rgba = chart_render.render_tile(rasters, x, y, zoom, scale) if rasters else None
    return None if rgba is None else chart_render.encode_png(rgba)


def rerender_tiles(kind: ChartKind, boxes: list, cycle: str, workers: int = 2) -> int:
    """Every tile of `kind` already drawn for `cycle` -- in its archive or
    a loose file -- that touches one of `boxes`, rendered again after a
    sheet changed on disk, then the cycle's revision bumped so browsers
    ask for them afresh. An archive is written again whole with them in
    it, under a new published name (publish). Tiles not yet drawn are
    left to render on demand. Returns the number rewritten. Every scale
    of a tile drawn at it (chart_grid.TILE_SCALES) is drawn again."""
    archives = {scale: tile_archive.on_disk(chart_archives.archive_path(kind.key, cycle, scale)) for scale in chart_grid.TILE_SCALES}
    tiles = set()
    for zoom in range(kind.min_zoom, kind.max_zoom + 1):
        for box in boxes:
            x0, x1, y0, y1 = chart_grid.tile_range(box, zoom)
            tiles.update(
                (x, y, zoom, scale)
                for x in range(x0, x1 + 1)
                for y in range(y0, y1 + 1)
                for scale in chart_grid.TILE_SCALES
                if (archives[scale].has(zoom, x, y) if archives[scale] else chart_render.tile_path(kind, cycle, x, y, zoom, scale).exists())
            )
    order = sorted(tiles, key=lambda t: (t[3], t[2], t[1], t[0]))
    jobs = [(kind.key, cycle, x, y, zoom, scale) for x, y, zoom, scale in order]
    log.info("%s %s: rendering %d tiles again", cycle, kind.key, len(jobs))
    if workers > 0 and len(jobs) > 1:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            drawn = list(pool.map(_rerender_tile, jobs, chunksize=16))
    else:
        drawn = list(map(_rerender_tile, jobs))

    written = 0
    replaced: dict = {scale: {} for scale in chart_grid.TILE_SCALES}
    for (x, y, zoom, scale), data in zip(order, drawn):
        if data is False:
            continue
        if archives[scale]:
            replaced[scale][(zoom, x, y)] = data
        else:
            path = chart_render.tile_path(kind, cycle, x, y, zoom, scale)
            if data is None:
                path.unlink(missing_ok=True)
            else:
                chart_render.write_atomically(path, data)
        written += data is not None
    for scale, these in replaced.items():
        if these:
            chart_archives.rewrite_archive(kind, cycle, scale, these)
    chart_serving.bump_revision(cycle)
    return written


def unmask_prepared(cycle: str | None = None, workers: int = 2, again: bool = False) -> dict:
    """The masked lines taken out of every sheet already on disk that
    has not been looked at for them -- preparing a sheet does this
    itself, so this is for the ones prepared before it did -- and the
    cached tiles they touched rendered again. `again` looks once more at
    sheets already cleaned, for what is left along the borders of what
    was taken out (after the search learns to find more). Returns {kind
    key: boxes changed}. Re-runnable."""
    cycle = cycle or chart_serving.serving_cycle()
    changed: dict = {}
    for chart in chart_sheets.prepared_charts(cycle):
        if not chart.kind.masked_lines:
            continue
        if not again and all(r.masked_lines is not None for r in chart.rasters):
            continue
        started = time.time()
        directory = chart.rasters[0].path.parent
        with chart_sheets.lock_for((chart.kind.key, chart.name)), chart_sheets.directory_lock(directory):
            removed = {}
            for path in sorted({r.path for r in chart.rasters}):
                parts = [r for r in chart.rasters if r.path == path]
                before = tuple(dict.fromkeys(b for r in parts for b in (r.masked_lines or ())))
                if parts[0].masked_lines is not None and not again:
                    removed[path] = (before, ())
                    continue
                removed[path] = (before, chart_faces.remove_masked_lines(path, [r.face for r in parts], known=before))
            rasters = tuple(
                Raster(path=r.path, face=r.face, envelope=r.envelope, mask=r.mask, masked_lines=removed[r.path][0] + removed[r.path][1])
                for r in chart.rasters
            )
            chart_sheets.write_ready(
                directory, Chart(kind=chart.kind, name=chart.name, cycle=chart.cycle, rasters=rasters, prepared_at=chart.prepared_at)
            )
        boxes = [box for _, found in removed.values() for box in found]
        changed.setdefault(chart.kind.key, []).extend(boxes)
        log.info("%s/%s: %d masked-line area(s) removed in %.0f s", chart.kind.key, chart.name, len(boxes), time.time() - started)
    for key, boxes in changed.items():
        if boxes:
            count = rerender_tiles(KINDS[key], boxes, cycle, workers=workers)
            log.info("%s: %d tiles rendered again; revision %d", key, count, chart_serving.tiles_revision(cycle))
    return changed
