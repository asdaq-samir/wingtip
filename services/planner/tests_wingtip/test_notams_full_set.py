"""wingtip.notams' full set (decision 0059): NMS's initial load kept beside
the SWIM feed's NOTAMs, one row a NOTAM heard from both, the ones it
leaves out ended, and the store said to hold every NOTAM only while NMS
keeps it up to date. Messages in the feed's own shape (test_notams)."""

import pytest

from tests_wingtip.test_notams import NOW, RUNWAY, message
from wingtip import notams

TAXIWAY = message(
    location="ORD",
    text="TWY B CLSD",
    start="202610190900",
    end="202611301100",
    number="650",
    domestic="!ORD 10/650 ORD TWY B CLSD 2610190900-2611301100",
    icao_location="KORD",
)
OBSTACLE = message(
    location="ORD",
    text="OBST CRANE 650FT AGL LGT OUT",
    start="202610010000",
    end="202612010000",
    number="001",
    domestic="!ORD 10/001 ORD OBST CRANE 650FT AGL LGT OUT 2610010000-2612010000",
    icao_location="KORD",
)
DAY = 24 * 3600


@pytest.fixture(autouse=True)
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(notams, "STORE", tmp_path / "notams.sqlite")
    monkeypatch.setattr(notams, "FORMER", tmp_path / "former" / "notams.sqlite")
    notams.reset()
    yield
    notams.reset()


def ids(now=NOW):
    return sorted(n["id"] for n in notams.at_fields(["KORD"], now=now))


def test_the_feed_alone_is_never_the_full_set():
    notams.heard(RUNWAY, now=NOW)
    assert notams.nms_state() == (None, None)
    assert notams.full_set(now=NOW) is False


def test_a_load_holds_what_the_feed_never_sent_and_one_heard_from_both_once():
    notams.heard(RUNWAY, now=NOW)
    # The crane's NOTAM was issued before the feed was first heard.
    assert notams.loaded([RUNWAY, OBSTACLE], now=NOW + 60) == 2
    assert ids(NOW + 60) == ["ORD 10/001", "ORD 10/709"]
    # Loaded, but not up to date until its changes since have been asked.
    assert notams.full_set(now=NOW + 60) is False
    notams.synced(NOW + 120)
    assert notams.nms_state() == (NOW + 60, NOW + 120)
    assert notams.full_set(now=NOW + 120 + notams.FULL_SYNC_WITHIN_S) is True
    assert notams.full_set(now=NOW + 121 + notams.FULL_SYNC_WITHIN_S) is False


def test_a_notam_the_load_leaves_out_has_ended_only_where_it_was_heard_a_day_before():
    """A cancellation the feed missed: the whole set no longer lists it. One
    heard within the day before the load may be newer than its file."""
    notams.heard(TAXIWAY, now=NOW - 2 * DAY)
    notams.heard(RUNWAY, now=NOW - 3600)
    notams.loaded([OBSTACLE], asked=NOW, now=NOW)
    assert ids() == ["ORD 10/001", "ORD 10/709"]


def test_a_load_ends_none_of_a_classification_it_holds_none_of():
    fdc = message(
        location="ORD",
        text="IAP ILS RWY 10R AMDT 3 NA",
        start="202610010000",
        end="202612010000",
        number="4918",
        classification="FDC",
        domestic="!FDC 6/4918 ORD IAP ILS RWY 10R AMDT 3 NA",
    )
    notams.heard(fdc, now=NOW - 2 * DAY)
    notams.loaded([OBSTACLE], asked=NOW, now=NOW)
    assert "FDC 6/4918" in ids()
