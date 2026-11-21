"""Part of a chart sheet reprojected to web mercator, as RGB and how much
of each pixel the sheet covers (warp_rgb): the renderer's one read of a
raster, for one tile (wingtip.chart_render) or a row of them
(wingtip.chart_pyramid). How a palette sheet is drawn sharp at every
zoom, finer or coarser than its own pixels, is here.
"""

from __future__ import annotations

import functools
import math
import os
import threading
from pathlib import Path

import numpy as np
from PIL import Image

from . import chart_grid, geo
from .chart_kinds import Box
from .chart_raster import read_rgb, without_raster_rim


# From how far past the chart's own resolution a tile is drawn smooth
# (_warp_smooth): a sectional's tile at zoom 12 is 1.46 times finer than
# the FAA's 42.3 m pixels at Chicago, a TAC's at 13 about 1.4. Below
# this the two are nearly one to one, and nearest-neighbour is as sharp
# as the sheet.
_SMOOTH_FROM = 1.1
# How finely the sheet is read for that: twice its own resolution, so
# nearest-neighbour onto a grid that does not line up with the sheet's
# pixels still gives every one of them its place (at the sheet's own
# size, a thin line one pixel wide fell between two grid points and was
# dropped, or was doubled).
_SMOOTH_READ = 2
# Grid pixels read beyond the warp's own edge on every side, so the
# filter has neighbours there and a tile's edge matches the next tile's
# (Lanczos reaches three output pixels each way, a little over four
# grid pixels at a sectional's zoom 12).
_SMOOTH_MARGIN_PX = 5
# Lanczos over bicubic: side by side over Midway and O'Hare it keeps
# the lettering and the runways' edges a little firmer, with no halo
# to see beside the thin lines, and drew no slower (115 ms a tile
# against 123, 210 tiles).
_SMOOTH_FILTER = Image.Resampling.LANCZOS


# Each thread's sheets kept open, the newest few: opening one read its
# CRS and built PROJ a database context afresh, 14% of a tile's time in
# proj.db's sqlite (2026-11-01). A dataset is not to be shared between
# threads, hence one set a thread. Keyed by the file's size and time, so
# a sheet swapped in by a refresh is opened anew.
_OPEN = threading.local()
_OPEN_PER_THREAD = 6


def _opened(path) -> object:
    """The raster at `path`, open, from this thread's few."""
    import rasterio

    held = getattr(_OPEN, "held", None)
    if held is None:
        held = _OPEN.held = {}
    stat = os.stat(path)
    key = (str(path), stat.st_size, stat.st_mtime_ns)
    src = held.pop(key, None)
    if src is None or src.closed:
        src = rasterio.open(path)
        while len(held) >= _OPEN_PER_THREAD:
            held.pop(next(iter(held))).close()
    held[key] = src  # the newest last
    return src


@functools.cache
def _web_mercator():
    """EPSG:3857 parsed once, not at every warp."""
    from rasterio.crs import CRS

    return CRS.from_epsg(3857)


def warp_rgb(
    path: Path, bbox_3857: tuple, width: int, height: int, centre_lat: float, mask: Path | None = None, face: Box | None = None
) -> tuple:
    """Part of a raster, reprojected to web mercator: (height, width,
    3) RGB and (height, width) float32 coverage, 0 to 1, of how much
    of each pixel the raster actually had (and, given a companion
    `mask` raster, how much is chart rather than collar) -- one tile,
    or a whole row of them at once. The RGB of a partly covered pixel
    is the average of its covered part alone.

    The chart is a palette image, so it is warped as indices
    (nearest-neighbour -- an averaged index is a random colour) and
    coloured afterwards. At zooms coarser than the chart's own
    resolution that alone drops thin lines; so the warp is read at two
    to four times the requested size and shrunk with a smooth filter in
    RGB (_warp_coarse), which is the averaging a palette cannot have. At zooms finer than
    it, nearest-neighbour makes each of the sheet's pixels a hard block
    of one or two tile pixels -- every letter and line a staircase,
    which the map's stretch past the deepest tiles magnifies -- so
    those are drawn smooth instead (_warp_smooth); `face`, the box of
    the chart the tile draws, keeps the collar out of that filter.

    The coverage matters at a sheet's own edge. A sheet is a rectangle
    in its conic projection, which in web mercator is a quadrilateral
    with leaning sides; its face is a lat/lon box, and where the box
    runs past the leaning edge the warp has nothing to put. Left as
    index 0 that is paper, and paper drawn over the neighbouring sheet
    showed on the map as a white sliver, widening down the seam. And
    it is a fraction rather than a yes or no because two sheets that
    meet inside one pixel each cover less than half of it: a yes-or-no
    at half left such a pixel to nobody, a hairline along the seam."""
    xmin, ymin, xmax, ymax = bbox_3857
    src = _opened(path)
    ground_m_per_px = (xmax - xmin) / width * math.cos(math.radians(centre_lat))
    upsample = float(src.res[0]) / ground_m_per_px
    if upsample >= _SMOOTH_FROM:
        return _warp_smooth(src, bbox_3857, width, height, upsample, mask, face)
    oversample = int(min(_COARSE_READ_MAX, max(_COARSE_READ_MIN, round(ground_m_per_px / float(src.res[0])))))
    return _warp_coarse(src, bbox_3857, width, height, oversample, mask)


