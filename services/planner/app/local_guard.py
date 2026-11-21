"""Who may reach the planner straight, without the gateway: what is on
the planner's own machine, and no web page.

The planner publishes its port on loopback alone (docker-compose.yml's
127.0.0.1:8084) and answers without sign-in, since every pilot's
request reaches it through the gateway, which signs them in and names
the pilot (X-Pilot-Id) itself. Loopback still let a web page in, from
any site open in a browser on that machine (the security review of
2026-11-21):

- by DNS rebinding: a name of the page's own that answers 127.0.0.1
  makes the planner the page's own origin, so it may set X-Pilot-Id and
  read the answer, every pilot's checkpoint notes by counting up ids;
- by a plain form post or a no-cors fetch, which a browser sends without
  asking: the developer's bodiless POSTs, a retrain or a chart refresh,
  started from any site.

So a request names the planner by one of its own hosts (the compose
network's "planner", loopback, the tests' client), which a rebound name
is not; and a request a browser sends from another site's page (its
Origin another site's, or Sec-Fetch-Site cross-site) is refused. The
gateway's Java client, curl and the scripts send neither header; the
planner's own pages (its /docs) are same-origin.
"""

from __future__ import annotations

from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send

# The names the planner is reached by: the compose network's (the
# gateway's PLANNER_SERVICE_URL, the uptime probe), loopback (the
# container's health check, the scripts on the Mac, CI's curl), and
# Starlette's test client and the MCP connector's in-process calls.
HOSTS = frozenset({"planner", "localhost", "127.0.0.1", "::1", "testserver"})


def _host_of(value: str) -> str:
    """A Host header's name, its port taken off ("[::1]:8084" is "::1")."""
    value = value.strip().lower()
    if value.startswith("["):
        return value[1 : value.find("]")] if "]" in value else value
    return value.rsplit(":", 1)[0] if value.count(":") == 1 else value


def allows(headers: dict[str, str]) -> bool:
    """Whether a request with these (lower-cased) headers may go on."""
    host = headers.get("host", "")
    if _host_of(host) not in HOSTS:
        return False
    if headers.get("sec-fetch-site") == "cross-site":
        return False
    origin = headers.get("origin")
    if origin is None:
        return True
    # A page of the planner's own, as its /docs is: the origin's host is
    # the Host the request names. "null" (a sandboxed or file page) is not.
    name = origin.split("://", 1)[-1]
    return origin.startswith(("http://", "https://")) and name.lower() == host.strip().lower()


class LocalOnly:
    """Refuses, 403, what `allows` does not."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
            if not allows(headers):
                await PlainTextResponse("Not here: the planner is reached through the gateway.", 403)(scope, receive, send)
                return
        await self.app(scope, receive, send)
