"""The one copy of the stores' UTC times (wingtip.utc)."""

from datetime import datetime, timedelta, timezone

from wingtip import utc

NOON = 1_794_139_200.0  # 2026-11-08T12:00:00Z


def test_iso_from_seconds_and_datetimes():
    assert utc.iso(NOON) == "2026-11-08T12:00:00Z"
    assert utc.iso(NOON + 0.9) == "2026-11-08T12:00:00Z"
    assert utc.iso(datetime(2026, 11, 8, 12)) == "2026-11-08T12:00:00Z"
    chicago = timezone(timedelta(hours=-6))
    assert utc.iso(datetime(2026, 11, 8, 6, tzinfo=chicago)) == "2026-11-08T12:00:00Z"


def test_epoch_reads_the_feeds_forms():
    for text in (
        "2026-11-08T12:00:00Z",
        "2026-11-08T12:00:00.000Z",
        "2026-11-08T12:00:00+00:00",
        "2026-11-08T12:00:00",
        " 2026-11-08T06:00:00-06:00 ",
    ):
        assert utc.epoch(text) == NOON, text
    assert utc.parse("2026-11-08T12:00Z").tzinfo == timezone.utc


def test_epoch_or_none():
    assert utc.epoch_or_none(None) is None
    assert utc.epoch_or_none("") is None
    assert utc.epoch_or_none("indeterminate") is None
    assert utc.epoch_or_none("2026-11-08T12:00:00Z") == NOON
