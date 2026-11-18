"""A chart tile drawn from the sheets that cover it, and the helpers every
way of drawing one shares: the composite of one sheet over another, the
PNG it is kept as, where it lives in the tile cache and the order sheets
are drawn in.

These are the renderer's own work, shared by the tile drawn on request
(wingtip.chart_tiles), the whole pyramid (wingtip.chart_pyramid) and a
tile drawn again (wingtip.chart_rerender), so each draws a tile the same
way. RENDERER_VERSION is raised with any change to what a drawn tile
looks like.
"""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image

from .atomic import atomic_path
from . import chart_grid, chart_warp, config
from .chart_grid import TILE_PX
from .chart_kinds import ChartKind


def composite(rgba: np.ndarray, rgb: np.ndarray, coverage: np.ndarray) -> np.ndarray:
    """`rgba` with a sheet's `rgb` drawn into whatever part of each
    pixel is still uncovered, by the sheet's own `coverage` of it: a
    pixel a sheet covers wholly is drawn once and left alone after
    (the first sheet wins where two overlap); a pixel two sheets meet
    inside is the two averaged by their shares. The alpha kept is that
    total: opaque from half a pixel's worth up, so a seam inside a
    pixel is a seam and not a hairline of daylight, and the fraction
    itself below that, so the next sheet knows what is left."""
    old = rgba[:, :, 3].astype(np.float32) / 255.0
    weight = coverage * (1.0 - old)
    touched = weight > 0
    if not touched.any():
        return rgba
    total = old + weight
    colour = rgba[:, :, :3].astype(np.float32) * old[:, :, None] + rgb.astype(np.float32) * weight[:, :, None]
    colour = colour / np.maximum(total, 1e-6)[:, :, None]
    rgba[touched, :3] = np.clip(colour[touched] + 0.5, 0, 255).astype(np.uint8)
    rgba[touched, 3] = np.where(total[touched] >= 0.5, 255, total[touched] * 255.0).astype(np.uint8)
    return rgba


def render_tile(rasters: list, x: int, y: int, zoom: int, scale: int = 1) -> np.ndarray | None:
    """The tile as (TILE_PX, TILE_PX, 4) RGBA -- `scale` times that on a
    side for a high-density screen's (chart_grid.TILE_SCALES) -- composited from
    every raster whose face covers part of it -- first raster wins where
    faces overlap -- and transparent where none does. None when the
    whole tile is uncovered."""
    px = TILE_PX * scale
    bbox = chart_grid.tile_bbox_3857(x, y, zoom)
    lats, lons = chart_grid.tile_lats(y, zoom, px), chart_grid.tile_lons(x, zoom, px)
    out = np.zeros((px, px, 4), dtype=np.uint8)
    for raster in rasters:
        covered = chart_grid.face_mask(raster.face, lats, lons) & (out[:, :, 3] < 255)
        if not covered.any():
            continue
        rgb, coverage = chart_warp.warp_rgb(raster.path, bbox, px, px, float(lats[px // 2]), raster.mask, raster.face)
        out = composite(out, rgb, coverage * covered)
    return out if out[:, :, 3].any() else None


def encode_png(rgba: np.ndarray) -> bytes:
    """The tile as an 8-bit palette PNG: a third the bytes of the RGBA
    encoding (15 KB against 43 for a busy urban tile) at a third the
    time, and exact -- at the chart's own zoom the pixels are the
    sheet's palette to begin with, so the quantiser has nothing to
    approximate. The octree quantiser is the one that keeps alpha.

    A 512-pixel "@2x" tile is the sheet resampled (Lanczos) to twice its
    pixels, so its edges are colours the sheet never had; 256 of them
    still hold those edges: on 150 sampled @2x tiles the palette came
    to 40.9 dB PSNR against the full-colour original, with no
    difference to see side by side at twice the size, at a quarter of
    the bytes -- 29 GB for a cycle's @2x tiles where full colour (kept
    from 2026-11-07 to 11-08) took 115 (the owner, 2026-11-08)."""
    image = Image.fromarray(rgba, "RGBA").quantize(256, method=Image.Quantize.FASTOCTREE)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def decode_rgba(png: bytes) -> np.ndarray:
    return np.array(Image.open(io.BytesIO(png)).convert("RGBA"))  # a copy: the caller writes into it


def encode_lossless(rgba: np.ndarray) -> bytes:
    """A tile still being drawn, kept exactly: encode_png's palette is
    for the finished tile, and quantising at every sheet drew the seams
    a little further off each pass."""
    buffer = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buffer, format="PNG")
    return buffer.getvalue()


# The pyramid render's own version. A pass records it when it finishes,
# and a later pass under a different one draws every tile again rather
# than keeping the ones on disk -- a change to how a tile is drawn (the
# sheet rims of 9ace720, say) used to reach only tiles not yet rendered.
# Records from before it was kept count as version 1. Raise it with
# any change to what a rendered tile looks like. 2: a palette sheet's
# pale rim, not only its paper, gives way to the neighbour.
RENDERER_VERSION = 3


def tile_path(kind: ChartKind, cycle: str, x: int, y: int, zoom: int, scale: int = 1, root: Path | None = None) -> Path:
    """Where a tile lives under the cache (`root`, the cache itself by
    default): {y}.png, or {y}@2x.png for a high-density one."""
    name = f"{y}.png" if scale == 1 else f"{y}@{scale}x.png"
    return (root or config.CHART_TILE_CACHE_DIR) / cycle / kind.key / str(zoom) / str(x) / name


def draw_order(names) -> list:
    """The order sheets are drawn into a tile -- the first wins where two
    faces overlap -- which is reverse name order. Nothing makes one sheet
    better than another inside an overlap; what matters is that the
    pyramid and a tile rendered on demand agree. They did not: the
    pyramid drew sheets in `chart_sheets.prepared_charts`' order (newest cycle first,
    and so names last first) and a tile rendered on demand in
    `COVERAGE`'s (names first first), so a tile rendered on demand drew
    the other sheet from its pyramid neighbours across the whole
    overlap, and showed it as a seam along its edge. Reverse name order
    is the one the pyramid on disk was rendered in, so it stays valid."""
    return sorted(names, reverse=True)


def write_atomically(path: Path, data: bytes) -> None:
    # A name of its own for each writer: two of the planner's request
    # threads rendering one tile shared a temp file once, and the second's
    # rename moved the first's half-written bytes. Not flushed: a pyramid
    # pass writes millions of tiles, and what a power cut loses is drawn again.
    with atomic_path(path, durable=False) as tmp:
        tmp.write_bytes(data)
