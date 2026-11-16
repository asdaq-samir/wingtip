"""A field's elevation and runways are NASR's wherever NASR lists the field,
and an OurAirports row for the same ident more than nasr_fields.MATCH_NM
from NASR's reference point lends it nothing (the aviation audit's AV-1).
Seeded with the 2026-10-29 cycle's own rows for 32TX and C29 and
OurAirports' for the same idents; and, where the real files are on disk,
over every open field."""

from pathlib import Path

import pandas as pd
import pytest

from wingtip import airports, pattern

OURS = {"iso_country": "US", "icao_code": None, "gps_code": None, "wikipedia_link": None}
#: OurAirports' rows: its 32TX is Hinson Airport at Kenney, TX, some 300 nm
#: east of NASR's 32TX, Rockpile Ranch; its KC29 is NASR's C29 at Middleton.
AIRPORTS = [
    {
        **OURS,
        "ident": "32TX",
        "local_code": "32TX",
        "type": "small_airport",
        "name": "Hinson Airport",
        "latitude_deg": 30.0580997467041,
        "longitude_deg": -96.35919952392578,
        "elevation_ft": 365,
        "municipality": "Kenney",
        "iso_region": "US-TX",
        "wikipedia_link": "https://en.wikipedia.org/wiki/Hinson",
    },
    {
        **OURS,
        "ident": "KC29",
        "local_code": "C29",
        "type": "small_airport",
        "name": "Middleton Municipal Morey Field",
        "latitude_deg": 43.1143,
        "longitude_deg": -89.531502,
        "elevation_ft": 928,
        "municipality": "Middleton",
        "iso_region": "US-WI",
    },
    # A field NASR does not list: OurAirports' runways are all there are.
    {
        **OURS,
        "ident": "XOA1",
        "local_code": "XOA1",
        "type": "small_airport",
        "name": "Only Ours",
        "latitude_deg": 44.0,
        "longitude_deg": -90.0,
        "elevation_ft": 1000,
        "municipality": "Nowhere",
        "iso_region": "US-WI",
    },
]
RUNWAY = {"le_latitude_deg": None, "le_longitude_deg": None, "he_latitude_deg": None, "he_longitude_deg": None}
OURS_RUNWAYS = [
    {**RUNWAY, "airport_ident": "32TX", "length_ft": 1866, "width_ft": 100, "surface": "TURF-G", "lighted": 0, "closed": 0}
    | {"le_ident": "12", "he_ident": "30", "le_heading_degT": None, "he_heading_degT": None},
    {**RUNWAY, "airport_ident": "KC29", "length_ft": 1780, "width_ft": 120, "surface": "GRE", "lighted": 0, "closed": 0}
    | {"le_ident": "01", "he_ident": "19", "le_heading_degT": 7.5, "he_heading_degT": 187.5},
    {**RUNWAY, "airport_ident": "KC29", "length_ft": 2195, "width_ft": 110, "surface": "GRS", "lighted": 0, "closed": 1}
    | {"le_ident": "18", "he_ident": "36", "le_heading_degT": 180, "he_heading_degT": 360},
    {**RUNWAY, "airport_ident": "XOA1", "length_ft": 2500, "width_ft": 60, "surface": "ASP", "lighted": 1, "closed": 0}
    | {"le_ident": "09", "he_ident": "27", "le_heading_degT": 90, "he_heading_degT": 270},
]
OURS_FREQUENCIES = [
    {"airport_ident": "32TX", "type": "UNIC", "description": "Hinson's CTAF", "frequency_mhz": 122.9},
    {"airport_ident": "KC29", "type": "UNIC", "description": "CTAF/UNICOM", "frequency_mhz": 123.0},
]
#: NASR APT_BASE: Rockpile Ranch and Middleton, and TST, a field with a
#: runway its remarks close.
NASR_BASE = [
    {"ARPT_ID": "32TX", "ICAO_ID": None, "ARPT_NAME": "ROCKPILE RANCH", "CITY": "KENT", "STATE_CODE": "TX", "ARPT_STATUS": "O"}
    | {"LAT_DECIMAL": 30.79200555, "LONG_DECIMAL": -104.25085555, "ELEV": 5386, "SITE_TYPE_CODE": "A", "FACILITY_USE_CODE": "PR"},
    {"ARPT_ID": "C29", "ICAO_ID": None, "ARPT_NAME": "MIDDLETON MUNI/MOREY FLD", "CITY": "MIDDLETON", "STATE_CODE": "WI"}
    | {
        "ARPT_STATUS": "O",
        "LAT_DECIMAL": 43.1144118,
        "LONG_DECIMAL": -89.5321368,
        "ELEV": 928,
        "SITE_TYPE_CODE": "A",
        "FACILITY_USE_CODE": "PU",
    },
    {"ARPT_ID": "TST", "ICAO_ID": "KTST", "ARPT_NAME": "TEST FIELD", "CITY": "MIDDLETON", "STATE_CODE": "WI", "ARPT_STATUS": "O"}
    | {"LAT_DECIMAL": 43.2, "LONG_DECIMAL": -89.6, "ELEV": 900, "SITE_TYPE_CODE": "A", "FACILITY_USE_CODE": "PU"},
    # Chicago Executive, whose 12/30 has a displaced threshold at each end.
    {"ARPT_ID": "PWK", "ICAO_ID": "KPWK", "ARPT_NAME": "CHICAGO EXEC", "CITY": "CHICAGO", "STATE_CODE": "IL", "ARPT_STATUS": "O"}
    | {"LAT_DECIMAL": 42.11488277, "LONG_DECIMAL": -87.9019925, "ELEV": 644.9, "SITE_TYPE_CODE": "A", "FACILITY_USE_CODE": "PU"},
]
NASR_RUNWAYS = [
    {"ARPT_ID": "32TX", "RWY_ID": "05/23", "RWY_LEN": 3931, "RWY_WIDTH": 100, "SURFACE_TYPE_CODE": "TURF", "RWY_LGT_CODE": None},
    {"ARPT_ID": "C29", "RWY_ID": "01/19", "RWY_LEN": 1050, "RWY_WIDTH": 120, "SURFACE_TYPE_CODE": "TURF", "RWY_LGT_CODE": None},
    {"ARPT_ID": "C29", "RWY_ID": "10/28", "RWY_LEN": 4001, "RWY_WIDTH": 100, "SURFACE_TYPE_CODE": "ASPH", "RWY_LGT_CODE": "MED"},
    {"ARPT_ID": "TST", "RWY_ID": "06R/24L", "RWY_LEN": 5000, "RWY_WIDTH": 100, "SURFACE_TYPE_CODE": "CONC", "RWY_LGT_CODE": "HIGH"},
    {"ARPT_ID": "PWK", "RWY_ID": "12/30", "RWY_LEN": 4415, "RWY_WIDTH": 75, "SURFACE_TYPE_CODE": "ASPH", "RWY_LGT_CODE": "MED"},
]
END = {"LAT_DECIMAL": None, "LONG_DECIMAL": None, "TRUE_ALIGNMENT": None}
NASR_ENDS = [
    {**END, "ARPT_ID": "32TX", "RWY_ID": "05/23", "RWY_END_ID": "05"},
    {**END, "ARPT_ID": "32TX", "RWY_ID": "05/23", "RWY_END_ID": "23"},
    {
        "ARPT_ID": "C29",
        "RWY_ID": "01/19",
        "RWY_END_ID": "01",
        "TRUE_ALIGNMENT": 7,
        "LAT_DECIMAL": 43.11475555,
        "LONG_DECIMAL": -89.52809722,
    },
    {
        "ARPT_ID": "C29",
        "RWY_ID": "01/19",
        "RWY_END_ID": "19",
        "TRUE_ALIGNMENT": 187,
        "LAT_DECIMAL": 43.11761188,
        "LONG_DECIMAL": -89.52758811,
    },
    {
        "ARPT_ID": "C29",
        "RWY_ID": "10/28",
        "RWY_END_ID": "10",
        "TRUE_ALIGNMENT": 100,
        "LAT_DECIMAL": 43.11486627,
        "LONG_DECIMAL": -89.54064797,
    },
    {
        "ARPT_ID": "C29",
        "RWY_ID": "10/28",
        "RWY_END_ID": "28",
        "TRUE_ALIGNMENT": 280,
        "LAT_DECIMAL": 43.11302733,
        "LONG_DECIMAL": -89.52587938,
    },
    {"ARPT_ID": "PWK", "RWY_ID": "12/30", "RWY_END_ID": "12", "TRUE_ALIGNMENT": 118, "DISPLACED_THR_LEN": 295, "LNDG_DIST_AVBL": 3785}
    | {"LAT_DECIMAL": 42.11539236, "LONG_DECIMAL": -87.90716866},
    {"ARPT_ID": "PWK", "RWY_ID": "12/30", "RWY_END_ID": "30", "TRUE_ALIGNMENT": 298, "DISPLACED_THR_LEN": 432, "LNDG_DIST_AVBL": 3725}
    | {"LAT_DECIMAL": 42.10971125, "LONG_DECIMAL": -87.89280077},
]
NASR_REMARKS = [
    # As LHW's are filed: "6R" in the remark for APT_RWY's "06R".
    {"ARPT_ID": "TST", "REF_COL_NAME": "RWY_ID", "ELEMENT": "06R/24L", "REMARK": "RWY 6R/24L CLSD INDEFLY."},
    # A closure to some flights alone is not the runway's.
    {"ARPT_ID": "C29", "REF_COL_NAME": "GENERAL_REMARK", "ELEMENT": "", "REMARK": "RWY 10/28 CLSD TO NIGHT OPNS."},
]


