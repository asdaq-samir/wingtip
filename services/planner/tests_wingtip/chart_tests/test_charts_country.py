"""The chart modules (wingtip.charts maps them): a country of sheets, whole cycles and the high-density tiles."""

import json

import pytest
from wingtip import (
    chart_grid,
    chart_kinds,
    chart_prepare,
    chart_publish,
    chart_pyramid,
    chart_upkeep,
    chart_render,
    chart_serving,
    chart_sheets,
    chart_tiles,
    config,
)

from .helpers import LEFT, RIGHT, _backdate, _sheet


def test_a_cycle_missing_a_sheet_is_not_complete_so_nothing_is_published_or_pruned(two_sheet_country, monkeypatch):
    """A sheet that failed to download was simply not rendered; the pass
    finished, the cycle read complete with a hole in it, and the same
    refresh pruned the older cycle's copy of that sheet."""
    tmp_path = two_sheet_country
    chart_pyramid.render_pyramid(
        chart_kinds.SECTIONAL, zooms=(7,), workers=0, charts=[_sheet(tmp_path, "Left", LEFT, 1)], cycle="10-29-2026"
    )

    assert not chart_serving.pyramid_complete("10-29-2026", ("sec",))
    assert chart_serving.pyramid_missing("10-29-2026", "sec") == ["Right"]
    assert chart_upkeep.refresh_due()
    status = chart_upkeep.status()["building"] or chart_upkeep.status()["pyramid"]
    assert status["sec"]["complete"] is False and status["sec"]["missing"] == ["Right"]

    published, pruned = [], []
    monkeypatch.setattr(chart_prepare, "prepare_all", lambda kinds, cycle: None)
    monkeypatch.setattr(chart_pyramid, "render_pyramid", lambda kind, **kw: 0)
    monkeypatch.setattr(chart_publish, "publish", lambda cycle, bucket, **kw: published.append(cycle))
    monkeypatch.setattr(chart_upkeep, "prune_cycles", lambda keep: pruned.append(keep))
    monkeypatch.setattr(chart_publish, "bucket_cycle", lambda bucket, **kw: None)  # nothing published yet
    chart_upkeep.refresh(kinds=("sec",), publish_bucket="bucket")
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
        directory = config.CHARTS_DIR / cycle / kind / name
        directory.mkdir(parents=True)
        (directory / chart_sheets.READY).write_text("{}")

    assert chart_upkeep.status()["prepared"] == {"sec": 3, "tac": 1}


def test_refresh_renders_only_the_kinds_not_complete(two_sheet_country, monkeypatch):
    tmp_path = two_sheet_country
    chart_pyramid.render_pyramid(
        chart_kinds.SECTIONAL,
        zooms=(7,),
        workers=0,
        charts=[_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)],
        cycle="10-29-2026",
    )
    assert chart_serving.pyramid_complete("10-29-2026", ("sec",))
    rendered, prepared = [], []
    monkeypatch.setattr(chart_prepare, "prepare_all", lambda kinds, cycle: prepared.append(kinds))
    monkeypatch.setattr(chart_pyramid, "render_pyramid", lambda kind, **kw: rendered.append(kind.key) or 0)

    chart_upkeep.refresh(kinds=("sec", "tac"), prune=False)

    assert prepared == [("tac",)] and rendered == ["tac"]


def test_a_second_pass_never_makes_a_complete_cycle_read_unfinished(two_sheet_country, monkeypatch):
    """Every pass wrote finished_at back to None, and the map flipped to
    the older cycle until it was done."""
    tmp_path = two_sheet_country
    sheets = [_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)]
    chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(7,), workers=0, charts=sheets, cycle="10-29-2026")
    (tmp_path / "tiles" / "09-03-2026").mkdir(parents=True)
    chart_serving.write_pyramid_status(
        "09-03-2026", {"kind": "sec", "zooms": [7], "sheets": ["Left", "Right"], "finished_at": "t", "tiles": 1, "current_pass": None}
    )

    seen = []
    real_row = chart_pyramid._render_row

    def row(args):
        chart_serving._serving_cache["at"] = 0.0
        seen.append((chart_serving.pyramid_complete("10-29-2026", ("sec",)), chart_serving.serving_cycle()))
        return real_row(args)

    monkeypatch.setattr(chart_pyramid, "_render_row", row)
    chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(7,), workers=0, charts=sheets, cycle="10-29-2026")

    assert seen and all(seen_ == (True, "10-29-2026") for seen_ in seen)
    assert chart_serving.pyramid_status("10-29-2026")["sec"]["current_pass"] is None


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

    assert chart_serving.pyramid_complete("10-29-2026", ("sec",))
    assert chart_serving.pyramid_status("10-29-2026")["sec"]["tiles"] == 7


