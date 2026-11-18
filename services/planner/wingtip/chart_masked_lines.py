"""Taking the masked line back out of a sectional: a band found by
wingtip.chart_bands is carried on along its line, given the tint of the
chart around it, and the sheet is written back (find_masked_lines,
remove_masked_lines). The reasons a band is told from a label are in
wingtip.chart_bands.

Split out of wingtip.chart_faces, through which the chart pipeline
reaches these; the overviews a cleaned sheet is given again are
wingtip.chart_sheets'.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from .atomic import atomic_path
from .chart_sheets import build_overviews
from .chart_bands import (
    BAND_BLOCK,
    band_candidates,
    BAND_MIN_BLOCKS_NEAR,
    BAND_NEIGHBOUR_BLOCKS,
    BAND_PAPER_IN_NEAR,
    faces_in_blocks,
    measure_band,
)
from .chart_band_fill import band_region, extend_band, fill_bands, light, paper_and_tint
from .chart_raster import palette

log = logging.getLogger(__name__)


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
    paper_lut, tint_lut = paper_and_tint(lut)
    light_lut = light(lut, paper_lut)
    paper = paper_lut[data[::b, ::b]]
    inside = faces_in_blocks(crs, transform, faces, paper.shape)
    anchors = _box_outlines(crs, transform, known, paper.shape) if known else np.zeros(paper.shape, bool)
    region = np.zeros(data.shape, bool)
    for axis, mask, span in band_candidates(paper, inside):
        band = measure_band(data, paper_lut, tint_lut, axis, mask, span)
        if band is not None:
            region[band_region(data.shape, extend_band(data, paper_lut, light_lut, band))] = True
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
                region[band_region(data.shape, extend_band(data, paper_lut, light_lut, band))] = True
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
        paper_lut, _ = paper_and_tint(lut)
        data = src.read(1)
        profile, colormap, tags, band_tags = src.profile, src.colormap(1), src.tags(), src.tags(1)
        crs, transform = src.crs, src.transform
    region = find_masked_lines(data, lut, crs, transform, faces, known)
    if region is None:
        return ()
    changed = fill_bands(data, region, paper_lut, light(lut, paper_lut))
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
        build_overviews(tmp)
    log.info("%s: %d masked-line pixels given back their tint, in %d area(s)", path.name, changed, len(boxes))
    return tuple(boxes)
