"""A leg's variation and air are read half way along its geodesic
(wingtip.altitude.midpoint), never at the mean of its longitudes: across
the antimeridian that mean is half a world from the leg."""

from wingtip.altitude import midpoint

ADAK, SHEMYA = (51.878, -176.646), (52.7123, 174.1136)


def test_the_midpoint_of_a_leg_across_the_antimeridian_is_on_it():
    lat, lon = midpoint(ADAK, SHEMYA)
    # Between the two fields, west of Adak and past 180: not near Greenwich.
    assert 51.8 < lat < 53.0
    assert abs(lon) > 175.0


def test_the_midpoint_of_a_short_leg_is_about_the_mean():
    lat, lon = midpoint((42.3246, -88.0741), (42.1142, -87.9015))
    assert abs(lat - 42.2194) < 0.01 and abs(lon - -87.9878) < 0.01
