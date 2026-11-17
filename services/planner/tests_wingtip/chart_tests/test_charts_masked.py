"""wingtip.chart_faces: taking masked lines out of a sheet, and smooth tiles."""

import math

import numpy as np
import pytest
import rasterio
from rasterio.warp import transform_bounds
from wingtip import chart_faces, charts

from .helpers import _palette_raster


def _masked_sheet(path, box):
    """A sheet of land tint with a masked line down it -- a road across
    the band and lettering in it -- beside two things that are paper
    too and are not a masked line: a label box with a border, and a
    dry lake whose width and edges wander."""
    data = np.full((1600, 1600), 8, np.uint8)
    data[100:1500, 700:736] = 0  # the band, 36 px wide
    data[800:803, :] = 7  # a road across it
    data[400:420, 710:726] = 7  # "TAC", lettered in it
    data[298:390, 98:548] = 7  # a label box, the shape of the real ones: border ...
    data[300:388, 100:546] = 0  # ... and its paper
    for row in range(200, 1400):  # a dry lake
        centre = 1250 + int(20 * math.sin(row / 90))
        half = 15 + int(10 * math.sin(row / 37)) + (row * 7919) % 5
        data[row, centre - half : centre + half] = 0
    _palette_raster(path, box, data)
    return data


def test_remove_masked_lines_gives_the_band_its_tint_back_and_nothing_else(tmp_path):
    box = (-90.0, 41.0, -88.0, 43.0)
    path = tmp_path / "sheet.tif"
    before = _masked_sheet(path, box)

    boxes = chart_faces.remove_masked_lines(path, [box])

    with rasterio.open(path) as src:
        after = src.read(1)
        assert src.colormap(1)[8] == (216, 232, 206, 255)
        assert len(src.overviews(1)) == len(charts._OVERVIEW_LEVELS)
        coarse = src.read(1, out_shape=(400, 400))  # from the rebuilt overview, not the old one
    assert (after[100:1500, 700:736][before[100:1500, 700:736] == 0] == 8).all()
    assert (after[800:803, 690:750] == 7).all()  # the road is still printed across it
    assert (after[400:420, 710:726] == 7).all()  # and the lettering is still in it
    assert (after[300:388, 100:546] == 0).all()  # the label box keeps its paper
    assert (after[298:390, 98:548] == before[298:390, 98:548]).all()
    lake = before[200:1400, 1150:1350] == 0
    assert (after[200:1400, 1150:1350][lake] == 0).all()  # and so does the lake
    assert (after[:, :690] == before[:, :690]).all() and (after[:, 750:] == before[:, 750:]).all()
    assert (coarse[30:370, 176:183] != 0).all()  # no paper left in the band at zoom-out either

    assert len(boxes) == 1
    west, south, east, north = boxes[0]
    band_lon = -90.0 + 718 / 1600 * 2.0
    assert west < band_lon < east and south < 42.0 < north and east - west < 0.2

    # Run again, it finds nothing left to take out.
    assert chart_faces.remove_masked_lines(path, [box]) == ()


def test_a_band_takes_the_tint_beside_it_not_the_halo_along_its_edge(tmp_path):
    # Specks of a lighter shade just outside the band's soft edge, as a
    # letter's halo or a road's anti-aliasing leave there, and a stretch
    # of the chart stippled with it so it is one of the colours the chart
    # is painted in. Copied from the nearest pixel, each speck was a
    # streak across the band.
    box, path = (-90.0, 41.0, -88.0, 43.0), tmp_path / "sheet.tif"
    data = np.full((1600, 1600), 8, np.uint8)
    data[100:1500, 700:736] = 0
    data[100:1500:10, 696:698] = 5
    data[100:1000:3, 100:500:3] = 5
    _palette_raster(path, box, data)

    assert chart_faces.remove_masked_lines(path, [box])
    with rasterio.open(path) as src:
        band = src.read(1)[100:1500, 700:736]
    assert (band == 8).all()


