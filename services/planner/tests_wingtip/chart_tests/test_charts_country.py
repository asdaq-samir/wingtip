"""wingtip.charts: a country of sheets, whole cycles and the high-density tiles."""

import json

import pytest
from wingtip import charts

from .helpers import LEFT, RIGHT, _backdate, _Bucket, _sheet


def test_a_cycle_missing_a_sheet_is_not_complete_so_nothing_is_published_or_pruned(two_sheet_country, monkeypatch):
    """A sheet that failed to download was simply not rendered; the pass
    finished, the cycle read complete with a hole in it, and the same
    refresh pruned the older cycle's copy of that sheet."""
    tmp_path = two_sheet_country
    charts.render_pyramid(charts.SECTIONAL, zooms=(7,), workers=0, charts=[_sheet(tmp_path, "Left", LEFT, 1)], cycle="10-29-2026")

    assert not charts.pyramid_complete("10-29-2026", ("sec",))
    assert charts.pyramid_missing("10-29-2026", "sec") == ["Right"]
    assert charts.refresh_due()
    status = charts.status()["building"] or charts.status()["pyramid"]
    assert status["sec"]["complete"] is False and status["sec"]["missing"] == ["Right"]

    published, pruned = [], []
    monkeypatch.setattr(charts, "prepare_all", lambda kinds, cycle: None)
    monkeypatch.setattr(charts, "render_pyramid", lambda kind, **kw: 0)
    monkeypatch.setattr(charts, "publish", lambda cycle, bucket, **kw: published.append(cycle))
    monkeypatch.setattr(charts, "prune_cycles", lambda keep: pruned.append(keep))
    monkeypatch.setattr(charts, "_bucket_cycle", lambda bucket, **kw: None)  # nothing published yet
    charts.refresh(kinds=("sec",), publish_bucket="bucket")
    assert published == [] and pruned == []


def test_status_counts_the_prepared_charts_of_each_kind(two_sheet_country):
    """A count per kind, any cycle, from the marker each prepared chart
    leaves: the console shows no more, and loading every chart to count
    it was most of the status endpoint's time."""
    for cycle, kind, name in [
        ("10-29-2026", "sec", "Left"),
        ("10-29-2026", "sec", "Right"),
        ("10-29-2026", "tac", "Chicago"),
        ("09-03-2026", "sec", "Left"),
        ("10-29-2026", "not_a_kind", "Stray"),
    ]:
        directory = charts.CHARTS_DIR / cycle / kind / name
        directory.mkdir(parents=True)
        (directory / charts._READY).write_text("{}")

    assert charts.status()["prepared"] == {"sec": 3, "tac": 1}


def test_refresh_renders_only_the_kinds_not_complete(two_sheet_country, monkeypatch):
    tmp_path = two_sheet_country
    charts.render_pyramid(
        charts.SECTIONAL,
        zooms=(7,),
        workers=0,
        charts=[_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)],
        cycle="10-29-2026",
    )
    assert charts.pyramid_complete("10-29-2026", ("sec",))
    rendered, prepared = [], []
    monkeypatch.setattr(charts, "prepare_all", lambda kinds, cycle: prepared.append(kinds))
    monkeypatch.setattr(charts, "render_pyramid", lambda kind, **kw: rendered.append(kind.key) or 0)

    charts.refresh(kinds=("sec", "tac"), prune=False)

    assert prepared == [("tac",)] and rendered == ["tac"]


def test_a_second_pass_never_makes_a_complete_cycle_read_unfinished(two_sheet_country, monkeypatch):
    """Every pass wrote finished_at back to None, and the map flipped to
    the older cycle until it was done."""
    tmp_path = two_sheet_country
    sheets = [_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)]
    charts.render_pyramid(charts.SECTIONAL, zooms=(7,), workers=0, charts=sheets, cycle="10-29-2026")
    (tmp_path / "tiles" / "09-03-2026").mkdir(parents=True)
    charts._write_pyramid_status(
        "09-03-2026", {"kind": "sec", "zooms": [7], "sheets": ["Left", "Right"], "finished_at": "t", "tiles": 1, "current_pass": None}
    )

    seen = []
    real_row = charts._render_row

    def row(args):
        charts._serving_cache["at"] = 0.0
        seen.append((charts.pyramid_complete("10-29-2026", ("sec",)), charts.serving_cycle()))
        return real_row(args)

    monkeypatch.setattr(charts, "_render_row", row)
    charts.render_pyramid(charts.SECTIONAL, zooms=(7,), workers=0, charts=sheets, cycle="10-29-2026")

    assert seen and all(seen_ == (True, "10-29-2026") for seen_ in seen)
    assert charts.pyramid_status("10-29-2026")["sec"]["current_pass"] is None


def test_a_record_from_before_sheets_were_kept_still_reads_as_complete(two_sheet_country):
    path = two_sheet_country / "tiles" / "10-29-2026" / "pyramid.json"
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps(
            {
                "sec": {
                    "kind": "sec",
                    "zooms": [3],
                    "started_at": "t",
                    "finished_at": "t",
                    "rasters_total": 2,
                    "rasters_done": 2,
                    "tiles_written": 7,
                    "current": None,
                }
            }
        )
    )

    assert charts.pyramid_complete("10-29-2026", ("sec",))
    assert charts.pyramid_status("10-29-2026")["sec"]["tiles"] == 7


