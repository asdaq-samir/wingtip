"""Finding a chart face's edges on its raster: the raster's palette reduced
to ink, paper and tint in pooled blocks (ink_maps), and the search from the
sheet's edge inward for the neatline, or for where the chart's tint begins
(find_edge), with a sectional's edge snapped to its whole or quarter degree
(snap).

Split out of wingtip.chart_faces (2026-11-21), which was at 395 lines: this
is the run-start and edge search, chart_faces assembles the face from it
(detect_face) and from the sheets whose border is straight.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .chart_kinds import Box
from .chart_raster import WHITE_MIN_CHANNEL, read_rgb

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
POOL_PX = 4
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
# A sheet can also carry its sea's tint on past the neatline, as bleed,
# with its legend panels printed over that: Los Angeles's west neatline
# (121 30W) has its title panel and then bare ocean blue outside it, 0.38
# paper over the strip (0.03 inside), so the search went on to where the
# tint starts and drew the panel and a strip of bleed over the Pacific
# (the owner's phone, 2026-11-21). On a sectional, whose sheets end on
# whole and quarter degrees (on_grid), a line there with this much paper
# outside it and this much more than inside it is the neatline too: the
# chart's own graticule has chart either side, the same paper both ways.
# A TAC's edges are not on the grid, and the frame of an inset in its
# collar has paper and tint outside it as well.
_BLEED_MIN_OUTSIDE_WHITE = 0.3
_BLEED_MIN_WHITE_STEP = 0.25
# Where there is no neatline (the chart runs on past its nominal edge
# and is cut by the sheet's edge, or by the boxes printed above it), the
# face ends where the tint does: sampled this often, and pulled this
# far inside the first tinted line, because a row of boxes ends on a
# straight raster row that a curved parallel crosses gradually.
_CONTENT_STEP_PX = 20
_CONTENT_MIN_TINT = 0.5
_CONTENT_MARGIN_PX = 100
# The tint the face starts with is the run of it the search ends in, not
# the first tint met: Los Angeles prints its VFR route insets (Coliseum,
# Mini, Coastal, the Special Flight Rules Area), tinted maps of their
# own, in two framed columns down its west collar, and the first tint
# was theirs; the face took them in and the map drew them over the
# Pacific south of Santa Barbara (the owner's phone, 2026-11-20). The
# paper between the inset columns and between them and the chart is 6
# and 10 steps wide (130 and 200 px). A gap this short is bridged
# rather than taken for the collar, against a line of chart that dips
# under half tint; on the 32 TAC rasters of the 10-29-2026 cycle only
# Los Angeles's west edge moves (0.70 degrees in, to the chart).
_CONTENT_BRIDGE_STEPS = 2
# Sectional sheets end on whole and quarter degrees; a measured edge
# that close to one is that one.
_SNAP_GRID_DEG = 0.25
_SNAP_TOLERANCE_DEG = 0.012


@dataclass
class Ink:
    crs: object
    transform: object
    dark: np.ndarray  # pooled: any ink in the block
    white: np.ndarray  # pooled: fraction of paper in the block
    tint: np.ndarray  # pooled: fraction of neither
    # A sheet across the antimeridian is worked in unwrapped longitudes
    # (east of 180 counted on past it) and samples are wrapped back
    # before they are projected.
    wrap: bool = False


def ink_maps(src) -> Ink:
    pool = POOL_PX
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
    return Ink(crs=src.crs, transform=src.transform, dark=dark, white=white, tint=tint)


def _sample(ink: Ink, lats: np.ndarray, lons: np.ndarray) -> tuple:
    """(dark, white, tint, inside) at each (lat, lon): outside the
    raster counts as paper."""
    import rasterio.transform
    import rasterio.warp

    if ink.wrap:
        lons = ((lons + 180.0) % 360.0) - 180.0
    xs, ys = rasterio.warp.transform("EPSG:4326", ink.crs, lons.tolist(), lats.tolist())
    rows, cols = rasterio.transform.rowcol(ink.transform, xs, ys)
    rows, cols = np.asarray(rows) // POOL_PX, np.asarray(cols) // POOL_PX
    inside = (rows >= 0) & (rows < ink.dark.shape[0]) & (cols >= 0) & (cols < ink.dark.shape[1])
    dark = np.zeros(len(lats), dtype=bool)
    white = np.ones(len(lats), dtype=np.float32)
    tint = np.zeros(len(lats), dtype=np.float32)
    dark[inside] = ink.dark[rows[inside], cols[inside]]
    white[inside] = ink.white[rows[inside], cols[inside]]
    tint[inside] = ink.tint[rows[inside], cols[inside]]
    return dark, white, tint, inside


def find_edge(ink: Ink, envelope: Box, res_m: float, edge: str, search: float = 0.25, on_grid: bool = False) -> tuple:
    """Where the chart face ends along one edge: (position in degrees,
    how it was found), the position None when nothing chart-like lies
    within `search` of the raster (a share of its width or height) of
    that edge (the kind's edge_search). `on_grid` for a kind whose sheets
    end on the quarter degree (the sectional), whose neatline may have
    bleed past it.

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
        start, inward, depth = (south, 1.0, search * (north - south)) if edge == "s" else (north, -1.0, search * (north - south))
    else:
        along = np.linspace(south + 0.2 * (north - south), north - 0.2 * (north - south), _SAMPLES_ALONG)
        deg_per_px = res_m / (_METRES_PER_DEGREE * math.cos(math.radians((south + north) / 2)))
        start, inward, depth = (west, 1.0, search * (east - west)) if edge == "w" else (east, -1.0, search * (east - west))

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
            offsets = np.linspace(_OUTSIDE_STRIP_PX[0], _OUTSIDE_STRIP_PX[1], 6) * deg_per_px
            _, white, tint, _ = sample_lines(line - inward * offsets)
            if white.mean() >= _MIN_OUTSIDE_WHITE or tint.mean() <= _MAX_OUTSIDE_TINT:
                return float(line), "neatline"
            if on_grid and _on_grid(float(line)) and white.mean() >= _BLEED_MIN_OUTSIDE_WHITE:
                _, white_in, _, _ = sample_lines(line + inward * offsets)
                if white.mean() - white_in.mean() >= _BLEED_MIN_WHITE_STEP:
                    return float(line), "neatline"

    # From just inside the sheet's edge (the edge itself samples as
    # outside the raster) inward.
    coarse = start + inward * (POOL_PX * deg_per_px + np.arange(0.0, depth, _CONTENT_STEP_PX * deg_per_px))
    _, _, tint, _ = sample_lines(coarse)
    first = _chart_run_start(tint >= _CONTENT_MIN_TINT)
    if first is None:
        return None, "none"
    if first == 0:
        return float(start), "sheet edge"
    return float(coarse[first] + inward * _CONTENT_MARGIN_PX * deg_per_px), "content"


def _chart_run_start(tinted: np.ndarray) -> int | None:
    """The first line of the chart among lines sampled inward from a
    sheet's edge: where the tinted run the search ends in begins, gaps
    of up to _CONTENT_BRIDGE_STEPS untinted lines bridged. When the
    search ends off the tint, the first tinted line, as it always was."""
    hits = np.flatnonzero(tinted)
    if hits.size == 0:
        return None
    if not tinted[-1]:
        return int(hits[0])
    first = len(tinted) - 1
    for i in hits[::-1]:
        if first - i - 1 > _CONTENT_BRIDGE_STEPS:
            break
        first = int(i)
    return first


def _on_grid(value: float) -> bool:
    return abs(value - round(value / _SNAP_GRID_DEG) * _SNAP_GRID_DEG) <= _SNAP_TOLERANCE_DEG


def snap(value: float) -> float:
    nearest = round(value / _SNAP_GRID_DEG) * _SNAP_GRID_DEG
    return nearest if abs(nearest - value) <= _SNAP_TOLERANCE_DEG else value
