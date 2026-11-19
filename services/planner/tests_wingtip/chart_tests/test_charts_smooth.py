"""wingtip.chart_warp: tiles finer than their sheet are drawn smooth."""

import numpy as np
from wingtip import chart_grid, chart_render, chart_sheets, chart_warp

from .helpers import LEFT, RIGHT, _palette_raster, _rgb_raster, _tile_at


def test_a_tile_finer_than_the_sheet_is_drawn_smooth_and_meets_its_neighbour(tmp_path):
    """Past the sheet's own resolution a line is drawn with soft edges,
    not as a staircase of whole sheet pixels: some of its pixels are
    between ink and paper. And two neighbouring tiles drawn apart meet
    as the same warp drawn across both: the filter sees past each
    tile's edge, so no line shows between them."""
    rgb = np.full((512, 512, 3), 255, np.uint8)
    rgb[:, :, 1] = np.linspace(40, 250, 512).astype(np.uint8)[None, :]  # a gradient to see a seam in
    for k in range(0, 512, 16):  # lines two sheet pixels thick
        rgb[k : k + 2, :, :] = 0
        rgb[:, k : k + 2, :] = 0
    path = tmp_path / "fine.tif"
    _rgb_raster(path, LEFT, rgb)
    lat = 42.0
    x, y = _tile_at(lat, -89.0, 11)
    centre = float(chart_grid.tile_lats(y, 11)[chart_grid.TILE_PX // 2])

    left, _ = chart_warp.warp_rgb(path, chart_grid.tile_bbox_3857(x, y, 11), 256, 256, centre)
    right, _ = chart_warp.warp_rgb(path, chart_grid.tile_bbox_3857(x + 1, y, 11), 256, 256, centre)
    xmin, ymin, _, ymax = chart_grid.tile_bbox_3857(x, y, 11)
    both, coverage = chart_warp.warp_rgb(path, (xmin, ymin, chart_grid.tile_bbox_3857(x + 1, y, 11)[2], ymax), 512, 256, centre)

    joined = np.concatenate([left, right], axis=1).astype(int)
    assert np.abs(joined - both.astype(int)).max() <= 3
    # The lines' edges are soft: red, 255 off the lines and 0 on them,
    # takes values between along their edges.
    red = both[:, :, 0].astype(int)
    soft = (red > 10) & (red < 245)
    assert soft.any() and coverage.min() >= 0.999


def test_smooth_tiles_keep_sheet_seams_whole(tmp_path):
    """Drawn smooth, two sheets that meet still fill every pixel between
    them, and neither brings its paper or collar across the seam: each
    pixel is one sheet's colour, the other's, or the two blended on the
    seam's own column."""
    left, right = tmp_path / "left.tif", tmp_path / "right.tif"
    _palette_raster(left, (-90.0, 41.0, -87.9, 43.0), np.full((512, 512), 1, np.uint8))
    _palette_raster(right, (-88.1, 41.0, -86.0, 43.0), np.full((512, 512), 2, np.uint8))
    rasters = [
        chart_sheets.Raster(right, face=RIGHT, envelope=(-88.1, 41.0, -86.0, 43.0)),
        chart_sheets.Raster(left, face=LEFT, envelope=(-90.0, 41.0, -87.9, 43.0)),
    ]
    x, y = _tile_at(42.0, -88.0, 11)
    tile = chart_render.render_tile(rasters, x, y, 11)

    assert (tile[:, :, 3] == 255).all()
    colours = tile[:, :, :3].astype(int)
    pure = (colours == (255, 0, 0)).all(axis=2) | (colours == (0, 0, 255)).all(axis=2)
    blended = ~pure
    assert not (colours[blended].sum(axis=1) > 300).any()  # no paper
    seam = int(np.argmin(np.abs(chart_grid.tile_lons(x, 11) + 88.0)))
    assert set(np.nonzero(blended)[1].tolist()) <= {seam - 1, seam, seam + 1}
