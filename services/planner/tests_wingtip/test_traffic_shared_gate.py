"""Round 7's audit on the shared adsb.lol gate (C1 to C5, C8): its turns taken
against the live store's real SQLite file, outside the traffic package's lock,
once a region, and by the background only where free."""

import sqlite3
import threading
import time

import pytest

from wingtip import traffic
from wingtip.traffic import adsb_lol, common, shared_gate, store, watched

from .traffic_world import CESSNA, stand_in
from .traffic_world import adsbx_fixture, clock_fixture  # noqa: F401 -- the fixtures, by the names the runner gives them

REGION = (42.5, -88.0, 80)
OTHER = (43.5, -88.0, 80)


@pytest.fixture(name="shared")
def shared_fixture(clock, monkeypatch):
    """The gate as the planner and ingest keep it, in the test's own live store; the clock a real one's
    size, as the gate turns monotonic times to the wall's."""
    clock.now = time.monotonic()
    stand_in(monkeypatch, "_LOL", shared_gate.SharedGate("adsb.lol"))
    stand_in(monkeypatch, "_ask", lambda region: [])
    return clock


def _spy_take(monkeypatch, seen):
    real = adsb_lol._LOL.take

    def take(*args):
        seen.append(common._LOCK.locked())
        return real(*args)

    monkeypatch.setattr(adsb_lol._LOL, "take", take)


def test_a_regions_turn_is_taken_outside_the_traffic_lock_and_slept_for_once(shared, monkeypatch):
    seen = []
    _spy_take(monkeypatch, seen)
    start = shared.now
    first = adsb_lol._region_answer(REGION)
    second = adsb_lol._region_answer(OTHER)
    assert seen == [False, False]
    # The first goes at once; the second a gap after it, slept for once (not a second time for the gate's turn).
    assert first[0] == pytest.approx(start) and second[0] == pytest.approx(start + adsb_lol.MIN_GAP_S)
    assert shared.now == pytest.approx(start + adsb_lol.MIN_GAP_S)
    assert adsb_lol._STATE["next_ask"] == pytest.approx(start + 2 * adsb_lol.MIN_GAP_S)
    assert store._query("SELECT count(*) FROM gates WHERE name = 'adsb.lol'") == [(1,)]


def test_a_poll_with_its_answer_in_memory_is_not_kept_behind_a_write_ingest_holds(shared, monkeypatch):
    adsb_lol._region_answer(REGION)
    ingest = sqlite3.connect(store.STORE, isolation_level=None)
    ingest.execute("BEGIN IMMEDIATE")
    reached = threading.Event()
    real = adsb_lol._LOL.take
    monkeypatch.setattr(adsb_lol._LOL, "take", lambda *a: reached.set() or real(*a))
    new_region = threading.Thread(target=adsb_lol._region_answer, args=(OTHER,))
    new_region.start()
    try:
        assert reached.wait(5)
        began = time.monotonic()
        assert adsb_lol._region_answer(REGION)[1] == []
        assert adsb_lol._covering(42.5, -88.0, 10) is not None
        assert time.monotonic() - began < 1.0
    finally:
        ingest.execute("ROLLBACK")
        ingest.close()
        new_region.join(15)
    assert not new_region.is_alive()


def test_a_wall_clock_that_stepped_back_does_not_silence_adsb_lol(shared):
    gate = adsb_lol._LOL
    wall = time.time()
    # A last ask and a hold far ahead: the clock was set back since.
    store._write("INSERT INTO gates (name, last, until) VALUES ('adsb.lol', ?, ?)", (wall + 3600, wall + 86400))
    slot = gate.take(shared.now, shared.now, adsb_lol.MIN_GAP_S, 7200.0)
    assert slot is not None and slot - shared.now <= shared_gate.MAX_HOLD_S + 1
    store._write("DELETE FROM gates")
    store._write("INSERT INTO gates (name, last) VALUES ('adsb.lol', ?)", (wall + 3600,))
    slot = gate.take(shared.now, shared.now, adsb_lol.MIN_GAP_S, 100.0)
    assert slot is not None and slot - shared.now <= shared_gate.MAX_AHEAD_S + adsb_lol.MIN_GAP_S + 1
    gate.hold(10**7, shared.now)
    assert gate.until - shared.now <= shared_gate.MAX_HOLD_S + 1
    # A hold stored far ahead before the step is read, and kept by a new hold, as an hour from now at most.
    store._write("UPDATE gates SET until = ? WHERE name = 'adsb.lol'", (wall + 86400,))
    assert gate.until - shared.now <= shared_gate.MAX_HOLD_S + 1
    gate.hold(5.0, shared.now)
    (until,) = store._query("SELECT until FROM gates WHERE name = 'adsb.lol'")[0]
    assert until - time.time() <= shared_gate.MAX_HOLD_S + 1


class _Ok:
    status_code = 200
    headers: dict = {}

    def raise_for_status(self):
        pass

    def json(self):
        return {"ac": []}


