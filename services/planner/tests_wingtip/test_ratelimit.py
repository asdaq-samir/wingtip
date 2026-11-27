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
