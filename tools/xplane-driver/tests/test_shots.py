"""The shot list: its checks, the takes a gap cuts, when the recorder runs,
and the clock."""

import pytest

from wingtip_replay import shots
from wingtip_replay.camera import Body, chase, ease, flyby_point, look_at, quaternion

RUNS = [(0.0, 30.0), (40.0, 60.0)]


def spec(*shot_list, **settings):
    return {"flight": "sample.fdr", **settings, "shots": list(shot_list)}


def test_a_shot_across_a_gap_is_two_takes():
    _, shot_list = shots.load(spec({"kind": "chase", "from_s": 20, "to_s": 50}), 60)
    assert [(t.start, t.end) for t in shots.takes(shot_list, RUNS)] == [(20, 30), (40, 50)]


def test_a_take_shorter_than_a_second_is_left_out():
    _, shot_list = shots.load(spec({"kind": "tower", "from_s": 29.5, "to_s": 45, "lat": 0, "lon": 0, "alt_ft": 0}), 60)
    assert [(t.start, t.end) for t in shots.takes(shot_list, RUNS)] == [(40, 45)]


def test_the_recorder_runs_through_a_cut_and_stops_at_a_gap():
    _, shot_list = shots.load(spec({"kind": "chase", "from_s": 0, "to_s": 10}, {"kind": "flyby", "from_s": 10, "to_s": 50}), 60)
    assert shots.recording_spans(shots.takes(shot_list, RUNS)) == [(0, 30), (40, 50)]


def test_the_take_at_a_time_and_the_next_one():
    _, shot_list = shots.load(spec({"kind": "chase", "from_s": 0, "to_s": 50}), 60)
    all_takes = shots.takes(shot_list, RUNS)
    assert shots.take_at(all_takes, 35) is None
    assert shots.next_take(all_takes, 35).start == 40
    assert shots.take_at(all_takes, 30) is None and shots.take_at(all_takes, 29.9).start == 0


@pytest.mark.parametrize(
    ("bad", "words"),
    [
        (spec({"kind": "drone"}), "kind must be"),
        (spec({"kind": "chase", "from_s": 5, "to_s": 2}), "before it starts"),
        (spec({"kind": "chase", "from_s": 0, "to_s": 10}, {"kind": "flyby", "from_s": 5, "to_s": 20}), "overlaps"),
        (spec(clock="wall"), "clock must be"),
        (spec(source="xml"), "source must be"),
        ({"shots": []}, "no 'flight'"),
    ],
)
def test_a_shot_list_that_cannot_play_says_why(bad, words):
    with pytest.raises(shots.ShotListError, match=words):
        shots.load(bad, 60)


def test_a_shot_past_the_flights_end_is_cut_to_it():
    _, shot_list = shots.load(spec({"kind": "chase", "from_s": 50, "to_s": 90}, {"kind": "flyby", "from_s": 70, "to_s": 80}), 60)
    assert [(s.start, s.end) for s in shot_list] == [(50, 60)]


def test_the_fixed_clock_moves_a_frame_at_a_time_however_slow_the_mac():
    clock = shots.Clock("fixed", 30, 10.0)
    for slow in (0.2, 0.5, 0.01):
        clock.tick(slow)
    assert abs(clock.t - 10.1) < 1e-9
    real = shots.Clock("real", 30, 0.0)
    real.tick(0.25)
    assert real.t == 0.25


def test_the_quaternion_of_level_north_is_the_identity_and_every_one_is_a_unit():
    assert quaternion(0, 0, 0) == pytest.approx((1, 0, 0, 0))
    for angles in ((90, 0, 0), (123, -7, 25), (359, 15, -60)):
        assert sum(c * c for c in quaternion(*angles)) == pytest.approx(1.0)


def test_the_chase_camera_is_behind_and_above_looking_down_at_the_airplane():
    north = Body(0, 100, 0, 0, 0, 0)
    x, y, z, pitch, heading, roll, zoom = chase(north, 0, 40, 8)
    assert (x, y, z) == pytest.approx((0, 108, 40))  # +z is south: behind a northbound airplane
    assert heading == 0 and pitch < 0 and (roll, zoom) == (0, 1)


def test_a_flyby_stands_to_the_right_and_looks_at_the_airplane():
    east = Body(0, 0, 0, 90, 0, 0)
    point = flyby_point(east, 60, 5)
    assert point == pytest.approx((0, 5, 60))  # right of eastbound is south
    heading, _ = look_at(point, (0, 0, 0))
    assert heading == pytest.approx(0)


def test_the_chase_camera_swings_round_the_short_way_and_lags():
    assert ease(None, 90, 0.033, 1.5) == 90
    step = ease(350, 10, 0.033, 1.5)
    assert 350 < step < 360
    assert ease(350, 10, 100, 1.5) == pytest.approx(10, abs=1e-6)
