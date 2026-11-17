import pytest
from wingtip import charts

from .helpers import LEFT, RIGHT


@pytest.fixture(autouse=True)
def plain_tiles_only(monkeypatch):
    """The pyramid's tests count and look at its 256-pixel tiles: each
    pass draws them alone here, and the high-density ones have tests of
    their own (the "@2x" tests below), which put both back."""
    monkeypatch.setattr(charts, "TILE_SCALES", (1,))


@pytest.fixture
def two_sheet_country(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "CHARTS_DIR", tmp_path / "charts")
    monkeypatch.setattr(charts, "current_cycle", lambda *a, **k: "10-29-2026")
    monkeypatch.setattr(charts, "_serving_cache", {"value": None, "at": 0.0})
    monkeypatch.setitem(charts.COVERAGE, "sec", {"Left": LEFT, "Right": RIGHT})
    return tmp_path
