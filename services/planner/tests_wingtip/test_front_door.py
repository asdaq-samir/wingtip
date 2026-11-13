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
