"""A finished kind's chart tiles as one PMTiles archive per density
(wingtip.tile_archive): written whole, packed from a pass's loose files,
served at the same tile URLs -- from the disk, or from the published copy
by range requests -- and written again when tiles are drawn again."""

import io

import pytest
from PIL import Image

from wingtip import (
    chart_archives,
    chart_coverage,
    chart_grid,
    chart_kinds,
    chart_render,
    chart_rerender,
    chart_serving,
    chart_tiles,
    config,
    tile_archive,
)

CYCLE = "10-29-2026"


PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
PLAIN, SHARP, OLD, CLEANED = (10, 20, 30), (40, 50, 60), (70, 80, 90), (200, 100, 0)


def _tiles(*zxy):
    # A PNG's signature then a name: the archive keeps bytes as they come.
    return [(z, x, y, len(data), lambda d=data: d) for (z, x, y), data in ((t, PNG_MAGIC + f"png {t}".encode()) for t in zxy)]


def _png(rgb) -> bytes:
    """A small tile of one colour, a palette PNG as the pyramid draws one."""
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), rgb).quantize(256).save(buffer, format="PNG")
    return buffer.getvalue()


def _colour(tile: bytes):
    return Image.open(io.BytesIO(tile)).convert("RGB").getpixel((0, 0))


def _webp_of(rgb, tile: bytes | None) -> bool:
    """A tile packed into a chart archive: lossless WebP, the same colour."""
    return tile is not None and chart_render.is_webp(tile) and _colour(tile) == rgb


def test_an_archive_holds_what_was_written_and_nothing_else(tmp_path):
    path = tmp_path / "sec.pmtiles"
    assert tile_archive.write(path, _tiles((8, 65, 94), (8, 64, 94), (9, 130, 189)), {"kind": "sec"}) == 3
    archive = tile_archive.on_disk(path)
    assert archive.get(8, 65, 94) == PNG_MAGIC + b"png (8, 65, 94)" and archive.get(9, 130, 189) == PNG_MAGIC + b"png (9, 130, 189)"
    assert archive.get(8, 1, 1) is None and not archive.has(8, 1, 1) and archive.has(8, 64, 94)
    assert archive.get(3, 99, 99) is None  # off the grid: no tile, not an error
    assert sorted((z, x, y) for z, x, y, _, _ in archive.tiles()) == [(8, 64, 94), (8, 65, 94), (9, 130, 189)]
    assert archive.header["tile_type"] == tile_archive.TileType.PNG  # the first tile's own
    assert not list(tmp_path.glob("*.part"))


def test_a_tile_says_what_it_is():
    webp = chart_render.to_webp(_png(PLAIN))
    assert tile_archive.tile_type_of(webp) == tile_archive.TileType.WEBP and tile_archive.media_type(webp) == "image/webp"
    assert tile_archive.media_type(_png(PLAIN)) == "image/png"
    assert tile_archive.media_type(b"\xff\xd8\xff\xe0") == "image/jpeg"
    assert tile_archive.media_type(b"what") == "application/octet-stream"


def test_a_tile_as_webp_is_the_same_pixels_and_webp_is_kept_as_it_is():
    drawn = Image.new("RGBA", (256, 256), (255, 255, 255, 255))
    for i in range(0, 256, 4):  # lines and a transparent margin, as a chart's edge has
        drawn.putpixel((i, i), (200, 0, 120, 255))
        drawn.putpixel((i, 255 - i), (0, 60, 160, 255))
        drawn.putpixel((0, i), (0, 0, 0, 0))
    palette = io.BytesIO()
    drawn.quantize(256, method=Image.Quantize.FASTOCTREE).save(palette, format="PNG")
    webp = chart_render.to_webp(palette.getvalue())
    assert chart_render.is_webp(webp)
    before = Image.open(io.BytesIO(palette.getvalue())).convert("RGBA")
    after = Image.open(io.BytesIO(webp)).convert("RGBA")
    assert before.tobytes() == after.tobytes()
    assert chart_render.to_webp(webp) is webp


