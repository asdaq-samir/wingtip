"""wingtip.charts: the FAA chart cycle, the tile grid, and the pyramid's tiles, serving and publishing."""

import datetime as dt
import io
import json
import re

import numpy as np
import pytest
from cachetools import TTLCache
from PIL import Image
from wingtip import charts

from .helpers import C81, _Bucket, _palette_raster


def test_cycle_arithmetic_from_the_anchor():
    assert charts.cycle_from_anchor(dt.date(2026, 9, 3)) == "09-03-2026"
    assert charts.cycle_from_anchor(dt.date(2026, 9, 20)) == "09-03-2026"
    assert charts.cycle_from_anchor(dt.date(2026, 10, 28)) == "09-03-2026"
    assert charts.cycle_from_anchor(dt.date(2026, 10, 29)) == "10-29-2026"
    assert charts.cycle_from_anchor(dt.date(2026, 7, 9)) == "07-09-2026"


def test_current_cycle_never_fetches_when_told_not_to(monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError("must not touch the network")

    monkeypatch.setattr(charts.requests, "get", boom)
    monkeypatch.setattr(charts.outside, "get", boom)
    monkeypatch.setattr(charts, "_cycle_cache", TTLCache(maxsize=1, ttl=60))
    assert charts.current_cycle(dt.date(2026, 9, 20), fetch=False) == "09-03-2026"


def test_tile_bbox_wgs84_contains_a_known_point():
    west, south, east, north = charts.tile_bbox_wgs84(65, 94, 8)
    assert west < C81[1] < east
    assert south < C81[0] < north
    assert west == pytest.approx(-88.59375)
    assert north == pytest.approx(43.0689, abs=1e-3)


def test_coverage_index_is_well_formed():
    for kind, entries in charts.COVERAGE.items():
        assert kind in charts.KINDS
        for name, entry in entries.items():
            assert re.fullmatch(r"[A-Za-z][A-Za-z0-9_\-]*", name), name
            for west, south, east, north in charts._boxes(entry):
                assert west < east and south < north, name
                assert -180 <= west and east <= 180 and 12 < south and north < 73, name
    # The route this project was built around is covered by every kind.
    here = (C81[1], C81[0], C81[1], C81[0])
    for kind in charts.KINDS:
        assert any(charts._intersects(box, here) for box in charts.COVERAGE[kind].values()), kind


def test_zip_urls_follow_each_kind_and_the_caribbean_exception():
    assert (
        charts.zip_url(charts.SECTIONAL, "Green_Bay", "09-03-2026")
        == "https://aeronav.faa.gov/visual/09-03-2026/sectional-files/Green_Bay.zip"
    )
    assert charts.zip_url(charts.TAC, "Chicago", "09-03-2026") == "https://aeronav.faa.gov/visual/09-03-2026/tac-files/Chicago_TAC.zip"
    assert charts.zip_url(charts.IFR_LOW, "enr_l12", "09-03-2026") == "https://aeronav.faa.gov/enroute/09-03-2026/enr_l12.zip"
    assert (
        charts.zip_url(charts.SECTIONAL, "Caribbean_1_VFR", "09-03-2026")
        == "https://aeronav.faa.gov/visual/09-03-2026/Caribbean/Caribbean_1_VFR.zip"
    )
    assert charts._is_chart_member(charts.SECTIONAL, "Hawaiian_Islands", "Hawaiian Islands SEC.tif")
    assert not charts._is_chart_member(charts.SECTIONAL, "Hawaiian_Islands", "Honolulu Inset SEC.tif")
    assert charts._is_chart_member(charts.SECTIONAL, "Caribbean_1_VFR", "Caribbean 1 VFR Chart.tif")
    assert not charts._is_chart_member(charts.TAC, "Chicago", "Chicago FLY.tif")
    assert charts._is_chart_member(charts.IFR_LOW, "enr_l34", "ENR_L34.tif")
    assert not charts._is_chart_member(charts.IFR_LOW, "enr_l34", "ENR_L34_BOST_INSET.tif")
    # The insets are sheets of their own, under the overlay kinds, out
    # of the zips they ride in.
    assert (
        charts.zip_url(charts.TAC, "Honolulu_Inset", "09-03-2026")
        == "https://aeronav.faa.gov/visual/09-03-2026/sectional-files/Hawaiian_Islands.zip"
    )
    assert charts._is_chart_member(charts.TAC, "Honolulu_Inset", "Honolulu Inset SEC.tif")
    assert not charts._is_chart_member(charts.TAC, "Honolulu_Inset", "Hawaiian Islands SEC.tif")
    assert charts.zip_url(charts.IFR_AREA, "enr_a02", "09-03-2026") == "https://aeronav.faa.gov/enroute/09-03-2026/enr_a02.zip"
    assert charts._is_chart_member(charts.IFR_AREA, "enr_a01", "ENR_A01_ATL.tif")
    assert not charts._is_chart_member(charts.IFR_AREA, "enr_a01", "ENR_A01_ATL.htm")
    assert charts.IFR_AREA.over == ("ifr_low", "ifr_high") and charts.TAC.over == ("sec",)
    # A coverage entry may be several boxes, for a sheet across the antimeridian.
    assert charts._covers(((170.0, 50.0, 180.0, 53.0), (-180.0, 50.0, -172.0, 53.0)), (-175.0, 51.0, -174.0, 52.0))
    assert not charts._covers(((170.0, 50.0, 180.0, 53.0), (-180.0, 50.0, -172.0, 53.0)), (-160.0, 51.0, -159.0, 52.0))


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
    png = charts.encode_png(rgba)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    back = charts._decode_rgba(png)
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
    png = charts.encode_png(rgba)
    assert Image.open(io.BytesIO(png)).mode == "P"
    back = charts._decode_rgba(png)
    assert back.shape == (512, 512, 4)
    assert np.abs(back[:, :, :3].astype(int) - rgba[:, :, :3]).mean() < 8


def test_render_pyramid_writes_every_tile_of_every_sheet_and_composites_seams(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    left_box, right_box = (-90.0, 41.0, -88.0, 43.0), (-88.0, 41.0, -86.0, 43.0)
    monkeypatch.setitem(charts.COVERAGE, "sec", {"Left": left_box, "Right": right_box})
    _palette_raster(tmp_path / "left.tif", left_box, np.full((512, 512), 1, np.uint8))
    _palette_raster(tmp_path / "right.tif", right_box, np.full((512, 512), 2, np.uint8))
    sheets = [
        charts.Chart(
            charts.SECTIONAL, "Left", "09-03-2026", (charts.Raster(tmp_path / "left.tif", face=left_box, envelope=left_box),), "now"
        ),
        charts.Chart(
            charts.SECTIONAL, "Right", "09-03-2026", (charts.Raster(tmp_path / "right.tif", face=right_box, envelope=right_box),), "now"
        ),
    ]
    written = charts.render_pyramid(charts.SECTIONAL, zooms=(7, 8), workers=0, charts=sheets)

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
    seam = charts._decode_rgba((tmp_path / "tiles" / "09-03-2026" / "sec" / "8" / "65" / "94.png").read_bytes())
    west, _, east, _ = charts.tile_bbox_wgs84(65, 94, 8)
    col = lambda lon: int((lon - west) / (east - west) * 256)  # noqa: E731
    assert tuple(seam[200, col(-88.3)]) == (255, 0, 0, 255)
    assert tuple(seam[200, col(-87.7)]) == (0, 0, 255, 255)
    assert seam[2, 128, 3] == 0

    record = charts.pyramid_status("09-03-2026")["sec"]
    assert record["sheets"] == ["Left", "Right"] and record["finished_at"] and record["tiles"] == written
    assert record["current_pass"] is None
    assert charts.pyramid_complete("09-03-2026", ("sec",))
    assert not charts.pyramid_complete("09-03-2026")  # no TAC pyramid yet

    # A second run finds every tile complete and writes nothing.
    assert charts.render_pyramid(charts.SECTIONAL, zooms=(7, 8), workers=0, charts=sheets) == 0

    # Adjacent faces that meet are no gap; a face pulled back is,
    # unless a third sheet lies over the strip between them.
    assert charts.face_gaps(sheets) == []
    apart = [
        sheets[0],
        charts.Chart(
            charts.SECTIONAL,
            "Right",
            "09-03-2026",
            (charts.Raster(tmp_path / "right.tif", face=(-87.9, 41.0, -86.0, 43.0), envelope=right_box),),
            "now",
        ),
    ]
    assert charts.face_gaps(apart) == [("left", "right", 0.1)]
    over = (-88.5, 40.5, -87.5, 43.5)
    filler = charts.Chart(charts.SECTIONAL, "Over", "09-03-2026", (charts.Raster(tmp_path / "over.tif", face=over, envelope=over),), "now")
    assert charts.face_gaps([*apart, filler]) == []


def test_serving_cycle_is_the_newest_complete_pyramid(tmp_path, monkeypatch):
    # The records written here are in the shape from before the renderer
    # was kept, which reads as version 1: this is not about renderers.
    monkeypatch.setattr(charts, "RENDERER_VERSION", 1)
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "CHARTS_DIR", tmp_path / "charts")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "10-29-2026")
    monkeypatch.setattr(charts, "_serving_cache", {"value": None, "at": 0.0})

    # Nothing on disk: the FAA's current cycle, rendered on demand.
    assert charts.serving_cycle() == "10-29-2026"

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
    charts._write_pyramid_status("09-03-2026", done)
    charts._write_pyramid_status("10-29-2026", {**done, "finished_at": None})  # the new one, still rendering
    assert charts.serving_cycle() == "09-03-2026"
    assert charts.refresh_due()

    # Running is the refresh lock held -- not a half-written status file.
    assert not charts.refresh_running()
    with charts.refresh_lock() as got:
        assert got and charts.refresh_running()
    assert not charts.refresh_running()

    for kind in charts.KINDS:
        charts._write_pyramid_status("10-29-2026", {**done, "kind": kind})
    assert charts.serving_cycle() == "10-29-2026"
    assert not charts.refresh_due()
    assert not charts.refresh_running()

    (tmp_path / "charts" / "09-03-2026" / "sec").mkdir(parents=True)
    (tmp_path / "charts" / "10-29-2026" / "sec").mkdir(parents=True)
    removed = charts.prune_cycles(keep="10-29-2026")
    assert sorted(removed) == ["charts/09-03-2026", "tiles/09-03-2026"]
    assert not (tmp_path / "charts" / "09-03-2026").exists()
    assert (tmp_path / "charts" / "10-29-2026").exists()
    assert not (tmp_path / "tiles" / "09-03-2026").exists()


