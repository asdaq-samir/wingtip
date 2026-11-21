"""The outside data's terms, read from the deployment's files and the
credits (docs/legal/credits.md): a source whose terms allow only personal
use stays off in production, and every source whose licence asks for a
credit has one. The licences audit of 2026-11-21 found ADS-B Exchange's
personal-use plan on in production and Terrain Tiles', OpenStreetMap's
and the time zones' credits missing; a change that brings either back
fails here."""

import re
from pathlib import Path

from wingtip import elevation, ground_grid, nearby

ROOT = Path(__file__).resolve().parents[3]
PROD = (ROOT / "infra/docker-compose.prod.yml").read_text()
CREDITS = (ROOT / "docs/legal/credits.md").read_text()


def credit_rows() -> list[list[str]]:
    """credits.md's table rows, each its cells, the header rows left out."""
    rows = [line for line in CREDITS.splitlines() if line.startswith("| ") and not line.startswith("| Credit |")]
    return [[cell.strip() for cell in row.split("|")[1:-1]] for row in rows]


def test_personal_use_traffic_is_off_in_production():
    # adsb.fi's open data is "for personal, non-commercial use only"
    # (github.com/adsbfi/opendata); ADS-B Exchange's RapidAPI plan is its
    # personal-use one, and JETNET's terms (2(d)) let no API account show
    # its data to anyone not their subscriber.
    assert re.findall(r"ADSBFI_OPEN_DATA: (\S+)", PROD) and set(re.findall(r"ADSBFI_OPEN_DATA: (\S+)", PROD)) == {'"0"'}
    assert re.findall(r"ADSBX_RAPIDAPI_KEY: (\S+)", PROD) == ['""']


def test_every_source_whose_licence_asks_is_credited():
    rows = credit_rows()

    def credited(start: str, terms: str) -> bool:
        return any(row[0].startswith(start) and row[1] == terms for row in rows)

    # The terrain the altitudes and the map's relief are drawn from: Terrain
    # Tiles' attribution list (github.com/tilezen/joerd, docs/attribution.md).
    assert "elevation-tiles-prod" in elevation.TERRAIN_TILE_URL and "elevation-tiles-prod" in ground_grid.TILE_URL
    assert credited("Terrain Tiles (Mapzen and others)", "Each source's terms, credited")
    # Overture's base theme is OpenStreetMap's (ODbL 4.3), its places partly
    # Foursquare's (Apache 2.0).
    assert "theme=base/type=infrastructure" in Path(nearby.__file__).read_text()
    assert credited("OpenStreetMap contributors: airport outlines", "ODbL 1.0")
    assert credited("Overture Maps places", "CDLA Permissive 2.0 and Apache 2.0")
    # tzfpy carries timezone-boundary-builder's data, ODbL.
    assert "tzfpy" in (ROOT / "services/planner/requirements-wingtip.txt").read_text()
    assert credited("Time zones: timezone-boundary-builder", "ODbL 1.0")
    # A Commons photo is credited with its author, its licence and its page.
    assert credited("Wikimedia Commons photos of fields", "Each photo's own licence")


def test_adsb_lol_is_asked_with_its_key_and_left_alone_while_its_quota_is_spent(monkeypatch):
    # adsb.lol's API page (read 2026-11-21): a key in x-api-key raises an
    # address's 500 requests a day; over quota is a 429 with Retry-After.
    from types import SimpleNamespace

    from wingtip.config import get_settings
    from wingtip.traffic import common

    monkeypatch.setenv("ADSBLOL_API_KEY", "a-key")
    get_settings.cache_clear()
    try:
        assert common.lol_headers()["x-api-key"] == "a-key"
        assert common.lol_headers()["User-Agent"] == common.HEADERS["User-Agent"]
        monkeypatch.setenv("ADSBLOL_API_KEY", "")
        get_settings.cache_clear()
        assert "x-api-key" not in common.lol_headers()
    finally:
        monkeypatch.delenv("ADSBLOL_API_KEY")
        get_settings.cache_clear()
    assert common.refused_for_s(SimpleNamespace(status_code=429, headers={"Retry-After": "5400"})) == 5400.0
    assert common.refused_for_s(SimpleNamespace(status_code=429, headers={})) == common.QUOTA_WAIT_S
    assert common.refused_for_s(SimpleNamespace(status_code=503, headers={"Retry-After": "60"})) == 0.0
    assert re.findall(r"ADSBLOL_API_KEY: (\S+)", PROD) == ["${ADSBLOL_API_KEY:-}"]