@pytest.fixture
def raw(tmp_path):
    """OurAirports' three tables with NASR's four beside them, as data/raw keeps them."""
    pd.DataFrame(AIRPORTS).to_csv(tmp_path / "airports.csv", index=False)
    pd.DataFrame(OURS_RUNWAYS).to_csv(tmp_path / "runways.csv", index=False)
    pd.DataFrame(OURS_FREQUENCIES).to_csv(tmp_path / "airport-frequencies.csv", index=False)
    faa = tmp_path / "faa_nasr"
    faa.mkdir()
    for name, rows in (("APT_BASE", NASR_BASE), ("APT_RWY", NASR_RUNWAYS), ("APT_RWY_END", NASR_ENDS), ("APT_RMK", NASR_REMARKS)):
        pd.DataFrame(rows).to_csv(faa / f"{name}.csv", index=False)
    return tmp_path


def test_32tx_is_rockpile_ranch_at_its_own_elevation_not_hinsons(raw):
    place = airports.find_place("32TX", cache_path=raw / "airports.csv")
    assert (place["lat"], place["lon"]) == pytest.approx((30.79200555, -104.25085555))
    assert place["elevation_ft"] == 5386  # NASR APT_BASE ELEV; OurAirports' 365 is Hinson's
    assert place["name"] == "Rockpile Ranch"
    assert (place["municipality"], place["region"]) == ("Kent", "US-TX")
    (nearest,) = airports.nearest(30.792, -104.251, limit=1, cache_path=raw / "airports.csv")
    assert (nearest["ident"], nearest["elevation_ft"]) == ("32TX", 5386)
    planned = airports.get_airport("32TX", cache_path=raw / "airports.csv")
    assert (planned["lat"], planned["lon"], planned["elevation_ft"]) == pytest.approx((30.79200555, -104.25085555, 5386))
    assert planned["name"] == "Rockpile Ranch"