def test_a_seam_tile_is_never_served_half_drawn(two_sheet_country, monkeypatch):
    """The served file was the pass's blend buffer: between the two
    sheets the seam tile sat on disk with one side drawn, and was
    served -- and kept by browsers for weeks -- like that."""
    tmp_path = two_sheet_country
    sheets = [_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)]
    monkeypatch.setattr(chart_prepare, "ensure_chart", lambda kind, name, cycle=None, fetch=True: {c.name: c for c in sheets}[name])
    seam = chart_render.tile_path(chart_kinds.SECTIONAL, "10-29-2026", 65, 94, 8)
    west, _, east, _ = chart_grid.tile_bbox_wgs84(65, 94, 8)
    col = lambda lon: int((lon - west) / (east - west) * 256)  # noqa: E731
    between, drawn = [], []
    real_row = chart_pyramid._render_row

    def row(args):
        if args[0] not in drawn:
            drawn.append(args[0])
        if len(drawn) == 2 and not between:  # the first sheet drawn, the second not begun
            between.append((seam.exists(), seam.with_suffix(".partial").exists()))
            served = chart_render.decode_rgba(chart_tiles.tile_png(65, 94, 8))  # drawn whole, on demand
            between.append((tuple(served[200, col(-88.3)]), tuple(served[200, col(-87.7)])))
        return real_row(args)

    monkeypatch.setattr(chart_pyramid, "_render_row", row)
    chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle="10-29-2026")

    assert between == [(False, True), ((255, 0, 0, 255), (0, 0, 255, 255))]
    tile = chart_render.decode_rgba(seam.read_bytes())
    assert tuple(tile[200, col(-88.3)]) == (255, 0, 0, 255) and tuple(tile[200, col(-87.7)]) == (0, 0, 255, 255)
    assert not list((tmp_path / "tiles").rglob("*.partial"))


def test_the_tiles_at_the_edge_of_the_country_are_served_once_the_pass_ends(two_sheet_country):
    tmp_path = two_sheet_country
    chart_pyramid.render_pyramid(
        chart_kinds.SECTIONAL,
        zooms=(8,),
        workers=0,
        charts=[_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)],
        cycle="10-29-2026",
    )
    edge = chart_render.decode_rgba(chart_render.tile_path(chart_kinds.SECTIONAL, "10-29-2026", 65, 94, 8).read_bytes())
    assert edge[2, 128, 3] == 0 and edge[200, 128, 3] == 255  # north of 43N is no sheet's
    assert len(list((tmp_path / "tiles").rglob("*.png"))) == 6
    assert not list((tmp_path / "tiles").rglob("*.partial"))


def test_a_complete_pyramid_rendered_again_writes_nothing_and_keeps_every_byte(two_sheet_country):
    """A finished tile was decoded, found wanting nothing and left -- but
    a seam tile had been quantised once per sheet, drifting each pass."""
    tmp_path = two_sheet_country
    sheets = [_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)]
    assert chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle="10-29-2026") == 8
    before = {p: p.read_bytes() for p in (tmp_path / "tiles").rglob("*.png")}

    assert chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle="10-29-2026") == 0
    assert {p: p.read_bytes() for p in (tmp_path / "tiles").rglob("*.png")} == before
    assert chart_serving.tiles_revision("10-29-2026") == 0


def test_a_new_renderer_draws_every_tile_again_and_the_browsers_are_told(two_sheet_country, monkeypatch):
    """A change to how a tile is drawn reached only tiles not yet on
    disk: the sheet rims of 9ace720 never reached a finished cycle."""
    tmp_path = two_sheet_country
    cycle = "10-29-2026"
    sheets = [_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)]
    chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle=cycle)
    _backdate(tmp_path / "tiles")
    assert chart_serving.pyramid_due(cycle, ("sec",)) == ()

    monkeypatch.setattr(chart_render, "RENDERER_VERSION", chart_render.RENDERER_VERSION + 1)
    assert chart_serving.pyramid_due(cycle, ("sec",)) == ("sec",) and chart_upkeep.refresh_due()
    served = []
    real_row = chart_pyramid._render_row

    def row(args):
        served.append(chart_serving.serving_cycle())
        return real_row(args)

    monkeypatch.setattr(chart_pyramid, "_render_row", row)
    assert chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle=cycle) == 8

    assert set(served) == {cycle}  # the old tiles served meanwhile
    record = chart_serving.pyramid_status(cycle)["sec"]
    assert record["renderer"] == chart_render.RENDERER_VERSION and record["tiles"] == 16
    assert chart_serving.tiles_revision(cycle) == 1
    assert chart_serving.pyramid_due(cycle, ("sec",)) == ()
    assert chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle=cycle) == 0


def test_a_pass_under_a_new_renderer_cut_short_is_resumed_not_begun_again(two_sheet_country, monkeypatch):
    tmp_path = two_sheet_country
    cycle = "10-29-2026"
    sheets = [_sheet(tmp_path, "Left", LEFT, 1), _sheet(tmp_path, "Right", RIGHT, 2)]
    chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle=cycle)
    _backdate(tmp_path / "tiles")
    monkeypatch.setattr(chart_render, "RENDERER_VERSION", chart_render.RENDERER_VERSION + 1)
    real_row = chart_pyramid._render_row
    first = []

    def killed_at_the_second_sheet(args):
        if not first:
            first.append(args[0])
        if args[0] != first[0]:
            raise KeyboardInterrupt
        return real_row(args)

    monkeypatch.setattr(chart_pyramid, "_render_row", killed_at_the_second_sheet)
    with pytest.raises(KeyboardInterrupt):
        chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle=cycle)
    assert chart_serving.pyramid_complete(cycle, ("sec",)) and chart_serving.tiles_revision(cycle) == 0

    monkeypatch.setattr(chart_pyramid, "_render_row", real_row)
    assert chart_pyramid.render_pyramid(chart_kinds.SECTIONAL, zooms=(8,), workers=0, charts=sheets, cycle=cycle) == 4  # the second's
    assert chart_serving.tiles_revision(cycle) == 1
    assert chart_serving.pyramid_status(cycle)["sec"]["renderer"] == chart_render.RENDERER_VERSION


# ---------------------------------------------------------------------------
# The high-density ("@2x") tiles
# ---------------------------------------------------------------------------
