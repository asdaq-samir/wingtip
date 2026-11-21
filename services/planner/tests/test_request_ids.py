"""app.request_ids: the gateway's X-Request-Id held for the request, so
the planner's log lines carry it; a value that is no token is not taken."""

import asyncio

from wingtip import log_lines

from app.request_ids import RequestIds, id_of


def test_the_id_is_taken_only_where_it_is_a_token():
    assert id_of([(b"x-request-id", b"a1b2-c3")]) == "a1b2-c3"
    assert id_of([(b"x-request-id", b"two words\n")]) is None
    assert id_of([(b"accept", b"*/*")]) is None


def test_the_id_is_held_while_the_request_is_answered_and_let_go_after():
    seen = []

    async def endpoint(scope, receive, send):
        seen.append(log_lines.request_id.get())

    app = RequestIds(endpoint)
    asyncio.run(app({"type": "http", "headers": [(b"x-request-id", b"req-7")]}, None, None))
    assert seen == ["req-7"] and log_lines.request_id.get() is None
