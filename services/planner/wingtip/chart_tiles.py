"""A chart tile, as the map asks for it: from the kind's archive once its
pyramid is packed (wingtip.chart_archives), else drawn on first request
from the sheets that cover it (wingtip.chart_render) and kept on disk for
the cycle. tile_image is the same tile for the chart reader.
"""

from __future__ import annotations

import io
import logging
import time

import requests
from PIL import Image

from .config import get_settings
from . import tile_archive
from . import chart_archives, chart_cycle, chart_grid, chart_prepare, chart_render, chart_serving, config
from .chart_coverage import COVERAGE, covers, intersects
from .chart_kinds import Box, ChartKind, KINDS

log = logging.getLogger(__name__)

# Whether a tile may send for a sheet it needs that is not on disk -- a
# 70 MB download and a minute of preparation, with the tile waiting.
# CHARTS_FETCH_FOR_TILES=0 is CI's (infra/docker-compose.ci.yml): there the
# warm-up prepares the corridors' own sheets (chart_prepare.prepare_for_bbox, which
# always fetches), a tile over them is drawn and cached as ever, and a
# tile that would need any other sheet is left blank (tile_png). The
# browser suite's zoomed-out views sent for 29 sheets beyond the
# corridor's 10, and the charts cache then carried all 39 to every run;
# drawn instead from the sheets there were, such a tile was never whole,
# so never cached, and was drawn again on every request -- the planner
# busy drawing the country under the Class B test while every other
# test on the stack waited on it.
FETCH_FOR_TILES = get_settings().charts_fetch_for_tiles


_NONE_TTL_S = 3600


class TileUnavailable(RuntimeError):
    """Where the tiles are published (CHART_TILES_URL, the AWS server), the
    published archive could not be read just now. The server does not draw
    the tile itself instead: on its two cores, a CDN or S3 outage turned
    every tile the map asked for into a sheet fetched and drawn, and the
    routes, nav logs and Briefs every pilot was waiting on starved (the ops
    audit, 2026-11-21). The map leaves the tile blank and asks again."""


def rasters_covering(kind: ChartKind, bbox: Box, cycle: str | None = None) -> tuple[list, bool]:
    """Every prepared raster of `kind` whose face touches `bbox`, in
    `chart_render.draw_order`, and whether that is all of them -- False
    when a chart that should be there could not be downloaded (or, where tiles do not
    fetch, is not on disk), so a tile rendered without it is not cached
    as if it were complete."""
    cycle = cycle or chart_cycle.current_cycle()
    rasters, complete = [], True
    for name in chart_render.draw_order(COVERAGE[kind.key]):
        envelope = COVERAGE[kind.key][name]
        if not covers(envelope, bbox):
            continue
        chart = chart_prepare.ensure_chart(kind, name, cycle, fetch=FETCH_FOR_TILES)
        if chart is None:
            complete = False
            continue
        rasters.extend(r for r in chart.rasters if intersects(r.face, bbox))
    return rasters, complete


def _archive(kind_key: str, cycle: str, scale: int = 1):
    """The kind's archive the planner serves its tiles from, or None
    where there is none and tiles are loose files drawn on request: on
    disk, or, where the tiles are published (CHART_TILES_URL), the
    published copy the pointer names, read by range requests."""
    if not config.CHART_TILES_URL:
        return tile_archive.on_disk(chart_archives.archive_path(kind_key, cycle, scale))
    pointer = chart_serving.serving_pointer()
    name = ((pointer.get("archives") or {}).get(kind_key) or {}).get(str(scale)) if pointer.get("cycle") == cycle else None
    return tile_archive.over_http(f"{config.CHART_TILES_URL}/{cycle}/{name}", requests) if name else None


def tile_png(x: int, y: int, zoom: int, kind: str = "sec", scale: int = 1) -> bytes | None:
    """The tile's PNG bytes -- from the kind's archive when its pyramid is
    finished, where a tile it lacks is no tile; else rendered on first
    request and cached on disk for the cycle; None where no chart of
    this kind covers it (a 404 for the map's tile layer to leave blank).
    `scale` 2 is the high-density tile. TileUnavailable where the tiles are
    published and their archive cannot be read."""
    chart_kind = KINDS[kind]
    # Whole numbers, whatever the caller handed in: the tile's file is
    # named by them under the cache (CodeQL's py/path-injection).
    x, y, zoom, scale = int(x), int(y), int(zoom), int(scale)
    if not (chart_kind.min_zoom <= zoom <= chart_kind.max_zoom) or scale not in chart_grid.TILE_SCALES:
        return None
    cycle = chart_serving.serving_cycle_of(kind)
    archive = _archive(kind, cycle, scale)
    if archive is not None:
        try:
            return archive.get(zoom, x, y)
        except (OSError, requests.RequestException) as err:
            # The published copy out of reach for now: drawn here instead
            # where tiles are drawn here (locally), never on the AWS server.
            log.warning("%s tile %d/%d/%d not read from its archive", kind, zoom, x, y, exc_info=True)
            if config.CHART_TILES_URL:
                raise TileUnavailable(f"{kind} tile {zoom}/{x}/{y}: its archive did not answer") from err
    elif config.CHART_TILES_URL:
        raise TileUnavailable(f"{kind} tiles of cycle {cycle} at {scale}x are not published, or the pointer did not answer")
    path = chart_render.tile_path(chart_kind, cycle, x, y, zoom, scale)
    none_marker = path.with_suffix(".none")
    try:
        if path.exists():
            return path.read_bytes()
        if none_marker.exists() and time.time() - none_marker.stat().st_mtime < _NONE_TTL_S:
            return None
    except OSError:
        pass

    rasters, complete = rasters_covering(chart_kind, chart_grid.tile_bbox_wgs84(x, y, zoom), cycle)
    if not complete and not FETCH_FOR_TILES:
        return None  # where tiles do not fetch, part of a tile is not drawn (FETCH_FOR_TILES)
    rgba = chart_render.render_tile(rasters, x, y, zoom, scale) if rasters else None
    path.parent.mkdir(parents=True, exist_ok=True)
    if rgba is None:
        if complete:
            none_marker.touch()
        return None
    data = chart_render.encode_png(rgba)
    if complete:
        chart_render.write_atomically(path, data)
        none_marker.unlink(missing_ok=True)
    return data


def tile_image(x: int, y: int, zoom: int, kind: str = "sec") -> Image.Image | None:
    """The tile as an RGB image with the uncovered parts white -- what
    the chart reader (wingtip.chartvision) wants: paper, not the black its
    road-and-rail class looks for."""
    png = tile_png(x, y, zoom, kind)
    if png is None:
        return None
    rgba = Image.open(io.BytesIO(png)).convert("RGBA")
    paper = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    return Image.alpha_composite(paper, rgba).convert("RGB")


def tile_cached(x: int, y: int, zoom: int, kind: str = "sec") -> bool:
    cycle = chart_serving.serving_cycle_of(kind)
    archive = _archive(kind, cycle)
    if archive is not None:
        try:
            return archive.has(zoom, x, y)
        except (OSError, requests.RequestException):
            return False
    return chart_render.tile_path(KINDS[kind], cycle, x, y, zoom).exists()
