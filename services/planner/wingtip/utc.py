"""UTC times as the stores, the feeds and the apps write them: ISO 8601 to
the second with its Z ("2026-11-09T21:18:00Z"), and seconds since 1970.

The one copy for the planner, ingest and weather, which each kept their
own pair of these (the simplicity wave of 2026-11-18). A time with no
offset is UTC here, as every feed the services read writes it: read as
local time it would move by the host's offset on a Mac outside UTC.
"""

from __future__ import annotations

from datetime import datetime, timezone


def iso(at: float | datetime) -> str:
    """Seconds since 1970, or a datetime, as "YYYY-MM-DDTHH:MM:SSZ", the
    fraction of a second dropped. A naive datetime is taken as UTC."""
    if isinstance(at, datetime):
        moment = at.astimezone(timezone.utc) if at.tzinfo else at
    else:
        moment = datetime.fromtimestamp(at, timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse(text: str) -> datetime:
    """An ISO 8601 time ("…Z", "…+00:00", a fraction or none) as an aware
    UTC datetime. Raises ValueError on text that is not one."""
    moment = datetime.fromisoformat(text.strip())
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment.astimezone(timezone.utc)


def epoch(text: str) -> float:
    """An ISO 8601 time as seconds since 1970. Raises ValueError."""
    return parse(text).timestamp()


def epoch_or_none(text: str | None) -> float | None:
    """epoch(text), or None for no text or text that is not a time: for a
    feed's optional, sometimes malformed field."""
    if not text:
        return None
    try:
        return epoch(text)
    except ValueError:
        return None
