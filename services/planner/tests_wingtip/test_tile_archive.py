"""A finished kind's chart tiles as one PMTiles archive per density
(wingtip.tile_archive): written whole, packed from a pass's loose files,
served at the same tile URLs -- from the disk, or from the published copy
by range requests -- and written again when tiles are drawn again."""

import pytest

from wingtip import charts, tile_archive

CYCLE = "10-29-2026"


def _tiles(*zxy):
    return [(z, x, y, len(data), lambda d=data: d) for (z, x, y), data in ((t, f"png {t}".encode()) for t in zxy)]


def test_an_archive_holds_what_was_written_and_nothing_else(tmp_path):
    path = tmp_path / "sec.pmtiles"
    assert tile_archive.write(path, _tiles((8, 65, 94), (8, 64, 94), (9, 130, 189)), {"kind": "sec"}) == 3
    archive = tile_archive.on_disk(path)
    assert archive.get(8, 65, 94) == b"png (8, 65, 94)" and archive.get(9, 130, 189) == b"png (9, 130, 189)"
    assert archive.get(8, 1, 1) is None and not archive.has(8, 1, 1) and archive.has(8, 64, 94)
    assert archive.get(3, 99, 99) is None  # off the grid: no tile, not an error
    assert sorted((z, x, y) for z, x, y, _, _ in archive.tiles()) == [(8, 64, 94), (8, 65, 94), (9, 130, 189)]
    assert archive.header["tile_type"] == tile_archive.TileType.PNG
    assert not list(tmp_path.glob("*.part"))


def test_nothing_to_write_writes_nothing(tmp_path):
    assert tile_archive.write(tmp_path / "sec.pmtiles", [], {}) == 0
    assert tile_archive.on_disk(tmp_path / "sec.pmtiles") is None


def test_a_rewritten_archive_is_read_afresh(tmp_path):
    path = tmp_path / "sec.pmtiles"
    tile_archive.write(path, _tiles((8, 65, 94)), {})
    assert tile_archive.on_disk(path).get(8, 65, 94) == b"png (8, 65, 94)"
    tile_archive.write(path, [(8, 65, 94, 3, lambda: b"new"), *_tiles((8, 66, 94))], {})
    assert tile_archive.on_disk(path).get(8, 65, 94) == b"new"


@pytest.fixture
def cache(tmp_path, monkeypatch):
    """A tile cache whose sectional pyramid is finished, at both densities."""
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "CHART_TILES_URL", None)
    monkeypatch.setattr(charts, "TILE_SCALES", (1, 2))
    monkeypatch.setattr(charts, "serving_cycle_of", lambda kind: CYCLE)
    root = tmp_path / "tiles" / CYCLE / "sec" / "8" / "65"
    root.mkdir(parents=True)
    (root / "94.png").write_bytes(b"plain")
    (root / "94@2x.png").write_bytes(b"sharp")
    (root / "95.none").touch()
    charts._write_pyramid_status(
        CYCLE,
        {
            "kind": "sec",
            "zooms": [8],
            "sheets": sorted(charts.COVERAGE["sec"]),
            "finished_at": "t",
            "tiles": 1,
            "current_pass": None,
            "scales": [1, 2],
        },
    )
    return tmp_path / "tiles"


def test_a_finished_kind_is_packed_and_served_from_its_archives(cache, monkeypatch):
    assert charts.pack_complete(CYCLE) == {"sec": 2}
    assert sorted(p.name for p in (cache / CYCLE).glob("*.pmtiles")) == ["sec.pmtiles", "sec@2x.pmtiles"]
    assert not (cache / CYCLE / "sec").exists()  # the loose files, the marker and the folders gone
    monkeypatch.setattr(charts, "rasters_covering", lambda *a, **k: pytest.fail("a packed tile is never drawn"))
    assert charts.tile_png(65, 94, 8, "sec") == b"plain"
    assert charts.tile_png(65, 94, 8, "sec", scale=2) == b"sharp"
    # Not in the archive: no tile here, as the .none marker said.
    assert charts.tile_png(65, 95, 8, "sec") is None
    assert charts.tile_cached(65, 94, 8, "sec") and not charts.tile_cached(65, 95, 8, "sec")
    # Packed again with no loose tiles: the archives stay as they are.
    assert charts.pack_complete(CYCLE) == {}
    assert charts.tile_png(65, 94, 8, "sec") == b"plain"


def test_a_kind_mid_pass_is_not_packed(cache):
    """A pass under way keeps the last finished pass's record, complete,
    beside half a pyramid of loose tiles."""
    record = charts.pyramid_status(CYCLE)["sec"]
    charts._write_pyramid_status(CYCLE, {**record, "current_pass": {"started_at": "t", "done": 0, "total": 2}})
    assert charts.pack_complete(CYCLE) == {}
    assert (cache / CYCLE / "sec" / "8" / "65" / "94.png").exists()


def test_tiles_drawn_again_go_into_the_archive_and_the_revision_moves(cache, monkeypatch):
    charts.pack_complete(CYCLE)
    tile_archive.write(cache / CYCLE / "sec.pmtiles", [*_tiles((8, 65, 94), (8, 66, 94))], {})
    drawn = {(65, 94): b"cleaned", (66, 94): None}
    monkeypatch.setattr(charts, "_rerender_tile", lambda args: drawn.get((args[2], args[3]), False))
    box = charts.tile_bbox_wgs84(65, 94, 8)
    wide = (box[0], box[1], charts.tile_bbox_wgs84(66, 94, 8)[2] - 0.01, box[3])
    # 65/94 at both densities drawn again; 66/94 drawn as nothing.
    assert charts.rerender_tiles(charts.KINDS["sec"], [wide], CYCLE, workers=0) == 2
    assert charts.tile_png(65, 94, 8, "sec") == b"cleaned"
    assert charts.tile_png(65, 94, 8, "sec", scale=2) == b"cleaned"
    assert charts.tile_png(66, 94, 8, "sec") is None  # no sheet draws it any more
    assert charts.tiles_revision(CYCLE) == 1


def test_the_published_archive_is_read_by_range_requests(cache, monkeypatch):
    charts.pack_complete(CYCLE)
    body = (cache / CYCLE / "sec.pmtiles").read_bytes()
    monkeypatch.setattr(charts, "CHART_TILES_URL", "https://d123.cloudfront.net/tiles")
    monkeypatch.setattr(charts, "_serving_cache", {"value": None, "at": 0.0})
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

    monkeypatch.setattr(charts.requests, "get", get)
    assert charts.tile_png(65, 94, 8, "sec") == b"plain"
    assert charts.tile_png(65, 95, 8, "sec") is None
    assert charts.tiles_revision(CYCLE) == 3
    assert set(asked) == {"https://d123.cloudfront.net/tiles/serving.json", f"https://d123.cloudfront.net/tiles/{CYCLE}/sec-abc.pmtiles"}
    # The header and directory once; then a tile is one request of its own bytes.
    before = len(asked)
    charts.tile_png(65, 94, 8, "sec")
    assert len(asked) == before + 1
