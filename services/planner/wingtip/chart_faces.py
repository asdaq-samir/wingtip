"""Finding a chart's face on its raster, and cleaning the raster up:
where the printed sheet's collar ends and the chart begins (detect_face,
and split_antimeridian for a sheet that crosses 180), and the lines the
FAA's own masking left across the chart (find_masked_lines,
remove_masked_lines). The search for each edge is wingtip.chart_edges.

Split out of wingtip.charts before the rest of it was (2026-09-23): every
chart commit between that day's two simplicity assessments was raster
cleaning or edge detection. wingtip.chart_prepare calls in here while
preparing a sheet, and wingtip.chart_rerender to clean one already on
disk; this reads the chart kinds from wingtip.chart_kinds.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from . import chart_panels
from .chart_bands import faces_in_blocks
from .chart_edges import POOL_PX, Ink, find_edge, ink_maps, snap
from .chart_masked_lines import find_masked_lines, remove_masked_lines
from .chart_kinds import SECTIONAL, Box, ChartKind

# The chart pipeline reaches the face and the masked-line cleaning through
# this module; the cleaning lives in chart_masked_lines.
__all__ = ["detect_face", "find_masked_lines", "remove_masked_lines", "split_antimeridian"]

log = logging.getLogger(__name__)


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


def _straight_face(ink: Ink, crs, transform, mask_path: Path) -> Box:
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
    import rasterio.warp

    rows, cols = ink.dark.shape
    col_continuity = ink.dark[int(rows * 0.2) : int(rows * 0.8), :].mean(axis=0)
    row_continuity = ink.dark[:, int(cols * 0.2) : int(cols * 0.8)].mean(axis=1)
    c0, c1 = _widest_gap(col_continuity)
    r0, r1 = _widest_gap(row_continuity)

    r_lo, r_hi = r0, min(r1 + 1, rows)  # pooled rows [r_lo, r_hi): the chart and its ruling lines
    c_lo, c_hi = c0, min(c1 + 1, cols)
    inside = np.zeros((rows, cols), dtype=bool)
    inside[r_lo:r_hi, c_lo:c_hi] = True
    chart_panels.write_mask(mask_path, inside, crs, transform, POOL_PX)

    x0, x1 = c_lo * POOL_PX, c_hi * POOL_PX
    y0, y1 = r_lo * POOL_PX, r_hi * POOL_PX
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
        ink = ink_maps(src)
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
        position, how = find_edge(ink, envelope, res_m, edge, kind.edge_search, kind.key == SECTIONAL.key)
        if position is None:
            log.warning("%s: nothing chart-like near the %s edge; assuming a %.2f-degree collar", path.name, edge, collar[i])
            face.append(fallback[edge])
            continue
        # By key, not identity: a ChartKind that crossed into a render
        # process, or a module run as __main__, is a copy, not this
        # module's own SECTIONAL.
        if how == "neatline" and kind.key == SECTIONAL.key:
            position = snap(position)
        log.info("%s: %s edge at %.4f (%s)", path.name, edge, position, how)
        face.append(position)
    face = tuple(face)
    # The band search's blocks are the face search's pooled ones, 4 px.
    inside = faces_in_blocks(ink.crs, ink.transform, [face], ink.white.shape)
    return envelope, face, chart_panels.cut_mask(path, kind, ink, inside, POOL_PX)
