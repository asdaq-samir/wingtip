"""How the planner keeps to an outside source's limits, the one gate the
traffic sources share (adsb.lol's API and globe, ADS-B Exchange, the
OpenSky Network): a gap between asks, a hold after a refusal (its own
wait where it names one, held to a most), and what the source itself
says is left of the day's budget.

Each was a dict of its own in its own module, written three ways;
the weather service's paced sources take a
turn from one too (`turn`). The times are the caller's clock, passed in,
so a test's stand-in clock is the one used; the gate keeps no clock and
asks nothing itself.
"""

from __future__ import annotations

import datetime as dt
import math
import threading


class Gate:
    """One source's manners: `last` (when it was last asked), `until`
    (when a hold ends) and `left` (its own count of what is left, and the
    UTC day it said so)."""

    def __init__(self, *, gap_s: float = 0.0, hold_most_s: float = math.inf, reserve: int = 0):
        self.gap_s = gap_s
        self.hold_most_s = hold_most_s
        self.reserve = reserve
        self.last = -math.inf
        self.until = -math.inf
        self.left: tuple[int, dt.date] | None = None
        self._lock = threading.Lock()

    def held(self, now: float) -> bool:
        """Whether a refusal's hold still runs."""
        return now < self.until

    def hold(self, seconds: float, now: float) -> None:
        """Not asked for `seconds` from now, held to `hold_most_s`; a longer
        hold already running is kept."""
        with self._lock:
            self.until = max(self.until, now + min(seconds, self.hold_most_s))

    def spaced(self, now: float) -> bool:
        """Whether `gap_s` has gone by since the last ask."""
        return now - self.last >= self.gap_s

    def asked(self, now: float) -> None:
        """An ask went now (a later one already marked is kept)."""
        with self._lock:
            self.last = max(self.last, now)

    def take(self, now: float, earliest: float, gap_s: float, wait_most_s: float) -> float | None:
        """The next turn at or after `earliest`, `gap_s` after the last ask
        and past a hold, taken (marked as the last ask) where it is within
        `wait_most_s` of `now`; None, nothing taken, where it is further."""
        with self._lock:
            slot = max(earliest, self.last + gap_s, self.until)
            if slot - now > wait_most_s:
                return None
            self.last = slot
            return slot

    def turn(self, clock, sleep) -> None:
        """This ask's turn, `gap_s` after the last one's: slept for with
        `sleep` where it is still to come, by `clock`'s time. Taken under
        the lock, so asks from several threads queue a gap apart. A source
        asked one at a time (aviationweather.gov's map, tfr.faa.gov's
        detail files) needs no more of the gate."""
        with self._lock:
            now = clock()
            at = max(now, self.last + self.gap_s)
            self.last = at
        if at > now:
            sleep(at - now)

    def counted(self, remaining: float | None, day: dt.date) -> None:
        """The source's own count of what is left today, where it sent one."""
        if remaining is not None:
            with self._lock:
                self.left = (int(remaining), day)

    def remaining(self, day: dt.date) -> int | None:
        """What the source last said is left, where it said so on `day`."""
        left = self.left
        return left[0] if left and left[1] == day else None

    def spent(self, day: dt.date) -> bool:
        """Fewer than `reserve` left by the source's own count today."""
        left = self.remaining(day)
        return left is not None and left < self.reserve
