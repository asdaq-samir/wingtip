"""wingtip.chart_faces and the render: finding the chart face in a raster, and drawing tiles from more than one sheet."""

import math

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import transform_bounds
from wingtip import chart_edges, chart_faces, chart_grid, chart_kinds, chart_render, chart_sheets, chart_warp

from .helpers import PALETTE, _palette_raster, _rgb_raster


def test_snap_pulls_a_sectional_edge_onto_the_quarter_degree():
    assert chart_edges.snap(43.9994) == 44.0
    assert chart_edges.snap(-92.9971) == -93.0
    assert chart_edges.snap(41.4416) == 41.4416  # a TAC-like edge stays measured


def test_a_tile_coarser_than_the_sheet_keeps_a_thin_line_as_a_fainter_one(tmp_path):
    """A one-pixel ink line on the tint, drawn at a zoom where a tile
    pixel is 1.4 sheet pixels (a sectional at zoom 11): nearest-neighbour
    alone dropped it wherever the grid's points fell either side of it,
    and the zooms out from the sheet's own read softer than the chart.
    Read finer and shrunk with the smooth filter, the line is there in
    every column as a fainter one (the owner, 2026-11-03)."""
    # 475 sheet pixels across a 256-pixel tile at 41 N: 1.4 sheet pixels
    # to the tile's on the ground, as _warp_rgb measures it, and 1.86
    # down the rows, between which a nearest-neighbour read at the tile's
    # own size misses row 101 altogether (its rows land on 100 and 102).
    box = (-88.0, 41.0, -87.9, 41.1)
    data = np.full((475, 475), 8, dtype=np.uint8)
    data[101, :] = 7
    _palette_raster(tmp_path / "sheet.tif", box, data)
    from rasterio.warp import transform_bounds

    bbox = transform_bounds("EPSG:4326", "EPSG:3857", *box)
    rgb, coverage = chart_warp.warp_rgb(tmp_path / "sheet.tif", bbox, 256, 256, 41.05)
    assert rgb.shape == (256, 256, 3)
    # Covered through, but for the scan's rim at the raster's own edge.
    assert coverage[8:-8, 8:-8].min() > 0.99
    # The tint is (216, 232, 206); a row holding the line is darker than
    # it in every column: the line is there, not dropped.
    line_rows = np.where(rgb[8:-8, 8:-8, 0].mean(axis=1) < 200)[0] + 8
    assert 1 <= len(line_rows) <= 3
    assert rgb[line_rows[0], 8:-8, 0].max() < 200
    # Off the line the tint is untouched.
    assert rgb[8, 8:-8, 0].min() == 216 and rgb[247, 8:-8, 0].min() == 216


def test_render_and_detect_read_three_band_rasters_too(tmp_path):
    box = (-92.0, 40.0, -88.0, 44.0)
    rgb = np.full((1000, 1000, 3), 255, np.uint8)  # paper
    rgb[100:900, 250:, :] = (216, 232, 206)  # a face: tinted
    rgb[899:901, 250:, :] = 0  # south neatline
    rgb[100:900, 249:252, :] = 0  # west neatline
    _rgb_raster(tmp_path / "ifr.tif", box, rgb)
    raster = chart_sheets.Raster(tmp_path / "ifr.tif", face=box, envelope=box)
    tile = chart_render.render_tile([raster], 63, 94, 8)  # 91.4W to 90W, inside the tinted part
    assert tile is not None and tuple(tile[128, 128]) == (216, 232, 206, 255)
    # An IFR sheet's border is the sheet's own straight rows and
    # columns: the chart area is the widest stretch between ruling
    # lines -- here from the west line to the raster's east edge and
    # from the raster's top to the south line -- and comes with a mask
    # raster that keeps the collar out of the face's corners.
    envelope, face, mask = chart_faces.detect_face(tmp_path / "ifr.tif", chart_kinds.IFR_LOW)
    assert face[0] == pytest.approx(-91.0, abs=0.03)
    assert face[1] == pytest.approx(40.4, abs=0.1)
    assert face[2] == pytest.approx(-88.0, abs=0.03)
    assert face[3] == pytest.approx(44.0, abs=0.03)
    assert mask is not None and mask.exists()
    # Rendered with the whole envelope as its face, the mask alone
    # keeps the legend column west of the border transparent.
    masked = chart_sheets.Raster(tmp_path / "ifr.tif", face=box, envelope=box, mask=mask)
    tile = chart_render.render_tile([masked], 63, 94, 8)  # 91.4W to 90W
    west, _, east, _ = chart_grid.tile_bbox_wgs84(63, 94, 8)
    col = int((-91.2 - west) / (east - west) * 256)
    assert tile[128, col, 3] == 0
    assert tuple(tile[128, 200]) == (216, 232, 206, 255)
    # The sectional method on the same raster, for comparison, reads
    # the neatline as a geographic line, and has no mask.
    envelope, face, mask = chart_faces.detect_face(tmp_path / "ifr.tif", chart_kinds.SECTIONAL)
    assert face[0] == pytest.approx(-91.0, abs=0.02)
    assert mask is None


