"""The NTSB's record of a draft's event, for its kit, once the NTSB has
one: read from the NTSB store ingest builds on the data volume
(wingtip.history.ntsb, services/ingest/ingest/ntsb.py: avall.mdb each
month and the weekly deltas over it), which this job reaches as the
planner does, from the shared store and not through a request (CLAUDE.md,
"data comes in at the edges"). The NTSB's words are given as it wrote
them, its narrative's kind ("preliminary" or "final") with them.

No leads come from it: the store keeps each case's local date, town and
state, but no time of day and no point (wingtip.history.ntsb's tables),
so the engine's identity check (occurrence_identity) could only ever
send such a lead to a person. The FAA's statements name the same events
first, within a day; the NTSB's case is added to their draft here when it
appears, a week or so later."""

from __future__ import annotations

from wingtip.history import ntsb as store

SOURCE = "ntsb"


def leads() -> list[dict]:
    """The NTSB's events as leads: none (above)."""
    return []


def record(n_number: str, local_date: str) -> dict | None:
    """The NTSB's cases of the airplane on the event's local date (the
    NTSB's ev_date is the local date where it happened, as the FAA's
    statement's is), as the store gives them, with the store's source and
    credit; None where it has none yet, or the store is not built."""
    if not n_number:
        return None
    cases = [c for c in store.events(n_number, local_date) if c["date"] == local_date]
    if not cases:
        return None
    return {"source": store.SOURCE, "credit": store.CREDIT, "cases": cases}
