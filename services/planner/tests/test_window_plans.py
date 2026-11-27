"""app.window.hours.Plans: the departure window's hours with different
winds plan at once, and one plan is worked out once however many hours
want it (round 6's audit, N2: one lock had them plan one at a time)."""

import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from types import SimpleNamespace

from app.window import hours

DEPART = datetime(2026, 11, 27, 18, tzinfo=timezone.utc)


def test_hours_with_different_winds_plan_at_once_and_the_same_plan_once(monkeypatch):
    both_in = threading.Barrier(2, timeout=5)
    made = []

    def plan_for(q, r):
        made.append(q.depart)
        # Two different keys both inside plan_for at once, or the barrier
        # breaks: under one lock the second never comes in.
        if len(made) <= 2:
            both_in.wait()
        return SimpleNamespace(totals={})

    monkeypatch.setattr(hours, "plan_for", plan_for)
    plans = hours.Plans(SimpleNamespace(depart=None), SimpleNamespace(), DEPART, airplane=False)
    monkeypatch.setattr(hours, "replace_depart", lambda q, depart: SimpleNamespace(depart=depart))
    with ThreadPoolExecutor(4) as pool:
        got = list(pool.map(lambda k: plans._planned(("period", k % 2), DEPART), range(4)))
    assert len(made) == 2 and got[0] is got[2] and got[1] is got[3]