def test_each_kind_goes_over_to_a_new_cycle_as_its_own_pass_finishes(tmp_path, monkeypatch):
    # The owner, 2026-10-29: the sectionals were done at 15:11 and the IFR
    # charts hours later; each kind is drawn from its own newest complete
    # pyramid, not all from the sectional's.
    monkeypatch.setattr(charts, "RENDERER_VERSION", 1)
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "CHARTS_DIR", tmp_path / "charts")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "10-29-2026")
    monkeypatch.setattr(charts, "_serving_cache", {"value": None, "at": 0.0})
    monkeypatch.setattr(charts, "_kind_serving", {})
    done = {"zooms": [3], "started_at": "t", "finished_at": "t", "rasters_total": 1, "rasters_done": 1, "tiles_written": 1, "current": None}
    monkeypatch.setattr(charts, "COVERAGE", {k: {} for k in charts.KINDS})
    for kind in charts.KINDS:
        charts._write_pyramid_status("09-03-2026", {**done, "kind": kind})
    charts._write_pyramid_status("10-29-2026", {**done, "kind": "sec"})
    charts._write_pyramid_status("10-29-2026", {**done, "kind": "ifr_low", "finished_at": None})  # still drawing
    assert charts.serving_cycle() == "10-29-2026"
    assert charts.serving_cycle_of("sec") == "10-29-2026"
    assert charts.serving_cycle_of("ifr_low") == "09-03-2026"
    assert charts.serving_cycle_of("tac") == "09-03-2026"
    # Its pass finished: over it goes.
    charts._write_pyramid_status("10-29-2026", {**done, "kind": "ifr_low"})
    assert charts.serving_cycle_of("ifr_low") == "10-29-2026"
    # A kind with no complete pyramid anywhere: the sectional's, drawn on request.
    monkeypatch.setattr(charts, "_kind_serving", {})
    for c in ("09-03-2026", "10-29-2026"):
        charts._write_pyramid_status(c, {**done, "kind": "ifr_high", "finished_at": None})
    assert charts.serving_cycle_of("ifr_high") == "10-29-2026"


