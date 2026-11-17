"""Taking the masked line back out of a sectional: a band found by
wingtip.chart_bands is carried on along its line, given the tint of the
chart around it, and the sheet is written back (find_masked_lines,
remove_masked_lines). The reasons a band is told from a label are in
wingtip.chart_bands.

Split out of wingtip.chart_faces. wingtip.charts reaches these through
wingtip.chart_faces; this calls back into wingtip.charts for the
overviews, through the module rather than its names, so either can be
imported first.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from . import charts
from .atomic import atomic_path
from .chart_bands import (
    BAND_BLOCK,
    band_candidates,
    BAND_MIN_BLOCKS_NEAR,
    BAND_NEIGHBOUR_BLOCKS,
    BAND_PAPER_IN_NEAR,
    BAND_STEP_PX,
    faces_in_blocks,
    measure_band,
)
from .chart_raster import WHITE_MIN_CHANNEL, palette

log = logging.getLogger(__name__)

# A measured band is carried on along its line while the strip between
# its edges stays this much its background, across this many cuts that
# are not.
_BAND_EXTEND_PAPER = 0.3
_BAND_EXTEND_MISSES = 2
# The tint a band pixel takes is one of the colours the chart around it
# is mostly painted in, not whatever halo or hairline is nearest; the
# fill is worked in chunks so a band around a whole Caribbean inset is
# not one distance transform the size of the sheet.
_BAND_FILL_MIN_SHARE = 0.003
# Where something translucent is printed across a band -- a Class B
# ring's magenta -- the band's paper under it is a pale pink the chart
# has nowhere else, not paper: the magenta over the tint either side is
# a darker mauve. So a band's background is its paper and any light
# colour the chart around it hardly has. And a band's fill comes from
# colours the chart around it has even a little of: the ring's mauve is
# under one percent of it, and without it the fill broke the ring.
_BAND_LIGHT_MIN_SUM = 450
_BAND_UNSEEN_SHARE = 0.001
_BAND_FILL_CHUNK_PX = 1024
_BAND_FILL_MARGIN_PX = 64
# ... and from inside a flat patch of one of them, where one is this
# near. The pixels right along a band's edge are as often a letter's
# halo, a road's anti-aliasing or the scan's soft rim as the tint, and
# the nearest of those, copied across, drew each column of the band a
# different colour: a strip of streaks where the band had been.
_BAND_FILL_FLAT_PX = 5
_BAND_FILL_FLAT_REACH_PX = 96


def _light(lut: np.ndarray, paper_lut: np.ndarray) -> np.ndarray:
    """Per palette entry: is it a light colour that is not paper -- a
    tint, or paper under a translucent overprint -- rather than ink."""
    return ~paper_lut & (lut.astype(int).sum(axis=1) >= _BAND_LIGHT_MIN_SUM)


def _background(window: np.ndarray, band: np.ndarray, around: np.ndarray, paper_lut: np.ndarray, light_lut: np.ndarray) -> np.ndarray:
    """Which pixels of `band` are the band's own background: paper, or a
    light colour the chart `around` it hardly has (see _BAND_UNSEEN_SHARE)."""
    values, counts = np.unique(window[around], return_counts=True)
    seen = np.zeros(256, bool)
    if len(values):
        seen[values[counts >= _BAND_UNSEEN_SHARE * counts.sum()]] = True
    return band & (paper_lut[window] | (light_lut[window] & ~seen[window]))


def _paper_and_tint(lut: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per palette entry: is it paper, and is it one of the light area
    tints a chart is painted in (terrain, water, towns) rather than
    linework."""
    paper = lut.min(axis=1) >= WHITE_MIN_CHANNEL
    tint = ~paper & (lut.astype(int).sum(axis=1) >= 500) & (lut.min(axis=1) >= 60)
    return paper, tint


def _extend_band(data: np.ndarray, paper_lut: np.ndarray, light_lut: np.ndarray, band: tuple) -> tuple:
    """A measured band carried on along its own line past where its
    measurement stopped, for as long as the strip between its edges is
    still mostly the band's background: through the name lettered across
    it and under the Class B ring printed over it in the last kilometres
    before a sheet's edge, up to the edge itself."""
    axis, first, last, left_fit, right_fit = band
    grid = data if axis == 0 else data.T

    def edges(pos: int) -> tuple | None:
        lo = int(np.floor(np.polyval(left_fit, pos)))
        hi = int(np.ceil(np.polyval(right_fit, pos))) + 1
        if not 0 <= pos < grid.shape[0] or lo < 0 or hi > grid.shape[1] or hi - lo < 3:
            return None
        return lo, hi

    # What the chart either side of the measured band looks like, to
    # tell the band's own background from it further on.
    beside = []
    for pos in range(first, last + 1, BAND_STEP_PX):
        found = edges(pos)
        if found:
            lo, hi = found
            beside += [grid[pos, max(lo - 60, 0) : max(lo - 8, 0)], grid[pos, hi + 8 : hi + 60]]
    values, counts = np.unique(np.concatenate(beside), return_counts=True) if beside else ((), ())
    seen = np.zeros(256, bool)
    if len(values):
        seen[values[counts >= _BAND_UNSEEN_SHARE * counts.sum()]] = True
    background = paper_lut | (light_lut & ~seen)

    ends = []
    for start, step in ((first, -BAND_STEP_PX), (last, BAND_STEP_PX)):
        pos, end, misses = start, start, 0
        while misses <= _BAND_EXTEND_MISSES:
            pos += step
            found = edges(pos)
            if found is None:
                break
            if background[grid[pos, found[0] : found[1]]].mean() >= _BAND_EXTEND_PAPER:
                end, misses = pos, 0
            else:
                misses += 1
        ends.append(end)
    return axis, min(ends[0], first), max(ends[1], last), left_fit, right_fit


