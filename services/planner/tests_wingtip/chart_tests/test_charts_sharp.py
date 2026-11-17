"""wingtip.charts: the sharp tiles, the scales the map may ask for and a staged pass."""

import json

from wingtip import charts

from .helpers import LEFT, RIGHT, _Bucket, _sheet


def test_a_pass_draws_each_tile_at_twice_the_pixels_beside_the_plain_one(two_sheet_country, monkeypatch):
    """A phone's 2x and 3x screens stretched the 256-pixel tile; the 512-
    pixel one of the same z/x/y is drawn from the sheet, seams and all."""
    monkeypatch.setattr(charts, "TILE_SCALES", (1, 2))
    tmp_path = two_sheet_country
    sheets = [_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)]
    assert charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle="10-29-2026") == 16

    root = tmp_path / "tiles" / "10-29-2026" / "sec" / "8"
    assert len(list(root.rglob("*@2x.png"))) == len(list(root.rglob("*.png"))) // 2 == 6
    plain = charts._decode_rgba((root / "65" / "94.png").read_bytes())
    sharp = charts._decode_rgba((root / "65" / "94@2x.png").read_bytes())
    assert plain.shape == (256, 256, 4) and sharp.shape == (512, 512, 4)
    west, _, east, _ = charts.tile_bbox_wgs84(65, 94, 8)
    col = lambda lon: int((lon - west) / (east - west) * 512)  # noqa: E731
    assert tuple(sharp[400, col(-88.3)]) == (255, 0, 0, 255) and tuple(sharp[400, col(-87.7)]) == (0, 0, 255, 255)
    assert charts.pyramid_status("10-29-2026")["sec"]["scales"] == [1, 2]
    assert charts.tile_scales("sec") == [1, 2]


def test_the_sharp_tiles_join_a_finished_pyramid_without_touching_its_own(two_sheet_country, monkeypatch):
    """The cycle being served when this lands was drawn without them: the
    map asks for none until a pass has drawn them, and a pass of them
    alone (`pyramid --scales 2`) leaves every 256-pixel tile as it was."""
    tmp_path = two_sheet_country
    sheets = [_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)]
    charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle="10-29-2026")
    before = {p: p.read_bytes() for p in (tmp_path / "tiles").rglob("*.png")}
    assert charts.tile_scales("sec") == [1]

    monkeypatch.setattr(charts, "TILE_SCALES", (1, 2))
    assert charts.tile_scales("sec") == [1]
    assert charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle="10-29-2026", scales=(2,)) == 8
    assert {p: p.read_bytes() for p in before} == before
    assert charts.tile_scales("sec") == [1, 2]
    assert charts.tiles_revision("10-29-2026") == 0  # new names: nothing a browser holds is stale


def test_a_sharp_tile_is_drawn_on_request_and_a_scale_never_drawn_is_none(two_sheet_country, monkeypatch):
    monkeypatch.setattr(charts, "TILE_SCALES", (1, 2))
    tmp_path = two_sheet_country
    sheets = {c.name: c for c in (_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2))}
    monkeypatch.setattr(charts, "ensure_chart", lambda kind, name, cycle=None, fetch=True: sheets[name])

    sharp = charts._decode_rgba(charts.tile_png(64, 94, 8, "sec", scale=2))
    assert sharp.shape == (512, 512, 4) and tuple(sharp[256, 256]) == (255, 0, 0, 255)
    assert charts._tile_path(charts.SECTIONAL, "10-29-2026", 64, 94, 8, 2).name == "94@2x.png"
    assert charts._tile_path(charts.SECTIONAL, "10-29-2026", 64, 94, 8, 2).exists()
    assert charts.tile_png(64, 94, 8, "sec", scale=3) is None


def test_the_published_pointer_says_which_scales_the_map_may_ask_for(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "CHART_TILES_URL", "https://d123.cloudfront.net/tiles")
    pointers = [{"cycle": "10-29-2026"}, {"cycle": "12-24-2026", "scales": {"sec": [1, 2], "tac": [1]}}]

    class Response:
        ok = True

        def json(self):
            return pointers[0]

    monkeypatch.setattr(charts.requests, "get", lambda url, **kw: Response())
    # A cycle published before there were any: the plain tiles alone.
    monkeypatch.setattr(charts, "_serving_cache", {"value": None, "at": 0.0})
    assert charts.tile_scales("sec") == [1]
    pointers.pop(0)
    monkeypatch.setattr(charts, "_serving_cache", {"value": None, "at": 0.0})
    assert charts.serving_cycle() == "12-24-2026"
    assert charts.tile_scales("sec") == [1, 2] and charts.tile_scales("tac") == [1]
    assert charts.tile_scales("ifr_low") == [1]

    # And publish writes them there, from each kind's record.
    monkeypatch.setattr(charts, "CHART_TILES_URL", None)
    charts._write_pyramid_status(
        "12-24-2026", {"kind": "sec", "zooms": [8], "sheets": [], "finished_at": "t", "tiles": 0, "current_pass": None, "scales": [1, 2]}
    )

    client = _Bucket()
    charts.publish("12-24-2026", "bucket", prefix="tiles", client=client)
    assert json.loads(client.objects[("bucket", "tiles/serving.json")][0])["scales"] == {"sec": [1, 2]}


def test_a_staged_pass_writes_where_it_was_told_from_its_worker_processes(two_sheet_country, monkeypatch):
    """Python 3.14 starts the workers by forkserver, which imports this
    module afresh: the staging folder `--tiles-dir` sets was not in the
    workers', and a staged pass wrote into the served cache."""
    tmp_path = two_sheet_country
    staging = tmp_path / "staging"
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", staging)
    sheets = [_sheet(tmp_path, "Left", LEFT, 1)]
    assert charts.render_pyramid(charts.SECTIONAL, zooms=(7,), workers=1, charts=sheets, cycle="10-29-2026") > 0
    assert list(staging.rglob("*.png")) and not (tmp_path / "tiles").exists()
