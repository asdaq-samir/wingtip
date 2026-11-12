"""The one connection to the outside data sources -- the FAA's downloads,
NOAA's models and products, the USGS, the Census, Wikimedia -- shared by
wingtip and the services on its base image (ingest, weather, jobs).

A source that drops a connection or answers 429, 502, 503 or 504 is
asked again, up to three times, on an exponential back-off with jitter
(at once, then after 1 s and 2 s, each of those plus up to half a
second, so a pool of workers does not knock again in step: urllib3's
get_backoff_time waits nothing before the first), or after the source's own
Retry-After where it sends one, held to 30 s so no request waits on a
source for an hour. Only GET and HEAD are retried: they ask, and asking
twice changes nothing; nothing that posts or writes is. A read that
times out is not retried either: each caller's own timeout is how long
it can wait, and a second try would double it. urllib3's Retry does all
of it (urllib3 2.8.0), on one pool of kept-alive connections per host.

Live traffic opts out (`session(retries=False)`, or plain requests):
a position a few seconds late is a wrong one. Calls to our own services
keep their own clients."""

from __future__ import annotations

import functools

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# The answers worth asking again: too many requests, and a gateway or
# server that is down for the moment (RFC 9110 15.6.3-5, RFC 6585 4).
RETRIED_STATUSES = frozenset({429, 502, 503, 504})

# Retry is immutable (each attempt makes a new one), so one serves every pool.
RETRY = Retry(
    total=3,
    read=0,
    other=0,
    status_forcelist=RETRIED_STATUSES,
    allowed_methods=frozenset({"GET", "HEAD"}),
    backoff_factor=0.5,
    backoff_jitter=0.5,
    respect_retry_after_header=True,
    retry_after_max=30,
    # The last answer goes back to the caller, whose raise_for_status
    # (or status check) says what failed, as it did before.
    raise_on_status=False,
)


def session(*, retries: bool = True, pool: int = 10) -> requests.Session:
    """A requests Session for outside sources, `pool` connections kept
    per host, retrying as the module says unless `retries` is False
    (requests' own default then: one try)."""
    adapter = HTTPAdapter(pool_connections=pool, pool_maxsize=pool, max_retries=RETRY if retries else 0)
    shared = requests.Session()
    shared.mount("https://", adapter)
    shared.mount("http://", adapter)
    return shared


@functools.cache
def _shared() -> requests.Session:
    # One for the process: urllib3's pools are thread-safe, and nothing
    # here keeps cookies or changes the session after it is made.
    return session()


def get(url: str, **kwargs) -> requests.Response:
    """requests.get through the shared, retrying session; the caller's
    timeout, headers and stream as before."""
    return _shared().get(url, **kwargs)


def head(url: str, **kwargs) -> requests.Response:
    """requests.head through the shared, retrying session."""
    return _shared().head(url, **kwargs)
