"""wingtip.ratelimit: the gate the traffic sources keep to."""

import datetime as dt

from wingtip.ratelimit import Gate

DAY = dt.date(2026, 11, 27)


def test_a_hold_is_held_to_its_most_and_a_longer_one_kept():
    gate = Gate(hold_most_s=86400)
    # OpenSky's 292 years, held to a day.
    gate.hold(9223372036, now=100.0)
    assert gate.held(100.0 + 86399) and not gate.held(100.0 + 86400)
    gate.hold(5, now=200.0)
    assert gate.until == 100.0 + 86400


def test_a_gap_between_asks_and_the_sources_own_count_of_what_is_left():
    gate = Gate(gap_s=30, reserve=200)
    assert gate.spaced(0.0)
    gate.asked(10.0)
    assert not gate.spaced(39.0) and gate.spaced(40.0)
    assert not gate.spent(DAY)
    gate.counted(199, DAY)
    assert gate.spent(DAY) and gate.remaining(DAY) == 199
    # Yesterday's count says nothing of today.
    assert gate.remaining(DAY + dt.timedelta(days=1)) is None and not gate.spent(DAY + dt.timedelta(days=1))


def test_each_turn_comes_a_gap_after_the_last_the_first_at_once():
    clock, slept = [100.0], []

    def sleep(seconds):
        slept.append(seconds)
        clock[0] += seconds

    gate = Gate(gap_s=0.5)
    for _ in range(3):
        gate.turn(lambda: clock[0], sleep)
    assert slept == [0.5, 0.5] and gate.last == 101.0


def test_a_turn_is_taken_a_gap_after_the_last_past_a_hold_and_not_where_too_far_off():
    gate = Gate()
    assert gate.take(0.0, 0.0, 5.0, 10.0) == 0.0
    assert gate.take(1.0, 1.0, 5.0, 10.0) == 5.0
    gate.hold(30, now=1.0)
    assert gate.take(2.0, 2.0, 5.0, 10.0) is None and gate.last == 5.0


def test_the_planner_and_ingest_take_adsb_lols_turns_from_one_gate(tmp_path, monkeypatch):
    """Round 6's audit, N3: each process paced adsb.lol on its own. Two
    SharedGates on one live store stand in for the two processes."""
    import time

    from wingtip.traffic import shared_gate, store

    monkeypatch.setattr(store, "STORE", tmp_path / "live.sqlite")
    store.reset()
    planner, ingest = shared_gate.SharedGate("adsb.lol"), shared_gate.SharedGate("adsb.lol")
    now = time.monotonic()
    assert abs(planner.take(now, now, 5.0, 10.0) - now) < 0.01
    # ingest's next turn is a gap after the planner's ask, and a third too far off is not taken.
    assert abs(ingest.take(now, now, 5.0, 10.0) - (now + 5.0)) < 0.01
    assert ingest.take(now, now, 5.0, 4.0) is None
    planner.hold(60, now)
    assert ingest.held(now + 59) and not ingest.held(now + 61)
    store.reset()
