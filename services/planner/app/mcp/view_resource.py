"""The live view's page, the `ui://` resource the host renders in its
sandbox (MCP Apps, spec 2026-01-26, "UI Resource Format"): the web's own
build of it, apps/web claude-view.html, which the gateway serves with the
app (/app/claude-view.html). One file, its script and styles inlined at
build (vite.claude-view.config.ts), as the sandbox loads nothing from its
own origin; the chart's tiles are the only thing it fetches, from
Wingtip's own address, which its Content-Security-Policy names
(`_meta.ui.csp`): nothing else is allowed in (the host's "no loosening").

Read from the gateway on its compose address and kept a few minutes, so
a new web build is in the view without a planner restart."""

from __future__ import annotations

import logging
import time
from urllib.parse import urlparse

import httpx2
from mcp.server.apps import APP_MIME_TYPE
from mcp.server.mcpserver.resources import FunctionResource

from ..settings import get_settings
from .flight_view import VIEW_URI

log = logging.getLogger(__name__)

#: Where the gateway serves the web's build of the view.
VIEW_PATH = "/app/claude-view.html"
#: Seconds a page read from the gateway is kept.
KEEP_S = 300
_KEPT: dict[str, tuple[float, str]] = {}
#: The mark in the view's page (apps/web claude-view.html).
MARK = '<meta name="wingtip-view"'


#: What the host shows where the web's build is not on this server.
MISSING = (
    "<!doctype html><html><head><meta charset='utf-8'><title>Wingtip</title></head>"
    "<body style='font:15px system-ui;margin:16px'>Wingtip's live view is not built on this server: "
    "run the web's build (npm run build in apps/web). The flight is in the text of the answer.</body></html>"
)


def _origin(url: str | None) -> str | None:
    if not url:
        return None
    parts = urlparse(url)
    return f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else None


def csp() -> dict:
    """The origins the view may load from: Wingtip's own (its chart tiles,
    through the gateway) and the tiles' CDN where one serves them."""
    s = get_settings()
    origins = sorted({o for o in (_origin(s.mcp_issuer), _origin(s.chart_tiles_url)) if o})
    return {"resourceDomains": origins, "connectDomains": origins}


async def _fetched() -> httpx2.Response:
    async with httpx2.AsyncClient(base_url=get_settings().gateway_url, timeout=10) as client:
        return await client.get(VIEW_PATH)


async def page() -> str:
    """The view's page, from the gateway, or a page saying it is not built."""
    kept = _KEPT.get(VIEW_PATH)
    if kept and time.monotonic() - kept[0] < KEEP_S:
        return kept[1]
    try:
        resp = await _fetched()
    except httpx2.HTTPError as err:
        log.warning("connector view: the gateway did not answer for %s (%s)", VIEW_PATH, type(err).__name__)
        return MISSING
    # The gateway answers the app's own page for an address of the app it
    # has no file for: the view's page is known by its own mark.
    if resp.status_code != 200 or MARK not in resp.text:
        log.warning("connector view: the gateway answered %s for %s", resp.status_code, VIEW_PATH)
        return MISSING
    _KEPT[VIEW_PATH] = (time.monotonic(), resp.text)
    return resp.text


def resource() -> FunctionResource:
    """The view as the Apps extension serves it. `preferredDisplayMode`
    asks Claude to open it in the side panel by itself (Claude's own key,
    claude.com/docs/connectors/building/mcp-apps/display-modes), at the
    owner's ask for the app open beside the chat as Claude works on it."""
    return FunctionResource(
        uri=VIEW_URI,
        name="wingtip-flight",
        title="Wingtip flight",
        description="The flight being planned: the chart with the route, its points and its figures.",
        mime_type=APP_MIME_TYPE,
        meta={"ui": {"csp": csp(), "preferredDisplayMode": "fullscreen"}},
        fn=page,
    )