def _band_region(shape: tuple, band: tuple) -> tuple:
    """The pixels a measured band covers -- between its two edges, a
    couple of pixels out for the scan's soft edge, and carried one band
    width on past either end so that where two meet at a corner the
    square they share is covered -- as (rows, cols) index arrays."""
    axis, first, last, left_fit, right_fit = band
    along_size, across_size = shape if axis == 0 else shape[::-1]
    width = float(np.median(np.polyval(right_fit, [first, last]) - np.polyval(left_fit, [first, last])))
    reach = int(width) + 8
    along = np.arange(max(first - reach, 0), min(last + BAND_STEP_PX + reach, along_size))
    lo = np.clip(np.floor(np.polyval(left_fit, along)).astype(int) - 2, 0, across_size)
    hi = np.clip(np.ceil(np.polyval(right_fit, along)).astype(int) + 3, 0, across_size)  # exclusive
    counts = np.maximum(hi - lo, 0)
    along_idx = np.repeat(along, counts)
    across_idx = np.concatenate([np.arange(a, b) for a, b in zip(lo, hi)]) if counts.sum() else np.array([], int)
    return (along_idx, across_idx) if axis == 0 else (across_idx, along_idx)


def _fill_bands(data: np.ndarray, region: np.ndarray, paper_lut: np.ndarray, light_lut: np.ndarray) -> int:
    """Every pixel of the bands' own background in `region` -- paper, or
    paper under something translucent -- given the palette index of the
    nearest flat patch of the surrounding chart's light colours (or,
    with none near, the nearest pixel of them), in place. Returns the
    number of pixels changed."""
    from scipy import ndimage as ndi

    chunk, margin = _BAND_FILL_CHUNK_PX, _BAND_FILL_MARGIN_PX
    height, width = data.shape
    changed = 0
    for r0 in range(0, height, chunk):
        for c0 in range(0, width, chunk):
            r1, c1 = min(r0 + chunk, height), min(c0 + chunk, width)
            if not region[r0:r1, c0:c1].any():
                continue
            top, bottom = max(r0 - margin, 0), min(r1 + margin, height)
            left, right = max(c0 - margin, 0), min(c1 + margin, width)
            window = data[top:bottom, left:right]
            near = region[top:bottom, left:right]
            core = np.zeros_like(near)
            core[r0 - top : r1 - top, c0 - left : c1 - left] = True
            target = _background(window, near & core, ~near, paper_lut, light_lut)
            if not target.any():
                continue
            around = ~near & light_lut[window]
            values, counts = np.unique(window[around], return_counts=True)
            if not len(values):
                continue
            usual = np.zeros(256, bool)
            usual[values[counts >= _BAND_FILL_MIN_SHARE * counts.sum()]] = True
            source = around & usual[window]
            _, (rows, cols) = ndi.distance_transform_edt(~source, return_indices=True)
            flat = source & (ndi.maximum_filter(window, _BAND_FILL_FLAT_PX) == ndi.minimum_filter(window, _BAND_FILL_FLAT_PX))
            if flat.any():
                distance, (flat_rows, flat_cols) = ndi.distance_transform_edt(~flat, return_indices=True)
                close = distance <= _BAND_FILL_FLAT_REACH_PX
                rows[close], cols[close] = flat_rows[close], flat_cols[close]
            window[target] = window[rows[target], cols[target]]
            changed += int(target.sum())
    return changed


def _box_outlines(crs, transform, boxes, shape: tuple) -> np.ndarray:
    """Search blocks along the borders of lat/lon `boxes`, traced into the
    raster's projection: where the rest of a band lies, when the boxes
    are areas already taken out of it."""
    from affine import Affine
    from rasterio.features import rasterize
    from rasterio.warp import transform as transform_points

    lines = []
    for west, south, east, north in boxes:
        n = 100
        lons = np.concatenate([np.linspace(west, east, n), np.full(n, east), np.linspace(east, west, n), np.full(n, west)])
        lats = np.concatenate([np.full(n, south), np.linspace(south, north, n), np.full(n, north), np.linspace(north, south, n)])
        xs, ys = transform_points("EPSG:4326", crs, lons.tolist(), lats.tolist())
        ring = list(zip(xs, ys))
        lines.append(({"type": "LineString", "coordinates": ring + ring[:1]}, 1))
    block = transform @ Affine.scale(BAND_BLOCK, BAND_BLOCK)
    return rasterize(lines, out_shape=shape, transform=block, all_touched=True).astype(bool)


