"""What the deployment lets in, read from its files: the production front
door (infra/server/Caddyfile) and the compose files' published ports. The
security audit of 2026-11-10 found each of these open; a change that opens
one again fails here before it is deployed."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CADDY = (ROOT / "infra/server/Caddyfile").read_text()


def test_caddy_refuses_the_internal_routes():
    # M2: the connector's records are the planner's alone.
    assert re.search(r"handle /internal/\* \{\s*respond \"Not found\" 404", CADDY)


def test_caddy_passes_on_no_forwarded_header_a_viewer_wrote():
    # L2: Spring reads Forwarded ahead of the X-Forwarded-Host Caddy sets.
    for header in ("Forwarded", "X-Forwarded-Prefix"):
        assert re.search(rf"header_up -{header}\s*$", CADDY, re.M), header


def test_no_compose_file_publishes_the_gateways_internal_port():
    # M2: 8081 is reached over the compose network alone (InternalPortConfig).
    for compose in ("docker-compose.yml", "infra/docker-compose.prod.yml", "infra/docker-compose.ci.yml"):
        assert not re.search(r":8081\b", (ROOT / compose).read_text()), compose


def _tiles_regexp() -> re.Pattern:
    match = re.search(r"@tiles \{(.*?)\n\t\}", CADDY, re.S)
    assert match, "the tiles' matcher"
    block = match[1]
    # Only CloudFront's requests, and only to read.
    assert "header X-Origin-Secret {$ORIGIN_SECRET}" in block
    assert re.search(r"method GET HEAD\s*$", block, re.M)
    return re.compile(re.search(r"path_regexp (\S+)", block)[1])


def test_caddy_hands_the_planner_its_tiles_alone():
    # audit/tiles.md #2: the map's tiles skip the gateway; nothing else of
    # the planner's may, since it trusts the gateway's X-Pilot-Id.
    tiles = _tiles_regexp()
    for path in (
        "/api/planner/chart-tile/sec/9/131/190.png",
        "/api/planner/chart-tile/ifr_low/9/131/190@2x.png",
        "/api/planner/terrain-tile/9/131/190.png",
        "/api/planner/overlay-tiles",
        "/api/planner/overlay-tiles/2026-10-29-v9-31ab0e98.pmtiles",
    ):
        assert tiles.fullmatch(path), path
    for path in (
        "/api/planner/plan",
        "/api/planner/chart",
        "/api/planner/chart-tile/sec/9/131/../../../../picks",
        "/api/planner/chart-tile/sec/9/131/190.png/../../picks",
        "/api/planner/overlay-tiles/../plan",
        "/api/planner/overlay-tilesx",
        "/api/planner/terrain-tile/9/131/190.json",
        "/internal/connector",
    ):
        assert not tiles.fullmatch(path), path


def test_caddy_sends_the_planner_no_cookie_or_pilot():
    handle = re.search(r"handle @tiles \{(.*?)\n\t\}", CADDY, re.S)[1]
    assert "reverse_proxy planner:8000" in handle
    for header in ("Cookie", "X-Pilot-Id", "X-Origin-Secret", "Forwarded", "X-Forwarded-Prefix"):
        assert re.search(rf"header_up -{header}\s*$", handle, re.M), header


def _planner_paths() -> list[re.Pattern]:
    import json

    paths = json.loads((ROOT / "services/planner/openapi.json").read_text())["paths"]
    return [re.compile(re.sub(r"\\\{[^}]+\\\}", "[^/]+", re.escape(p))) for p in paths]


def test_caddy_asks_the_planner_for_its_own_tile_addresses():
    # The security review of 2026-11-21: stripping all of /api/planner
    # asked the planner for /chart-tile/..., which it has no route for, so
    # every tile on AWS would have been a 404. The handle rewrites as the
    # gateway does (UpstreamRoutes: /api/planner/X is /api/X), and every
    # address the matcher lets through lands on one of the planner's routes.
    handle = re.search(r"handle @tiles \{(.*?)\n\t\}", CADDY, re.S)[1]
    rewrite = re.search(r"uri replace (\S+) (\S+) 1\s*$", handle, re.M)
    assert rewrite and "strip_prefix" not in handle
    routes = _planner_paths()
    for path in (
        "/api/planner/chart-tile/sec/9/131/190.png",
        "/api/planner/chart-tile/ifr_low/9/131/190@2x.png",
        "/api/planner/terrain-tile/9/131/190.png",
        "/api/planner/overlay-tiles",
        "/api/planner/overlay-tiles/2026-10-29-v9-31ab0e98.pmtiles",
    ):
        asked = path.replace(rewrite[1], rewrite[2], 1)
        assert any(route.fullmatch(asked) for route in routes), asked


def test_caddy_names_the_planner_by_a_host_it_answers():
    # The planner refuses a Host that is not one of its own (app/local_guard.py,
    # HOSTS); the origin's name passed on would make every tile a 403.
    handle = re.search(r"handle @tiles \{(.*?)\n\t\}", CADDY, re.S)[1]
    assert re.search(r"header_up Host planner\s*$", handle, re.M)
    guard = (ROOT / "services/planner/app/local_guard.py").read_text()
    assert re.search(r'HOSTS = frozenset\(\{"planner"', guard)
