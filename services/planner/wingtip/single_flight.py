"""A file's table read once, however many ask for it at once.

functools.lru_cache keeps what a function returned, but does nothing for
callers that come while the first is still working it out: each misses
and works it out too. After a restart the planner's warm-up and every
request that came in the meantime -- the map's airports in view, each
card's place, the Stops along a route -- were each reading the same FAA
file and building the same table, a copy apiece, and the planner answered
nothing, not even its health check, for minutes (py-spy on the live
planner, 2026-10-28: four request threads and the warm-up all in
faa_data._contacts_of). `once` is an LRU cache with one builder per key:
the others wait for its answer and take it.

It is cachetools' own `cached` with a `condition`, which does exactly
that: a key being built is marked pending, its callers wait on the
condition, and the builder stores the answer and wakes them; a builder
that raises wakes them too, and the next of them builds it again. The
lock is held only while the cache is looked at, never while a table is
built, so different keys build at once.

Its one difference from the hand-built version it replaced: a thread
that asked for the key it was itself building would wait on itself for
ever, where the old re-entrant lock let it in. None of the 36 functions
built with `once` does (checked 2026-11-12): nine of them read
faa_data._read_apt_base_cached and cycle_pack._newest reads _open,
procedures._airport reads _index, each another function's cache, and
none of those reads back -- and a same-key call would have recursed
without end under lru_cache anyway, which never stored a key until its
build had returned.
"""

import threading
from collections.abc import Callable
from typing import ParamSpec, TypeVar

from cachetools import LRUCache, cached

P = ParamSpec("P")
R = TypeVar("R")


def once(maxsize: int | None = 128) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """lru_cache(maxsize), each key built by one caller at a time, with
    lru_cache's cache_clear() and cache_info(). None keeps every key."""

    def decorate(build: Callable[P, R]) -> Callable[P, R]:
        cache: LRUCache | dict = {} if maxsize is None else LRUCache(maxsize=maxsize)
        return cached(cache, condition=threading.Condition(), info=True)(build)

    return decorate