def _warp_grid(src, bbox_3857: tuple, w: int, h: int, mask: Path | None) -> tuple:
    """The raster warped nearest-neighbour onto a (h, w) web-mercator
    grid over `bbox_3857`: its RGB, and which of the grid's pixels it
    covers (less any collar `mask` cuts out and the pale rim of the scan)."""
    from rasterio.enums import Resampling
    from rasterio.transform import from_bounds
    from rasterio.vrt import WarpedVRT

    xmin, ymin, xmax, ymax = bbox_3857
    # No nodata value: with one, GDAL "protects" it by rewriting
    # every source pixel of that index to the next one, and index
    # 0 is the chart's paper. add_alpha gives the mask instead.
    grid = dict(crs=_web_mercator(), transform=from_bounds(xmin, ymin, xmax, ymax, w, h), width=w, height=h, resampling=Resampling.nearest)
    with WarpedVRT(src, add_alpha=True, **grid) as vrt:
        rgb = read_rgb(vrt)
        alpha = vrt.read(src.count + 1)
    if mask is not None:
        with WarpedVRT(_opened(mask), **grid) as vrt:
            alpha = np.minimum(alpha, vrt.read(1))
    return rgb, without_raster_rim(alpha >= 128, rgb, src, bbox_3857)


# A tile coarser than the sheet is read at this many grid pixels to its
# own, at least and at most, and shrunk with the same filter the close-in
# tiles are drawn with (_warp_coarse). The least used to be one -- a zoom
# 11 sectional tile, 1.4 sheet pixels to its own, was nearest-neighbour
# with no filter at all, every thin line stepped or dropped where it fell
# between the grid's points, and the zooms out from there a box filter
# over whole-number samples -- so the chart read softer at every zoom but
# its deepest (the owner, 2026-11-03: "the maps are not very clear at
# outer zoom levels"). Two covers the zoom just coarser than the sheet;
# the most is the memory of a 1024 px read a tile, and further out than
# that the chart's own print is too small to read anyway.
_COARSE_READ_MIN = 2
_COARSE_READ_MAX = 4
# Output pixels read beyond the tile on every side, so the filter has
# neighbours there and a tile's edge matches the next tile's (Lanczos
# reaches three output pixels each way).
_COARSE_MARGIN_PX = 3


