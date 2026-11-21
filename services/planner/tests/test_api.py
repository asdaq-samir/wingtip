"""HTTP-layer tests of the endpoints that need no group of their own: a
chart that would not read as a 502, the stock airplane profiles and the
chart tiles, against a real FastAPI TestClient. External dependencies
are mocked at the module-level names the routers call. The Dev console's
tests are in test_api_dev, the briefing's in test_api_briefing."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# --- /api/checkpoints: the chart's read failing as an HTTP status ---


def test_checkpoints_translates_a_chart_that_would_not_read_to_502(monkeypatch):
    from app import chart_model

    def unread(route, wait):
        raise RuntimeError(f"the chart along {route} could not be read: tile fetch failed")

    monkeypatch.setattr(chart_model, "corridor", unread)

    resp = client.get("/api/checkpoints", params={"dep": "C81", "dest": "KDLH"})

    assert resp.status_code == 502
    assert "could not be read" in resp.json()["detail"]


def test_aircraft_profiles_lists_the_stock_profiles():
    resp = client.get("/api/aircraft-profiles")

    assert resp.status_code == 200
    names = {p["name"]: p for p in resp.json()["profiles"]}
    assert names["c172"]["cruise_tas_kt"] == 110 and names["c172"]["type"] == "Cessna 172"
    # The same for every pilot: a browser and the CDN may keep the list.
    assert resp.headers["cache-control"] == "public, max-age=300, s-maxage=3600"


# --- /api/chart-tile ---


def test_a_chart_tile_no_sheet_covers_is_an_empty_204_kept_as_long_as_a_drawn_one(monkeypatch):
    # It was a 404: an error in the browser's console for every tile of sea
    # or Canada round the country as the planner opens.
    from wingtip import chart_tiles

    monkeypatch.setattr(chart_tiles, "tile_bytes", lambda x, y, z, kind, scale=1: None)
    empty = client.get("/api/chart-tile/sec/4/1/8.png")
    assert empty.status_code == 204 and empty.content == b""
    monkeypatch.setattr(chart_tiles, "tile_bytes", lambda x, y, z, kind, scale=1: b"\x89PNG\r\n\x1a\n")
    drawn = client.get("/api/chart-tile/sec/4/3/6.png")
    assert drawn.status_code == 200 and drawn.headers["content-type"] == "image/png"
    assert empty.headers["cache-control"] == drawn.headers["cache-control"]
    # Out of an archive packed since 2026-11-21 a tile is lossless WebP at
    # the same address, and says so.
    monkeypatch.setattr(chart_tiles, "tile_bytes", lambda x, y, z, kind, scale=1: b"RIFF\x10\x00\x00\x00WEBPVP8L")
    webp = client.get("/api/chart-tile/sec/4/3/6.png")
    assert webp.status_code == 200 and webp.headers["content-type"] == "image/webp"
    # Outside the chart's zooms, and a kind there is none of, are still 404s.
    assert client.get("/api/chart-tile/sec/2/0/0.png").status_code == 404
    assert client.get("/api/chart-tile/wac/4/3/6.png").status_code == 404


def test_a_tile_whose_published_archive_is_out_of_reach_is_a_503_no_cache_keeps(monkeypatch):
    # The ops audit, 2026-11-21: the AWS server no longer draws such a tile
    # itself (chart_tiles.TileUnavailable), and a blank kept at the edge
    # for 28 days would outlive the outage.
    from wingtip import chart_tiles

    def unavailable(x, y, z, kind, scale=1):
        raise chart_tiles.TileUnavailable("sec tile 4/3/6: its archive did not answer")

    monkeypatch.setattr(chart_tiles, "tile_png", unavailable)
    resp = client.get("/api/chart-tile/sec/4/3/6.png")
    assert resp.status_code == 503 and resp.headers["cache-control"] == "no-store"


def test_the_512_pixel_tile_is_the_same_address_with_at_2x(monkeypatch):
    from wingtip import chart_tiles

    asked = []
    png = b"\x89PNG\r\n\x1a\n"
    monkeypatch.setattr(chart_tiles, "tile_bytes", lambda x, y, z, kind, scale=1: asked.append((kind, z, x, y, scale)) or png)
    assert client.get("/api/chart-tile/sec/4/3/6@2x.png").status_code == 200
    assert client.get("/api/chart-tile/tac/11/522/757.png").status_code == 200
    assert asked == [("sec", 4, 3, 6, 2), ("tac", 11, 522, 757, 1)]
    assert client.get("/api/chart-tile/sec/4/3/6@3x.png").status_code == 422


def test_a_tile_asked_by_its_cycle_and_revision_is_immutable_and_a_bare_one_kept_half_a_cycle(monkeypatch):
    # The map's address names the cycle and revision (tileTemplate's ?c=&r=),
    # so its bytes never change: immutable, which spares Safari's reload a
    # whole tile again. A bare address, or one naming another revision,
    # keeps the half cycle it had.
    from wingtip import chart_serving, chart_tiles

    monkeypatch.setattr(chart_tiles, "tile_bytes", lambda x, y, z, kind, scale=1: b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr(chart_serving, "serving_cycle_of", lambda kind: "10-29-2026")
    monkeypatch.setattr(chart_serving, "tiles_revision", lambda cycle: 10)
    named = client.get("/api/chart-tile/sec/4/3/6@2x.png?c=10-29-2026&r=10")
    assert named.headers["cache-control"] == f"public, max-age={365 * 24 * 3600}, immutable"
    for bare in (
        "/api/chart-tile/sec/4/3/6.png",
        "/api/chart-tile/sec/4/3/6.png?c=10-29-2026&r=9",
        "/api/chart-tile/sec/4/3/6.png?c=09-03-2026&r=10",
    ):
        assert client.get(bare).headers["cache-control"] == f"public, max-age={28 * 24 * 3600}"
