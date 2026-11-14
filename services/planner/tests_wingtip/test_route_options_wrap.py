"""Route options across the antimeridian (the aviation audit's AV-11): the
engine frames Adak (176.6 W) to Shemya (174.1 E) within 180 degrees of the
departure, so its boxes and samples may pass -180; the planner reads them
on the data's side."""

import numpy as np

from wingtip import route_options


def test_a_box_past_the_antimeridian_is_read_as_its_two_halves():
    assert route_options._boxes((50.0, -190.0, 54.0, -170.0)) == [(50.0, 170.0, 54.0, 180.0), (50.0, -180.0, 54.0, -170.0)]
    assert route_options._boxes((50.0, 170.0, 54.0, 185.0)) == [(50.0, 170.0, 54.0, 180.0), (50.0, -180.0, 54.0, -175.0)]
    assert route_options._boxes((40.0, -90.0, 42.0, -85.0)) == [(40.0, -90.0, 42.0, -85.0)]
    # Shemya's station is inside a frame drawn west of Adak past -180.
    assert route_options._in((50.0, -190.0, 54.0, -170.0), 52.7, 174.1)
    assert not route_options._in((50.0, -190.0, 54.0, -170.0), 52.7, 160.0)


def test_the_samples_are_read_at_the_datas_own_longitudes():
    frame = {"cell_deg": 0.25, "per_cell": 5, "lat0": 51.0, "lon0": -186.0, "rows": 1, "cols": 48}
    _, lons = route_options._samples(frame)
    assert lons.min() >= -180.0 and lons.max() < 180.0
    # The first sample, 185.975 W, is 174.025 E.
    assert np.isclose(lons[0, 0], 174.025)
