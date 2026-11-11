"""A region's chart cut out of the cycle's archives for a phone to keep
(wingtip.offline_charts), and the regions it is cut by
(wingtip.offline_regions): the sheets, the states, a drawn box."""

import pytest

from wingtip import charts, offline_charts, offline_regions, tile_archive
from wingtip.geo import tile_xy

CYCLE = "10-29-2026"


def _tile(lat, lon, z):
    x, y = tile_xy(lat, lon, z)
    return z, int(x), int(y)


# Chicago (O'Hare) and Denver at zooms 8 and 12, and Chicago at zoom 13,
# past the sectional's deepest.
ORD = [_tile(41.98, -87.90, z) for z in (8, 12)]
DEN = [_tile(39.86, -104.67, z) for z in (8, 12)]


@pytest.fixture
def cache(tmp_path, monkeypatch):
    """A cycle whose sectional archive holds tiles over Chicago and Denver."""
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path)
    tiles = [(z, x, y, 10, lambda t=(z, x, y): f"png{t}"[:10].ljust(10).encode()) for z, x, y in ORD + DEN]
    tile_archive.write(tmp_path / CYCLE / "sec.pmtiles", tiles, {"kind": "sec"})
    return tmp_path


def test_the_regions_are_the_sheets_then_the_states():
    regions = offline_regions.catalog()
    ids = [r.id for r in regions]
    assert ids.index("Chicago") < ids.index("state-WI")
    assert len([r for r in regions if r.group == "state"]) == 52  # 50, DC and Puerto Rico
    assert offline_regions.find("Twin_Cities").name == "Twin Cities"
    assert offline_regions.find("Caribbean_1_VFR").name == "Caribbean 1"
    # Alaska either side of the antimeridian, as the Census draws it.
    assert len(offline_regions.find("state-AK").boxes) == 2
    assert offline_regions.find("Nowhere") is None


def test_a_drawn_box_is_snapped_and_bounded():
    assert offline_regions.box_id(-88.3, 41.6, -87.1, 42.2) == "box_-88.5_41.5_-87_42.5"
    box = offline_regions.find("box_-88.5_41.5_-87_42.5")
    assert box.group == "box" and box.boxes == ((-88.5, 41.5, -87.0, 42.5),)
    assert offline_regions.find("box_-88.3_41.6_-87.1_42.2") is None  # not snapped: another cut of one box
    assert offline_regions.find("box_-120_25_-70_49") is None  # the country: too big for a phone at once
    assert offline_regions.find("box_-87_41.5_-88.5_42.5") is None  # west past east


def test_the_tiles_of_a_region_are_those_its_boxes_touch():
    chicago = offline_regions.find("Chicago")
    wanted = set(offline_charts.tiles(chicago, charts.SECTIONAL))
    assert set(ORD) <= wanted and not set(DEN) & wanted
    assert {z for z, _, _ in wanted} == set(range(charts.SECTIONAL.min_zoom, charts.SECTIONAL.max_zoom + 1))


def test_a_cut_holds_the_region_tiles_and_its_estimate_is_its_size(cache):
    chicago = offline_regions.find("Chicago")
    assert offline_charts.archives_of(CYCLE) == ["sec"]
    estimate = offline_charts.estimate(CYCLE, chicago, "sec")
    assert estimate["tiles"] == 2 and not estimate["exact"]
    path = offline_charts.cut(CYCLE, chicago, "sec")
    assert path == cache / CYCLE / "offline" / "Chicago" / "sec.pmtiles"
    cut = tile_archive.on_disk(path)
    assert all(cut.has(*t) for t in ORD) and not any(cut.has(*t) for t in DEN)
    assert cut.get(*ORD[1]) == tile_archive.on_disk(cache / CYCLE / "sec.pmtiles").get(*ORD[1])
    # The estimate came within a few KB of the file, and is now the file's.
    assert abs(estimate["bytes"] - path.stat().st_size) < 4096
    assert offline_charts.estimate(CYCLE, chicago, "sec") == {"tiles": 2, "bytes": path.stat().st_size, "exact": True}
    assert offline_charts.known_sizes(CYCLE, chicago) == {"sec": path.stat().st_size}
    # Kept: asked again, the same file, not cut again.
    mtime = path.stat().st_mtime_ns
    assert offline_charts.cut(CYCLE, chicago, "sec") == path and path.stat().st_mtime_ns == mtime


def test_no_tiles_or_no_archive_is_no_cut(cache):
    assert offline_charts.cut(CYCLE, offline_regions.find("state-HI"), "sec") is None
    assert offline_charts.cut(CYCLE, offline_regions.find("Chicago"), "tac") is None
    assert offline_charts.estimate(CYCLE, offline_regions.find("Chicago"), "sec@2x") is None
    assert offline_charts.cut("../etc", offline_regions.find("Chicago"), "sec") is None
    assert offline_charts.parse_archive("sec@3x") is None
    assert offline_charts.parse_archive("ifr_low@2x") == (charts.IFR_LOW, 2)


def test_the_cycles_now_and_ahead(cache, monkeypatch):
    monkeypatch.setattr(charts, "serving_cycle", lambda: CYCLE)
    assert offline_charts.cycles() == (CYCLE, None)
    tile_archive.write(cache / "12-24-2026" / "sec.pmtiles", [(8, 1, 1, 1, lambda: b"x")], {})
    monkeypatch.setattr(charts, "in_force", lambda c: c == CYCLE)
    assert offline_charts.cycles() == (CYCLE, "12-24-2026")


def test_the_packs_a_region_touches():
    index = {
        "regions": [
            {"name": "n40w092", "west": -92, "south": 40, "east": -88, "north": 44},
            {"name": "n36w108", "west": -108, "south": 36, "east": -104, "north": 40},
        ]
    }
    names = [p["name"] for p in offline_charts.packs_for(offline_regions.find("Chicago"), index)]
    assert names == ["n40w092"]
    assert offline_charts.packs_for(offline_regions.find("Chicago"), None) == []