def test_a_search_takes_its_turn_outside_the_lock_and_reads_no_hold_apart(shared, monkeypatch):
    seen = []
    _spy_take(monkeypatch, seen)
    monkeypatch.setattr(adsb_lol._LOL, "held", lambda now: pytest.fail("a separate read of the hold"))
    monkeypatch.setattr(adsb_lol.outside, "live_get", lambda *a, **kw: _Ok())
    assert adsb_lol._paced("https://api.adsb.lol/v2/hex/a128b9") == {"ac": []}
    assert seen == [False]


def test_an_airplane_adsb_lol_hears_on_the_ground_is_not_asked_of_ads_b_exchange(clock, monkeypatch):
    """C1: a card open on a parked airplane cost ADS-B Exchange's month 180 calls an hour."""
    taxiing = {**CESSNA, "alt_baro": "ground", "gs": 0, "seen_pos": 5.0}
    stand_in(monkeypatch, "_paced", lambda url, **kw: {"ac": [taxiing]})
    stand_in(monkeypatch, "_adsbx", lambda path, search=False: pytest.fail("asked ADS-B Exchange"))
    watched._watch("a128b9")
    assert watched._answered("a128b9")


def test_ads_b_exchange_is_asked_for_what_adsb_lol_answered_without_or_after_turns_lost_in_a_row(clock, monkeypatch):
    asked = []
    stand_in(monkeypatch, "_adsbx", lambda path, search=False: asked.append(path) or [])

    def lost(url, **kw):
        raise common.TrafficUnavailable("not free")

    stand_in(monkeypatch, "_paced", lost)
    for _ in range(watched.LOL_MISSED_MAX - 1):
        clock.now += watched.WATCH_GAP_S
        watched._watch("a128b9")
    assert asked == []
    clock.now += watched.WATCH_GAP_S
    watched._watch("a128b9")
    assert asked == ["icao/a128b9"]
    stand_in(monkeypatch, "_paced", lambda url, **kw: {"ac": []})
    clock.now += watched.WATCH_GAP_S
    watched._watch("a0b7d8")
    assert asked == ["icao/a128b9", "icao/a0b7d8"]


def test_the_background_takes_only_a_turn_that_is_free_and_a_follow_round_a_few(clock, monkeypatch):
    waits = []
    stand_in(monkeypatch, "_wall", lambda: 1791800000.0)
    stand_in(monkeypatch, "_recent_trace", lambda hex_id: traffic.globe.UNREAD)
    for n in range(6):
        traffic.follow("a%05x" % n)

    def free(url, wait_most_s=None, **kw):
        waits.append(wait_most_s)
        return {"ac": []}

    stand_in(monkeypatch, "_paced", free)
    traffic.follow_round()
    assert waits == [0.0] * watched.FOLLOW_ASKS_MAX


def test_the_open_cards_are_asked_for_together(clock, monkeypatch):
    both, asked = threading.Barrier(2, timeout=5), []

    def ask(hex_id):
        both.wait()
        asked.append(hex_id)

    stand_in(monkeypatch, "_watch", ask)
    for hex_id in ("a128b9", "a0b7d8"):
        watched._WATCHED[hex_id] = clock.now
    assert watched.watch_round() == 2 and sorted(asked) == ["a0b7d8", "a128b9"]


def test_open_cards_in_one_round_share_adsb_lols_turns_rather_than_spend_ads_b_exchange(clock, monkeypatch):
    """Each open card waits up to two of adsb.lol's gaps for its turn: the
    second card of a round goes a gap after the first, where with no wait it
    found none and, LOL_MISSED_MAX rounds on, asked ADS-B Exchange each round."""

    class Heard(_Ok):
        def __init__(self, url):
            self.hex = url.rsplit("/", 1)[-1]

        def json(self):
            return {"ac": [{**CESSNA, "hex": self.hex}]}

    monkeypatch.setattr(adsb_lol.outside, "live_get", lambda url, *a, **kw: Heard(url))
    stand_in(monkeypatch, "_adsbx", lambda path, search=False: pytest.fail("asked ADS-B Exchange"))
    start = clock.now
    for hex_id in ("a128b9", "a0b7d8"):
        watched._watch(hex_id)
        assert watched._answered(hex_id)
    assert clock.now == pytest.approx(start + adsb_lol.MIN_GAP_S)


def test_a_card_is_asked_again_in_the_next_round_though_the_scheduler_ran_it_a_little_early(clock, monkeypatch):
    waits = []
    stand_in(monkeypatch, "_paced", lambda url, wait_most_s=None, **kw: waits.append(wait_most_s) or {"ac": []})
    stand_in(monkeypatch, "_adsbx", lambda path, search=False: [])
    watched._watch("a128b9")
    clock.now += watched.WATCH_GAP_S - 0.5
    watched._watch("a128b9")
    assert waits == [2 * adsb_lol.MIN_GAP_S] * 2
    clock.now += 0.4
    watched._watch("a128b9")
    assert len(waits) == 2