def test_webp_tiles_are_written_in_order_and_checked_for_length(tmp_path):
    tiles = [(9, 130, 189, 0, lambda: _png(OLD)), (8, 65, 94, 0, lambda: _png(PLAIN))]
    path = tmp_path / "sec.pmtiles"
    assert tile_archive.write(path, chart_archives.webp_tiles(tiles), {}, tile_type=tile_archive.TileType.WEBP) == 2
    archive = tile_archive.on_disk(path)
    assert archive.header["tile_type"] == tile_archive.TileType.WEBP
    assert _webp_of(PLAIN, archive.get(8, 65, 94)) and _webp_of(OLD, archive.get(9, 130, 189))


def test_nothing_to_write_writes_nothing(tmp_path):
    assert tile_archive.write(tmp_path / "sec.pmtiles", [], {}) == 0
    assert tile_archive.on_disk(tmp_path / "sec.pmtiles") is None


def test_a_rewritten_archive_is_read_afresh(tmp_path):
    path = tmp_path / "sec.pmtiles"
    tile_archive.write(path, _tiles((8, 65, 94)), {})
    assert tile_archive.on_disk(path).get(8, 65, 94) == PNG_MAGIC + b"png (8, 65, 94)"
    tile_archive.write(path, [(8, 65, 94, 3, lambda: b"new"), *_tiles((8, 66, 94))], {})
    assert tile_archive.on_disk(path).get(8, 65, 94) == b"new"


