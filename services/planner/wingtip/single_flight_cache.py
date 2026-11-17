"""A single-flight TTL cache and the error a caller gets when a computation
runs past the limit (StillComputing), with what it was waiting on in words a
pilot can act on. The planner's altitude and plan caches (wingtip.planning)
are built on it."""

import threading
import time

from cachetools import TTLCache


# What the stages of wingtip.altitude's selection are called to a pilot, by
# the part of their label before the dot.
_STAGE_NAMES = {
    "terrain": "the terrain and obstacles",
    "airspace": "the airspace",
    "weather": "aviationweather.gov",
    "magnetic_variation_deg": "the magnetic variation",
    "sua": "the FAA's special-use airspace",
    "chart": "the chart reader",
}


def describe_stages(stages) -> str:
    """ "the terrain and obstacles and aviationweather.gov" -- what a
    computation is still waiting on, in words a pilot can act on."""
    names = sorted({_STAGE_NAMES.get(stage.split(".")[0], stage) for stage in stages})
    if not names:
        return ""
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


class StillComputing(RuntimeError):
    """A computation for this key has been running longer than the limit.
    The message says for how long and on what it is still waiting;
    whatever it finishes with is cached for the next request."""

    def __init__(self, elapsed_s: float, stages):
        waiting = describe_stages(stages)
        super().__init__(
            f"Still working after {elapsed_s:.0f} s"
            + (f", waiting on {waiting}" if waiting else "")
            + ". Try again in a minute: the answer is kept once it arrives."
        )
        self.elapsed_s = elapsed_s
        self.stages = sorted(stages)


class _Flight:
    """One computation in progress: when it started, the stages it has
    said are still running, and the event its waiters wait on."""

    def __init__(self, pending: set | None):
        self.started = time.monotonic()
        self.pending = pending if pending is not None else set()
        self.done = threading.Event()

    def age(self) -> float:
        return time.monotonic() - self.started


class SingleFlightTTLCache:
    """A TTLCache where a miss is computed once per key, even under
    concurrent callers.

    The lock used to protect only the dict: check the cache, release the
    lock, compute on a miss, re-take the lock to store it. That leaves
    the computation itself unguarded, so two requests for the same
    not-yet-cached route -- the same plan loaded from two tabs, a retry
    racing the original -- both pay for the whole terrain/airspace/
    weather stack, which is exactly the cost this cache exists to avoid
    paying twice. The second caller now waits on the first caller's
    result instead of repeating it.

    A per-key event, not one lock for the whole cache: two different
    routes must still compute in parallel, only two callers of the
    *same* route serialise.

    And the wait is bounded (`limit_s`). It used to wait for as long as
    the first computation took, and one that never finished -- seen on
    2026-09-23, after a Docker restart, with every later nav log for the
    route streaming "still waiting" until the service was restarted --
    held every later caller with it. A caller now gives up after the
    limit with StillComputing, saying what the computation is waiting
    on; and a computation older than the limit counts as abandoned, so
    the next caller starts a fresh one rather than joining it.
    """

    def __init__(self, maxsize: int, ttl: float):
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)
        self._lock = threading.Lock()
        self._inflight: dict[object, _Flight] = {}
        # key -> a computation given up on as abandoned that has not
        # finished yet (see get_or_compute).
        self._abandoned: dict[object, _Flight] = {}

    def get(self, key):
        """Read-only access, for a caller that wants to see a cached
        value without joining anyone else's in-flight computation."""
        with self._lock:
            return self._cache.get(key)

    def running(self, key) -> tuple[float, list] | None:
        """How long the computation for `key` has been running and which
        of its stages are still going, or None when none is."""
        with self._lock:
            flight = self._inflight.get(key)
            return None if flight is None else (flight.age(), sorted(flight.pending))

    def clear(self):
        """Same shape as TTLCache.clear(), so the test fixture that
        resets every cache between tests does not need to know this one
        is not a bare TTLCache."""
        with self._lock:
            self._cache.clear()
            self._inflight.clear()
            self._abandoned.clear()

    def get_or_compute(self, key, compute, limit_s: float | None = None, pending: set | None = None):
        """The cached value, or `compute()`'s -- computed once however
        many callers ask at the same time. `pending` is the set `compute`
        reports its running stages in (see wingtip.altitude._timed), shown to
        anyone waiting on it; `limit_s` bounds the wait (see above)."""
        with self._lock:
            hit = self._cache.get(key)
            if hit is not None:
                return hit
            flight = self._inflight.get(key)
            if flight is not None and limit_s is not None and flight.age() > limit_s:
                # Abandoned. A fresh computation replaces it -- once. The
                # abandoned one cannot be stopped and keeps its threads,
                # and when what it is stuck on is shared (a lock, a hung
                # download) the fresh one sticks on it too; replacing
                # every limit_s piled up another stuck computation each
                # time. While an abandoned one is still running, a caller
                # is told what it waits on instead.
                previous = self._abandoned.get(key)
                if previous is not None and not previous.done.is_set():
                    raise StillComputing(flight.age(), flight.pending)
                self._abandoned[key] = flight
                flight = None
            if flight is None:
                flight = _Flight(pending)
                self._inflight[key] = flight
                leader = True
            else:
                leader = False

        if not leader:
            remaining = None if limit_s is None else max(0.0, limit_s - flight.age())
            if not flight.done.wait(timeout=remaining):
                raise StillComputing(flight.age(), flight.pending)
            with self._lock:
                hit = self._cache.get(key)
            if hit is not None:
                return hit
            # The leader's own compute() raised, so nothing was stored --
            # fall through and try again rather than propagate an
            # unrelated caller's exception, or the leader's transient
            # network error, to every follower that was only waiting on
            # a lock.
            return self.get_or_compute(key, compute, limit_s, pending)

        try:
            value = compute()
        except BaseException:
            self._finish(key, flight)
            raise
        with self._lock:
            # The current flight owns the slot. One replaced as abandoned
            # only fills an empty one: it used to overwrite the newer
            # flight's answer with its own, from inputs at least limit_s
            # older, and a fresh TTL.
            if self._inflight.get(key) is flight or key not in self._cache:
                self._cache[key] = value
        self._finish(key, flight)
        return value

    def _finish(self, key, flight: _Flight) -> None:
        """Wakes this flight's waiters, and forgets it -- unless a later
        caller has already replaced it as abandoned, whose own flight
        must stay."""
        with self._lock:
            if self._abandoned.get(key) is flight:
                del self._abandoned[key]
            if self._inflight.get(key) is flight:
                del self._inflight[key]
        flight.done.set()
