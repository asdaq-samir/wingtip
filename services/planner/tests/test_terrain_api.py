"""/api/terrain-tile and /api/terrain/obstacles: the ground and the
obstacles the map's relief and 3D view draw (app.routers.terrain)."""

import pandas as pd
import requests
from fastapi.testclient import TestClient
from wingtip import elevation, faa_data, terrain_fine

from app.main import app

client = TestClient(app)


def test_a_terrain_tile_is_a_png_kept_a_month(monkeypatch):
    monkeypatch.setattr(elevation, "terrain_tile_png", lambda z, x, y: b"\x89PNG tile")
    got = client.get("/api/terrain-tile/11/509/758.png")
    assert got.status_code == 200
    assert got.headers["content-type"] == "image/png"
    assert got.content == b"\x89PNG tile"
    assert "max-age=2592000" in got.headers["cache-control"]


def test_no_terrain_tile_past_the_built_zoom_or_off_the_grid(monkeypatch):
    monkeypatch.setattr(elevation, "terrain_tile_png", lambda z, x, y: b"tile")
    assert client.get("/api/terrain-tile/14/0/0.png").status_code == 404
    assert client.get("/api/terrain-tile/2/4/0.png").status_code == 404


def test_a_zoom_13_tile_is_the_one_built_ahead(monkeypatch):
    monkeypatch.setattr(terrain_fine, "fine_tile_png", lambda x, y: b"\x89PNG fine %d %d" % (x, y))
    got = client.get("/api/terrain-tile/13/1707/3108.png")
    assert got.status_code == 200
    assert got.content == b"\x89PNG fine 1707 3108"


def test_a_terrain_tile_that_cannot_be_fetched_is_a_503(monkeypatch):
    def fail(z, x, y):
        raise requests.ConnectionError("offline")

    monkeypatch.setattr(elevation, "terrain_tile_png", fail)
    assert client.get("/api/terrain-tile/11/509/758.png").status_code == 503


def test_the_obstacles_in_a_box_tallest_first(monkeypatch, tmp_path):
    asked = {}

    def load(path, bbox, min_agl_ft):
        asked.update(bbox=bbox, min_agl_ft=min_agl_ft)
        return pd.DataFrame(
            [
                {"lat": 42.1, "lon": -88.2, "city": "ELGIN", "type": "TOWER", "agl_ft": 480.0, "amsl_ft": 1381.0, "lit": True},
                {"lat": 42.2, "lon": -88.1, "city": "ELGIN", "type": "BLDG", "agl_ft": 1451.0, "amsl_ft": 2073.0, "lit": False},
            ]
        )

    monkeypatch.setattr(faa_data, "ensure_nasr_file", lambda name, cache: tmp_path / name)
    monkeypatch.setattr(faa_data, "load_obstacles", load)
    got = client.get("/api/terrain/obstacles", params={"south": 41.5, "west": -88.5, "north": 42.5, "east": -87.5})
    assert got.status_code == 200
    assert asked == {"bbox": (41.5, -88.5, 42.5, -87.5), "min_agl_ft": 200}
    assert got.json() == {
        "more": False,
        "obstacles": [
            {"lat": 42.2, "lon": -88.1, "agl_ft": 1451, "amsl_ft": 2073, "type": "BLDG", "lit": False},
            {"lat": 42.1, "lon": -88.2, "agl_ft": 480, "amsl_ft": 1381, "type": "TOWER", "lit": True},
        ],
    }


def test_a_box_wider_than_a_tilted_view_is_turned_away():
    got = client.get("/api/terrain/obstacles", params={"south": 30, "west": -100, "north": 45, "east": -80})
    assert got.status_code == 422
