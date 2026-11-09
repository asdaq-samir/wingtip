"""/api/offline-charts: what a phone can keep for flying with no signal,
a region's files with their sizes, and a region's archive cut on the
first ask and fetched whole or in ranges."""
import pytest
from fastapi.testclient import TestClient
from wingtip import charts, cycle_pack, offline_charts, tile_archive, vector_tiles
from wingtip.geo import tile_xy

from app.main import app

client = TestClient(app)
CYCLE = "10-29-2026"


@pytest.fixture
def held(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path)
    monkeypatch.setattr(charts, "serving_cycle", lambda: CYCLE)
    monkeypatch.setattr(offline_charts, "warm", lambda cycle, regions: None)
    monkeypatch.setattr(vector_tiles, "tiles_index", lambda: {"name": "2026-10-29-v4-0badf00d", "bytes": 1234})
    monkeypatch.setattr(cycle_pack, "phone_index", lambda: {"cycle": "2026-10-29", "regions": [
        {"name": "n40w092", "west": -92, "south": 40, "east": -88, "north": 44, "bytes": 99}]})
    x, y = tile_xy(41.98, -87.90, 10)
    tile_archive.write(tmp_path / CYCLE / "sec@2x.pmtiles", [(10, int(x), int(y), 4, lambda: b"tile")], {})
    return tmp_path


def test_none_packed_yet_is_a_404(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path)
    monkeypatch.setattr(charts, "serving_cycle", lambda: CYCLE)
    assert client.get("/api/offline-charts").status_code == 404


def test_the_catalog(held):
    answer = client.get("/api/offline-charts")
    assert answer.status_code == 200
    body = answer.json()
    assert body["cycle"] == CYCLE and body["archives"] == ["sec@2x"] and body["next_cycle"] is None
    assert body["expires"] == "2026-12-24"   # 56 days on (the engine's data_cycle)
    assert body["overlay"] == {"name": "2026-10-29-v4-0badf00d", "bytes": 1234}
    chicago = next(r for r in body["regions"] if r["id"] == "Chicago")
    assert chicago["group"] == "sheet" and chicago["sizes"] == {}
    assert answer.headers["cache-control"] == "public, max-age=300, s-maxage=3600"


def test_a_region_files_then_its_archive(held):
    files = client.get(f"/api/offline-charts/{CYCLE}/Chicago").json()
    assert [a["archive"] for a in files["archives"]] == ["sec@2x"]
    archive = files["archives"][0]
    assert archive["tiles"] == 1 and archive["scale"] == 2 and archive["kind"] == "sec"
    assert archive["url"] == f"/api/offline-charts/{CYCLE}/Chicago/sec@2x.pmtiles"
    assert files["packs"] == [{"name": "n40w092", "bytes": 99, "url": "/api/cycle-pack/2026-10-29/n40w092.pack"}]

    whole = client.get(archive["url"])
    assert whole.status_code == 200 and whole.headers["accept-ranges"] == "bytes"
    assert whole.headers["cache-control"] == f"public, max-age={28 * 24 * 3600}, immutable"
    assert tile_archive.on_disk(held / CYCLE / "offline" / "Chicago" / "sec@2x.pmtiles") is not None
    assert client.get(archive["url"], headers={"Range": "bytes=0-126"}).status_code == 206
    # Cut, the size is the file's.
    again = client.get(f"/api/offline-charts/{CYCLE}/Chicago").json()["archives"][0]
    assert again["exact"] and again["bytes"] == len(whole.content)


def test_what_is_not_there_is_a_404(held):
    assert client.get(f"/api/offline-charts/{CYCLE}/Atlantis").status_code == 404
    assert client.get("/api/offline-charts/01-01-2020/Chicago").status_code == 404
    assert client.get(f"/api/offline-charts/{CYCLE}/Chicago/sec.pmtiles").status_code == 404
    assert client.get(f"/api/offline-charts/{CYCLE}/state-HI/sec@2x.pmtiles").status_code == 404
    assert client.get(f"/api/offline-charts/{CYCLE}/Chicago/nope.pmtiles").status_code == 404


def test_a_drawn_box(held):
    box = client.get("/api/offline-box", params={"west": -88.3, "south": 41.6, "east": -87.1, "north": 42.2}).json()
    assert box == {"id": "box_-88.5_41.5_-87_42.5"}
    assert client.get(f"/api/offline-charts/{CYCLE}/{box['id']}").json()["archives"][0]["tiles"] == 1


def test_the_gateway_forwards_them():
    paths = app.openapi()["paths"]
    for path in ("/api/offline-charts", "/api/offline-charts/{cycle}/{region}", "/api/offline-box"):
        assert paths[path]["get"]["x-gateway"] == {"access": "public", "cache": True}
    archive = paths["/api/offline-charts/{cycle}/{region}/{archive}.pmtiles"]["get"]["x-gateway"]
    assert archive["range"] and "Content-Length" in archive["headers"]
