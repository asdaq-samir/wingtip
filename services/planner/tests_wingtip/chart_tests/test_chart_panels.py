"""wingtip.chart_panels, and the TAC's face around its insets: a paper panel
printed over the face is cut out of it, the chart's own paper is not, and
tinted insets in the collar stay out of the face."""

import numpy as np
import pytest
import rasterio
from wingtip import chart_edges, chart_faces, chart_grid, chart_kinds, chart_panels, chart_render, chart_sheets

from .helpers import _palette_raster, _tile_at


def _face_of_tint(shape=(800, 800)) -> dict:
    """A face of chart tint in pooled blocks, as chart_faces measures one:
    the fraction of each block that is paper, tint and ink."""
    return {"white": np.zeros(shape), "tint": np.ones(shape), "dark": np.zeros(shape, bool), "inside": np.ones(shape, bool)}


def _paint(blocks: dict, where, what: str) -> None:
    blocks["white"][where] = what == "paper"
    blocks["tint"][where] = what == "tint"
    blocks["dark"][where] = what == "ink"


def _paper_panel(blocks: dict, r0, r1, c0, c1) -> None:
    """A panel as Puerto Rico prints them: paper inside a frame, with
    print and a route's magenta ring across it."""
    _paint(blocks, np.s_[r0:r1, c0:c1], "paper")
    for frame in (np.s_[r0 : r0 + 2, c0:c1], np.s_[r1 - 2 : r1, c0:c1], np.s_[r0:r1, c0 : c0 + 2], np.s_[r0:r1, c1 - 2 : c1]):
        _paint(blocks, frame, "ink")
    _paint(blocks, np.s_[r0 + 20 : r1 - 20 : 15, c0 + 10 : c1 - 10], "ink")
    rr, cc = np.ogrid[: blocks["white"].shape[0], : blocks["white"].shape[1]]
    ring = np.abs(np.hypot(rr - (r0 + r1) / 2, cc - (c0 + c1) / 2) - (r1 - r0) / 3) < 2
    _paint(blocks, ring, "tint")


def _panels(blocks: dict) -> list:
    return chart_panels.find_paper_panels(blocks["white"], blocks["tint"], blocks["dark"], blocks["inside"])


def test_a_framed_paper_panel_inside_the_face_is_found_whole():
    blocks = _face_of_tint()
    _paper_panel(blocks, 100, 350, 200, 620)
    panels = _panels(blocks)
    assert len(panels) == 1
    r0, r1, c0, c1 = panels[0]
    # Edge to edge, the frame included, to within the block its edge
    # falls in.
    assert abs(r0 - 100) <= 1 and abs(r1 - 350) <= 1 and abs(c0 - 200) <= 1 and abs(c1 - 620) <= 1


def test_a_panel_running_on_past_the_face_is_cut_where_the_face_ends():
    """Puerto Rico's route panels reach the sheet's north neatline: the
    collar past it counts as chart for the panel's top edge."""
    blocks = _face_of_tint()
    _paper_panel(blocks, 0, 300, 200, 620)
    blocks["inside"][:40] = False
    assert len(_panels(blocks)) == 1


def test_the_charts_own_paper_is_not_a_panel():
    """A white road, a framed label box and a large untinted area with
    the geography's own edge (west of Phoenix, the salt flats) stay."""
    blocks = _face_of_tint()
    _paint(blocks, np.s_[400:403, :], "paper")  # a road across the sheet
    _paint(blocks, np.s_[50:80, 50:150], "paper")  # a label box ("CTC ... APP WITHIN 20 NM"), 120 x 400 px
    _paint(blocks, np.s_[50:52, 50:150], "ink")
    _paint(blocks, np.s_[78:80, 50:150], "ink")
    rr, cc = np.ogrid[:800, :800]
    _paint(blocks, np.abs(rr - 600) + np.abs(cc - 500) < 180, "paper")  # a diamond of paper 1,440 px across
    assert _panels(blocks) == []


def test_a_cell_of_the_graticule_is_not_a_panel():
    """Baltimore-Washington's white SFRA band fills much of a 15-minute
    cell, framed by the graticule on four sides, whose lines run on
    past its corners as no panel's frame does."""
    blocks = _face_of_tint()
    _paint(blocks, np.s_[100:400, 100:400], "paper")
    for line in (np.s_[100:102, :], np.s_[398:400, :], np.s_[:, 100:102], np.s_[:, 398:400]):
        _paint(blocks, line, "ink")
    assert _panels(blocks) == []
    # The same paper, framed by lines that stop at its corners, is one.
    blocks = _face_of_tint()
    _paper_panel(blocks, 100, 400, 100, 400)
    assert len(_panels(blocks)) == 1


def test_a_panel_too_small_to_be_one_stays():
    blocks = _face_of_tint()
    _paper_panel(blocks, 100, 220, 200, 620)  # 120 blocks tall: under the 150 a panel is at least
    assert _panels(blocks) == []


