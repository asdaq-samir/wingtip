"""ingest's health check (the image's HEALTHCHECK and compose's): healthy
while its last beat in the live store is newer than HEALTHY_WITHIN_S.
`python -m ingest.health` exits 0 when healthy, 1 with the reason when not.
A feed that cannot connect does not fail it: its state says so, and the
reading keeps trying; a stuck process or a store it cannot write does.

The beat is read with sqlite3 alone, never through wingtip.traffic: that
package's imports (pandas, scipy, pyproj) took 2.3 s of processor a check
across several threads, and compose ran the check every 5 s, which was
most of what ingest was seen to use (240% in `docker stats` while one
ran, 2026-11-09); this takes a few hundredths of a second."""

import sqlite3
import sys
import time

from wingtip.config import get_settings as wingtip_settings

from .settings import get_settings


def problem(now: float | None = None) -> str | None:
    """What is wrong, or None."""
    path = wingtip_settings().live_store
    try:
        # Read-only: the check never makes a store where there is none.
        db = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5.0)
        try:
            row = db.execute("SELECT at FROM beats WHERE name = 'ingest'").fetchone()
        finally:
            db.close()
    except sqlite3.Error:
        row = None
    if row is None:
        return "no beat written yet"
    age = (now if now is not None else time.time()) - row[0]
    within = get_settings().healthy_within_s
    return f"last beat {age:.0f} s ago (more than {within:.0f})" if age > within else None


if __name__ == "__main__":
    wrong = problem()
    if wrong:
        print(wrong, file=sys.stderr)
    sys.exit(1 if wrong else 0)
