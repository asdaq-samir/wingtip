"""One GET, as every source here is asked: with wingtip's User-Agent
(wingtip.config.REQUEST_HEADERS, or the FAA's browser-like one where the
caller passes it), a time-out, retries for a transient failure only, and
the held copy's validators so an unchanged file is a 304."""

from __future__ import annotations

import requests
from wingtip.config import REQUEST_HEADERS
from wingtip.retry import with_retries


class FetchFailed(RuntimeError):
    """The source did not answer, timed out, or refused."""


#: The client errors that can pass: 408 Request Timeout, 429 Too Many Requests.
RETRIED_CLIENT_ERRORS = (408, 429)


def get(
    url: str, params: dict | None = None, validators: dict | None = None, retries: int = 3, headers: dict | None = None, timeout: float = 30
) -> requests.Response:
    """A transient blip (a slow query 504ing, seen 2026-09-18) is tried
    again a few seconds later rather than failing the fetch. `validators`,
    the held copy's ETag and Last-Modified, ask for it only if it has
    changed (a 304 otherwise).

    A request refused as asked (a 4xx but a time-out or too many
    requests) is not tried again: it is refused the same way each time.
    The windtemp API answered 400 on 2026-11-06, its tables discontinued
    with the NAM (NWS Service Change Notice 26-47), and three tries and
    their back-off put 6.5 s on each ask."""
    sent = {**(headers or REQUEST_HEADERS), **(validators or {})}

    def attempt() -> requests.Response:
        resp = requests.get(url, params=params or {}, headers=sent, timeout=timeout)
        status = getattr(resp, "status_code", None)
        if isinstance(status, int) and 400 <= status < 500 and status not in RETRIED_CLIENT_ERRORS:
            raise FetchFailed(f"{url} refused: {status} {str(resp.text)[:200]}")
        resp.raise_for_status()
        return resp

    return with_retries(attempt, describe=f"request to {url}", retries=retries, error=FetchFailed)


def validators_of(resp) -> dict | None:
    """What to ask the next fetch with: If-None-Match and If-Modified-Since
    from the answer's ETag and Last-Modified, where it gave them."""
    headers = getattr(resp, "headers", None)
    if headers is None:
        return None
    asked = {}
    etag, modified = headers.get("ETag"), headers.get("Last-Modified")
    if isinstance(etag, str):
        asked["If-None-Match"] = etag
    if isinstance(modified, str):
        asked["If-Modified-Since"] = modified
    return asked or None
