"""The chart modules (wingtip.charts maps them): the FAA chart cycle, the tile grid, and the pyramid's tiles, serving and publishing."""

import datetime as dt
import io
import re

import numpy as np
import pytest
from cachetools import TTLCache
from PIL import Image
from wingtip import (
    chart_coverage,
    chart_cycle,
    chart_grid,
    chart_kinds,
    chart_prepare,
    chart_pyramid,
    chart_upkeep,
    chart_render,
    chart_serving,
    chart_sheets,
    config,
)

from .helpers import C81, _palette_raster


def test_cycle_arithmetic_from_the_anchor():
    assert chart_cycle.cycle_from_anchor(dt.date(2026, 9, 3)) == "09-03-2026"
    assert chart_cycle.cycle_from_anchor(dt.date(2026, 9, 20)) == "09-03-2026"
    assert chart_cycle.cycle_from_anchor(dt.date(2026, 10, 28)) == "09-03-2026"
    assert chart_cycle.cycle_from_anchor(dt.date(2026, 10, 29)) == "10-29-2026"
    assert chart_cycle.cycle_from_anchor(dt.date(2026, 7, 9)) == "07-09-2026"


def test_current_cycle_never_fetches_when_told_not_to(monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError("must not touch the network")

    monkeypatch.setattr(chart_serving.requests, "get", boom)
    monkeypatch.setattr(chart_prepare.outside, "get", boom)
    monkeypatch.setattr(chart_cycle, "_cycle_cache", TTLCache(maxsize=1, ttl=60))
    assert chart_cycle.current_cycle(dt.date(2026, 9, 20), fetch=False) == "09-03-2026"


def test_tile_bbox_wgs84_contains_a_known_point():
    west, south, east, north = chart_grid.tile_bbox_wgs84(65, 94, 8)
    assert west < C81[1] < east
    assert south < C81[0] < north
    assert west == pytest.approx(-88.59375)
    assert north == pytest.approx(43.0689, abs=1e-3)


def test_coverage_index_is_well_formed():
    for kind, entries in chart_coverage.COVERAGE.items():
        assert kind in chart_kinds.KINDS
        for name, entry in entries.items():
            assert re.fullmatch(r"[A-Za-z][A-Za-z0-9_\-]*", name), name
            for west, south, east, north in chart_coverage.boxes(entry):
                assert west < east and south < north, name
                assert -180 <= west and east <= 180 and 12 < south and north < 73, name
    # The route this project was built around is covered by every kind.
    here = (C81[1], C81[0], C81[1], C81[0])
    for kind in chart_kinds.KINDS:
        assert any(chart_coverage.intersects(box, here) for box in chart_coverage.COVERAGE[kind].values()), kind


def test_zip_urls_follow_each_kind_and_the_caribbean_exception():
    assert (
        chart_kinds.zip_url(chart_kinds.SECTIONAL, "Green_Bay", "09-03-2026")
        == "https://aeronav.faa.gov/visual/09-03-2026/sectional-files/Green_Bay.zip"
    )
    assert (
        chart_kinds.zip_url(chart_kinds.TAC, "Chicago", "09-03-2026")
        == "https://aeronav.faa.gov/visual/09-03-2026/tac-files/Chicago_TAC.zip"
    )
    assert chart_kinds.zip_url(chart_kinds.IFR_LOW, "enr_l12", "09-03-2026") == "https://aeronav.faa.gov/enroute/09-03-2026/enr_l12.zip"
    assert (
        chart_kinds.zip_url(chart_kinds.SECTIONAL, "Caribbean_1_VFR", "09-03-2026")
        == "https://aeronav.faa.gov/visual/09-03-2026/Caribbean/Caribbean_1_VFR.zip"
    )
    assert chart_kinds.is_chart_member(chart_kinds.SECTIONAL, "Hawaiian_Islands", "Hawaiian Islands SEC.tif")
    assert not chart_kinds.is_chart_member(chart_kinds.SECTIONAL, "Hawaiian_Islands", "Honolulu Inset SEC.tif")
    assert chart_kinds.is_chart_member(chart_kinds.SECTIONAL, "Caribbean_1_VFR", "Caribbean 1 VFR Chart.tif")
    assert not chart_kinds.is_chart_member(chart_kinds.TAC, "Chicago", "Chicago FLY.tif")
    assert chart_kinds.is_chart_member(chart_kinds.IFR_LOW, "enr_l34", "ENR_L34.tif")
    assert not chart_kinds.is_chart_member(chart_kinds.IFR_LOW, "enr_l34", "ENR_L34_BOST_INSET.tif")
    # The insets are sheets of their own, under the overlay kinds, out
    # of the zips they ride in.
    assert (
        chart_kinds.zip_url(chart_kinds.TAC, "Honolulu_Inset", "09-03-2026")
        == "https://aeronav.faa.gov/visual/09-03-2026/sectional-files/Hawaiian_Islands.zip"
    )
    assert chart_kinds.is_chart_member(chart_kinds.TAC, "Honolulu_Inset", "Honolulu Inset SEC.tif")
    assert not chart_kinds.is_chart_member(chart_kinds.TAC, "Honolulu_Inset", "Hawaiian Islands SEC.tif")
    assert chart_kinds.zip_url(chart_kinds.IFR_AREA, "enr_a02", "09-03-2026") == "https://aeronav.faa.gov/enroute/09-03-2026/enr_a02.zip"
    assert chart_kinds.is_chart_member(chart_kinds.IFR_AREA, "enr_a01", "ENR_A01_ATL.tif")
    assert not chart_kinds.is_chart_member(chart_kinds.IFR_AREA, "enr_a01", "ENR_A01_ATL.htm")
    assert chart_kinds.IFR_AREA.over == ("ifr_low", "ifr_high") and chart_kinds.TAC.over == ("sec",)
    # A coverage entry may be several boxes, for a sheet across the antimeridian.
    assert chart_coverage.covers(((170.0, 50.0, 180.0, 53.0), (-180.0, 50.0, -172.0, 53.0)), (-175.0, 51.0, -174.0, 52.0))
    assert not chart_coverage.covers(((170.0, 50.0, 180.0, 53.0), (-180.0, 50.0, -172.0, 53.0)), (-160.0, 51.0, -159.0, 52.0))


def test_palette_png_keeps_the_colours_and_the_transparency():
    # A busy top half from a small palette, the way a chart tile is
    # (linework and labels over a handful of tints), and a transparent
    # bottom half.
    rng = np.random.default_rng(7)
    colours = np.array([(216, 232, 206), (0, 0, 0), (248, 248, 88), (8, 104, 136), (184, 152, 152)], np.uint8)
    rgba = np.zeros((256, 256, 4), np.uint8)
    rgba[:128, :, :3] = colours[rng.integers(0, len(colours), (128, 256))]
    rgba[:128, :, 3] = 255
    rgba[64, 64, :3] = (216, 232, 206)
    rgba[64, 15, :3] = (0, 0, 0)
    png = chart_render.encode_png(rgba)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    back = chart_render.decode_rgba(png)
    assert tuple(back[64, 64]) == (216, 232, 206, 255)
    assert tuple(back[64, 15]) == (0, 0, 0, 255)
    assert back[200, 64, 3] == 0
    assert (back[:128, :, 3] == 255).all()
    rgba_png = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(rgba_png, format="PNG")
    assert len(png) < len(rgba_png.getvalue()) / 2


def test_retina_tile_is_a_palette_png_too():
    # A 512-pixel @2x tile with resampled edges: kept as a palette PNG,
    # a quarter the bytes of full colour (encode_png).
    ramp = np.linspace(0, 255, 512, dtype=np.uint8)
    rgba = np.zeros((512, 512, 4), np.uint8)
    rgba[:, :, 0] = ramp[None, :]
    rgba[:, :, 1] = ramp[:, None]
    rgba[:, :, 2] = 200
    rgba[:, :, 3] = 255
    png = chart_render.encode_png(rgba)
    assert Image.open(io.BytesIO(png)).mode == "P"
    back = chart_render.decode_rgba(png)
    assert back.shape == (512, 512, 4)
    assert np.abs(back[:, :, :3].astype(int) - rgba[:, :, :3]).mean() < 8


def test_render_pyramid_writes_every_tile_of_every_sheet_and_composites_seams(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    left_box, right_box = (-90.0, 41.0, -88.0, 43.0), (-88.0, 41.0, -86.0, 43.0)
    monkeypatch.setitem(chart_coverage.COVERAGE, "sec", {"Left": left_box, "Right": right_box})
    _palette_raster(tmp_path / "left.tif", left_box, np.full((512, 512), 1, np.uint8))
    _palette_raster(tmp_path / "right.tif", right_box, np.full((512, 512), 2, np.uint8))
    sheets = [
        chart_sheets.Chart(
            chart_kinds.SECTIONAL,
            "Left",
            "09-03-2026",
            (chart_sheets.Raster(tmp_path / "left.tif", face=left_box, envelope=left_box),),
            "now",
        ),
        chart_sheets.Chart(
            chart_kinds.SECTIONAL,
            "Right",
            "09-03-2026",
            (chart_sheets.Raster(tmp_path / "right.tif", face=right_box, envelope=right_box),),
            "now",
        ),
    ]
    written = chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(7, 8), workers=0, charts=sheets)

    tiles = sorted(p.relative_to(tmp_path / "tiles").as_posix() for p in (tmp_path / "tiles").rglob("*.png"))
    # Zoom 7: x 32-33, y 47; zoom 8: x 64-66 (90W to 86W), y 94-95.
    assert len(tiles) == 8
    # Each sheet writes the seam tiles it shares with the other (one
    # at zoom 7, two at zoom 8), so writes outnumber files by three.
    assert written == 11
    assert "09-03-2026/sec/8/65/94.png" in tiles
    assert "09-03-2026/sec/8/64/95.png" in tiles
    assert not any(t.startswith("09-03-2026/sec/8/67/") for t in tiles)

    # The seam tile at 88W carries both sheets.
    seam = chart_render.decode_rgba((tmp_path / "tiles" / "09-03-2026" / "sec" / "8" / "65" / "94.png").read_bytes())
    west, _, east, _ = chart_grid.tile_bbox_wgs84(65, 94, 8)
    col = lambda lon: int((lon - west) / (east - west) * 256)  # noqa: E731
    assert tuple(seam[200, col(-88.3)]) == (255, 0, 0, 255)
    assert tuple(seam[200, col(-87.7)]) == (0, 0, 255, 255)
    assert seam[2, 128, 3] == 0

    record = chart_serving.pyramid_status("09-03-2026")["sec"]
    assert record["sheets"] == ["Left", "Right"] and record["finished_at"] and record["tiles"] == written
    assert record["current_pass"] is None
    assert chart_serving.pyramid_complete("09-03-2026", ("sec",))
    assert not chart_serving.pyramid_complete("09-03-2026")  # no TAC pyramid yet

    # A second run finds every tile complete and writes nothing.
    assert chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(7, 8), workers=0, charts=sheets) == 0

    # Adjacent faces that meet are no gap; a face pulled back is,
    # unless a third sheet lies over the strip between them.
    assert chart_prepare.face_gaps(sheets) == []
    apart = [
        sheets[0],
        chart_sheets.Chart(
            chart_kinds.SECTIONAL,
            "Right",
            "09-03-2026",
            (chart_sheets.Raster(tmp_path / "right.tif", face=(-87.9, 41.0, -86.0, 43.0), envelope=right_box),),
            "now",
        ),
    ]
    assert chart_prepare.face_gaps(apart) == [("left", "right", 0.1)]
    over = (-88.5, 40.5, -87.5, 43.5)
    filler = chart_sheets.Chart(
        chart_kinds.SECTIONAL, "Over", "09-03-2026", (chart_sheets.Raster(tmp_path / "over.tif", face=over, envelope=over),), "now"
    )
    assert chart_prepare.face_gaps([*apart, filler]) == []


