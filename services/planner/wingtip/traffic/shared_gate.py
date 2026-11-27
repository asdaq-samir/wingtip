"""adsb.lol's gate kept where the planner and ingest both see it: the live
store's `gates` table (wingtip.traffic.store), one row a source.

The planner asks adsb.lol for the map's regions, a pilot's searches and an
open card's airplane; ingest asks it for the followed airplanes every
FOLLOW_EVERY_S. Each paced itself against a ratelimit.Gate in its own
memory, so "never two requests closer together than MIN_GAP_S" held per
process only, and a refusal one saw did not hold the other (round 6's
audit, N3). SharedGate has the Gate's `last`, `until`, `held`, `hold`,
`asked` and `take`, each read from or written to the row in one short
transaction: a turn taken by one process is never taken by the other.

The row is in Unix seconds, the one clock both processes share; the
callers pass monotonic times (common._clock), turned to and from the
wall's at each call.
"""

from __future__ import annotations

import math
import time

from . import store


def _gate(name: str) -> tuple[float, float]:
    """(last, until) of a source's row, Unix seconds, -inf where never set."""
    rows = store._query("SELECT last, until FROM gates WHERE name = ?", (name,))
    last, until = rows[0] if rows else (None, None)
    return (-math.inf if last is None else last), (-math.inf if until is None else until)


def _take(name: str, earliest: float, gap_s: float, latest: float) -> float | None:
    """The source's next turn at or after `earliest`, `gap_s` after its last
    and past its hold, taken as its last ask where it is no later than
    `latest`; None, nothing taken, where it is later."""
    with store._LOCK:
        db = store._connection()
        db.execute("BEGIN IMMEDIATE")
        try:
            last, until = db.execute("SELECT last, until FROM gates WHERE name = ?", (name,)).fetchone() or (None, None)
            slot = max(earliest, -math.inf if last is None else last + gap_s, -math.inf if until is None else until)
            if slot > latest:
                db.execute("ROLLBACK")
                return None
            db.execute("INSERT INTO gates (name, last) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET last = excluded.last", (name, slot))
            db.execute("COMMIT")
        except BaseException:
            db.execute("ROLLBACK")
            raise
    return slot


_LATER = "ON CONFLICT (name) DO UPDATE SET {0} = max(coalesce(gates.{0}, excluded.{0}), excluded.{0})"


class SharedGate:
    """ratelimit.Gate's turns and holds for one source, kept in the live
    store, so every process asking it keeps to the one gap."""

    def __init__(self, name: str):
        self.name = name

    @staticmethod
    def _wall_less_clock() -> float:
        return time.time() - time.monotonic()

    @property
    def last(self) -> float:
        return _gate(self.name)[0] - self._wall_less_clock()

    @property
    def until(self) -> float:
        return _gate(self.name)[1] - self._wall_less_clock()

    def held(self, now: float) -> bool:
        """Whether a refusal's hold, either process's, still runs."""
        return now < self.until

    def hold(self, seconds: float, now: float) -> None:
        """Not asked for `seconds` from now; a longer hold already set is kept."""
        store._write(
            f"INSERT INTO gates (name, until) VALUES (?, ?) {_LATER.format('until')}", (self.name, now + seconds + self._wall_less_clock())
        )

    def asked(self, now: float) -> None:
        """An ask went now (a later one already marked is kept)."""
        store._write(f"INSERT INTO gates (name, last) VALUES (?, ?) {_LATER.format('last')}", (self.name, now + self._wall_less_clock()))

    def take(self, now: float, earliest: float, gap_s: float, wait_most_s: float) -> float | None:
        """ratelimit.Gate.take, against both processes' asks."""
        off = self._wall_less_clock()
        slot = _take(self.name, earliest + off, gap_s, now + wait_most_s + off)
        return None if slot is None else slot - off