@pytest.fixture
def cache(tmp_path, monkeypatch):
    """A tile cache whose sectional pyramid is finished, at both densities."""
    monkeypatch.setattr(config, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(config, "CHART_TILES_URL", None)
    monkeypatch.setattr(chart_grid, "TILE_SCALES", (1, 2))
    monkeypatch.setattr(chart_serving, "serving_cycle_of", lambda kind: CYCLE)
    monkeypatch.setattr(chart_archives, "_pack_workers", lambda: 0)  # encoded here, not in a pool
    root = tmp_path / "tiles" / CYCLE / "sec" / "8" / "65"
    root.mkdir(parents=True)
    (root / "94.png").write_bytes(_png(PLAIN))
    (root / "94@2x.png").write_bytes(_png(SHARP))
    (root / "95.none").touch()
    chart_serving.write_pyramid_status(
        CYCLE,
        {
            "kind": "sec",
            "zooms": [8],
            "sheets": sorted(chart_coverage.COVERAGE["sec"]),
            "finished_at": "t",
            "tiles": 1,
            "current_pass": None,
            "scales": [1, 2],
        },
    )
    return tmp_path / "tiles"


def test_a_finished_kind_is_packed_and_served_from_its_archives(cache, monkeypatch):
    assert chart_archives.pack_complete(CYCLE) == {"sec": 2}
    assert sorted(p.name for p in (cache / CYCLE).glob("*.pmtiles")) == ["sec.pmtiles", "sec@2x.pmtiles"]
    assert not (cache / CYCLE / "sec").exists()  # the loose files, the marker and the folders gone
    monkeypatch.setattr(chart_tiles, "rasters_covering", lambda *a, **k: pytest.fail("a packed tile is never drawn"))
    # Packed as lossless WebP, the same pixels as the loose palette PNGs.
    assert tile_archive.on_disk(cache / CYCLE / "sec.pmtiles").header["tile_type"] == tile_archive.TileType.WEBP
    assert _webp_of(PLAIN, chart_tiles.tile_bytes(65, 94, 8, "sec"))
    assert _webp_of(SHARP, chart_tiles.tile_bytes(65, 94, 8, "sec", scale=2))
    # Not in the archive: no tile here, as the .none marker said.
    assert chart_tiles.tile_bytes(65, 95, 8, "sec") is None
    assert chart_tiles.tile_cached(65, 94, 8, "sec") and not chart_tiles.tile_cached(65, 95, 8, "sec")
    # Packed again with no loose tiles: the archives stay as they are.
    assert chart_archives.pack_complete(CYCLE) == {}
    assert _webp_of(PLAIN, chart_tiles.tile_bytes(65, 94, 8, "sec"))


def test_a_pass_over_some_zooms_keeps_the_rest_of_the_archive(cache):
    """Packed after a pass over zoom 8 alone, the archive keeps its other
    zooms' tiles, takes the new ones over the old, and drops one a
    `.none` marker now says is not there (2026-11-16: the TAC's close
    zooms were lost when its far ones were drawn)."""
    old = [(z, x, y, len(_png(OLD)), lambda: _png(OLD)) for z, x, y in ((9, 130, 189), (8, 65, 94), (8, 65, 95))]
    tile_archive.write(cache / CYCLE / "sec.pmtiles", old, {})  # a PNG archive, packed before the WebP
    assert chart_archives.pack_complete(CYCLE) == {"sec": 3}
    assert _webp_of(OLD, chart_tiles.tile_bytes(130, 189, 9, "sec"))  # another zoom: kept, now WebP
    assert _webp_of(PLAIN, chart_tiles.tile_bytes(65, 94, 8, "sec"))  # drawn again: the new one
    assert chart_tiles.tile_bytes(65, 95, 8, "sec") is None  # marked as none: dropped


def test_a_kind_mid_pass_is_not_packed(cache):
    """A pass under way keeps the last finished pass's record, complete,
    beside half a pyramid of loose tiles."""
    record = chart_serving.pyramid_status(CYCLE)["sec"]
    chart_serving.write_pyramid_status(CYCLE, {**record, "current_pass": {"started_at": "t", "done": 0, "total": 2}})
    assert chart_archives.pack_complete(CYCLE) == {}
    assert (cache / CYCLE / "sec" / "8" / "65" / "94.png").exists()


def test_tiles_drawn_again_go_into_the_archive_and_the_revision_moves(cache, monkeypatch):
    chart_archives.pack_complete(CYCLE)
    tile_archive.write(cache / CYCLE / "sec.pmtiles", [(8, x, 94, len(_png(OLD)), lambda: _png(OLD)) for x in (65, 66)], {})
    drawn = {(65, 94): _png(CLEANED), (66, 94): None}
    monkeypatch.setattr(chart_rerender, "_rerender_tile", lambda args: drawn.get((args[2], args[3]), False))
    box = chart_grid.tile_bbox_wgs84(65, 94, 8)
    wide = (box[0], box[1], chart_grid.tile_bbox_wgs84(66, 94, 8)[2] - 0.01, box[3])
    # 65/94 at both densities drawn again; 66/94 drawn as nothing.
    assert chart_rerender.rerender_tiles(chart_kinds.KINDS["sec"], [wide], CYCLE, workers=0) == 2
    assert _webp_of(CLEANED, chart_tiles.tile_bytes(65, 94, 8, "sec"))
    assert _webp_of(CLEANED, chart_tiles.tile_bytes(65, 94, 8, "sec", scale=2))
    assert chart_tiles.tile_bytes(66, 94, 8, "sec") is None  # no sheet draws it any more
    assert chart_serving.tiles_revision(CYCLE) == 1


def test_the_published_archive_is_read_by_range_requests(cache, monkeypatch):
    chart_archives.pack_complete(CYCLE)
    body = (cache / CYCLE / "sec.pmtiles").read_bytes()
    monkeypatch.setattr(config, "CHART_TILES_URL", "https://d123.cloudfront.net/tiles")
    monkeypatch.setattr(chart_serving, "_serving_cache", {"value": None, "at": 0.0})
    monkeypatch.setattr(tile_archive, "_remote", {})
    pointer = {"cycle": CYCLE, "revision": 3, "archives": {"sec": {"1": "sec-abc.pmtiles"}}}
    asked = []

    class Response:
        ok = True

        def __init__(self, url, headers):
            self.url, self.headers = url, headers or {}
            self.status_code = 206 if "Range" in self.headers else 200

        def json(self):
            return pointer

        def raise_for_status(self):
            pass

        @property
        def content(self):
            start, end = (int(v) for v in self.headers["Range"].removeprefix("bytes=").split("-"))
            return body[start : end + 1]

    def get(url, headers=None, **kw):
        asked.append(url)
        return Response(url, headers if url.endswith(".pmtiles") else None)

    monkeypatch.setattr(chart_serving.requests, "get", get)
    assert _webp_of(PLAIN, chart_tiles.tile_bytes(65, 94, 8, "sec"))
    assert chart_tiles.tile_bytes(65, 95, 8, "sec") is None
    assert chart_serving.tiles_revision(CYCLE) == 3
    assert set(asked) == {
        "https://d123.cloudfront.net/tiles/serving.json",
        "https://d123.cloudfront.net/tiles/next.json",  # a cycle staged ahead, none here
        f"https://d123.cloudfront.net/tiles/{CYCLE}/sec-abc.pmtiles",
    }
    # The header and directory once; then a tile is one request of its own bytes.
    before = len(asked)
    chart_tiles.tile_bytes(65, 94, 8, "sec")
    assert len(asked) == before + 1


def test_a_cycle_packed_as_png_is_transcoded_to_webp_once(cache):
    """The charts job's `transcode`: an archive packed before the WebP
    written again with the same pixels, its revision left alone; one
    already WebP is not touched."""
    tile_archive.write(cache / CYCLE / "sec.pmtiles", [(8, 65, 94, len(_png(OLD)), lambda: _png(OLD))], {})
    assert tile_archive.on_disk(cache / CYCLE / "sec.pmtiles").header["tile_type"] == tile_archive.TileType.PNG
    assert chart_archives.transcode(CYCLE, ("sec",), workers=1) == {"sec.pmtiles": 1}
    assert tile_archive.on_disk(cache / CYCLE / "sec.pmtiles").header["tile_type"] == tile_archive.TileType.WEBP
    assert _webp_of(OLD, chart_tiles.tile_bytes(65, 94, 8, "sec"))
    assert chart_serving.tiles_revision(CYCLE) == 0
    assert chart_archives.transcode(CYCLE, ("sec",), workers=1) == {}


def test_the_aws_server_never_draws_a_tile_its_published_archive_did_not_give(cache, monkeypatch):
    # The ops audit, 2026-11-21: a CDN or S3 outage made every tile a sheet
    # fetched and drawn on the server's two cores, starving every route.
    monkeypatch.setattr(config, "CHART_TILES_URL", "https://d123.cloudfront.net/tiles")
    monkeypatch.setattr(tile_archive, "_remote", {})
    monkeypatch.setattr(chart_tiles.chart_render, "render_tile", lambda *a: pytest.fail("drawn on the server"))
    monkeypatch.setattr(chart_tiles, "rasters_covering", lambda *a, **k: pytest.fail("sheets read on the server"))

    # The pointer unreadable: nothing published to read from.
    monkeypatch.setattr(chart_serving, "serving_pointer", lambda: {})
    with pytest.raises(chart_tiles.TileUnavailable):
        chart_tiles.tile_bytes(65, 94, 8, "sec")

    # The pointer read, the archive's bytes not.
    monkeypatch.setattr(chart_serving, "serving_pointer", lambda: {"cycle": CYCLE, "archives": {"sec": {"1": "sec-abc.pmtiles"}}})

    class Unreachable:
        def get(self, z, x, y):
            raise chart_tiles.requests.ConnectionError("CloudFront 502")

    monkeypatch.setattr(chart_tiles.tile_archive, "over_http", lambda url, session: Unreachable())
    with pytest.raises(chart_tiles.TileUnavailable):
        chart_tiles.tile_bytes(65, 94, 8, "sec")
