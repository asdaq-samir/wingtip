"""What every connector tool does around its answer: who is asking (the
signed-in pilot, from the checked token), whether they may (the scope,
and the rate limit that keeps one connection from running up the
planner's costs), the planner's own endpoints asked in-process, and a
refusal said as what failed and what to do -- Anthropic's and OpenAI's
directory reviews both refuse a bare "Internal Server Error"
(docs/design/mcp-connector.md).

The tools ask the planner's HTTP API (GET /api/plan, POST /api/go-no-go,
...) through its ASGI app, not its routers' functions: the answers are the
ones the app and the assistant get, shaped and checked by their response
models, and only app.main imports a router (.importlinter). Each operation
is a function generated from the planner's OpenAPI document
(app.generated.planner_calls, by scripts/build/assistant_client.py, as
the assistant's own client is), which sends through planner() here."""

from __future__ import annotations

from typing import Any

import httpx2
from limits import RateLimitItemPerDay, RateLimitItemPerMinute, storage, strategies
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.mcpserver.exceptions import ToolError
from wingtip import data_cycles

from ..settings import get_settings

#: Reading the planner with the pilot's own airplanes and flights.
READ = "wingtip:read"
#: Saving a flight to the pilot's account.
WRITE = "wingtip:write"
SCOPES = [READ, WRITE]

# One process's count: the planner runs as one (docker-compose.yml, the
# AWS task); a second replica would need limits' Redis storage instead.
_WINDOW = strategies.MovingWindowRateLimiter(storage.MemoryStorage())

#: The planner's own ASGI app, set by app.main once it is built.
PLANNER: dict[str, Any] = {"app": None}
#: As long as the app's own slowest answer may take: a plan's first
#: corridor (wingtip.planning gives up and says so before this).
PLANNER_TIMEOUT_S = 120


def pilot(scope: str = READ) -> str:
    """The signed-in pilot's id, once the call is allowed: their token has
    `scope`, and they are inside MCP_CALLS_PER_MINUTE and _PER_DAY."""
    token = get_access_token()
    if token is None or not token.subject:
        raise ToolError("Not signed in to Wingtip: reconnect Wingtip in your AI app's connector settings.")
    if scope not in token.scopes:
        raise ToolError(f"This connection was not allowed {scope}: disconnect Wingtip, connect it again and approve it.")
    settings = get_settings()
    limits = (
        (RateLimitItemPerMinute(settings.mcp_calls_per_minute), "a minute"),
        (RateLimitItemPerDay(settings.mcp_calls_per_day), "a day"),
    )
    for limit, per in limits:
        if not _WINDOW.test(limit, "pilot", token.subject):
            raise ToolError(f"Wingtip answers {limit.amount} questions {per} for each pilot, and that is used up: try again later.")
    for limit, _ in limits:
        _WINDOW.hit(limit, "pilot", token.subject)
    return token.subject


def ident(value: str) -> str:
    """An identifier as the planner reads one; the generated call quotes it
    as one path segment, so a stray slash reaches no other path."""
    return value.strip().upper()


def _said(resp: httpx2.Response) -> str:
    try:
        detail = resp.json().get("detail")
    except ValueError:
        detail = None
    if isinstance(detail, list):
        # FastAPI's 422: each field, and what is wrong with it.
        return "; ".join(f"{'.'.join(str(p) for p in d.get('loc', [])[1:])}: {d.get('msg')}" for d in detail if isinstance(d, dict))
    return str(detail or resp.text[:300] or resp.status_code)


async def planner(method: str, path: str, *, query: dict | None = None, body: Any = None, headers: dict | None = None) -> Any:
    """One of the planner's endpoints, its JSON answer, or a tool error in
    its own words with what to do about it. None and "" are left out of a
    query and the headers, as the planner reads an absent field."""
    params = {k: v for k, v in (query or {}).items() if v is not None and v != ""}
    sent = {k: str(v) for k, v in (headers or {}).items() if v is not None}
    # A fault in the planner is its 500, said as one, not a raised error
    # the SDK would hide behind "Error executing tool".
    transport = httpx2.ASGITransport(app=PLANNER["app"], raise_app_exceptions=False)
    async with httpx2.AsyncClient(transport=transport, base_url="http://planner", timeout=PLANNER_TIMEOUT_S) as client:
        resp = await client.request(method, path, params=params, json=body, headers=sent)
    if resp.status_code < 400:
        return resp.json()
    said = _said(resp)
    if resp.status_code == 404:
        raise ToolError(f"{said} Check the identifier: search_airports finds one by name.")
    if resp.status_code in (400, 422):
        raise ToolError(f"Wingtip cannot do that as asked: {said}. Change it and try again.")
    if resp.status_code == 502:
        raise ToolError(f"A data source Wingtip reads is unavailable ({said}); try again in a few minutes.")
    if resp.status_code == 504:
        raise ToolError(f"{said} Ask again in a minute: the answer is being worked out and kept.")
    raise ToolError(f"Wingtip could not answer ({resp.status_code}): {said}. Try again in a minute.")


def editions(*keys: str) -> list[dict]:
    """The FAA data sets an answer rests on, with the edition held: the
    same lines the app's Status page shows (wingtip.data_cycles)."""
    return [
        {"source": f"FAA {e['name'].lower()}", "edition": e["edition"], "current": e["current"]}
        for e in data_cycles.held()
        if e["key"] in keys
    ]


def rounded(value: Any, places: int = 1) -> Any:
    """Floats to `places` decimals, through lists and dicts: how a figure is
    written is each shell's (CLAUDE.md), and the nav log's 6.8979262 nm
    reads to a model, and to the pilot it quotes, as a precision no chart
    or airplane has. The app writes them to a tenth too."""
    if isinstance(value, float):
        return round(value, places)
    if isinstance(value, dict):
        return {k: rounded(v, places) for k, v in value.items()}
    if isinstance(value, list):
        return [rounded(v, places) for v in value]
    return value


def pick(row: dict, keys) -> dict:
    """The fields of an answer a tool gives, those with a value."""
    return {k: row[k] for k in keys if row.get(k) is not None}


#: Where the live products come from, as the app credits them.
METAR_SOURCE = {"source": "NWS Aviation Weather Center (aviationweather.gov) METAR and TAF, as sent"}
NOTAM_SOURCE = {"source": "FAA NOTAM System (SWIM FNS feed), as sent; TFRs from tfr.faa.gov"}
WINDS_SOURCE = {"source": "NWS winds and temperatures aloft forecast (FB)"}
ENGINE_SOURCE = {"source": "Wingtip engine: dead reckoning, altitudes and fuel, each rule citing its 14 CFR or AIM paragraph"}
