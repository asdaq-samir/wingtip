"""The web map's tile grid as the chart renderer draws it: a tile's size
and densities, its box in web mercator metres and in degrees, the
latitude and longitude of its pixels, and the tiles a chart face
touches.
"""

from __future__ import annotations

import numpy as np

from . import geo
from .geo import tile_lat_lon, tile_xy
from .chart_kinds import Box


TILE_PX = 256
# The pixel densities each tile is drawn at: TILE_PX on a side, and
# twice that for a phone's 2x and 3x screens, under the same z/x/y with
# "@2x" in its name (chart_render.tile_path) -- the convention MapKit's tile overlays,
# MapLibre and Leaflet's {r} share. A phone stretched the 256-pixel tile
# three times and blurred every letter and line on it; the 512-pixel one
# is drawn from the FAA's sheet at that size by the same Lanczos. Chosen
# over a zoom 13 at 256 pixels (the earlier claude/sharper-tiles) on
# 2026-11-06: zoom 13 sharpens only past zoom 12, where a 512-pixel zoom
# 12 is the same pixels, while these sharpen every zoom; and they are a
# third of zoom 13's files, the uploads being most of the CDN's bill. The
# Chicago sheet: 8,414 tiles either way, 149 MB at 256 and 419 MB at 512;
# its zoom 13, 24,449 tiles and 292 MB. Screenshots of it at 3x, against
# the sheet resampled once to the screen's pixels: SSIM 0.89-0.96 at
# zooms 10-14 with these, 0.77-0.91 without (zoom 13: 0.89 at 13 and 14
# only). The pipeline's Lanczos kept more line contrast than GDAL's own
# Lanczos or cubic on the sheet expanded to RGB, at 88 ms a tile to 322
# and 126.
TILE_SCALES = (1, 2)

# Web mercator's half-world extent in metres (EPSG:3857) -- the origin
# the standard {z}/{x}/{y} tile grid is laid out from -- is geo's.
_MERCATOR_ORIGIN_M = geo.WEB_MERCATOR_HALF_WORLD_M


def tile_bbox_3857(x: int, y: int, zoom: int) -> tuple:
    """The (xmin, ymin, xmax, ymax) of one standard tile, in EPSG:3857
    metres."""
    resolution = 2 * _MERCATOR_ORIGIN_M / (2**zoom)
    xmin = -_MERCATOR_ORIGIN_M + x * resolution
    ymax = _MERCATOR_ORIGIN_M - y * resolution
    return xmin, ymax - resolution, xmin + resolution, ymax


def tile_bbox_wgs84(x: int, y: int, zoom: int) -> Box:
    """The same tile as (west, south, east, north) degrees."""
    north, west = tile_lat_lon(x, y, zoom)
    south, east = tile_lat_lon(x + 1, y + 1, zoom)
    return west, south, east, north


def tile_lats(y: int, zoom: int, px: int = TILE_PX) -> np.ndarray:
    """The latitude at the centre of each pixel row of tile row `y`, `px`
    pixels high."""
    _, ymin, _, ymax = tile_bbox_3857(0, y, zoom)
    ys = ymax - (np.arange(px) + 0.5) / px * (ymax - ymin)
    return geo.mercator_y_to_lat(ys)


def tile_lons(x: int, zoom: int, px: int = TILE_PX) -> np.ndarray:
    """The longitude at the centre of each pixel column of tile column `x`,
    `px` pixels wide."""
    xmin, _, xmax, _ = tile_bbox_3857(x, 0, zoom)
    return geo.mercator_x_to_lon(xmin + (np.arange(px) + 0.5) / px * (xmax - xmin))


def face_mask(face: Box, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    west, south, east, north = face
    return ((lats >= south) & (lats <= north))[:, None] & ((lons >= west) & (lons <= east))[None, :]


def tile_range(face: Box, zoom: int) -> tuple:
    """(x0, x1, y0, y1), inclusive, of the tiles a face touches."""
    n = 2**zoom
    west, south, east, north = face
    # Web Mercator ends short of the poles; tile_xy clamps a face's edge
    # past that to the grid's.
    x0, y0 = tile_xy(north, west, zoom)
    x1, y1 = tile_xy(south, east, zoom)
    return max(0, int(x0)), min(n - 1, int(x1)), max(0, int(y0)), min(n - 1, int(y1))
