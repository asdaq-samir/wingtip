"""wingtip.chart_insets, the panels' cuts (chart_panels.panel_cuts) and the
neatline with bleed outside it: what a sheet prints over its face or past
its neatline is not drawn as chart."""

import numpy as np
import pytest
import rasterio
from wingtip import chart_faces, chart_insets, chart_kinds, chart_panels

from .helpers import _palette_raster


def _frame(dark: np.ndarray, r0: int, r1: int, c0: int, c1: int) -> None:
    dark[r0, c0:c1] = dark[r1 - 1, c0:c1] = True
    dark[r0:r1, c0] = dark[r0:r1, c1 - 1] = True


def _insets(dark: np.ndarray, inside: np.ndarray | None = None) -> list:
    return chart_insets.find_framed_insets(dark, np.ones(dark.shape, bool) if inside is None else inside)


def test_a_framed_inset_inside_the_face_is_found_whole():
    """Jacksonville's Tampa or Ketchikan's own town: a box with a frame
    that stops at its corners, the map inside it as busy as the chart."""
    dark = np.zeros((800, 800), bool)
    dark[::37, ::23] = True  # the chart's and the inset's print
    _frame(dark, 200, 500, 300, 640)
    insets = _insets(dark)
    assert len(insets) == 1
    r0, r1, c0, c1 = insets[0]
    assert abs(r0 - 200) <= 3 and abs(r1 - 500) <= 3 and abs(c0 - 300) <= 3 and abs(c1 - 640) <= 3


def test_an_inset_across_the_faces_corner_is_found_from_its_one_corner_inside():
    """Los Angeles's basin inset runs off the face's south-west corner:
    only its top-right corner is inside, its far sides off the face."""
    dark = np.zeros((800, 800), bool)
    inside = np.zeros((800, 800), bool)
    inside[:700, 100:] = True
    _frame(dark, 400, 800, 0, 450)
    insets = _insets(dark, inside)
    assert len(insets) == 1
    r0, r1, c0, c1 = insets[0]
    assert r0 <= 400 and r1 == 800 and c0 == 0 and c1 >= 450


def test_the_graticule_the_neatline_and_short_frames_are_not_insets():
    dark = np.zeros((800, 800), bool)
    # The graticule: its lines cross and run on past every corner.
    dark[::200, :] = True
    dark[:, ::200] = True
    assert _insets(dark) == []
    # The neatline's corner, on the face's edge.
    dark = np.zeros((800, 800), bool)
    inside = np.zeros((800, 800), bool)
    inside[100:, 100:] = True
    dark[100, 100:] = dark[100:, 100] = True
    assert _insets(dark, inside) == []
    # A label box under 600 px a side.
    dark = np.zeros((800, 800), bool)
    _frame(dark, 200, 300, 200, 600)
    assert _insets(dark) == []


def test_a_panels_cut_takes_its_title_and_runs_to_the_face_edge_and_the_next_panel():
    """Puerto Rico's route panels: a title over each frame, the first
    near the neatline, the next a little way along."""
    inside = np.zeros((1000, 1500), bool)
    inside[50:, :] = True
    cuts = chart_panels.panel_cuts([(120, 400, 100, 500), (110, 380, 560, 900)], inside)
    keep = np.ones(inside.shape, bool)
    for r0, r1, c0, c1 in cuts:
        keep[r0:r1, c0:c1] = False
    assert not keep[100:400, 100:500].any()  # the panel and the title above it
    assert not keep[50:120, 100:900].any()  # on to the neatline
    assert not keep[150:350, 500:560].any()  # the chart between the two panels
    assert keep[500:, :].all() and keep[:, 1000:].all()  # the chart well clear of them


def test_a_sectional_is_drawn_without_its_framed_inset(tmp_path):
    """Detected on a sheet, the inset is cut out by a mask raster as a
    TAC's paper panel is."""
    box = (-122.0, 32.0, -119.0, 34.0)
    data = np.full((2400, 2400), 8, np.uint8)  # the face, tinted, to the raster's edges
    data[1000:2400, 0:1200] = 3  # the inset's map, as tinted
    data[1000:1008, 0:1200] = data[1000:2400, 1192:1200] = 7  # its frame's top and east side
    data[1060:2340:80, 40:1160:16] = 7  # its print
    _palette_raster(tmp_path / "sec.tif", box, data)
    _, _, mask = chart_faces.detect_face(tmp_path / "sec.tif", chart_kinds.SECTIONAL)
    assert mask is not None
    with rasterio.open(mask) as m:
        cut = m.read(1) == 0
    assert cut[260:590, 10:290].all() and not cut[:240, :].any() and not cut[:, 310:].any()


@pytest.mark.parametrize("outside", ["bleed", "chart"])
def test_a_neatline_with_its_seas_tint_carried_past_it_is_the_neatline(tmp_path, outside):
    """Los Angeles's west neatline (121 30W) has the sheet's title panel
    and then bare ocean blue past it: the search took it for chart, went
    on to the tint at the sheet's edge, and drew both over the Pacific
    (2026-11-21). A meridian of the graticule, with chart either side,
    is still not the edge."""
    box = (-122.0, 32.0, -118.0, 36.0)
    data = np.full((1200, 4800), 8, np.uint8)  # the chart, and the bleed past it
    data[:, 600:603] = 7  # the line, 121 30W
    if outside == "bleed":
        data[:600, :600] = 0  # the title panel, paper, over the bleed's north half
    _palette_raster(tmp_path / "sec.tif", box, data)
    _, face, _ = chart_faces.detect_face(tmp_path / "sec.tif", chart_kinds.SECTIONAL)
    line = -121.5
    assert (face[0] == pytest.approx(line, abs=0.02)) is (outside == "bleed")