def test_serving_cycle_is_the_newest_complete_pyramid(tmp_path, monkeypatch):
    # The records written here are in the shape from before the renderer
    # was kept, which reads as version 1: this is not about renderers.
    monkeypatch.setattr(chart_render, "RENDERER_VERSION", 1)
    monkeypatch.setattr(config, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(config, "CHARTS_DIR", tmp_path / "charts")
    monkeypatch.setattr(chart_cycle, "current_cycle", lambda *a, **k: "10-29-2026")
    monkeypatch.setattr(chart_serving, "_serving_cache", {"value": None, "at": 0.0})

    # Nothing on disk: the FAA's current cycle, rendered on demand.
    assert chart_serving.serving_cycle() == "10-29-2026"

    done = {
        "kind": "sec",
        "zooms": [3],
        "started_at": "t",
        "finished_at": "t",
        "rasters_total": 1,
        "rasters_done": 1,
        "tiles_written": 1,
        "current": None,
    }
    chart_serving.write_pyramid_status("09-03-2026", done)
    chart_serving.write_pyramid_status("10-29-2026", {**done, "finished_at": None})  # the new one, still rendering
    assert chart_serving.serving_cycle() == "09-03-2026"
    assert chart_upkeep.refresh_due()

    # Running is the refresh lock held -- not a half-written status file.
    assert not chart_upkeep.refresh_running()
    with chart_upkeep.refresh_lock() as got:
        assert got and chart_upkeep.refresh_running()
    assert not chart_upkeep.refresh_running()

    for kind in chart_kinds.KINDS:
        chart_serving.write_pyramid_status("10-29-2026", {**done, "kind": kind})
    assert chart_serving.serving_cycle() == "10-29-2026"
    assert not chart_upkeep.refresh_due()
    assert not chart_upkeep.refresh_running()

    (tmp_path / "charts" / "09-03-2026" / "sec").mkdir(parents=True)
    (tmp_path / "charts" / "10-29-2026" / "sec").mkdir(parents=True)
    removed = chart_upkeep.prune_cycles(keep="10-29-2026")
    assert sorted(removed) == ["charts/09-03-2026", "tiles/09-03-2026"]
    assert not (tmp_path / "charts" / "09-03-2026").exists()
    assert (tmp_path / "charts" / "10-29-2026").exists()
    assert not (tmp_path / "tiles" / "09-03-2026").exists()


def test_a_sectional_draws_over_the_caribbean_chart_where_they_overlap():
    # The first sheet in draw_order wins where two faces overlap. The FAA's
    # Caribbean VFR charts are drawn at 1:1,000,000, half a sectional's
    # 1:500,000 detail (FAA Aeronautical Chart User's Guide, "VFR
    # Aeronautical Charts"), so over Florida the Miami and Jacksonville
    # sectionals must draw first, and Caribbean 2 before Caribbean 1 where
    # those two overlap. Reverse name order gives that today only because
    # the names sort so; this pins it against a change of order.
    sectionals = chart_coverage.COVERAGE["sec"]
    order = chart_render.draw_order(list(sectionals))
    car1 = chart_coverage.boxes(sectionals["Caribbean_1_VFR"])
    over_car1 = {
        name
        for name, entry in sectionals.items()
        if name != "Caribbean_1_VFR" and any(chart_coverage.intersects(a, b) for a in chart_coverage.boxes(entry) for b in car1)
    }
    assert {"Miami", "Jacksonville", "Caribbean_2_VFR"} <= over_car1
    for name in ("Miami", "Jacksonville", "Caribbean_2_VFR"):
        assert order.index(name) < order.index("Caribbean_1_VFR"), name
