"""wingtip.charts: a refresh, the tile cache, writing a tile safely, and the pyramid workers' memory."""

import io
import json

import numpy as np
import pytest
from wingtip import charts

from .helpers import _palette_raster


def test_refresh_prepares_renders_and_prunes_only_when_complete(tmp_path, monkeypatch):
    # The records written here are in the shape from before the renderer
    # was kept, which reads as version 1: this is not about renderers.
    monkeypatch.setattr(charts, "RENDERER_VERSION", 1)
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "CHARTS_DIR", tmp_path / "charts")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "10-29-2026")
    monkeypatch.setattr(charts, "_serving_cache", {"value": None, "at": 0.0})
    calls = []
    monkeypatch.setattr(charts, "prepare_all", lambda kinds, cycle: calls.append(("prepare", kinds, cycle)))

    def fake_render(kind, workers=2, cycle=None, **kw):
        calls.append(("render", kind.key, cycle))
        charts._write_pyramid_status(
            cycle,
            {
                "kind": kind.key,
                "zooms": [],
                "started_at": "t",
                "finished_at": "t",
                "rasters_total": 0,
                "rasters_done": 0,
                "tiles_written": 0,
                "current": None,
            },
        )
        return 0

    monkeypatch.setattr(charts, "render_pyramid", fake_render)
    (tmp_path / "tiles" / "09-03-2026").mkdir(parents=True)

    assert charts.refresh(workers=1) == "10-29-2026"
    assert calls == [("prepare", tuple(charts.KINDS), "10-29-2026")] + [("render", k, "10-29-2026") for k in charts.KINDS]
    assert not (tmp_path / "tiles" / "09-03-2026").exists()  # pruned once the new cycle was complete
    calls.clear()
    assert charts.refresh(workers=1) == "10-29-2026"
    assert calls == []  # already complete: nothing to do


def test_a_refresh_publishing_to_a_bucket_asks_the_bucket_whether_the_cycle_is_done(tmp_path, monkeypatch):
    # The AWS task's disk is empty every morning; the bucket's pointer,
    # not the disk, says whether the FAA's cycle still has to be drawn.
    monkeypatch.setattr(charts, "RENDERER_VERSION", 1)
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "CHARTS_DIR", tmp_path / "charts")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "10-29-2026")
    calls = []
    monkeypatch.setattr(charts, "prepare_all", lambda kinds, cycle: calls.append("prepare"))

    def fake_render(kind, workers=2, cycle=None, **kw):
        charts._write_pyramid_status(
            cycle,
            {
                "kind": kind.key,
                "zooms": [],
                "started_at": "t",
                "finished_at": "t",
                "rasters_total": 0,
                "rasters_done": 0,
                "tiles_written": 0,
                "current": None,
            },
        )
        return 0

    monkeypatch.setattr(charts, "render_pyramid", fake_render)
    monkeypatch.setattr(charts, "publish", lambda cycle, bucket, **kw: calls.append(("publish", cycle, bucket)))

    class Bucket:
        class exceptions:
            class NoSuchKey(Exception):
                pass

        def __init__(self, cycle):
            self.cycle = cycle

        def get_object(self, Bucket, Key):
            assert (Bucket, Key) == ("charts-bucket", "tiles/serving.json")
            if self.cycle is None:
                raise self.exceptions.NoSuchKey()
            return {"Body": io.BytesIO(json.dumps({"cycle": self.cycle}).encode())}

    assert charts.refresh(publish_bucket="charts-bucket", client=Bucket("10-29-2026"), prune=False) == "10-29-2026"
    assert calls == []  # published already: nothing drawn

    for published in ("09-03-2026", None):  # the cycle before, or nothing yet
        monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / f"tiles-{published}")  # a morning's empty disk
        calls.clear()
        charts.refresh(publish_bucket="charts-bucket", client=Bucket(published), prune=False)
        assert calls == ["prepare", ("publish", "10-29-2026", "charts-bucket")]


def test_tile_png_caches_the_render_and_remembers_empty_tiles(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "09-03-2026")
    box = (-90.0, 41.0, -86.0, 43.0)
    _palette_raster(tmp_path / "sheet.tif", box, np.full((256, 256), 1, np.uint8))
    raster = charts.Raster(tmp_path / "sheet.tif", face=box, envelope=box)
    calls = []

    def covering(kind, bbox, cycle=None):
        calls.append(bbox)
        return ([raster] if charts._intersects(box, bbox) else []), True

    monkeypatch.setattr(charts, "rasters_covering", covering)

    first = charts.tile_png(65, 94, 8, "sec")
    assert first and first[:8] == b"\x89PNG\r\n\x1a\n"
    assert charts.tile_cached(65, 94, 8, "sec")
    monkeypatch.setattr(charts, "render_tile", lambda *a: pytest.fail("cached tiles are not re-rendered"))
    assert charts.tile_png(65, 94, 8, "sec") == first
    assert len(calls) == 1

    assert charts.tile_png(65, 80, 8, "sec") is None
    assert (tmp_path / "tiles" / "09-03-2026" / "sec" / "8" / "65" / "80.none").exists()
    assert charts.tile_png(65, 80, 8, "sec") is None
    assert len(calls) == 2

    assert charts.tile_png(65, 94, 20, "sec") is None  # past the chart's own zoom range

    image = charts.tile_image(65, 94, 8, "sec")
    assert image is not None and image.mode == "RGB"
    assert image.getpixel((128, 200)) == (255, 0, 0)


