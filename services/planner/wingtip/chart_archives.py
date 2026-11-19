"""A finished pyramid, packed: one archive per kind and density.

A pass draws loose files -- a tile is composited from one sheet after
another, and a pass cut short resumes from what is on disk -- and a
finished kind is then packed into one archive per density
(wingtip.tile_archive), its loose files removed: a cycle was about 1.4
million files on disk and as many objects in S3, and is now a few dozen.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path


from . import tile_archive
from . import chart_grid, chart_render, chart_serving, config
from .chart_kinds import ChartKind, KINDS

log = logging.getLogger(__name__)


def archive_path(kind_key: str, cycle: str, scale: int = 1, root: Path | None = None) -> Path:
    """Where a kind's finished pyramid at one density is kept: one archive
    beside the cycle's pyramid record (wingtip.tile_archive)."""
    return (root or config.CHART_TILE_CACHE_DIR) / cycle / tile_archive.archive_name(kind_key, scale)


def rewrite_archive(kind: ChartKind, cycle: str, scale: int, replaced: dict) -> int:
    """The kind's archive written again with `replaced` -- (z, x, y) to
    the tile's new PNG, or None to leave it out -- in place of its own."""
    old = tile_archive.on_disk(archive_path(kind.key, cycle, scale))
    kept = [(z, x, y, n, read) for z, x, y, n, read in old.tiles() if (z, x, y) not in replaced]
    new = [(z, x, y, len(data), lambda d=data: d) for (z, x, y), data in replaced.items() if data is not None]
    return tile_archive.write(archive_path(kind.key, cycle, scale), kept + new, archive_metadata(kind, cycle, scale))


def archive_metadata(kind: ChartKind, cycle: str, scale: int) -> dict:
    return {
        "name": f"FAA {kind.key} {cycle}",
        "kind": kind.key,
        "cycle": cycle,
        "scale": scale,
        "renderer": chart_render.RENDERER_VERSION,
        "attribution": "FAA aeronautical charts",
    }


def pack_pyramid(kind: ChartKind, cycle: str, scale: int = 1) -> int:
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
    count = tile_archive.write(archive_path(kind.key, cycle, scale), [*tiles, *kept], archive_metadata(kind, cycle, scale))
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


def pack_complete(cycle: str, kinds: tuple = tuple(KINDS)) -> dict:
    """Every finished kind of `cycle` packed, at each density its passes
    drew (its record's scales): {kind key: tiles packed}. What a refresh
    does once its passes end, and the one-off conversion of a cycle
    rendered before there were archives (the charts job's `pack`)."""
    packed = {}
    for key in kinds:
        record = chart_serving.pyramid_status(cycle).get(key, {})
        # A pass under way, or cut short, keeps the last finished pass's
        # record -- complete -- beside half a pyramid of loose tiles,
        # which would replace the whole archive.
        if not chart_serving.pyramid_complete(cycle, (key,)) or record.get("current_pass"):
            continue
        count = sum(pack_pyramid(KINDS[key], cycle, scale) for scale in record.get("scales", [1]) if scale in chart_grid.TILE_SCALES)
        if count:
            packed[key] = count
    return packed
