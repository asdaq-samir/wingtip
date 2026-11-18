"""wingtip.chart_faces: the render of sheets with leaning edges, two sheets together, and the face read from neatlines."""

import dataclasses

import numpy as np
import pytest
from rasterio.warp import transform_bounds
from wingtip import chart_faces, chart_grid, chart_kinds, chart_render, chart_sheets

from .helpers import PALETTE, _palette_raster


def test_render_leaves_a_sheets_own_leaning_edge_transparent(tmp_path):
    """A sheet is a rectangle in its own projection and a leaning
    quadrilateral in web mercator; its lat/lon face can run past the
    lean. Those pixels are the neighbour's to draw, not paper."""
    import rasterio.transform

    # A palette raster in UTM zone 15 (central meridian 93W): at 88W
    # its right edge leans a few degrees off the meridian.
    left, bottom = 900_000.0, 4_600_000.0  # metres, in the zone's east
    size = 800
    data = np.full((size, size), 8, np.uint8)
    with rasterio.open(
        tmp_path / "utm.tif",
        "w",
        driver="GTiff",
        width=size,
        height=size,
        count=1,
        dtype="uint8",
        crs="EPSG:32615",
        transform=rasterio.transform.from_origin(left, bottom + 200_000, 250, 250),
    ) as ds:
        ds.write(data, 1)
        ds.write_colormap(1, PALETTE)
    with rasterio.open(tmp_path / "utm.tif") as src:
        envelope = tuple(transform_bounds(src.crs, "EPSG:4326", *src.bounds))
    raster = chart_sheets.Raster(tmp_path / "utm.tif", face=envelope, envelope=envelope)

    # A tile row along the raster's east edge: every pixel there is
    # either the chart's tint or transparent, never paper.
    west, south, east, north = envelope
    x0, x1, y0, y1 = chart_grid.tile_range(envelope, 9)
    rgba = chart_render.render_tile([raster], x1, (y0 + y1) // 2, 9)
    assert rgba is not None
    opaque = rgba[:, :, 3] == 255
    assert opaque.any() and not opaque.all()
    assert (rgba[opaque][:, :3] == (216, 232, 206)).all()
    assert not (rgba[~opaque][:, :3] == 255).all() or (rgba[~opaque][:, :3] == 0).all()


def test_render_composites_two_sheets_and_clips_each_to_its_face(tmp_path):
    left_box, right_box = (-90.0, 41.0, -88.0, 43.0), (-88.0, 41.0, -86.0, 43.0)
    _palette_raster(tmp_path / "left.tif", left_box, np.full((512, 512), 1, np.uint8))
    _palette_raster(tmp_path / "right.tif", right_box, np.full((512, 512), 2, np.uint8))
    rasters = [
        chart_sheets.Raster(tmp_path / "left.tif", face=left_box, envelope=left_box),
        chart_sheets.Raster(tmp_path / "right.tif", face=right_box, envelope=right_box),
    ]

    # Tile 65/94 at zoom 8 straddles the seam at 88W and the sheets'
    # north edge at 43N.
    rgba = chart_render.render_tile(rasters, 65, 94, 8)
    assert rgba is not None and rgba.shape == (256, 256, 4)
    west, _, east, _ = chart_grid.tile_bbox_wgs84(65, 94, 8)

    def col(lon):
        return int((lon - west) / (east - west) * 256)

    assert tuple(rgba[200, col(-88.3)]) == (255, 0, 0, 255)
    assert tuple(rgba[200, col(-87.7)]) == (0, 0, 255, 255)
    assert rgba[2, 128, 3] == 0  # north of both faces: transparent
    assert rgba[200, col(-88.3) - 1 : col(-87.7), 3].all()  # nothing missing along the seam

    assert chart_render.render_tile(rasters, 65, 80, 8) is None  # far to the north


def test_detect_face_reads_neatlines_and_where_the_chart_runs_out(tmp_path):
    """A synthetic sheet, 4x4 degrees at 2000 px: a tinted face with an
    inked neatline on its west and south edges inside a paper collar,
    running on to the sheet's own east edge, and under a row of paper
    (the communication boxes) along the north."""
    box = (-92.0, 40.0, -88.0, 44.0)
    px_per_deg = 500
    data = np.zeros((2000, 2000), np.uint8)  # paper

    def col(lon):
        return int((lon - box[0]) * px_per_deg)

    def row(lat):
        # Rows run north to south; the raster is mercator, so equal
        # spacing in the transform is what these coordinates follow.
        y_top, y_bottom = (transform_bounds("EPSG:4326", "EPSG:3857", *box)[i] for i in (3, 1))
        y = transform_bounds("EPSG:4326", "EPSG:3857", box[0], lat, box[2], lat)[1]
        return int((y_top - y) / (y_top - y_bottom) * 2000)

    data[row(43.6) : row(41.0), col(-91.0) :] = 8  # the face
    data[row(41.0) - 1 : row(41.0) + 2, col(-91.0) :] = 7  # south neatline
    data[row(43.6) : row(41.0), col(-91.0) - 1 : col(-91.0) + 2] = 7  # west neatline
    _palette_raster(tmp_path / "sheet.tif", box, data)

    envelope, face, _ = chart_faces.detect_face(tmp_path / "sheet.tif", chart_kinds.SECTIONAL)
    assert envelope == pytest.approx(box, abs=1e-3)
    west, south, east, north = face
    assert west == -91.0 and south == 41.0  # neatlines, snapped
    assert -88.35 <= east <= -88.0  # the sheet's own edge, less the margin
    assert 43.3 <= north <= 43.55  # under the boxes, less the margin

    # A kind equal to the sectional but not the same object (a module run
    # as __main__ has its own, as `python -m wingtip.charts` once did) is
    # still read as a sectional (snapped edges).
    same_kind = dataclasses.replace(chart_kinds.SECTIONAL)
    assert same_kind is not chart_kinds.SECTIONAL
    assert chart_faces.detect_face(tmp_path / "sheet.tif", same_kind)[1] == face
