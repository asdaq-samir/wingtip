"""wingtip.time_zone: the zone a field keeps, from where it is."""

import pytest

from wingtip import time_zone


@pytest.mark.parametrize(
    ("lat", "lon", "zone"),
    [
        # KOSH, Oshkosh, Wisconsin: Central.
        (43.9844, -88.557, "America/Chicago"),
        # KPHX, Phoenix: Arizona keeps no daylight saving time.
        (33.4343, -112.0116, "America/Phoenix"),
        # KHNL, Honolulu.
        (21.3187, -157.9225, "Pacific/Honolulu"),
        # KIND, Indianapolis, in Eastern time; KEVV, Evansville, in the
        # state's Central corner: a state is not a zone.
        (39.7173, -86.2944, "America/Indiana/Indianapolis"),
        (38.037, -87.5324, "America/Chicago"),
    ],
)
def test_a_fields_zone_is_where_it_is(lat, lon, zone):
    assert time_zone.at(lat, lon) == zone