def test_masked_lines_outside_the_face_are_the_collar_and_are_left_alone(tmp_path):
    path = tmp_path / "sheet.tif"
    before = _masked_sheet(path, (-90.0, 41.0, -88.0, 43.0))
    assert chart_faces.remove_masked_lines(path, [(-88.9, 41.0, -88.0, 43.0)]) == ()  # the band is west of the face
    with rasterio.open(path) as src:
        assert (src.read(1) == before).all()


def test_what_was_taken_out_is_recorded_and_unmask_renders_its_tiles_again(tmp_path, monkeypatch):
    cycle, box = "09-03-2026", (-90.0, 41.0, -88.0, 43.0)
    monkeypatch.setattr(charts, "CHARTS_DIR", tmp_path / "charts")
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    directory = charts._chart_dir(cycle, charts.SECTIONAL, "Sheet")
    directory.mkdir(parents=True)
    _masked_sheet(directory / "sheet.tif", box)
    sheet = charts.Chart(charts.SECTIONAL, "Sheet", cycle, (charts.Raster(directory / "sheet.tif", face=box, envelope=box),), "then")
    charts._write_ready(directory, sheet)  # prepared before masked lines were looked for
    assert charts._load_ready(directory, charts.SECTIONAL, "Sheet", cycle).rasters[0].masked_lines is None

    x, y = 64, 94  # zoom 8, over the band at about 89.1W
    tile = charts._tile_path(charts.SECTIONAL, cycle, x, y, 8)
    tile.parent.mkdir(parents=True)
    tile.write_bytes(b"old")
    monkeypatch.setattr(
        charts, "rasters_covering", lambda kind, bbox, cycle=None: ([charts._load_ready(directory, kind, "Sheet", cycle).rasters[0]], True)
    )

    changed = charts.unmask_prepared(cycle, workers=0)

    assert len(changed["sec"]) == 1
    assert charts._load_ready(directory, charts.SECTIONAL, "Sheet", cycle).rasters[0].masked_lines == tuple(changed["sec"])
    assert tile.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"  # rendered again from the cleaned sheet
    assert charts.tiles_revision(cycle) == 1

    # Looked at once, the sheet is not looked at again, and nothing else is rendered.
    assert charts.unmask_prepared(cycle, workers=0) == {}
    assert charts.tiles_revision(cycle) == 1


