"""The page's request id on every log line the planner writes while it
answers a request: the gateway passes X-Request-Id on with each call it
forwards (its RequestIdFilter and TraceHeaders), and this holds it for
the request (wingtip.log_lines.request_id), so the planner's lines are
found by the id the gateway's carry. Without tracing on (production) it
was on the request's span alone, which was not sent anywhere.

A pure ASGI middleware, so a streamed answer keeps its id to its last
line; FastAPI's sync endpoints run in a thread that is handed the same
context. An id that is not a short token is not taken: it goes into logs.
"""

from __future__ import annotations

import re

from wingtip import log_lines

HEADER = b"x-request-id"
#: The gateway's own rule (RequestIdFilter.TOKEN).
TOKEN = re.compile(r"[A-Za-z0-9._-]{1,64}")


def id_of(headers) -> str | None:
    """The request id among ASGI headers, where it is a token."""
    for name, value in headers or ():
        if name == HEADER:
            sent = value.decode("latin-1")
            return sent if TOKEN.fullmatch(sent) else None
    return None


class RequestIds:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        held = log_lines.request_id.set(id_of(scope.get("headers")))
        try:
            await self.app(scope, receive, send)
        finally:
            log_lines.request_id.reset(held)