def test_32tx_has_nasrs_one_turf_runway_and_none_of_hinsons_figures(raw):
    (runway,) = airports.get_runways("32TX", cache_path=raw / "runways.csv")
    assert runway == {
        "ends": "05/23",
        "end_headings": [("05", None), ("23", None)],
        "end_positions": {},
        "end_distances": {"05": {"displaced_threshold_ft": None, "lda_ft": None}, "23": {"displaced_threshold_ft": None, "lda_ft": None}},
        "length_ft": 3931,
        "width_ft": 100,
        "surface": "TURF",
        "lighted": False,
        "closed": False,
    }
    assert airports.get_frequencies("32TX", cache_path=raw / "airport-frequencies.csv", faa_cache_dir=None) == []
    assert airports.wikipedia_link("32TX", cache_path=raw / "airports.csv") is None


def test_c29s_runways_are_nasrs_lengths_and_18_36_is_gone(raw):
    runways = airports.get_runways("KC29", cache_path=raw / "runways.csv")
    assert [(r["ends"], r["length_ft"], r["surface"], r["lighted"]) for r in runways] == [
        ("01/19", 1050, "TURF", False),  # OurAirports' 1,780
        ("10/28", 4001, "ASPH", True),  # RWY_LGT_CODE MED
    ]
    assert runways[1]["end_headings"] == [("10", 100.0), ("28", 280.0)]
    assert runways[0]["end_positions"]["01"] == pytest.approx((43.11475555, -89.52809722))
    # A remark closing it to night flights does not close the runway.
    assert not runways[1]["closed"]
    assert airports.get_runways("C29", cache_path=raw / "runways.csv") == runways
    # C29's own row is NASR's field: OurAirports' CTAF is kept beside the FAA's.
    assert [f["frequency_mhz"] for f in airports.get_frequencies("KC29", raw / "airport-frequencies.csv", None)] == [123.0]


