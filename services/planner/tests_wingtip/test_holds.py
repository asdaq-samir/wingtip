"""wingtip.holds: a hold the pilot puts anywhere -- how it is written, the
entry from the course flown to it, and the racetrack and time it takes."""
import pytest
from wingtip import holds


def test_a_hold_is_written_as_the_address_has_it():
    hold = holds.parse("vpbng/090/30:270:R:1M:2T")
    assert hold == holds.Hold("VPBNG/090/30", 270, True, 1.0, None, 2, None)
    assert holds.parse("KMSN:360:L:4N:10M") == holds.Hold("KMSN", 0, False, None, 4.0, None, 10.0)
    assert holds.parse("KMSN:400:L:4N:10M") is None
    assert holds.parse("KMSN:090:X:1M:2T") is None
    assert holds.parse("KMSN") is None


@pytest.mark.parametrize("arrival, inbound, right, made", [
    # Inbound 270 with right turns: the pattern north of the inbound leg,
    # east of the fix. Flying the inbound course to it, direct.
    (270, 270, True, "direct"),
    # Northbound, from the side away from the pattern: a right turn of 90
    # onto the outbound leg, direct.
    (0, 270, True, "direct"),
    # North-east, 135 right of inbound: out 30 into the holding side, a
    # teardrop.
    (45, 270, True, "teardrop"),
    # Southbound, from the pattern's side: out along the inbound course on
    # the other side, and back round to it, parallel.
    (180, 270, True, "parallel"),
    # Left turns, the mirror.
    (180, 270, False, "direct"),
    (0, 270, False, "parallel"),
    (135, 270, False, "teardrop"),
])
def test_the_entry_is_the_one_aim_5_3_8_gives_for_the_course_flown_to_the_fix(arrival, inbound, right, made):
    assert holds.entry(arrival, inbound, right) == made


def test_a_hold_is_held_for_its_laps_of_two_legs_and_two_minutes_of_turns_or_its_minutes():
    hold = holds.parse("KMSN:270:R:1M:2T")
    assert holds.held_minutes(hold, 110) == pytest.approx(8.0)
    assert holds.held_minutes(holds.parse("KMSN:270:R:1M:15M"), 110) == 15
