"""The flight file as the plugin reads it: rows, gaps, midnight, and the
airplane between two rows."""

from conftest import clock, fdr, northbound
from wingtip_replay.track import parse_fdr

START = 15 * 3600  # 15:00:00 UTC


def test_the_header_and_the_rows_are_read():
    flight = parse_fdr(fdr(northbound(START, 2)))
    assert flight.acft.endswith("Cessna_172SP.acf")
    assert (flight.tail, flight.date, flight.pres_inhg) == ("N1152Z", "11/08/2026", 30.12)
    assert flight.drefs == ("sim/cockpit2/controls/gear_handle_down",)
    assert len(flight.frames) == 21 and flight.start_clock_s == START
    assert flight.frames[-1].t == 2.0 and flight.frames[0].extra == (1.0,)


def test_a_gap_splits_the_runs_and_nothing_is_drawn_across_it():
    rows = northbound(START, 2) + northbound(START + 7, 1, lat0=47.6)
    flight = parse_fdr(fdr(rows))
    assert flight.run_times() == [(0.0, 2.0), (7.0, 8.0)]
    assert flight.sample(4.5) is None
    assert flight.sample(9.0) is None
    assert flight.sample(7.5).lat > 47.6


def test_between_two_rows_the_airplane_is_in_a_straight_line():
    flight = parse_fdr(fdr(northbound(START, 1)))
    a, b = flight.frames[3], flight.frames[4]
    mid = flight.sample(0.35)
    assert abs(mid.lat - (a.lat + b.lat) / 2) < 1e-9
    assert mid.alt_ft == 2000.0


def test_the_course_is_the_paths_true_course_not_the_files_magnetic_heading():
    pose = parse_fdr(fdr(northbound(START, 2))).sample(1.0)
    assert pose.heading_mag == 345.0
    assert abs(pose.course_true) < 0.01 or abs(pose.course_true - 360) < 0.01


def test_standing_still_has_no_course():
    rows = [(clock(START + i / 10), -122.21, 47.49, 30.0, 160.0, 0.0, 0.0, 1) for i in range(20)]
    assert parse_fdr(fdr(rows)).sample(1.0).course_true is None


def test_a_heading_through_north_goes_the_short_way():
    rows = [(clock(START), -122.21, 47.49, 2000, 350.0, 0, 0, 1), (clock(START + 0.1), -122.21, 47.4901, 2000, 10.0, 0, 0, 1)]
    assert abs(parse_fdr(fdr(rows)).sample(0.05).heading_mag) < 1e-6


def test_a_flight_over_midnight_runs_on_into_the_next_day():
    rows = northbound(86400 - 0.5, 1)
    flight = parse_fdr(fdr(rows))
    assert [round(f.t, 1) for f in flight.frames] == [round(i / 10, 1) for i in range(11)]
    assert len(flight.runs) == 1


def test_a_row_at_the_same_time_as_the_last_is_left_out():
    rows = northbound(START, 1)
    flight = parse_fdr(fdr(rows[:5] + [rows[4]] + rows[5:]))
    assert len(flight.frames) == len(rows)