def _drawn(raster, row: int, col: int) -> tuple:
    """The pixel a zoom 12 tile draws at a pixel of the sheet."""
    from rasterio.warp import transform

    with rasterio.open(raster.path) as src:
        x, y = src.xy(row, col)
        (lon,), (lat,) = transform(src.crs, "EPSG:4326", [x], [y])
    tx, ty = _tile_at(lat, lon, 12)
    west, south, east, north = chart_grid.tile_bbox_wgs84(tx, ty, 12)
    tile = chart_render.render_tile([raster], tx, ty, 12)
    if tile is None:
        return (0, 0, 0, 0)
    lats = chart_grid.tile_lats(ty, 12)
    return tile[int(np.abs(lats - lat).argmin()), int((lon - west) / (east - west) * 256)]


def test_a_tac_is_drawn_without_its_paper_panel(tmp_path):
    """Detected on a sheet, the panel is cut out by a mask raster: a tile
    over it is transparent where the sectional beneath then shows, and
    the chart round it is drawn."""
    box = (-66.0, 18.0, -65.0, 19.0)
    data = np.full((2400, 2400), 8, np.uint8)  # the face, tinted, to the raster's edges
    # The panel's paper, 800 px square and off to one side as Puerto
    # Rico's are, so its lines of print are not taken for a neatline ...
    data[400:1200, 1300:2100] = 0
    data[400:408, 1300:2100] = data[1192:1200, 1300:2100] = 7  # ... its frame
    data[400:1200, 1300:1308] = data[400:1200, 2092:2100] = 7
    data[480:1120:60, 1340:2060] = 7  # its print
    rr, cc = np.ogrid[400:1200, 1300:2100]
    data[400:1200, 1300:2100][np.abs(np.hypot(rr - 800, cc - 1700) - 250) < 6] = 3  # a Class B ring
    _palette_raster(tmp_path / "tac.tif", box, data)
    envelope, face, mask = chart_faces.detect_face(tmp_path / "tac.tif", chart_kinds.TAC)
    assert mask is not None and mask.exists()
    with rasterio.open(mask) as m:
        cut = m.read(1) == 0
    assert 0.9 < cut[100:300, 325:525].mean() and cut[400:, :].sum() == 0
    raster = chart_sheets.Raster(tmp_path / "tac.tif", face=face, envelope=envelope, mask=mask)
    assert _drawn(raster, 850, 1700)[3] == 0  # inside the panel, off its print and ring
    assert tuple(_drawn(raster, 1800, 1100)) == (216, 232, 206, 255)  # the chart south of it
    # A sectional cuts the same box out by its frame, which stops at its
    # corners, as a framed inset (chart_insets).
    assert chart_faces.detect_face(tmp_path / "tac.tif", chart_kinds.SECTIONAL)[2] is not None
    # Detected again once the panel is gone, the TAC's mask goes with it.
    data[400:1200, 1300:2100] = 8
    _palette_raster(tmp_path / "tac.tif", box, data)
    assert chart_faces.detect_face(tmp_path / "tac.tif", chart_kinds.TAC)[2] is None
    assert not mask.exists()


def test_a_face_starts_where_the_chart_does_not_at_tinted_insets_in_the_collar(tmp_path):
    """Los Angeles prints its route insets, tinted maps of their own, in
    two framed columns down its west collar with paper between them and
    the chart and no neatline; the face took the first tint, the insets',
    and they were drawn over the Pacific (the owner's phone, 2026-11-20)."""
    box = (-120.0, 33.4, -117.0, 34.5)
    data = np.zeros((1000, 3000), np.uint8)  # paper
    data[::2, 20:380] = 8  # the legend: symbols and their tints
    data[40:960, 1150:2900] = 8  # the chart, from column 1,150, no neatline
    for c0 in (400, 750):  # two columns of insets, 300 px wide, 100 px of paper from the chart
        for r0 in (60, 380, 700):
            data[r0 : r0 + 260, c0 : c0 + 300] = 8
            data[r0 : r0 + 260, c0 : c0 + 3] = data[r0 : r0 + 260, c0 + 297 : c0 + 300] = 7
    _palette_raster(tmp_path / "tac.tif", box, data)
    _, face, _ = chart_faces.detect_face(tmp_path / "tac.tif", chart_kinds.TAC)
    chart_west = -120.0 + 1150 / 3000 * 3.0
    # The face starts a little inside the tint (_CONTENT_MARGIN_PX).
    assert chart_west <= face[0] <= chart_west + 0.15


@pytest.mark.parametrize(
    ("tinted", "first"),
    [
        ("..##...###", 7),  # the run the search ends in
        ("..##.####", 2),  # a one-line gap bridged
        ("..###...", 2),  # ends off the tint: the first, as before
        ("........", None),
        ("#####", 0),
    ],
)
def test_the_chart_starts_at_the_tinted_run_the_search_ends_in(tinted, first):
    assert chart_edges._chart_run_start(np.array([c == "#" for c in tinted])) == first
