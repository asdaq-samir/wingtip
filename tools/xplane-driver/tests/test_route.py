"""The test flight's path in time: off the ground at once, climbing as soon
as a point above asks, descending late enough to cross a point below at
its height, and at rest at the end for as long as the file says."""

import pytest

from wingtip_replay import route


def flight():
    p = route.Point
    points = [
        p("A", "takeoff", True, 0.0, 0.0, 100.0, 0.0),
        p("B", "takeoff", True, 0.01, 0.0, 100.0, 30.0),
        p("C", "climb", False, 0.1, 0.0, 1000.0, 50.0),
        p("D", "enroute", False, 0.2, 0.0, 500.0, 50.0),
        p("E", "landing", True, 0.25, 0.0, 100.0, 20.0),
        p("F", "rollout", True, 0.26, 0.0, 100.0, 0.0),
    ]
    return points, route.profile(points, [1000.0, 9000.0, 10000.0, 5000.0, 1000.0], 5.0, 6.0, 10.0)


def first_on(table, leg):
    return next(s for s in table if s.leg == leg)


def test_it_starts_at_rest_on_the_ground_and_moves_off_at_once():
    _, table = flight()
    assert table[0].alt_m == 100.0
    assert table[0].speed_mps == route.CREEP_MPS
    assert all(s.alt_m == 100.0 for s in table if s.leg == 0)
    assert all(b.s_m >= a.s_m for a, b in zip(table, table[1:]))


def test_it_climbs_at_once_and_holds_the_height_above():
    _, table = flight()
    assert first_on(table, 2).alt_m == pytest.approx(1000.0)
    assert max(s.alt_m for s in table) == pytest.approx(1000.0)
    assert max(s.vs_mps for s in table) <= 5.0 + 1e-9


def test_it_descends_late_and_crosses_the_point_below_at_its_height():
    _, table = flight()
    halfway = next(s for s in table if s.leg == 2 and s.frac >= 0.5)
    assert halfway.alt_m == pytest.approx(1000.0)  # 500 m at 6 m/s is the last 4 km at 50 m/s
    assert first_on(table, 3).alt_m == pytest.approx(500.0, abs=6.0 * route.STEP_S * 2)
    assert min(s.vs_mps for s in table if s.leg == 2) >= -6.0 - 1e-9


def test_it_comes_down_onto_the_ground_point_and_rests_at_the_end():
    points, table = flight()
    assert first_on(table, 4).alt_m == pytest.approx(100.0, abs=1.0)
    resting = [s for s in table if s.resting]
    assert resting[0].speed_mps == 0.0
    assert resting[-1].t - resting[0].t == pytest.approx(10.0, abs=route.STEP_S)
    assert route.place(points, resting[-1].leg, resting[-1].frac) == pytest.approx((0.26, 0.0))
    assert table[-1].phase == "rollout"


def test_between_two_samples_the_figures_are_in_proportion():
    _, table = flight()
    a, b = table[100], table[101]
    mid = route.at(table, (a.t + b.t) / 2)
    assert mid.s_m == pytest.approx((a.s_m + b.s_m) / 2)
    assert route.at(table, -5).t == table[0].t
    assert route.at(table, 1e9) == table[-1]


def test_the_time_at_a_distance_is_the_first_sample_there():
    _, table = flight()
    assert route.time_at(table, 0.0) == 0.0
    assert route.time_at(table, 10_000.0) == first_on(table, 2).t
    assert route.time_at(table, 1e12) == table[-1].t


def test_a_point_along_a_runway_is_put_its_fraction_of_the_way():
    spec = {
        "points": [
            {
                "name": "Lift-off",
                "phase": "takeoff",
                "ground": True,
                "lat": 43.0,
                "lon": -89.0,
                "toward_lat": 43.1,
                "toward_lon": -89.2,
                "fraction": 0.25,
                "alt_m": 260.0,
                "speed_mps": 30.0,
            }
        ]
    }
    (p,) = route.points_of(spec)
    assert (p.lat, p.lon) == pytest.approx((43.025, -89.05))
