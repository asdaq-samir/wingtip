"""Finding a chart's face on its raster, and cleaning the raster up:
where the printed sheet's collar ends and the chart begins (detect_face,
and split_antimeridian for a sheet that crosses 180), and the lines the
FAA's own masking left across the chart (find_masked_lines,
remove_masked_lines).

Split out of wingtip.charts, which keeps the catalogue, the chart cycles,
rendering, publishing and serving. This is the part that changes on its
own: every chart commit between 2026-09-23's two simplicity assessments
was raster cleaning or edge detection, and none touched anything else
in the module. wingtip.charts calls in here while preparing a sheet, and
while warping a tile (read_rgb, without_raster_rim); this calls back into wingtip.charts for the chart
kinds and sheets, through the module rather than its names, so either
can be imported first.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from . import charts
from .chart_masked_lines import find_masked_lines, remove_masked_lines
from .chart_raster import WHITE_MIN_CHANNEL, read_rgb, without_raster_rim

if TYPE_CHECKING:
    from .charts import Box, ChartKind

# wingtip.charts reaches the face, the masked-line cleaning and the raster's
# colours through this module; they live in chart_masked_lines and chart_raster.
__all__ = ["detect_face", "find_masked_lines", "read_rgb", "remove_masked_lines", "split_antimeridian", "without_raster_rim"]

log = logging.getLogger(__name__)

# One degree of latitude, in metres, on the sphere web mercator uses.
_METRES_PER_DEGREE = 111_320.0

# ---------------------------------------------------------------------------
# Finding the chart face
# ---------------------------------------------------------------------------

# The raster's palette, reduced to the three things the search needs to
# know about a pixel: is it ink, is it paper, or is it neither -- the
# tints the chart face is coloured with (terrain, water, towns,
# airspace) and the collar, being paper and print, mostly is not.
_DARK_MAX_RGB_SUM = 160
# Darkness is pooled over blocks this size (any dark pixel makes the
# block dark) so that a two-pixel line is hit by a sample that lands
# within the block, and the search can step at a fraction of it.
_POOL_PX = 4
_SAMPLES_ALONG = 600
# A line is the neatline when this much of it is ink along the middle
# three-fifths of the chart (labels, airways and the scale bars crossing
# it break the rest) ...
_MIN_CONTINUITY = 0.55
# ... and the strip this far outside it is the collar rather than more
# chart: mostly paper, or paper with print on it. The band just outside
# the neatline carries the minute ticks and their labels, so the strip
# starts beyond them.
_OUTSIDE_STRIP_PX = (140, 350)
_MIN_OUTSIDE_WHITE = 0.6
_MAX_OUTSIDE_TINT = 0.15
# Where there is no neatline (the chart runs on past its nominal edge
# and is cut by the sheet's edge, or by the boxes printed above it), the
# face ends where the tint does: sampled this often, and pulled this
# far inside the first tinted line, because a row of boxes ends on a
# straight raster row that a curved parallel crosses gradually.
_CONTENT_STEP_PX = 20
_CONTENT_MIN_TINT = 0.5
_CONTENT_MARGIN_PX = 100
# Sectional sheets end on whole and quarter degrees; a measured edge
# that close to one is that one.
_SNAP_GRID_DEG = 0.25
_SNAP_TOLERANCE_DEG = 0.012


@dataclass
class _Ink:
    crs: object
    transform: object
    dark: np.ndarray  # pooled: any ink in the block
    white: np.ndarray  # pooled: fraction of paper in the block
    tint: np.ndarray  # pooled: fraction of neither
    # A sheet across the antimeridian is worked in unwrapped longitudes
    # (east of 180 counted on past it) and samples are wrapped back
    # before they are projected.
    wrap: bool = False


def _ink_maps(src) -> _Ink:
    pool = _POOL_PX
    rows, cols = src.height // pool, src.width // pool
    dark = np.zeros((rows, cols), dtype=bool)
    white = np.zeros((rows, cols), dtype=np.float32)
    tint = np.zeros((rows, cols), dtype=np.float32)
    step = 1024
    for r0 in range(0, rows * pool, step):
        r1 = min(r0 + step, rows * pool)
        rgb = read_rgb(src, window=((r0, r1), (0, cols * pool))).astype(np.int16)
        is_dark = rgb.sum(axis=2) < _DARK_MAX_RGB_SUM
        is_white = rgb.min(axis=2) >= WHITE_MIN_CHANNEL
        shape = ((r1 - r0) // pool, pool, cols, pool)
        dark[r0 // pool : r1 // pool] = is_dark.reshape(shape).any(axis=(1, 3))
        white[r0 // pool : r1 // pool] = is_white.reshape(shape).mean(axis=(1, 3))
        tint[r0 // pool : r1 // pool] = (~is_dark & ~is_white).reshape(shape).mean(axis=(1, 3))
    return _Ink(crs=src.crs, transform=src.transform, dark=dark, white=white, tint=tint)


def _sample(ink: _Ink, lats: np.ndarray, lons: np.ndarray) -> tuple:
    """(dark, white, tint, inside) at each (lat, lon): outside the
    raster counts as paper."""
    import rasterio.transform
    import rasterio.warp

    if ink.wrap:
        lons = ((lons + 180.0) % 360.0) - 180.0
    xs, ys = rasterio.warp.transform("EPSG:4326", ink.crs, lons.tolist(), lats.tolist())
    rows, cols = rasterio.transform.rowcol(ink.transform, xs, ys)
    rows, cols = np.asarray(rows) // _POOL_PX, np.asarray(cols) // _POOL_PX
    inside = (rows >= 0) & (rows < ink.dark.shape[0]) & (cols >= 0) & (cols < ink.dark.shape[1])
    dark = np.zeros(len(lats), dtype=bool)
    white = np.ones(len(lats), dtype=np.float32)
    tint = np.zeros(len(lats), dtype=np.float32)
    dark[inside] = ink.dark[rows[inside], cols[inside]]
    white[inside] = ink.white[rows[inside], cols[inside]]
    tint[inside] = ink.tint[rows[inside], cols[inside]]
    return dark, white, tint, inside


def _find_edge(ink: _Ink, envelope: Box, res_m: float, edge: str) -> tuple:
    """Where the chart face ends along one edge: (position in degrees,
    how it was found), the position None when nothing chart-like lies
    within a quarter of the raster of that edge.

    Walks inward from the raster's edge, sampling each candidate line
    along the chart's middle three-fifths -- along the geographic
    parallel or meridian, not the raster row or column. That is what
    tells the neatline from the collar's own ruling: the chart is a
    conic projection, so its parallels curve across the sheet and its
    meridians lean, and a communication box's straight edge parts
    company with the parallel through it within a few kilometres.
    Interior graticule lines are just as continuous as the neatline and
    are told apart by what lies outside them: more chart, not paper.

    Not every edge has a neatline. A sheet overlaps its neighbour on two
    sides, and there the chart runs on past its nominal edge until the
    sheet's own edge, or the row of boxes printed above it, cuts it
    off; on those edges the face ends where the tint does.
    """
    west, south, east, north = envelope
    horizontal = edge in ("s", "n")
    if horizontal:
        along = np.linspace(west + 0.2 * (east - west), east - 0.2 * (east - west), _SAMPLES_ALONG)
        deg_per_px = res_m / _METRES_PER_DEGREE
        start, inward, depth = (south, 1.0, 0.25 * (north - south)) if edge == "s" else (north, -1.0, 0.25 * (north - south))
    else:
        along = np.linspace(south + 0.2 * (north - south), north - 0.2 * (north - south), _SAMPLES_ALONG)
        deg_per_px = res_m / (_METRES_PER_DEGREE * math.cos(math.radians((south + north) / 2)))
        start, inward, depth = (west, 1.0, 0.25 * (east - west)) if edge == "w" else (east, -1.0, 0.25 * (east - west))

    def sample_lines(at: np.ndarray) -> tuple:
        across = np.repeat(at, len(along))
        with_along = np.tile(along, len(at))
        lats, lons = (across, with_along) if horizontal else (with_along, across)
        dark, white, tint, inside = _sample(ink, lats, lons)
        shape = (len(at), len(along))
        return tuple(v.reshape(shape).mean(axis=1) for v in (dark, white, tint, inside))

    positions = start + inward * np.arange(0.0, depth, 1.5 * deg_per_px)
    continuity, _, _, covered = sample_lines(positions)
    candidates = np.flatnonzero((continuity >= _MIN_CONTINUITY) & (covered > 0.9))
    if candidates.size:
        # A two-pixel line answers at two or three consecutive steps:
        # one cluster, its best step.
        clusters, current = [], [candidates[0]]
        for i in candidates[1:]:
            if i - current[-1] <= 2:
                current.append(i)
            else:
                clusters.append(current)
                current = [i]
        clusters.append(current)
        for cluster in clusters:
            best = max(cluster, key=lambda i: continuity[i])
            line = positions[best]
            strip = line - inward * np.linspace(_OUTSIDE_STRIP_PX[0], _OUTSIDE_STRIP_PX[1], 6) * deg_per_px
            _, white, tint, _ = sample_lines(strip)
            if white.mean() >= _MIN_OUTSIDE_WHITE or tint.mean() <= _MAX_OUTSIDE_TINT:
                return float(line), "neatline"

    # From just inside the sheet's edge (the edge itself samples as
    # outside the raster) inward.
    coarse = start + inward * (_POOL_PX * deg_per_px + np.arange(0.0, depth, _CONTENT_STEP_PX * deg_per_px))
    _, _, tint, _ = sample_lines(coarse)
    tinted = np.flatnonzero(tint >= _CONTENT_MIN_TINT)
    if tinted.size == 0:
        return None, "none"
    first = int(tinted[0])
    if first == 0:
        return float(start), "sheet edge"
    return float(coarse[first] + inward * _CONTENT_MARGIN_PX * deg_per_px), "content"


def _snap(value: float) -> float:
    nearest = round(value / _SNAP_GRID_DEG) * _SNAP_GRID_DEG
    return nearest if abs(nearest - value) <= _SNAP_TOLERANCE_DEG else value


def split_antimeridian(face: Box, envelope: Box) -> list:
    """A face measured in unwrapped longitudes (east past 180, see
    detect_face) as the one or two (face, envelope) pairs the tile
    arithmetic can draw: the part up to 180, and the part from -180 on."""
    if face[2] <= 180.0:
        return [(face, envelope)]
    west, south, east, north = face
    e_west, e_south, e_east, e_north = envelope
    return [
        ((west, south, 180.0, north), (e_west, e_south, 180.0, e_north)),
        ((-180.0, south, east - 360.0, north), (-180.0, e_south, e_east - 360.0, e_north)),
    ]


# A straight raster line counts as ruling when this much of it is ink
# over the middle three-fifths of the sheet; the chart area is the
# widest stretch of the sheet between two such lines (or the sheet's
# edge), since the legend panels are ruled tables and the chart is not.
_STRAIGHT_CONTINUITY = 0.9


def _widest_gap(continuity: np.ndarray) -> tuple:
    """(start, end) in pooled units of the widest interval between
    consecutive ruling lines, the raster's edges counting as lines,
    with each line taken whole: a line thicker than a pooled block, or
    astride two, is ruled in every block it touches, and the interval
    runs to the far side of both."""
    ruled = continuity >= _STRAIGHT_CONTINUITY
    edges = [0, *np.flatnonzero(ruled).tolist(), len(continuity)]
    best = (edges[0], edges[1])
    for a, b in zip(edges, edges[1:]):
        if b - a > best[1] - best[0]:
            best = (a, b)
    start, end = best
    while start > 0 and ruled[start - 1]:
        start -= 1
    while end + 1 < len(continuity) and ruled[end + 1]:
        end += 1
    return start, end


def _straight_face(ink: _Ink, crs, transform, mask_path: Path) -> Box:
    """The chart area of a sheet whose border is the sheet's own
    rectangle: written to `mask_path` as a small raster (255 inside
    the rectangle, 0 outside, one pixel per pooled block) that the
    renderer warps alongside the sheet, and returned as the lat/lon box
    around the rectangle's whole outline. A conic sheet leans and bows
    in lat/lon, so the box takes in collar at the corners; the mask is
    what keeps that from being drawn.

    The ruling lines themselves are inside the mask, whole. Two
    adjacent sheets are cut on the same line (to within a pixel or
    two), so with the lines left out their masks stood a line's width
    apart and every seam was a hairline of map background; with them
    in, the masks overlap by that width."""
    import rasterio
    import rasterio.warp
    from rasterio.transform import Affine

    rows, cols = ink.dark.shape
    col_continuity = ink.dark[int(rows * 0.2) : int(rows * 0.8), :].mean(axis=0)
    row_continuity = ink.dark[:, int(cols * 0.2) : int(cols * 0.8)].mean(axis=1)
    c0, c1 = _widest_gap(col_continuity)
    r0, r1 = _widest_gap(row_continuity)

    r_lo, r_hi = r0, min(r1 + 1, rows)  # pooled rows [r_lo, r_hi): the chart and its ruling lines
    c_lo, c_hi = c0, min(c1 + 1, cols)
    inside = np.zeros((rows, cols), dtype=np.uint8)
    inside[r_lo:r_hi, c_lo:c_hi] = 255
    with rasterio.open(
        mask_path,
        "w",
        driver="GTiff",
        width=cols,
        height=rows,
        count=1,
        dtype="uint8",
        crs=crs,
        transform=transform @ Affine.scale(_POOL_PX),
        compress="deflate",
    ) as out:
        out.write(inside, 1)

    x0, x1 = c_lo * _POOL_PX, c_hi * _POOL_PX
    y0, y1 = r_lo * _POOL_PX, r_hi * _POOL_PX
    # The rectangle's sides are straight on the sheet and arcs in
    # latitude and longitude: a parallel bows toward the pole between
    # two points on it, so the top side is furthest north in its
    # middle, not at either corner (on a sheet twenty degrees wide, by
    # a third of a degree). A box around the corners alone left that
    # bow to nobody: a strip of map background under the neighbour's
    # neatline. So the box is around the whole outline.
    along = np.linspace(0.0, 1.0, 256)
    xs = np.concatenate([x0 + along * (x1 - x0), x0 + along * (x1 - x0), np.full_like(along, x0), np.full_like(along, x1)])
    ys = np.concatenate([np.full_like(along, y0), np.full_like(along, y1), y0 + along * (y1 - y0), y0 + along * (y1 - y0)])
    px, py = transform @ (xs, ys)
    lons, lats = rasterio.warp.transform(crs, "EPSG:4326", list(px), list(py))
    return (min(lons), min(lats), max(lons), max(lats))


def detect_face(path: Path, kind: ChartKind) -> tuple[Box, Box, Path | None]:
    """(envelope, face, mask) of a chart raster: the raster's own
    bounds and the chart within them with the collar cut away, both
    (west, south, east, north) degrees, and for a sheet with a straight
    border the mask raster that cuts the collar out of the face's
    corners (None otherwise). An edge that yields nothing falls back to
    the kind's typical collar width, and says so in the log."""
    import rasterio
    import rasterio.warp

    with rasterio.open(path) as src:
        ink = _ink_maps(src)
        envelope = tuple(float(v) for v in rasterio.warp.transform_bounds(src.crs, "EPSG:4326", *src.bounds))
        if envelope[0] > envelope[2]:
            # Across the antimeridian (the western Aleutians): carry on
            # past 180 so that west is west of east, and wrap samples
            # back on their way to the raster. The face comes back the
            # same way; split_antimeridian cuts it in two for drawing.
            envelope = (envelope[0], envelope[1], envelope[2] + 360.0, envelope[3])
            ink.wrap = True
        res_m = float(src.res[0])
        if kind.straight_border:
            mask_path = path.with_name(f"{path.stem}.mask.tif")
            face = _straight_face(ink, src.crs, src.transform, mask_path)
            log.info("%s: face %s (straight border)", path.name, tuple(round(v, 4) for v in face))
            return envelope, face, mask_path

    west, south, east, north = envelope
    collar = kind.fallback_collar
    fallback = {"w": west + collar[0], "s": south + collar[1], "e": east - collar[2], "n": north - collar[3]}
    face = []
    for i, edge in enumerate("wsen"):
        position, how = _find_edge(ink, envelope, res_m, edge)
        if position is None:
            log.warning("%s: nothing chart-like near the %s edge; assuming a %.2f-degree collar", path.name, edge, collar[i])
            face.append(fallback[edge])
            continue
        # By key, not identity: a ChartKind that crossed into a render
        # process, or a module run as __main__, is a copy, not this
        # module's own SECTIONAL.
        if how == "neatline" and kind.key == charts.SECTIONAL.key:
            position = _snap(position)
        log.info("%s: %s edge at %.4f (%s)", path.name, edge, position, how)
        face.append(position)
    return envelope, tuple(face), None
