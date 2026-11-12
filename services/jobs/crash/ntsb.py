"""The NTSB's records (avdata: the weekly upDDMON.zip deltas and the
monthly avall.zip), for the leads the FAA has not named and for the kit's
record once the NTSB has one: its own words, quoted, with its N-number,
its point and its injuries.

TODO(claude/studio-2): that branch builds the reader
(services/ingest/ingest/ntsb.py) into the shared store. Once it lands,
`leads()` reads its events since the last run into the statements' shape
(statements.parse: "place" a point, from the record's latitude and
longitude), and `record()` gives the kit the event's record by N-number
and date. Until then neither has anything to say."""

from __future__ import annotations

SOURCE = "ntsb"


def leads() -> list[dict]:
    """The NTSB's events not yet seen, in the statements' shape; none yet."""
    return []


def record(n_number: str, local_date: str) -> dict | None:
    """The NTSB's record of the event, for the kit; none yet."""
    del n_number, local_date
    return None
