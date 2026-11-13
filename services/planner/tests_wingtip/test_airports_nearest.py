"""wingtip.airports.nearest is the emergency list's candidates
(wingtip.emergency.fields_near), so it has to be the nearest fields, not
the first that fill a box. Four real fields round Prince William Sound,
OurAirports' rows as published; the distances are WGS-84 geodesics worked
apart from the code (Vincenty's inverse) and rounded as nearest rounds."""

import pytest

from wingtip import airports

HEADER = (
    "id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,"
    "scheduled_service,icao_code,iata_code,gps_code,local_code,home_link,wikipedia_link,keywords\n"
)
SOUND = (
    '9293,"2AK5","small_airport","Johnstone Point Airport",60.4817008972,-146.583999634,15,'
    '"NA","US","US-AK","Hinchinbrook","no",,,"PAJO","2AK5",,,\n'
    '14173,"7KA","small_airport","Tatitlek Airport",60.871449,-146.690297,62,'
    '"NA","US","US-AK","Tatitlek","yes","PAKA","TEK","PAKA","7KA",,,\n'
    '5418,"PAVD","medium_airport","Valdez Pioneer Field",61.132712,-146.246567,121,'
    '"NA","US","US-AK","Valdez","yes","PAVD","VDZ","PAVD","VDZ",,,\n'
    '17876,"PAWR","small_airport","Whittier Airport",60.777225,-148.719606,30,'
    '"NA","US","US-AK","Whittier","no","PAWR",,"PAWR","IEM",,,\n'
)
#: Over the sound at 61 N, where a degree of longitude is 29 nm.
AT = (61.0, -147.5)


@pytest.fixture
def sound_csv(tmp_path):
    path = tmp_path / "airports.csv"
    path.write_text(HEADER + SOUND)
    return path


def test_at_61_north_a_field_east_of_the_old_box_is_still_among_the_nearest(sound_csv):
    # The old search's first box was 0.75 degrees of latitude and 1.125 of
    # longitude round the position: it held Tatitlek and Johnstone Point,
    # two fields for a limit of two, and stopped, so Johnstone Point (41.2
    # nm) was listed and Valdez (37.4 nm, 1.25 degrees east) was not.
    assert abs(-146.246567 - AT[1]) > 0.75 * 1.5 and abs(-146.583999634 - AT[1]) < 0.75 * 1.5
    found = airports.nearest(*AT, limit=2, cache_path=sound_csv)
    assert [f["ident"] for f in found] == ["7KA", "PAVD"]
    assert [f["distance_nm"] for f in found] == pytest.approx([24.9, 37.4], abs=0.1)
    assert 60 < found[1]["bearing_deg"] < 90


def test_the_nearest_are_in_order_every_way_round_and_whittier_west_is_third(sound_csv):
    found = airports.nearest(*AT, limit=4, cache_path=sound_csv)
    assert [f["ident"] for f in found] == ["7KA", "PAVD", "PAWR", "2AK5"]
    assert [f["distance_nm"] for f in found] == pytest.approx([24.9, 37.4, 38.2, 41.2], abs=0.1)
    assert 240 < found[2]["bearing_deg"] < 270


def test_asked_for_more_than_lie_within_the_cap_it_lists_those_there_are(sound_csv):
    found = airports.nearest(*AT, limit=10, cache_path=sound_csv)
    assert [f["ident"] for f in found] == ["7KA", "PAVD", "PAWR", "2AK5"]
