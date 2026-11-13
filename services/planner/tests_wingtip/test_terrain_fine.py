"""wingtip.terrain_fine: the zoom-13 terrain tiles built ahead, which
tiles they are, and a tile outside them drawn from its parent, never
fetched."""

import io

import numpy as np
import pytest
from PIL import Image

from wingtip import elevation, ground_grid, terrain_fine


def _heights(png: bytes) -> np.ndarray:
    return elevation.terrarium_m(np.asarray(Image.open(io.BytesIO(png)).convert("RGB")).astype(np.float64))


# KASE, Aspen-Pitkin County/Sardy Field (NASR APT_BASE, 2026-10-29 cycle:
# 39-13-18.762N 106-52-05.64W).
KASE = (39.22187833, -106.86823333)


def test_the_tiles_round_an_airport_are_those_within_its_radius():
    tiles = terrain_fine.airport_tiles([KASE], radius_nm=5.0)
    x, y = terrain_fine._tile_of(KASE[0], KASE[1])
    assert (int(x), int(y)) in tiles
    # A zoom-13 tile is some 2 nm across here: a 5 nm circle is some 25
    # to 40 of them, not its box's 48 and more.
    assert 20 <= len(tiles) <= 45
    # None of them more than 5 nm from the field at its nearest.
    for tx, ty in tiles:
        south, west, north, east = terrain_fine._tile_bounds(tx, ty)
        lat = min(max(KASE[0], south), north)
        lon = min(max(KASE[1], west), east)
        assert np.hypot((lat - KASE[0]) * 60, (lon - KASE[1]) * 60 * np.cos(np.radians(KASE[0]))) <= 5.0


def test_steep_tiles_are_those_whose_ground_rises_the_relief_within_them(monkeypatch):
    # A small grid round KASE, 1/120 degree a cell, flat at 7,800 ft but
    # for one cell 2,000 ft higher and one no tile reached.
    monkeypatch.setattr(ground_grid, "SOUTH", 39.0)
    monkeypatch.setattr(ground_grid, "WEST", -107.0)
    high = np.full((60, 60), 7800, dtype=np.int16)
    low = high.copy()
    high[27, 16] = 9800
    high[5, 5] = low[5, 5] = ground_grid.NONE
    steep = terrain_fine.steep_tiles(high, low, relief_ft=1500)
    x, y = terrain_fine._tile_of(39.0 + 27.5 / 120, -107.0 + 16.5 / 120)
    assert steep == {(int(x), int(y))}
    assert terrain_fine.steep_tiles(high, low, relief_ft=2500) == set()


def test_a_tile_not_built_is_its_parents_quarter_drawn_larger_and_never_fetched(tmp_path, monkeypatch):
    monkeypatch.setattr(elevation, "TERRAIN_TILE_DIR", tmp_path)
    asked = []
    # The parent: its four quarters 1,000, 2,000, 3,000 and 4,000 m.
    parent = np.zeros((256, 256), dtype=np.float32)
    parent[:128, :128], parent[:128, 128:], parent[128:, :128], parent[128:, 128:] = 1000, 2000, 3000, 4000

    def tile(z, x, y):
        asked.append((z, x, y))
        assert z == 12, "a zoom-13 tile not built is not fetched"
        return parent

    monkeypatch.setattr(elevation, "_terrain_tile", tile)
    # Tile 13/(2*100+1)/(2*50+1): the parent 12/100/50's south-east quarter.
    got = _heights(terrain_fine.fine_tile_png(201, 101))
    assert asked == [(12, 100, 50)]
    assert got.shape == (256, 256)
    assert np.allclose(got, 4000)


def test_a_built_tile_is_read_from_the_store(tmp_path, monkeypatch):
    monkeypatch.setattr(elevation, "TERRAIN_TILE_DIR", tmp_path)
    elevation._TERRAIN_TILES.clear()
    rgb = np.zeros((256, 256, 3), dtype=np.uint8)
    rgb[:, :] = (138, 0, 128)  # 2,560.5 m
    path = terrain_fine.tile_path(201, 101)
    path.parent.mkdir(parents=True)
    Image.fromarray(rgb).save(path)
    assert np.allclose(_heights(terrain_fine.fine_tile_png(201, 101)), 2560.5)


@pytest.mark.parametrize("status, kept", [(200, True), (404, False)])
def test_the_build_keeps_a_tile_whole_and_skips_the_sea(tmp_path, monkeypatch, status, kept):
    monkeypatch.setattr(elevation, "TERRAIN_TILE_DIR", tmp_path)

    class Answer:
        status_code = status
        content = b"\x89PNG tile"

        def raise_for_status(self):
            pass

    class Session:
        def get(self, url, headers, timeout):
            assert url.endswith("/terrarium/13/201/101.png")
            return Answer()

    assert terrain_fine._fetch(Session(), 201, 101) is kept
    assert terrain_fine.tile_path(201, 101).exists() is kept
    assert not list(tmp_path.rglob("*.part"))
