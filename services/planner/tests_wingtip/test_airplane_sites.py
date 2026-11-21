"""A field NASR files as a heliport, a balloonport or a seaplane base is no
landing site for an airplane on wheels (the engine's field_site_type,
`airplane`; NASR APT_BASE's SITE_TYPE_CODE): OurAirports calls some of
them small airports, and the nearest fields, the Stops and a glide's list
offered them. Found by its ident, its card still names its kind."""

import pandas as pd
import pytest

from wingtip import airports
from wingtip.engine import ask as engine

ROW = {"municipality": "", "iso_region": "AK", "iso_country": "US", "elevation_ft": 70, "icao_code": None, "gps_code": None}
#: Round Anchorage: Lake Hood's strip (an airport to NASR), and beside it a
#: heliport, a seaplane base and a balloonport OurAirports files as small
#: airports, as the edge-places audit found possible. Places illustrative.
FIELDS = [
    {**ROW, "ident": i, "icao_code": icao, "local_code": faa, "name": name, "type": "small_airport", "latitude_deg": y, "longitude_deg": x}
    for i, icao, faa, name, y, x in [
        ("PALH", "PALH", "LHD", "Lake Hood", 61.18, -149.97),
        ("XAH1", None, "XAH1", "Roof Pad", 61.19, -149.95),
        ("XAC1", None, "XAC1", "Spenard Lake", 61.185, -149.96),
        ("XAB1", None, "XAB1", "Balloon Meadow", 61.17, -149.98),
    ]
]
NASR = [("LHD", "PALH", "A"), ("XAH1", None, "H"), ("XAC1", None, "C"), ("XAB1", None, "B")]
AT = (61.18, -149.96)


@pytest.fixture
def table(tmp_path):
    """OurAirports' table with NASR's APT_BASE beside it, as the planner keeps them."""
    path = tmp_path / "airports.csv"
    pd.DataFrame(FIELDS).to_csv(path, index=False)
    (tmp_path / "faa_nasr").mkdir()
    at = {f["local_code"]: (f["latitude_deg"], f["longitude_deg"], f["name"].upper()) for f in FIELDS}
    rows = [
        {
            "ARPT_ID": faa,
            "ICAO_ID": icao,
            "ARPT_STATUS": "O",
            "ARPT_NAME": at[faa][2],
            "CITY": "ANCHORAGE",
            "SITE_TYPE_CODE": site,
            "FACILITY_USE_CODE": "PU",
            "ELEV": 70,
            "LAT_DECIMAL": at[faa][0],
            "LONG_DECIMAL": at[faa][1],
        }
        for faa, icao, site in NASR
    ]
    pd.DataFrame(rows).to_csv(tmp_path / "faa_nasr" / "APT_BASE.csv", index=False)
    return path


def test_the_engine_says_which_kinds_an_airplane_lands_at():
    assert [engine("field_site_type", site_type=c)["airplane"] for c in ("A", "G", "U", "H", "B", "C")] == [True] * 3 + [False] * 3
    assert engine("field_site_type", site_type=None)["airplane"] is True


def test_only_the_airport_is_among_the_nearest_and_on_the_map(table):
    assert [p["ident"] for p in airports.nearest(*AT, limit=10, cache_path=table)] == ["PALH"]
    assert [p["ident"] for p in airports.places_in(60, -151, 62, -149, cache_path=table)] == ["PALH"]


def test_a_heliport_is_still_found_by_its_ident(table):
    assert airports.find_place("XAH1", cache_path=table)["ident"] == "XAH1"