def test_a_tile_sends_for_a_missing_sheet_only_where_tiles_may_fetch(tmp_path, monkeypatch):
    """CHARTS_FETCH_FOR_TILES=0 (CI's): a tile draws on the sheets on
    disk, downloads none and makes nothing on disk, and says it is not
    whole so it is not cached as if it were. Where tiles may fetch (the
    default) the same tile sends for every sheet under it."""
    monkeypatch.setattr(charts, "CHARTS_DIR", tmp_path / "charts")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "09-03-2026")
    monkeypatch.setattr(charts, "_failed", {})
    downloads = []

    def download(kind, name, cycle):
        downloads.append((kind.key, name))
        raise charts.requests.ConnectionError("the FAA is not asked in a test")

    monkeypatch.setattr(charts, "_download_and_prepare", download)
    chicago = charts.COVERAGE["sec"]["Chicago"]

    monkeypatch.setattr(charts, "FETCH_FOR_TILES", False)
    assert charts.rasters_covering(charts.KINDS["sec"], chicago) == ([], False)
    assert downloads == []
    assert not (tmp_path / "charts").exists()

    monkeypatch.setattr(charts, "FETCH_FOR_TILES", True)
    assert charts.rasters_covering(charts.KINDS["sec"], chicago) == ([], False)
    assert ("sec", "Chicago") in downloads


def test_a_tile_missing_a_sheet_is_left_blank_where_tiles_do_not_fetch(tmp_path, monkeypatch):
    """Where tiles do not fetch (CI), a tile that would need a sheet not
    on disk is not drawn from part of what it needs: never whole, it was
    never cached, and was drawn again on every request. Where they fetch,
    it is drawn from what there is, and still not cached."""
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "09-03-2026")
    monkeypatch.setattr(charts, "_serving_cache", {"value": None, "at": 0.0})
    box = (-90.0, 41.0, -86.0, 43.0)
    _palette_raster(tmp_path / "sheet.tif", box, np.full((256, 256), 1, np.uint8))
    raster = charts.Raster(tmp_path / "sheet.tif", face=box, envelope=box)
    monkeypatch.setattr(charts, "rasters_covering", lambda kind, bbox, cycle=None: ([raster], False))
    render = charts.render_tile

    monkeypatch.setattr(charts, "FETCH_FOR_TILES", False)
    monkeypatch.setattr(charts, "render_tile", lambda *a: pytest.fail("a tile missing a sheet is not drawn here"))
    assert charts.tile_png(65, 94, 8, "sec") is None

    monkeypatch.setattr(charts, "FETCH_FOR_TILES", True)
    monkeypatch.setattr(charts, "render_tile", render)
    assert charts.tile_png(65, 94, 8, "sec")[:8] == b"\x89PNG\r\n\x1a\n"
    assert not charts.tile_cached(65, 94, 8, "sec")


def test_two_threads_writing_one_tile_use_two_temp_files(tmp_path, monkeypatch):
    """Named by process only, two request threads rendering the same tile
    shared one temp file."""
    import threading

    from wingtip import charts

    names = []
    real_write = type(tmp_path).write_bytes
    barrier = threading.Barrier(2)

    def recording_write(self, data):
        names.append(self.name)
        barrier.wait(5)  # both temp files exist before either is renamed
        return real_write(self, data)

    monkeypatch.setattr(type(tmp_path), "write_bytes", recording_write)
    tile = tmp_path / "7.png"
    threads = [threading.Thread(target=charts._write_atomically, args=(tile, b"png" * n)) for n in (1, 2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(5)

    assert len(set(names)) == 2
    assert tile.read_bytes() in (b"png", b"pngpng")


def test_the_revision_is_written_whole(tmp_path, monkeypatch):
    """Written in place, a run killed mid-write left a file that read as
    no revision at all."""
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    written = []
    real_write = charts._write_atomically
    monkeypatch.setattr(charts, "_write_atomically", lambda path, data: written.append(path.name) or real_write(path, data))

    charts._bump_revision("09-03-2026")

    assert written == [charts._TILES_REVISION]
    assert charts.tiles_revision("09-03-2026") == 1


GB = 2**30


def test_pyramid_workers_fit_the_memory_there_is():
    # The pass that was killed: high-density tiles in a 12 GB Docker VM.
    # Two fit where three did not; the 1x tiles take more.
    assert charts.pyramid_workers((1, 2), 11 * GB, 12) == 2
    assert charts.pyramid_workers((1,), 11 * GB, 12) == 6
    # Never more than the CPUs, never fewer than one.
    assert charts.pyramid_workers((1,), 64 * GB, 4) == 4
    assert charts.pyramid_workers((2,), 2 * GB, 12) == 1
    assert charts.pyramid_workers((2,), 0, None) == 1
    # Memory that cannot be read: the old default of four.
    assert charts.pyramid_workers((2,), None, 12) == 4


def test_available_memory_reads_the_containers_limit(tmp_path):
    cgroup = tmp_path / "sys/fs/cgroup"
    cgroup.mkdir(parents=True)
    (cgroup / "memory.max").write_text(f"{12 * GB}\n")
    (cgroup / "memory.current").write_text(f"{2 * GB}\n")
    (tmp_path / "proc").mkdir()
    (tmp_path / "proc/meminfo").write_text(f"MemTotal: 16000000 kB\nMemAvailable: {14 * GB // 1024} kB\n")
    assert charts.available_memory(tmp_path) == 10 * GB
    # No limit on the cgroup: the kernel's MemAvailable.
    (cgroup / "memory.max").write_text("max\n")
    assert charts.available_memory(tmp_path) == 14 * GB
    (tmp_path / "proc/meminfo").unlink()
    assert charts.available_memory(tmp_path) is None
