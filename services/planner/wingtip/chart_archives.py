"""A finished pyramid, packed: one archive per kind and density.

A pass draws loose files -- a tile is composited from one sheet after
another, and a pass cut short resumes from what is on disk -- and a
finished kind is then packed into one archive per density
(wingtip.tile_archive), its loose files removed: a cycle was about 1.4
million files on disk and as many objects in S3, and is now a few dozen.
A loose tile is a palette PNG; in the archive it is the same pixels as
lossless WebP (wingtip.chart_render.to_webp), 11% fewer bytes.
"""

from __future__ import annotations

import logging
import os
import re
from collections.abc import Iterator
from concurrent.futures import ProcessPoolExecutor
from itertools import islice
from pathlib import Path


from . import tile_archive
from . import chart_grid, chart_render, chart_serving, config
from .chart_kinds import ChartKind, KINDS

log = logging.getLogger(__name__)

#: Tiles handed to the encoding processes at a time: some 20 MB of @2x
#: tiles each way, where the whole of a kind would be tens of GB.
_BATCH = 512


def _encoded(tiles: list, workers: int) -> Iterator[bytes]:
    """Each of `tiles` -- (z, x, y, length, read) -- as its archive keeps
    it (chart_render.to_webp), in their order, a batch at a time."""
    pool = ProcessPoolExecutor(max_workers=workers) if workers > 1 else None
    try:
        it = iter(tiles)
        while batch := [t[4]() for t in islice(it, _BATCH)]:
            yield from (pool.map(chart_render.to_webp, batch, chunksize=16) if pool else map(chart_render.to_webp, batch))
    finally:
        if pool:
            pool.shutdown()


def webp_tiles(tiles, workers: int = 0) -> list:
    """`tiles` -- (z, x, y, length, read), PNG or WebP -- as lossless WebP,
    ready for tile_archive.write with tile_type WEBP: encoded once for
    each one's length, which the archive's directory is laid out from
    before any tile is written, and again, in the same tile-id order,
    as it writes them (it checks each is the length it was); holding
    them all between would be tens of GB at @2x. Encoding is the same
    each time (one libwebp, one setting), and a WebP tile is passed as
    it is."""
    ordered = sorted(tiles, key=lambda t: tile_archive.zxy_to_tileid(t[0], t[1], t[2]))
    lengths = [len(data) for data in _encoded(ordered, workers)]
    stream = _encoded(ordered, workers)
    return [(z, x, y, n, lambda: next(stream)) for (z, x, y, _, _), n in zip(ordered, lengths)]


def _write(kind: ChartKind, cycle: str, scale: int, tiles, workers: int = 0) -> int:
    return tile_archive.write(
        archive_path(kind.key, cycle, scale),
        webp_tiles(tiles, workers),
        archive_metadata(kind, cycle, scale),
        tile_type=tile_archive.TileType.WEBP,
    )


def _pack_workers() -> int:
    """The processes that encode a pack: the machine's cores but one,
    four at most (some 9 ms a tile each)."""
    return max(1, min(4, (os.cpu_count() or 2) - 1))


def archive_path(kind_key: str, cycle: str, scale: int = 1, root: Path | None = None) -> Path:
    """Where a kind's finished pyramid at one density is kept: one archive
    beside the cycle's pyramid record (wingtip.tile_archive)."""
    return (root or config.CHART_TILE_CACHE_DIR) / cycle / tile_archive.archive_name(kind_key, scale)


def rewrite_archive(kind: ChartKind, cycle: str, scale: int, replaced: dict) -> int:
    """The kind's archive written again with `replaced` -- (z, x, y) to
    the tile's new PNG, or None to leave it out -- in place of its own,
    every tile in it WebP."""
    old = tile_archive.on_disk(archive_path(kind.key, cycle, scale))
    kept = [(z, x, y, n, read) for z, x, y, n, read in old.tiles() if (z, x, y) not in replaced]
    new = [(z, x, y, len(data), lambda d=data: d) for (z, x, y), data in replaced.items() if data is not None]
    return _write(kind, cycle, scale, kept + new)


def archive_metadata(kind: ChartKind, cycle: str, scale: int) -> dict:
    return {
        "name": f"FAA {kind.key} {cycle}",
        "kind": kind.key,
        "cycle": cycle,
        "scale": scale,
        "renderer": chart_render.RENDERER_VERSION,
        "attribution": "FAA aeronautical charts",
    }