def test_a_tile_is_not_rendered_again_without_every_sheet_it_needs(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    cycle, x, y = "09-03-2026", 64, 94
    tile = charts._tile_path(charts.SECTIONAL, cycle, x, y, 8)
    tile.parent.mkdir(parents=True)
    tile.write_bytes(b"old")
    raster = charts.Raster(tmp_path / "a.tif", face=(-90.0, 41.0, -88.0, 43.0), envelope=(-90.0, 41.0, -88.0, 43.0))
    monkeypatch.setattr(charts, "rasters_covering", lambda kind, bbox, cycle=None: ([raster], False))
    monkeypatch.setattr(charts, "render_tile", lambda *a: pytest.fail("rendered without every sheet"))

    assert charts._rerender_tile(("sec", cycle, x, y, 8, 1)) is False
    assert charts.rerender_tiles(charts.SECTIONAL, [raster.face], cycle, workers=0) == 0
    assert tile.read_bytes() == b"old"

    # Nothing covers it at all: the old tile goes, as before.
    monkeypatch.setattr(charts, "rasters_covering", lambda kind, bbox, cycle=None: ([], True))
    assert charts._rerender_tile(("sec", cycle, x, y, 8, 1)) is None
    charts.rerender_tiles(charts.SECTIONAL, [raster.face], cycle, workers=0)
    assert not tile.exists()


def test_a_tile_rendered_on_demand_draws_the_same_sheet_as_the_pyramid(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    cycle = "09-03-2026"
    a_box, b_box = (-90.0, 41.0, -87.5, 43.0), (-88.5, 41.0, -86.0, 43.0)  # overlapping 88.5W to 87.5W
    _palette_raster(tmp_path / "a.tif", a_box, np.full((512, 512), 1, np.uint8))
    _palette_raster(tmp_path / "b.tif", b_box, np.full((512, 512), 2, np.uint8))
    sheets = {
        "Alpha": charts.Chart(charts.SECTIONAL, "Alpha", cycle, (charts.Raster(tmp_path / "a.tif", face=a_box, envelope=a_box),), "now"),
        "Bravo": charts.Chart(charts.SECTIONAL, "Bravo", cycle, (charts.Raster(tmp_path / "b.tif", face=b_box, envelope=b_box),), "now"),
    }
    charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=list(sheets.values()), cycle=cycle)
    monkeypatch.setitem(charts.COVERAGE, "sec", {"Alpha": a_box, "Bravo": b_box})
    monkeypatch.setattr(charts, "ensure_chart", lambda kind, name, cycle=None, fetch=True: sheets[name])

    x, y = 65, 94  # zoom 8, 88.6W to 87.2W: most of it the overlap
    pyramid = charts._decode_rgba(charts._tile_path(charts.SECTIONAL, cycle, x, y, 8).read_bytes())
    rasters, _ = charts.rasters_covering(charts.SECTIONAL, charts.tile_bbox_wgs84(x, y, 8), cycle)
    on_demand = charts.render_tile(rasters, x, y, 8)
    west, _, east, _ = charts.tile_bbox_wgs84(x, y, 8)
    col = int((-88.0 - west) / (east - west) * 256)
    assert tuple(pyramid[200, col]) == tuple(on_demand[200, col]) == (0, 0, 255, 255)  # Bravo, both ways


def _busy_band_sheet(path, box, clean_ends=True):
    """A long band whose middle runs through somewhere busy: half its
    blocks printed over, too little paper for a band on its own."""
    data = np.full((2400, 800), 8, np.uint8)
    rows, cols = np.mgrid[0:2400, 0:800]
    band = (rows >= 100) & (rows < 2300) & (cols >= 380) & (cols < 416)
    busy = band & (rows >= 900) & (rows < 1400)
    data[band] = 0 if clean_ends else 8
    data[busy] = 0
    data[busy & (((rows // 4) + (cols // 4)) % 2 == 0) & (cols >= 384) & (cols < 412)] = 7
    _palette_raster(path, box, data)
    return data


def test_a_band_through_somewhere_busy_is_followed_from_its_quiet_stretches(tmp_path):
    box, path = (-90.0, 40.0, -89.5, 43.0), tmp_path / "sheet.tif"
    before = _busy_band_sheet(path, box)
    assert chart_faces.remove_masked_lines(path, [box])
    with rasterio.open(path) as src:
        after = src.read(1)
    band = before[100:2300, 380:416] == 0
    assert (after[100:2300, 380:416][band] == 8).all()  # the busy stretch too
    assert (after[900:1400, 380:416][before[900:1400, 380:416] == 7] == 7).all()


def test_what_is_left_of_a_band_is_found_along_the_border_of_what_was_taken_out(tmp_path):
    box, path = (-90.0, 40.0, -89.5, 43.0), tmp_path / "sheet.tif"
    before = _busy_band_sheet(path, box, clean_ends=False)  # cleaned already, all but the busy stretch
    assert chart_faces.remove_masked_lines(path, [box]) == ()  # on its own it is not a band
    with rasterio.open(path) as src:  # where the band was taken out, a little wider than it
        (x0, y0), (x1, y1) = src.transform @ (376, 2300), src.transform @ (420, 100)
    taken_out = (transform_bounds("EPSG:3857", "EPSG:4326", x0, y0, x1, y1),)
    assert chart_faces.remove_masked_lines(path, [box], known=taken_out)
    with rasterio.open(path) as src:
        after = src.read(1)
    assert (after[900:1400, 380:416][before[900:1400, 380:416] == 0] == 8).all()


def test_a_scans_paper_border_does_not_draw_a_hairline_down_the_seam(tmp_path):
    # The first sheet's chart runs on to its raster's edge, and so does
    # its face; its scan ends in a ramp -- a paler column, a darker one --
    # and a column of paper. The neighbour covers the strip beyond it.
    left_box, right_box = (-90.0, 41.0, -88.0, 43.0), (-88.3, 41.0, -86.0, 43.0)
    left = np.full((512, 512), 1, np.uint8)
    left[:, -3], left[:, -2], left[:, -1] = 9, 8, 0
    _palette_raster(tmp_path / "left.tif", left_box, left)
    _palette_raster(tmp_path / "right.tif", right_box, np.full((512, 512), 2, np.uint8))
    rasters = [
        charts.Raster(tmp_path / "left.tif", face=(-90.0, 41.0, -87.9, 43.0), envelope=left_box),
        charts.Raster(tmp_path / "right.tif", face=right_box, envelope=right_box),
    ]
    x0, _, y0, _ = charts._tile_range((-88.001, 41.999, -87.999, 42.001), 10)
    rgba = charts.render_tile(rasters, x0, y0, 10)
    # Red, blue, and (the tile finer than the sheets, so drawn smooth)
    # the two blended where they meet -- none of the ramp or the paper.
    drawn = rgba[rgba[:, :, 3] > 0][:, :3].astype(int)
    assert (drawn[:, 1] == 0).all() and (np.abs(drawn[:, 0] + drawn[:, 2] - 255) <= 2).all()
    west, _, east, _ = charts.tile_bbox_wgs84(x0, y0, 10)
    col = lambda lon: int((lon - west) / (east - west) * 256)  # noqa: E731
    assert tuple(rgba[128, col(-88.05)]) == (255, 0, 0, 255)  # the first sheet, up to its edge
    assert tuple(rgba[128, col(-87.95)]) == (0, 0, 255, 255)  # its neighbour past it


def test_a_band_is_carried_through_the_lettering_up_to_the_sheets_edge(tmp_path):
    box, path = (-90.0, 40.0, -89.5, 42.0), tmp_path / "sheet.tif"
    data = np.full((1600, 800), 8, np.uint8)
    data[100:1600, 380:416] = 0  # runs off the bottom of the raster
    rows, cols = np.mgrid[1450:1600, 380:416]
    data[1450:1600, 380:416][((rows // 3 + cols // 3) % 3 != 0)] = 7  # a name lettered over its last stretch
    _palette_raster(path, box, data)
    assert chart_faces.remove_masked_lines(path, [(-90.0, 39.0, -89.5, 42.0)])
    with rasterio.open(path) as src:
        after = src.read(1)
    assert (after[100:1600, 380:416][data[100:1600, 380:416] == 0] == 8).all()


def _ringed_band_sheet(path, box, ring_rows):
    """A band down the sheet to its bottom edge, a Class B ring printed
    across it: magenta over the tint either side, pale pink over the
    band's paper."""
    data = np.full((1600, 800), 8, np.uint8)
    data[100:1600, 380:416] = 0
    rows, cols = np.mgrid[0:1600, 0:800]
    ring = (rows >= ring_rows[0]) & (rows < ring_rows[1])
    data[ring & (data == 8)] = 3
    data[ring & (data == 0)] = 4
    _palette_raster(path, box, data)
    return data


def test_a_band_under_a_class_b_ring_gets_the_rings_colour_back(tmp_path):
    box, path = (-90.0, 40.0, -89.5, 42.0), tmp_path / "sheet.tif"
    before = _ringed_band_sheet(path, box, (700, 760))
    assert chart_faces.remove_masked_lines(path, [(-90.0, 39.0, -89.5, 42.0)])
    with rasterio.open(path) as src:
        after = src.read(1)
    under = after[700:760, 380:416]
    assert not (under == 4).any() and not (under == 0).any()
    assert (under == 3).mean() > 0.9  # the ring runs on across it, unbroken
    assert (after[100:1600, 380:416][before[100:1600, 380:416] == 0] == 8).all()


def test_a_band_is_carried_under_a_ring_too_long_to_bridge_to_the_sheets_edge(tmp_path):
    box, path = (-90.0, 40.0, -89.5, 42.0), tmp_path / "sheet.tif"
    _ringed_band_sheet(path, box, (1150, 1450))  # and only 150 px of band after it
    assert chart_faces.remove_masked_lines(path, [(-90.0, 39.0, -89.5, 42.0)])
    with rasterio.open(path) as src:
        after = src.read(1)
    assert not (after[100:1600, 380:416] == 0).any()
    assert not (after[1150:1450, 380:416] == 4).any()