def test_a_seam_tile_is_never_served_half_drawn(two_sheet_country, monkeypatch):
    """The served file was the pass's blend buffer: between the two
    sheets the seam tile sat on disk with one side drawn, and was
    served -- and kept by browsers for weeks -- like that."""
    tmp_path = two_sheet_country
    sheets = [_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)]
    monkeypatch.setattr(charts, "ensure_chart", lambda kind, name, cycle=None, fetch=True: {c.name: c for c in sheets}[name])
    seam = charts._tile_path(charts.SECTIONAL, "10-29-2026", 65, 94, 8)
    west, _, east, _ = charts.tile_bbox_wgs84(65, 94, 8)
    col = lambda lon: int((lon - west) / (east - west) * 256)  # noqa: E731
    between, drawn = [], []
    real_row = charts._render_row

    def row(args):
        if args[0] not in drawn:
            drawn.append(args[0])
        if len(drawn) == 2 and not between:  # the first sheet drawn, the second not begun
            between.append((seam.exists(), seam.with_suffix(".partial").exists()))
            served = charts._decode_rgba(charts.tile_png(65, 94, 8))  # drawn whole, on demand
            between.append((tuple(served[200, col(-88.3)]), tuple(served[200, col(-87.7)])))
        return real_row(args)

    monkeypatch.setattr(charts, "_render_row", row)
    charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle="10-29-2026")

    assert between == [(False, True), ((255, 0, 0, 255), (0, 0, 255, 255))]
    tile = charts._decode_rgba(seam.read_bytes())
    assert tuple(tile[200, col(-88.3)]) == (255, 0, 0, 255) and tuple(tile[200, col(-87.7)]) == (0, 0, 255, 255)
    assert not list((tmp_path / "tiles").rglob("*.partial"))


def test_the_tiles_at_the_edge_of_the_country_are_served_once_the_pass_ends(two_sheet_country):
    tmp_path = two_sheet_country
    charts.render_pyramid(
        charts.SECTIONAL,
        zooms=(8,),
        workers=0,
        charts=[_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)],
        cycle="10-29-2026",
    )
    edge = charts._decode_rgba(charts._tile_path(charts.SECTIONAL, "10-29-2026", 65, 94, 8).read_bytes())
    assert edge[2, 128, 3] == 0 and edge[200, 128, 3] == 255  # north of 43N is no sheet's
    assert len(list((tmp_path / "tiles").rglob("*.png"))) == 6
    assert not list((tmp_path / "tiles").rglob("*.partial"))


def test_a_complete_pyramid_rendered_again_writes_nothing_and_keeps_every_byte(two_sheet_country):
    """A finished tile was decoded, found wanting nothing and left -- but
    a seam tile had been quantised once per sheet, drifting each pass."""
    tmp_path = two_sheet_country
    sheets = [_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)]
    assert charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle="10-29-2026") == 8
    before = {p: p.read_bytes() for p in (tmp_path / "tiles").rglob("*.png")}

    assert charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle="10-29-2026") == 0
    assert {p: p.read_bytes() for p in (tmp_path / "tiles").rglob("*.png")} == before
    assert charts.tiles_revision("10-29-2026") == 0


def test_a_new_renderer_draws_every_tile_again_and_the_browsers_are_told(two_sheet_country, monkeypatch):
    """A change to how a tile is drawn reached only tiles not yet on
    disk: the sheet rims of 9ace720 never reached a finished cycle."""
    tmp_path = two_sheet_country
    cycle = "10-29-2026"
    sheets = [_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)]
    charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle=cycle)
    _backdate(tmp_path / "tiles")
    assert charts.pyramid_due(cycle, ("sec",)) == ()

    monkeypatch.setattr(charts, "RENDERER_VERSION", charts.RENDERER_VERSION + 1)
    assert charts.pyramid_due(cycle, ("sec",)) == ("sec",) and charts.refresh_due()
    served = []
    real_row = charts._render_row

    def row(args):
        served.append(charts.serving_cycle())
        return real_row(args)

    monkeypatch.setattr(charts, "_render_row", row)
    assert charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle=cycle) == 8

    assert set(served) == {cycle}  # the old tiles served meanwhile
    record = charts.pyramid_status(cycle)["sec"]
    assert record["renderer"] == charts.RENDERER_VERSION and record["tiles"] == 16
    assert charts.tiles_revision(cycle) == 1
    assert charts.pyramid_due(cycle, ("sec",)) == ()
    assert charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle=cycle) == 0


def test_a_pass_under_a_new_renderer_cut_short_is_resumed_not_begun_again(two_sheet_country, monkeypatch):
    tmp_path = two_sheet_country
    cycle = "10-29-2026"
    sheets = [_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)]
    charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle=cycle)
    _backdate(tmp_path / "tiles")
    monkeypatch.setattr(charts, "RENDERER_VERSION", charts.RENDERER_VERSION + 1)
    real_row = charts._render_row
    first = []

    def killed_at_the_second_sheet(args):
        if not first:
            first.append(args[0])
        if args[0] != first[0]:
            raise KeyboardInterrupt
        return real_row(args)

    monkeypatch.setattr(charts, "_render_row", killed_at_the_second_sheet)
    with pytest.raises(KeyboardInterrupt):
        charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle=cycle)
    assert charts.pyramid_complete(cycle, ("sec",)) and charts.tiles_revision(cycle) == 0

    monkeypatch.setattr(charts, "_render_row", real_row)
    assert charts.render_pyramid(charts.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle=cycle) == 4  # the second's
    assert charts.tiles_revision(cycle) == 1
    assert charts.pyramid_status(cycle)["sec"]["renderer"] == charts.RENDERER_VERSION


# ---------------------------------------------------------------------------
# The high-density ("@2x") tiles
# ---------------------------------------------------------------------------


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
