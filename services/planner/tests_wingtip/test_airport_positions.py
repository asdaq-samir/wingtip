"""Where a field is: the FAA's own reference point where NASR lists it."""

import pandas as pd

from wingtip.airports import find_place


def test_a_field_the_faa_lists_sits_at_the_faas_reference_point(tmp_path):
    # OurAirports had KDEN 190 m south of NASR's ARP, so the card's ring sat
    # off the map's mark (the owner's screenshot, 2026-11-12).
    path = tmp_path / "us_airports.csv"
    pd.DataFrame(
        [
            {
                "ident": "KDEN",
                "icao_code": "KDEN",
                "local_code": "DEN",
                "gps_code": "KDEN",
                "name": "Denver Intl",
                "type": "large_airport",
                "municipality": "Denver",
                "iso_region": "US-CO",
                "iso_country": "US",
                "elevation_ft": 5434,
                "latitude_deg": 39.860027,
                "longitude_deg": -104.673792,
            }
        ]
    ).to_csv(path, index=False)
    (tmp_path / "faa_nasr").mkdir()
    pd.DataFrame(
        [{"ARPT_ID": "DEN", "ICAO_ID": "KDEN", "ARPT_STATUS": "O", "LAT_DECIMAL": 39.86166666, "LONG_DECIMAL": -104.67316666}]
    ).to_csv(tmp_path / "faa_nasr" / "APT_BASE.csv", index=False)
    place = find_place("KDEN", cache_path=path)
    assert (place["lat"], place["lon"]) == (39.86166666, -104.67316666)