def test_a_sheet_across_the_antimeridian_is_measured_unwrapped_and_drawn_in_two(tmp_path):
    """UTM zone 1's central meridian is 177W; a raster reaching west of
    its zone crosses 180. rasterio reports its bounds wrapped (west >
    east); the face is found in unwrapped longitudes and split at 180
    into the two boxes the tile arithmetic draws."""
    import rasterio.transform

    left, top = 60_000.0, 5_900_000.0  # UTM 1 metres: 640 km from about 176.6E across 180 to 174W
    size = 1000
    data = np.zeros((size, size), np.uint8)
    data[80:920, 80:920] = 8
    data[80:920, 79:82] = 7
    data[80:920, 918:921] = 7
    data[79:82, 80:920] = 7
    data[918:921, 80:920] = 7
    with rasterio.open(
        tmp_path / "aleut.tif",
        "w",
        driver="GTiff",
        width=size,
        height=size,
        count=1,
        dtype="uint8",
        crs="EPSG:32601",
        transform=rasterio.transform.from_origin(left, top, 640, 640),
    ) as ds:
        ds.write(data, 1)
        ds.write_colormap(1, PALETTE)

    envelope, face, _ = chart_faces.detect_face(tmp_path / "aleut.tif", chart_kinds.SECTIONAL)
    assert envelope[0] < 180 < envelope[2] < 200  # unwrapped: east carried on past 180
    assert envelope[0] < face[0] < face[2] < envelope[2]
    parts = chart_faces.split_antimeridian(face, envelope)
    assert len(parts) == 2
    (east_face, _), (west_face, _) = parts
    assert east_face[2] == 180.0 and west_face[0] == -180.0
    assert east_face[0] == face[0] and west_face[2] == pytest.approx(face[2] - 360.0)
    assert chart_faces.split_antimeridian((-90.0, 40.0, -88.0, 44.0), (-90.5, 39.5, -87.5, 44.5)) == [
        ((-90.0, 40.0, -88.0, 44.0), (-90.5, 39.5, -87.5, 44.5))
    ]


def test_a_straight_bordered_face_reaches_the_bow_of_its_top_edge(tmp_path):
    """An IFR sheet is a rectangle in its conic projection, and a
    parallel bows toward the pole: the rectangle's top side is
    furthest north in its middle, not at its corners. The face box
    has to reach the middle, or the strip between is drawn by nobody
    and shows as a band of map background under the neighbour's
    neatline."""
    import rasterio.transform
    import rasterio.warp

    # A conic sheet 2,000 km wide, centred on the projection's meridian.
    crs = "EPSG:5070"
    transform = rasterio.transform.from_origin(-1_000_000.0, 2_700_000.0, 2000.0, 2000.0)
    width, height = 1000, 250
    data = np.full((height, width), 8, np.uint8)
    data[19:22, 40:960] = 7
    data[228:231, 40:960] = 7
    data[19:231, 39:42] = 7
    data[19:231, 958:961] = 7
    with rasterio.open(
        tmp_path / "conic.tif", "w", driver="GTiff", width=width, height=height, count=1, dtype="uint8", crs=crs, transform=transform
    ) as ds:
        ds.write(data, 1)
        ds.write_colormap(1, PALETTE)

    def lat_at(col, row):
        x, y = transform @ (col, row)
        return rasterio.warp.transform(crs, "EPSG:4326", [x], [y])[1][0]

    # The ruling lines (rows 19-21 and 228-230) are inside the chart
    # area, whole, in pooled blocks of four rows: rows 16 to 231.
    corner, middle = lat_at(36, 16), lat_at(500, 16)
    assert middle > corner + 0.3
    _, face, _ = chart_faces.detect_face(tmp_path / "conic.tif", chart_kinds.IFR_LOW)
    assert face[3] == pytest.approx(middle, abs=0.05)
    assert face[1] == pytest.approx(lat_at(36, 232), abs=0.05)


def _rgb_raster_3857(path, bounds_m, rgb):
    """A three-band GeoTIFF over web-mercator metre bounds."""
    height, width = rgb.shape[:2]
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=width,
        height=height,
        count=3,
        dtype="uint8",
        crs="EPSG:3857",
        transform=from_bounds(*bounds_m, width, height),
    ) as ds:
        ds.write(np.moveaxis(rgb, -1, 0))


