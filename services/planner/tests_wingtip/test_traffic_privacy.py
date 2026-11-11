"""What the live store keeps of the pilot and of other airplanes, and for how
long, as docs/privacy-inventory.md promises: the map's region, never the
view's middle (which is the pilot's position when the map follows the
airplane), dropped a minute after the last ask; a followed airplane dropped
30 days after its card was last opened; and a track's points after 30 days,
all pruned on a schedule, whether or not ingest runs."""

from __future__ import annotations

import sqlite3
import threading

import pytest

from wingtip import traffic
from wingtip.traffic import radar, recorded, store


@pytest.fixture
def wall(monkeypatch):
    """The live store's wall clock, a test's own."""
    now = {"t": 1791800000.0}
    for part in (radar, recorded):
        monkeypatch.setattr(part, "_wall", lambda: now["t"])
    return now


def _rows(table: str) -> list[tuple]:
    db = sqlite3.connect(store.STORE)
    try:
        return db.execute(f"SELECT * FROM {table}").fetchall()  # noqa: S608 -- the test's own table names
    finally:
        db.close()


def test_the_view_middle_is_never_stored_only_its_region(wall):
    # The pilot's position, to the metre, as the map follows the airplane.
    radar.looked_at(42.361234, -88.141234, 30)
    [(place, lat, lon, radius, _at)] = _rows("looked")
    assert (lat, lon) == (42.5, -88.0)
    assert place == "42.5,-88.0,80"
    # Widened by half the cell's diagonal (21.2 nm), so ingest still reads
    # the radar over the whole view.
    assert radius == 52
    # Anywhere else in the same cell is the same row, not a trail.
    radar.looked_at(42.30, -87.80, 30)
    assert len(_rows("looked")) == 1
    # Zoomed out: the two-degree cell, out to adsb.lol's widest ask.
    radar.looked_at(33.9412, -118.4081, 165)
    assert _rows("looked")[1][1:4] == (34.0, -118.0, 250)


def test_the_regions_go_a_minute_after_the_last_ask_without_ingest(wall):
    radar.looked_at(42.36, -88.14, 30)
    wall["t"] += traffic.LOOKED_S - 1
    assert traffic.prune()["looked"] == 0
    wall["t"] += 2
    assert traffic.prune()["looked"] == 1
    assert _rows("looked") == []


def test_a_followed_airplane_expires_30_days_after_its_card_was_last_opened(wall):
    traffic.follow("a3c858")
    wall["t"] += traffic.FOLLOW_KEEP_S - 86400
    # Opened again the day before it would have gone: another 30 days.
    traffic.follow("a3c858")
    wall["t"] += 2 * 86400
    assert traffic.prune()["followed"] == 0
    assert traffic.followed() == {"a3c858"}
    wall["t"] += traffic.FOLLOW_KEEP_S
    assert traffic.prune()["followed"] == 1
    assert traffic.followed() == set()


def test_track_points_go_after_30_days_though_the_airplane_is_never_heard_again(wall):
    store.record("a3c858", {"t": wall["t"], "lat": 42.0, "lon": -88.0}, wall["t"] - traffic.RECORD_KEEP_S)
    store.record("a3c858", {"t": wall["t"] + 600, "lat": 42.1, "lon": -88.0}, wall["t"] - traffic.RECORD_KEEP_S)
    wall["t"] += traffic.RECORD_KEEP_S + 300
    assert traffic.prune()["points"] == 1
    assert [p["t"] for p in store.points("a3c858")] == [1791800600.0]


def test_the_prune_thread_runs_until_stopped(wall, monkeypatch):
    ran = threading.Event()
    stop = threading.Event()

    def pruned():
        ran.set()
        stop.set()
        return {}

    monkeypatch.setattr(radar, "prune", pruned)
    radar.prune_forever(stop)
    assert ran.is_set()