def test_a_runway_nasrs_remarks_close_is_closed(raw):
    (runway,) = airports.get_runways("KTST", cache_path=raw / "runways.csv")
    assert (runway["ends"], runway["closed"]) == ("06R/24L", True)


def test_each_end_carries_nasrs_displaced_threshold_and_landing_distance(raw, monkeypatch):
    # PWK 12/30, 4,415 ft: 12's threshold displaced 295 ft, 3,785 ft to
    # land on; 30's 432 ft, 3,725 ft (NASR APT_RWY_END, 2026-10-29 cycle).
    (runway,) = airports.get_runways("KPWK", cache_path=raw / "runways.csv")
    assert runway["length_ft"] == 4415
    assert runway["end_distances"] == {
        "12": {"displaced_threshold_ft": 295, "lda_ft": 3785},
        "30": {"displaced_threshold_ft": 432, "lda_ft": 3725},
    }
    monkeypatch.setattr(pattern, "right_traffic_ends", lambda ident, cache_dir: set())
    monkeypatch.setattr(pattern, "end_positions", lambda ident, cache_dir: {})
    ends = pattern.with_traffic([runway], "PWK", 42.11, -87.90)[0]["runway_ends"]
    assert [(e["ident"], e["displaced_threshold_ft"], e["lda_ft"]) for e in ends] == [("12", 295, 3785), ("30", 432, 3725)]
    # 32TX's ends have none in NASR: none said, never the runway's length.
    (turf,) = airports.get_runways("32TX", cache_path=raw / "runways.csv")
    assert turf["end_distances"]["05"] == {"displaced_threshold_ft": None, "lda_ft": None}


def test_a_field_nasr_does_not_list_keeps_ourairports_runways(raw):
    (runway,) = airports.get_runways("XOA1", cache_path=raw / "runways.csv")
    assert (runway["ends"], runway["length_ft"]) == ("9/27", 2500)  # OurAirports' as pandas reads it


# The guard over the real files (CI's data/raw cache, the planner's own
# disk), as test_closed_fields': no open field's elevation is other than
# NASR's, and the two the audit named have NASR's runways.
RAW = Path(__file__).resolve().parents[3] / "data/raw"


@pytest.mark.skipif(
    not (RAW / "airports.csv").exists() or not (RAW / "faa_nasr/APT_BASE.csv").exists(),
    reason="needs OurAirports' and NASR's tables on disk",
)
def test_no_real_open_field_has_an_elevation_other_than_nasrs():
    us = airports._us_airports(airports.DEFAULT_CACHE_PATH)
    open_ = us[us["_closed"].isna()]
    base = pd.read_csv(RAW / "faa_nasr/APT_BASE.csv", dtype=str, usecols=["ARPT_ID", "ICAO_ID", "ELEV"])
    icao = base.dropna(subset=["ICAO_ID"])
    elev = {**dict(zip(icao["ICAO_ID"], icao["ELEV"])), **dict(zip(base["ARPT_ID"], base["ELEV"]))}
    # By the first of a row's idents NASR lists, as the planner reads it.
    nasr = pd.Series(None, index=open_.index, dtype=object)
    for column in ("local_code", "ident", "icao_code", "gps_code"):
        known = open_[column].where(open_[column].notna()).astype(object)
        nasr = nasr.fillna(known.map(lambda i: elev.get(i.strip().upper()) if isinstance(i, str) else None))
    nasr = pd.to_numeric(nasr, errors="coerce")
    checked = nasr.notna()
    assert checked.sum() > 15_000
    wrong = open_[checked & (open_["elevation_ft"] != nasr)]
    assert wrong.empty, wrong[["_display_ident", "elevation_ft"]].head(20).to_string()
    if (RAW / "faa_nasr/APT_RWY.csv").exists():
        assert all(r["length_ft"] != 1866 for r in airports.get_runways("32TX"))
        assert "18/36" not in {r["ends"] for r in airports.get_runways("KC29")}