def pack_pyramid(kind: ChartKind, cycle: str, scale: int = 1, workers: int | None = None) -> int:
    """A kind's loose tiles of one density packed into its archive with
    the old archive's tiles the pass left alone (tile_archive.kept); the
    loose files, their `.none` markers and any `.partial` go. Returns how
    many tiles the archive holds; with no loose tiles, nothing is written
    and the archive there is kept."""
    suffix = "" if scale == 1 else f"@{scale}x"
    name = re.compile(rf"(\d+){re.escape(suffix)}\.png")
    # This density's markers, a `.none` (no tile there) and a `.partial`
    # (a tile drawn again), go with the loose tiles wherever they are.
    marker = re.compile(rf"\d+{re.escape(suffix)}\.(none|partial)")
    tiles, markers, base = [], [], config.CHART_TILE_CACHE_DIR / cycle / kind.key
    for z_dir in os.scandir(base) if base.is_dir() else ():
        if not z_dir.name.isdigit():
            continue
        for x_dir in os.scandir(z_dir.path):
            if not x_dir.name.isdigit():
                continue
            for f in os.scandir(x_dir.path):
                if match := name.fullmatch(f.name):
                    tiles.append((int(z_dir.name), int(x_dir.name), int(match[1]), f.stat().st_size, lambda p=f.path: Path(p).read_bytes()))
                elif marker.fullmatch(f.name):
                    markers.append(Path(f.path))
    struck = [(int(m.parent.parent.name), int(m.parent.name), int(m.name.split(".")[0].split("@")[0])) for m in markers]
    kept = tile_archive.kept(archive_path(kind.key, cycle, scale), tiles, struck, range(kind.min_zoom, kind.max_zoom + 1))
    count = _write(kind, cycle, scale, [*tiles, *kept], _pack_workers() if workers is None else workers)
    if not count:
        return 0
    for z, x, y, _, _ in tiles:
        (base / str(z) / str(x) / f"{y}{suffix}.png").unlink(missing_ok=True)
    for path in markers:
        path.unlink(missing_ok=True)
    for folder in [*sorted(base.rglob("*"), key=lambda p: len(p.parts), reverse=True), base]:
        if folder.is_dir() and not any(folder.iterdir()):
            folder.rmdir()
    log.info("%s %s%s: %d tiles packed into %s", cycle, kind.key, suffix, count, archive_path(kind.key, cycle, scale).name)
    return count


def pack_complete(cycle: str, kinds: tuple = tuple(KINDS), workers: int | None = None) -> dict:
    """Every finished kind of `cycle` packed, at each density its passes
    drew (its record's scales): {kind key: tiles packed}. What a refresh
    does once its passes end, and the one-off conversion of a cycle
    rendered before there were archives (the charts job's `pack`).
    `workers` encode the WebP, _pack_workers() by default."""
    packed = {}
    for key in kinds:
        record = chart_serving.pyramid_status(cycle).get(key, {})
        # A pass under way, or cut short, keeps the last finished pass's
        # record -- complete -- beside half a pyramid of loose tiles,
        # which would replace the whole archive.
        if not chart_serving.pyramid_complete(cycle, (key,)) or record.get("current_pass"):
            continue
        scales = [scale for scale in record.get("scales", [1]) if scale in chart_grid.TILE_SCALES]
        count = sum(pack_pyramid(KINDS[key], cycle, scale, workers) for scale in scales)
        if count:
            packed[key] = count
    return packed


def transcode(cycle: str, kinds: tuple = tuple(KINDS), workers: int | None = None) -> dict:
    """Every archive of `cycle` packed before the WebP (its header's tile
    type PNG) written again as lossless WebP, the same pixels: the
    one-off conversion of a cycle on disk (the charts job's `transcode`),
    with no tile drawn again, so no revision is bumped -- a browser that
    kept a PNG under a tile's address keeps the same picture. It needs
    free space for the largest archive again beside it. Returns {archive
    name: tiles}."""
    done = {}
    for key in kinds:
        for scale in chart_grid.TILE_SCALES:
            archive = tile_archive.on_disk(archive_path(key, cycle, scale))
            if archive is None or archive.header["tile_type"] == tile_archive.TileType.WEBP:
                continue
            count = _write(KINDS[key], cycle, scale, list(archive.tiles()), workers or _pack_workers())
            done[tile_archive.archive_name(key, scale)] = count
            log.info("%s %s: %d tiles written again as WebP", cycle, tile_archive.archive_name(key, scale), count)
    return done