def test_published_pointer_decides_the_served_cycle_in_the_cloud(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "CHART_TILES_URL", "https://d123.cloudfront.net/tiles")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "10-29-2026")
    monkeypatch.setattr(charts, "_serving_cache", {"value": None, "at": 0.0})

    class Response:
        ok = True

        def json(self):
            return {"cycle": "09-03-2026"}

    calls = []
    monkeypatch.setattr(charts.requests, "get", lambda url, **kw: calls.append(url) or Response())
    assert charts.serving_cycle() == "09-03-2026"
    assert calls == ["https://d123.cloudfront.net/tiles/serving.json"]

    # Unreachable, the planner falls back to its own disk and the FAA's cycle.
    monkeypatch.setattr(charts, "_serving_cache", {"value": None, "at": 0.0})
    monkeypatch.setattr(charts.requests, "get", lambda url, **kw: (_ for _ in ()).throw(charts.requests.ConnectionError()))
    assert charts.serving_cycle() == "10-29-2026"


def test_publish_uploads_each_archive_once_and_points_serving_at_them(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "TILE_SCALES", (1, 2))
    root = tmp_path / "tiles" / "09-03-2026"
    for key in ("sec/8/65/94.png", "sec/8/65/95.png", "sec/8/65/94@2x.png", "tac/11/522/757.png"):
        (root / key).parent.mkdir(parents=True, exist_ok=True)
        (root / key).write_bytes(b"\x89PNG" + key.encode())
    charts._write_pyramid_status(
        "09-03-2026",
        {
            "kind": "sec",
            "zooms": [8],
            "sheets": sorted(charts.COVERAGE["sec"]),
            "finished_at": "t",
            "tiles": 3,
            "current_pass": None,
            "scales": [1, 2],
        },
    )

    client = _Bucket()
    assert charts.publish("09-03-2026", "charts-bucket", prefix="tiles", client=client) == 2
    # The finished sectional packed first; the TAC, its pass not finished, stays loose and unpublished.
    assert not (root / "sec" / "8").exists() and (root / "tac/11/522/757.png").exists()
    pointer = json.loads(client.objects[("charts-bucket", "tiles/serving.json")][0])
    assert pointer["cycle"] == "09-03-2026" and pointer["kinds"] == {"sec": 3} and pointer["revision"] == 0
    names = pointer["archives"]["sec"]
    assert set(names) == {"1", "2"} and names["1"].startswith("sec-") and names["2"].startswith("sec@2x-")
    body, kind, cache = client.objects[("charts-bucket", f"tiles/09-03-2026/{names['1']}")]
    assert (kind, cache) == ("application/vnd.pmtiles", "public, max-age=2419200, immutable")
    archive = charts.tile_archive.Archive(lambda offset, length: body[offset : offset + length])
    assert archive.get(8, 65, 95) == b"\x89PNGsec/8/65/95.png" and archive.get(8, 64, 95) is None

    # A second run uploads nothing new but refreshes the pointer.
    before = len(client.objects)
    assert charts.publish("09-03-2026", "charts-bucket", prefix="tiles", client=client) == 0
    assert len(client.objects) == before
