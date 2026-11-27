"""One GET, as every source here is asked: with wingtip's User-Agent
(wingtip.config.REQUEST_HEADERS, or the FAA's browser-like one where the
caller passes it), a time-out, and the held copy's validators so an
unchanged file is a 304; through wingtip.outside's shared session, which
asks again on a dropped connection, a 429 and a 502 to 504, so this module
keeps no retry loop of its own (it had one, tenacity's, around the
session's, round-3 audit 2026-11-27)."""

from __future__ import annotations

import requests
from wingtip import outside
from wingtip.config import REQUEST_HEADERS


class FetchFailed(RuntimeError):
    """The source did not answer, timed out, or refused."""


def get(
    url: str, params: dict | None = None, validators: dict | None = None, headers: dict | None = None, timeout: float = 30
) -> requests.Response:
    """The source's answer; FetchFailed where it did not answer, timed out
    or refused once outside's session had asked again. `validators`, the
    held copy's ETag and Last-Modified, ask for it only if it has changed
    (a 304 otherwise).

    A request refused as asked (a 4xx) is refused the same way each time:
    the windtemp API answered 400 on 2026-11-06, its tables discontinued
    with the NAM (NWS Service Change Notice 26-47), and three tries and
    their back-off put 6.5 s on each ask."""
    sent = {**(headers or REQUEST_HEADERS), **(validators or {})}
    try:
        resp = outside.get(url, params=params or {}, headers=sent, timeout=timeout)
        status = getattr(resp, "status_code", None)
        if isinstance(status, int) and 400 <= status < 500:
            raise FetchFailed(f"{url} refused: {status} {str(resp.text)[:200]}")
        resp.raise_for_status()
    except requests.RequestException as err:
        raise FetchFailed(f"request to {url} failed: {err}") from err
    return resp


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
