"""wingtip.chart_cuts: a cycle that cuts what the served one did not is stopped for a person to look at, on records drawn by hand."""

import json

import numpy as np
import pytest
from wingtip import chart_cut_preview, chart_cuts, chart_kinds, chart_pyramid, chart_serving, chart_sheets, chart_upkeep, config

from .helpers import _palette_raster

OLD, NEW = "09-03-2026", "10-29-2026"
PANEL = [-66.0, 17.5, -65.0, 18.0]
INSET = [-118.5, 33.0, -117.5, 34.0]
FACE = [-67.0, 17.0, -64.0, 19.0]
SHEET = "tac/Puerto Rico-VI/Puerto Rico-VI TAC"


def cut(box, kind="panel"):
    return {"kind": kind, "box": box, "size_deg": [box[2] - box[0], box[3] - box[1]], "size_px": [1000, 600]}


def one(cycle, face, cuts, sheet=SHEET):
    return {"version": 1, "cycle": cycle, "sheets": {sheet: {"faces": [face], "cuts": cuts}}}


@pytest.fixture
def disk(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CHARTS_DIR", tmp_path / "charts")
    monkeypatch.setattr(config, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(chart_serving, "_serving_cache", {"value": None, "at": 0.0})
    return tmp_path / "charts"


def put(disk, cycle, record, name=chart_cuts.RECORD):
    (disk / cycle).mkdir(parents=True, exist_ok=True)
    (disk / cycle / name).write_text(json.dumps(record))


def test_the_same_cuts_pass_though_the_panel_moved_a_little():
    old = one(OLD, FACE, [cut(PANEL)])
    moved = [PANEL[0] + 0.02, PANEL[1] - 0.01, PANEL[2] + 0.03, PANEL[3]]
    assert chart_cuts.compare(old, one(NEW, FACE, [cut(moved)])) == []


def test_a_new_panel_fails_and_a_cut_that_went_does_not():
    old = one(OLD, FACE, [cut(PANEL)])
    elsewhere = [-66.5, 18.3, -66.0, 18.8]
    found = chart_cuts.compare(old, one(NEW, FACE, [cut(PANEL), cut(elsewhere)]))
    assert [(f.what, f.box) for f in found] == [("new panel cut", tuple(elsewhere))]
    assert chart_cuts.compare(old, one(NEW, FACE, [])) == []


def test_a_grown_cut_fails_and_a_shrunk_one_does_not():
    old = one(OLD, FACE, [cut(PANEL)])
    bigger = [PANEL[0] - 0.2, PANEL[1], PANEL[2], PANEL[3]]
    smaller = [PANEL[0] + 0.2, PANEL[1], PANEL[2], PANEL[3]]
    assert [f.what for f in chart_cuts.compare(old, one(NEW, FACE, [cut(bigger)]))] == ["grown panel cut"]
    assert chart_cuts.compare(old, one(NEW, FACE, [cut(smaller)])) == []


def test_a_face_edge_moved_past_the_tolerance_fails():
    old = one(OLD, FACE, [])
    near = [FACE[0] + 0.03, *FACE[1:]]
    far = [FACE[0], FACE[1], FACE[2] - 0.4, FACE[3]]
    assert chart_cuts.compare(old, one(NEW, near, [])) == []
    found = chart_cuts.compare(old, one(NEW, far, []))
    assert [(f.what, f.box) for f in found] == [("face edge moved", tuple(far))] and "(e)" in found[0].detail


def test_a_sheet_the_old_cycle_lacked_is_all_new():
    found = chart_cuts.compare(one(OLD, FACE, []), one(NEW, FACE, [cut(INSET, "inset")], "sec/Los Angeles/Los Angeles SEC"))
    assert [f.what for f in found] == ["new inset cut"]


def test_review_fails_until_the_cuts_are_accepted(disk):
    both = one(NEW, FACE, [cut(PANEL), cut(INSET)])
    put(disk, OLD, one(OLD, FACE, [cut(PANEL)]))
    put(disk, NEW, both)
    baseline, found = chart_cuts.review(NEW, OLD, previews=False)
    assert baseline == OLD and len(found) == 1
    with pytest.raises(chart_cuts.CutsNeedReview, match="accept-cuts 10-29-2026"):
        chart_cuts.gate_against(NEW, OLD)
    put(disk, NEW, both, chart_cuts.ACCEPTED)
    assert chart_cuts.review(NEW, OLD, previews=False)[1] == []
    chart_cuts.gate_against(NEW, OLD)
    # ... and a cut drawn after the look is a finding again.
    put(disk, NEW, one(NEW, FACE, [cut(PANEL), cut(INSET), cut([-65.5, 18.5, -65.2, 18.9])]))
    assert len(chart_cuts.review(NEW, OLD, previews=False)[1]) == 1


def test_a_cycle_checked_against_itself_or_alone_passes(disk, monkeypatch):
    monkeypatch.setattr(chart_serving, "serving_cycle", lambda: NEW)
    put(disk, NEW, one(NEW, FACE, [cut(PANEL)]))
    assert chart_cuts.review(NEW) == (None, [])
    assert chart_cuts.compare(chart_cuts.load_record(NEW), chart_cuts.load_record(NEW)) == []


def sheet_on_disk(disk, cycle, hole):
    """A TAC sheet whose mask has a hole at `hole` (rows, cols of 4-px blocks), written the way chart_panels writes one."""
    from rasterio.transform import from_bounds
    from rasterio.warp import transform_bounds
    from wingtip import chart_panels

    folder = disk / cycle / "tac" / "Puerto Rico-VI"
    folder.mkdir(parents=True)
    tif = folder / "Puerto Rico-VI TAC.tif"
    mask = folder / "Puerto Rico-VI TAC.mask.tif"
    _palette_raster(tif, FACE, np.full((200, 300), 8, np.uint8))
    keep = np.ones((50, 75), dtype=bool)
    keep[hole] = False
    transform = from_bounds(*transform_bounds("EPSG:4326", "EPSG:3857", *FACE), 300, 200)
    chart_panels.write_mask(mask, keep, "EPSG:3857", transform, 4)
    raster = chart_sheets.Raster(tif, face=tuple(FACE), envelope=tuple(FACE), mask=mask)
    chart_sheets.write_ready(folder, chart_sheets.Chart(chart_kinds.TAC, "Puerto Rico-VI", cycle, (raster,), "now"))


HOLE = (np.s_[10:30], np.s_[40:60])


def test_the_record_reads_the_cut_off_the_mask_and_a_preview_shows_it_in_red(disk):
    sheet_on_disk(disk, NEW, HOLE)
    data = chart_cuts.write_record(NEW)
    (entry,) = data["sheets"].values()
    (found,) = entry["cuts"]
    assert found["kind"] == "panel" and found["size_px"] == [80, 80]
    west, south, east, north = found["box"]
    assert FACE[0] < west < east < FACE[2] and FACE[1] < south < north < FACE[3]
    assert json.loads((disk / NEW / chart_cuts.RECORD).read_text()) == data
    out = chart_cut_preview.preview(NEW, SHEET, [found["box"]])
    from PIL import Image

    pixels = np.asarray(Image.open(out))
    assert pixels.shape[:2] == (200, 300)
    assert (pixels[..., 0] > pixels[..., 2] + 60).sum() > 1000  # the red cut over the land tint


def test_a_failed_review_writes_a_preview_per_finding(disk):
    sheet_on_disk(disk, NEW, HOLE)
    chart_cuts.write_record(NEW)
    put(disk, OLD, one(OLD, FACE, []))
    _, found = chart_cuts.review(NEW, OLD)
    assert len(found) == 1 and found[0].preview.exists() and str(found[0].preview) in found[0].line()


def test_build_cycle_stops_before_rendering_when_the_cuts_need_a_look(disk, monkeypatch):
    sheet_on_disk(disk, NEW, HOLE)
    put(disk, OLD, one(OLD, FACE, []))
    monkeypatch.setattr(chart_cuts, "baseline_cycle", lambda cycle: OLD)
    monkeypatch.setattr(chart_upkeep.chart_prepare, "prepare_all", lambda todo, cycle: chart_cuts.write_record(cycle))
    monkeypatch.setattr(chart_serving, "pyramid_due", lambda cycle, kinds: ("tac",))
    monkeypatch.setattr(chart_serving, "pyramid_complete", lambda cycle, kinds: False)
    renders = []
    monkeypatch.setattr(chart_pyramid, "render_pyramid", lambda *a, **k: renders.append(a))
    with pytest.raises(chart_cuts.CutsNeedReview):
        chart_upkeep.build_cycle(NEW, ("tac",), workers=1)
    assert renders == []
    chart_cuts.accept(NEW)
    chart_upkeep.build_cycle(NEW, ("tac",), workers=1)
    assert len(renders) == 1
