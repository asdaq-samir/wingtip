"""A chart raster's colours: the palette lookup, an RGB read of a window, and the
paper border of a scan.

Shared by wingtip.chart_faces (finding the face) and the masked-line
cleaning (wingtip.chart_bands, wingtip.chart_masked_lines), and by the
tile warp (wingtip.chart_warp). Split out so none of them
needs the others for the raster's own colours.
"""

from __future__ import annotations

import math

import numpy as np

# A pixel counts as paper when every channel is at least this light.
WHITE_MIN_CHANNEL = 240


def palette(src) -> np.ndarray | None:
    """The colormap as a (256, 3) RGB lookup -- None for a raster that
    carries its colours as three bands (the IFR enroute charts)."""
    if src.count >= 3:
        return None
    cmap = src.colormap(1)
    return np.array([cmap.get(i, (0, 0, 0, 255))[:3] for i in range(256)], dtype=np.uint8)


def read_rgb(src, window=None, out_shape=None) -> np.ndarray:
    """A window of the raster as (rows, cols, 3) RGB, whichever way the
    file stores its colours. wingtip.chart_warp reads a tile's warp through
    this too."""
    lut = palette(src)
    if lut is None:
        shape = None if out_shape is None else (3, *out_shape)
        return np.moveaxis(src.read([1, 2, 3], window=window, out_shape=shape), 0, -1)
    return lut[src.read(1, window=window, out_shape=out_shape)]


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

# A scan's own outermost pixels are a paper border -- one column of white
# down the Twin Cities sheet's east edge -- which is only ever collar,
# except where the chart runs on to the raster's edge and the face with
# it. Drawn there, it was a white hairline down the seam, with the
# neighbouring sheet on the far side of it.
_RASTER_RIM_PX = 3
# ... and inside the border, a ramp: on the Twin Cities sheet a column of
# paper, then a pale one, then a darker one, each a faint line down the
# seam. So in a palette sheet's outermost pixels anything this pale is
# dropped too and the neighbour draws there; a chart that runs on to
# its raster's edge in colour, as two sheets meeting there do, stays.
_RIM_PALE_MIN_CHANNEL = 180


def without_raster_rim(inside: np.ndarray, rgb: np.ndarray, src, bbox_3857: tuple) -> np.ndarray:
    """`inside` -- which pixels of a warp grid the source raster covers --
    with the pale in a palette raster's outermost `_RASTER_RIM_PX` pixels
    taken out: the scan's border and the ramp inside it, not a chart that
    runs to the edge of its raster in colour, which two sheets meeting
    there need. A three-band raster (the IFR charts) is left as it is. Only pixels near
    the edge of what is covered are looked at, so a warp well inside a
    sheet costs nothing."""
    from rasterio.warp import transform as transform_points
    from scipy import ndimage as ndi

    if src.count >= 3:
        return inside
    height, width = inside.shape
    xmin, ymin, xmax, ymax = bbox_3857
    dest_px_m = (xmax - xmin) / width
    reach = int(math.ceil(_RASTER_RIM_PX * float(src.res[0]) / dest_px_m)) + 2
    rows, cols = np.nonzero(inside & ~ndi.binary_erosion(inside, iterations=reach, border_value=1))
    if not len(rows):
        return inside
    xs = xmin + (cols + 0.5) * dest_px_m
    ys = ymax - (rows + 0.5) * (ymax - ymin) / height
    sx, sy = transform_points("EPSG:3857", src.crs, xs.tolist(), ys.tolist())
    inverse = ~src.transform
    sx, sy = np.asarray(sx), np.asarray(sy)
    c, r = inverse.a * sx + inverse.b * sy + inverse.c, inverse.d * sx + inverse.e * sy + inverse.f
    rim = (c < _RASTER_RIM_PX) | (r < _RASTER_RIM_PX) | (c > src.width - _RASTER_RIM_PX) | (r > src.height - _RASTER_RIM_PX)
    rim &= rgb[rows, cols].min(axis=1) >= _RIM_PALE_MIN_CHANNEL
    inside = inside.copy()
    inside[rows[rim], cols[rim]] = False
    return inside