def test_two_straight_bordered_sheets_meet_without_daylight(tmp_path):
    """Adjacent IFR sheets are cut on the same line: the south ruling
    line of one is the north ruling line of the next. Across the seam,
    at the charts' own zoom and at coarser ones where the seam falls
    inside a pixel, every pixel is drawn."""
    import rasterio.warp

    west, east = transform_bounds("EPSG:4326", "EPSG:3857", -92.0, 40.0, -88.0, 44.0)[::2]
    top = transform_bounds("EPSG:4326", "EPSG:3857", -92.0, 40.0, -88.0, 44.0)[3]
    bottom = transform_bounds("EPSG:4326", "EPSG:3857", -92.0, 36.0, -88.0, 40.0)[1]
    # Sheet A: 1000 rows down from 44N, its south line on rows 897-899,
    # so the line's foot is row 900 -- where sheet B's raster starts.
    a_px = (top - transform_bounds("EPSG:4326", "EPSG:3857", -92.0, 40.0, -88.0, 40.0)[1]) / 1000.0
    a = np.full((1000, 1000, 3), (216, 232, 206), np.uint8)
    a[897:900, :, :] = 0
    a[900:, :, :] = 255  # collar below the line
    a_bottom = top - 1000 * a_px
    _rgb_raster_3857(tmp_path / "a.tif", (west, a_bottom, east, top), a)
    b_top = top - 900 * a_px
    b = np.full((1000, 1000, 3), (255, 0, 0), np.uint8)  # a different tint, to tell the two apart
    b[0:3, :, :] = 0  # its north line
    _rgb_raster_3857(tmp_path / "b.tif", (west, bottom, east, b_top), b)

    rasters = []
    for name in ("a", "b"):
        envelope, face, mask = chart_faces.detect_face(tmp_path / f"{name}.tif", chart_kinds.IFR_LOW)
        rasters.append(chart_sheets.Raster(tmp_path / f"{name}.tif", face=face, envelope=envelope, mask=mask))
    assert rasters[0].face[1] <= rasters[1].face[3]  # the masks meet or overlap

    seam_lat = rasterio.warp.transform("EPSG:3857", "EPSG:4326", [west], [b_top])[1][0]
    for zoom in (6, 7, 8, 9):
        n = 2**zoom
        x = int((-89.0 + 180.0) / 360.0 * n)
        y = int((1.0 - math.log(math.tan(math.radians(seam_lat)) + 1.0 / math.cos(math.radians(seam_lat))) / math.pi) / 2.0 * n)
        tile = chart_render.render_tile(rasters, x, y, zoom)
        assert tile is not None
        lons, lats = chart_grid.tile_lons(x, zoom), chart_grid.tile_lats(y, zoom)
        inside = ((lons > -91.9) & (lons < -88.1))[None, :] & ((lats > 36.1) & (lats < 43.9))[:, None]
        assert (tile[:, :, 3][inside] == 255).all(), f"daylight at zoom {zoom}"
        # Clear of the line, each side is its own sheet's colour.
        col = int(np.argmin(np.abs(lons + 89.0)))
        above, below = np.flatnonzero(lats > seam_lat + 0.05), np.flatnonzero(lats < seam_lat - 0.05)
        # Within the filter's reach of the ruling line the smooth filter
        # leaves a shade of it (254 for 255), nothing a pilot sees.
        if len(above):
            assert np.abs(tile[above[-1], col, :3].astype(int) - (216, 232, 206)).max() <= 2
        if len(below):
            assert np.abs(tile[below[0], col, :3].astype(int) - (255, 0, 0)).max() <= 2


def test_a_tac_face_is_found_past_a_notes_panel_a_third_of_the_sheet_wide(tmp_path):
    """Minneapolis-St Paul's TAC prints its Class B notes down its east
    side, a third of the sheet across: searched a quarter of the way in,
    its neatline was never reached, the collar was guessed, and the notes
    were drawn over Wisconsin as chart (2026-11-20). The TAC's deeper
    search (edge_search) finds it."""
    box = (-94.5, 44.3, -91.5, 45.5)
    data = np.zeros((1000, 1000), np.uint8)  # paper
    data[50:950, 100:650] = 8  # the face, tinted
    data[50:950, 99:102] = 7  # west neatline
    data[50:950, 649:652] = 7  # east neatline
    data[49:52, 100:650] = 7  # north
    data[948:951, 100:650] = 7  # south
    data[300:700:20, 700:960] = 7  # the notes' lines of print
    _palette_raster(tmp_path / "tac.tif", box, data)
    _, face, _ = chart_faces.detect_face(tmp_path / "tac.tif", chart_kinds.TAC)
    assert face[2] == pytest.approx(-94.5 + 0.65 * 3.0, abs=0.03)
    # A quarter of the way in, the sectional's search, stops short of
    # it and guesses the collar, the notes inside the face.
    _, face, _ = chart_faces.detect_face(tmp_path / "tac.tif", chart_kinds.SECTIONAL)
    assert face[2] > -92.2
