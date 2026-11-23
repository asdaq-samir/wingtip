"""wingtip.route_join's course line: on the great circle, its ends the
fixes given, a point every few miles, worked out in one ask of the engine."""

from wingtip import geo, route_join

MSN = (43.1399, -89.3375)
DEN = (39.8617, -104.6731)


def test_the_course_line_is_the_great_circle_with_its_ends_the_fixes():
    line = route_join.course_line(MSN, DEN)
    assert line[0] == list(MSN) and line[-1] == list(DEN)
    gaps = [geo.distance_nm(*a, *b) for a, b in zip(line, line[1:])]
    assert max(gaps) <= 5.0 + 1e-6
    # Every point on the great circle, to the foot.
    assert max(abs(geo.cross_track_distance_nm(lat, lon, MSN, DEN)) for lat, lon in line) < 0.001


def test_the_course_line_asks_the_engine_once_not_twice_a_step(monkeypatch):
    asked = []
    real = geo._figure
    monkeypatch.setattr(geo, "_figure", lambda name, *values: asked.append(name) or real(name, *values))
    route_join.course_line(MSN, DEN)
    # The distance, then great_circle_points' inverse and its destinations.
    assert len(asked) <= 4


def test_a_line_between_one_point_and_itself_is_that_point():
    assert route_join.course_line(MSN, MSN) == [list(MSN), list(MSN)]