def _warp_coarse(src, bbox_3857: tuple, width: int, height: int, oversample: int, mask: Path | None) -> tuple:
    """warp_rgb for a tile coarser than the sheet: the indices warped
    nearest-neighbour onto a grid `oversample` times finer than the tile,
    coloured, then shrunk to the tile with the smooth filter in RGB -- the
    averaging a palette cannot have, which keeps a thin line as a fainter
    one rather than dropping it. The filter runs on colour weighted by
    what it may draw and divides by the same filter of the weights, as
    _warp_smooth does, so the collar and the nothing beyond a sheet's
    raster never bleed into the chart along a seam."""
    xmin, ymin, xmax, ymax = bbox_3857
    m = _COARSE_MARGIN_PX
    cell_x, cell_y = (xmax - xmin) / width, (ymax - ymin) / height
    outer = (xmin - m * cell_x, ymin - m * cell_y, xmax + m * cell_x, ymax + m * cell_y)
    rgb, inside = _warp_grid(src, outer, (width + 2 * m) * oversample, (height + 2 * m) * oversample, mask)
    weight = inside.astype(np.float32)
    box = (m * oversample, m * oversample, (m + width) * oversample, (m + height) * oversample)

    def shrunk(plane: np.ndarray) -> np.ndarray:
        image = Image.fromarray(np.ascontiguousarray(plane, dtype=np.float32), "F")
        return np.asarray(image.resize((width, height), _SMOOTH_FILTER, box=box))

    total = shrunk(weight)
    smooth = np.stack([shrunk(rgb[:, :, band] * weight) for band in range(3)], axis=-1)
    smooth /= np.maximum(total, 1e-6)[:, :, None]
    # The coverage: whole for a pixel whose centre the raster covers, as
    # the nearest-neighbour read had it, and the filtered weight (a
    # fraction, which the neighbouring sheet's makes up to one as
    # chart_render.render_tile sums them) only past the raster's own edge. The filter
    # softens that edge over three pixels, and a pixel just inside it at
    # 0.48 was a tile left short of whole, drawn again at every pass.
    # The grid pixels within half a grid pixel of the output pixel's
    # centre: the middle one of an odd block, the middle two by two of
    # an even one (the centre lies between them).
    lo, hi = (oversample - 1) // 2, oversample // 2 + 1
    block = inside[box[1] : box[3], box[0] : box[2]].reshape(height, oversample, width, oversample)
    centre = block[:, lo:hi, :, lo:hi].any(axis=(1, 3))
    coverage = np.where(centre, 1.0, np.clip(total, 0.0, 1.0)).astype(np.float32)
    out = np.where((total > 0)[:, :, None], smooth, 0.0)
    return np.clip(out + 0.5, 0, 255).astype(np.uint8), coverage


def _warp_smooth(src, bbox_3857: tuple, width: int, height: int, upsample: float, mask: Path | None, face: Box | None) -> tuple:
    """warp_rgb for a tile finer than the sheet: the indices warped at
    twice the sheet's own resolution, coloured, then resized to the
    tile in RGB with a smooth filter -- the way the FAA's own PDF and
    ForeFlight show the chart close in, edges soft rather than stepped.

    The filter runs on colour weighted by what it may draw (the others
    zeroed) and divides by the same filter of the weights, as the box
    filter above does: so the collar beyond a sheet's face and the
    nothing beyond its raster never bleed into the chart as a dark or
    white fringe along a seam. The coverage is the raster's own,
    filtered alike, a fraction at its leaning edge as ever. A few sheet
    pixels are read beyond the warp's edge on every side, so a tile's
    edge is filtered with its real neighbours and meets the next tile's
    without a line."""
    xmin, ymin, xmax, ymax = bbox_3857
    cols, rows = math.ceil(width * _SMOOTH_READ / upsample), math.ceil(height * _SMOOTH_READ / upsample)
    cell_x, cell_y = (xmax - xmin) / cols, (ymax - ymin) / rows
    m = _SMOOTH_MARGIN_PX
    outer = (xmin - m * cell_x, ymin - m * cell_y, xmax + m * cell_x, ymax + m * cell_y)
    rgb, inside = _warp_grid(src, outer, cols + 2 * m, rows + 2 * m, mask)
    weight = inside.astype(np.float32)
    if face is not None:
        ys = outer[3] - (np.arange(rows + 2 * m) + 0.5) * cell_y
        lats = geo.mercator_y_to_lat(ys)
        lons = geo.mercator_x_to_lon(outer[0] + (np.arange(cols + 2 * m) + 0.5) * cell_x)
        weight *= chart_grid.face_mask(face, lats, lons)
    box = (m, m, m + cols, m + rows)

    def enlarged(plane: np.ndarray) -> np.ndarray:
        image = Image.fromarray(np.ascontiguousarray(plane, dtype=np.float32), "F")
        return np.asarray(image.resize((width, height), _SMOOTH_FILTER, box=box))

    total = enlarged(weight)
    smooth = np.stack([enlarged(rgb[:, :, band] * weight) for band in range(3)], axis=-1)
    smooth /= np.maximum(total, 1e-6)[:, :, None]
    # Where the weights all but vanish -- past the raster's edge, or the
    # pale rim of its scan, under the filter's tails -- the division is
    # noise and the pixel is the neighbour's to draw: none of it covered.
    # (Past a face's edge, too, which the face mask leaves to the
    # neighbour anyway.) Drawn, the scan's paper and its ramp came
    # through there, faintly, in the next sheet's colour.
    drawn = total > 0.25
    out = np.where(drawn[:, :, None], smooth, 0.0)
    coverage = np.where(drawn, np.clip(enlarged(inside.astype(np.float32)), 0.0, 1.0), 0.0).astype(np.float32)
    return np.clip(out + 0.5, 0, 255).astype(np.uint8), coverage
