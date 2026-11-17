"""wingtip.charts: a cycle going over to a new pass, the published pointer and the publish."""

import json

from wingtip import charts

from .helpers import _Bucket


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