def find_masked_lines(data: np.ndarray, lut: np.ndarray, crs, transform, faces: list, known: tuple = ()) -> np.ndarray | None:
    """The pixels of a palette raster's masked lines inside `faces`, as
    a mask the shape of `data`; None where it has none. Candidates that
    measure as bands on their own come first. Then, round after round,
    whatever lies beside a band found so far -- or along the border of
    one of `known`, areas already taken out of this raster -- is looked
    for again with less paper asked of it and measured loosely: the
    stretch of a band through a town, the fourth side of a box."""
    from scipy import ndimage as ndi

    b = BAND_BLOCK
    paper_lut, tint_lut = _paper_and_tint(lut)
    light_lut = _light(lut, paper_lut)
    paper = paper_lut[data[::b, ::b]]
    inside = faces_in_blocks(crs, transform, faces, paper.shape)
    anchors = _box_outlines(crs, transform, known, paper.shape) if known else np.zeros(paper.shape, bool)
    region = np.zeros(data.shape, bool)
    for axis, mask, span in band_candidates(paper, inside):
        band = measure_band(data, paper_lut, tint_lut, axis, mask, span)
        if band is not None:
            region[_band_region(data.shape, _extend_band(data, paper_lut, light_lut, band))] = True
    if not region.any() and not anchors.any():
        return None
    waiting = band_candidates(paper, inside, paper_in=BAND_PAPER_IN_NEAR, min_blocks=BAND_MIN_BLOCKS_NEAR)
    while waiting:
        near = ndi.binary_dilation(region[::b, ::b] | anchors, iterations=BAND_NEIGHBOUR_BLOCKS)[: paper.shape[0], : paper.shape[1]]
        still, found = [], False
        for axis, mask, span in waiting:
            band = None
            if (mask & near[span]).any() and not (mask & region[::b, ::b][span]).all():
                band = measure_band(data, paper_lut, tint_lut, axis, mask, span, loose=True)
            if band is None:
                still.append((axis, mask, span))
            else:
                region[_band_region(data.shape, _extend_band(data, paper_lut, light_lut, band))] = True
                found = True
        if not found:
            break
        waiting = still
    if not region.any():
        return None
    # Only inside the face: the collar beyond it is never drawn, and is
    # left as printed.
    region &= np.repeat(np.repeat(inside, b, axis=0), b, axis=1)[: data.shape[0], : data.shape[1]]
    return region


def remove_masked_lines(path: Path, faces: list, known: tuple = ()) -> tuple:
    """The masked lines taken out of a palette chart raster, in place:
    found inside `faces` (a sheet split at the antimeridian has two),
    their paper filled with the tint around them, and the raster
    rewritten -- written whole to a copy with the same profile, colours
    and overviews, and swapped in, so a planner rendering from it at
    that moment finishes on the old file rather than reading half a
    new one. `known` are areas already taken out of it, whose borders
    the rest of a band is looked for along. Returns the (west, south,
    east, north) boxes changed, () when there were none (or the raster
    is not a palette image)."""
    import rasterio
    from rasterio.warp import transform_bounds
    from scipy import ndimage as ndi

    b = BAND_BLOCK
    with rasterio.open(path) as src:
        lut = palette(src)
        if lut is None:
            return ()
        paper_lut, _ = _paper_and_tint(lut)
        data = src.read(1)
        profile, colormap, tags, band_tags = src.profile, src.colormap(1), src.tags(), src.tags(1)
        crs, transform = src.crs, src.transform
    region = find_masked_lines(data, lut, crs, transform, faces, known)
    if region is None:
        return ()
    changed = _fill_bands(data, region, paper_lut, _light(lut, paper_lut))
    if not changed:
        return ()

    boxes = []
    labels, _ = ndi.label(region[::b, ::b], structure=np.ones((3, 3), bool))
    for rows, cols in ndi.find_objects(labels):
        x0, y0 = transform @ (cols.start * b, rows.stop * b)
        x1, y1 = transform @ (cols.stop * b, rows.start * b)
        boxes.append(tuple(float(v) for v in transform_bounds(crs, "EPSG:4326", x0, y0, x1, y1, densify_pts=21)))

    if not profile.get("tiled"):
        profile.pop("blockxsize", None)  # a striped file's strips are whole rows; GDAL only warns about it
    with atomic_path(path) as tmp:
        with rasterio.open(tmp, "w", **profile) as dst:
            dst.write_colormap(1, colormap)  # first: GDAL cannot make it a palette image once pixels are written
            dst.write(data, 1)
            dst.update_tags(**tags)
            dst.update_tags(1, **band_tags)
        charts.build_overviews(tmp)
    log.info("%s: %d masked-line pixels given back their tint, in %d area(s)", path.name, changed, len(boxes))
    return tuple(boxes)
