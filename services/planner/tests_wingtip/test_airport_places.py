"""The places the map draws (find_place, places_in, nearest) and the US
table they are read from, against small local tables."""

from pathlib import Path

import pandas as pd
import pytest

from wingtip import airport_us, airports
from wingtip.airport_places import _among, _place_of, _places_of
from wingtip.airports import find_place, places_in, search_airports


def test_a_place_is_found_by_any_ident_it_goes_by(us_airports_csv):
    assert find_place("C81", cache_path=us_airports_csv)["ident"] == "C81"
    assert find_place("kc81", cache_path=us_airports_csv)["ident"] == "C81"
    duluth = find_place("KDLH", cache_path=us_airports_csv)
    assert duluth["ident"] == "KDLH"
    assert duluth["source_ident"] == "KDLH"
    assert duluth["kind"] == "medium"
    assert find_place("CYQT", cache_path=us_airports_csv) is None
    assert find_place("", cache_path=us_airports_csv) is None


def test_a_three_letter_field_goes_by_its_k_code_where_one_with_a_digit_goes_by_its_own(us_airports_csv):
    # KPWK, not PWK, beside KMDW: OurAirports leaves its icao_code empty.
    assert find_place("PWK", cache_path=us_airports_csv)["ident"] == "KPWK"
    assert find_place("KPWK", cache_path=us_airports_csv)["ident"] == "KPWK"
    # C81 has no ICAO code; OurAirports' KC81 is its own invention.
    assert find_place("KC81", cache_path=us_airports_csv)["ident"] == "C81"


def test_the_places_in_a_box_are_landing_fields_biggest_first(us_airports_csv):
    everywhere = places_in(40, -95, 47, -87, cache_path=us_airports_csv)
    assert [p["ident"] for p in everywhere] == ["KMSP", "KDLH", "KPWK", "C81"]
    assert [p["ident"] for p in places_in(46, -93, 47, -92, cache_path=us_airports_csv)] == ["KDLH"]
    assert [p["ident"] for p in places_in(40, -95, 47, -87, limit=1, cache_path=us_airports_csv)] == ["KMSP"]
    # Only the ones asked for, before the limit: KMSP would come first.
    assert [p["ident"] for p in places_in(40, -95, 47, -87, limit=1, cache_path=us_airports_csv, only={"KDLH"})] == ["KDLH"]
    # The ones that report ahead of the rest, then by size: the limit
    # drops the bigger fields with no weather, not the small one with it.
    first = places_in(40, -95, 47, -87, limit=2, cache_path=us_airports_csv, first={"KC81"})
    assert [p["ident"] for p in first] == ["C81", "KMSP"]


def test_the_box_helpers_answer_as_isin_and_iterrows_did(us_airports_csv):
    from wingtip.airport_us import _us_airports

    df = _us_airports(us_airports_csv)
    for chosen in ({"KDLH", "nowhere"}, set()):
        assert _among(df["ident"], chosen).tolist() == df["ident"].isin(list(chosen)).tolist()
    assert _places_of(df) == [_place_of(row) for _, row in df.iterrows()]
    # A box with no fields in it, with `only` and with `first`.
    assert places_in(0, 0, 1, 1, cache_path=us_airports_csv) == []
    assert places_in(40, -95, 47, -87, cache_path=us_airports_csv, only=set()) == []
    assert _places_of(df.iloc[0:0]) == []


def test_the_nearest_fields_are_found_nearest_first_with_how_far_and_which_way(tmp_path):
    csv = tmp_path / "airports.csv"
    csv.write_text(
        "id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,"
        "scheduled_service,icao_code,iata_code,gps_code,local_code,home_link,wikipedia_link,keywords\n"
        '1,"KC81","small_airport","Campbell",42.3246,-88.0741,788,"NA","US","US-IL","Grayslake","no",,,"KC81","C81",,,\n'
        '2,"KUGN","medium_airport","Waukegan",42.4222,-87.8679,727,"NA","US","US-IL","Waukegan","no","KUGN",,"KUGN","UGN",,,\n'
        '3,"IL99","heliport","A Hospital",42.33,-88.07,700,"NA","US","US-IL","Somewhere","no",,,,"IL99",,,\n'
    )
    found = airports.nearest(42.30, -88.10, limit=2, cache_path=csv)
    assert [f["ident"] for f in found] == ["C81", "KUGN"]
    assert found[0]["distance_nm"] < found[1]["distance_nm"]
    assert 0 <= found[1]["bearing_deg"] < 90


def test_only_the_fields_the_faa_lists_are_drawn_searched_and_nearest(us_airports_csv, tmp_path):
    # The owner, 2026-10-27, of LL97 (in OurAirports, not in NASR): "I
    # would take it out if it's not showing with FAA". With the FAA's
    # airport file beside OurAirports', a field it doesn't list by any of
    # its idents is left out.
    (nasr := tmp_path / "faa_nasr").mkdir()
    listed = [("DLH", "KDLH"), ("C81", None), ("PWK", "KPWK")]
    pd.DataFrame([{"ARPT_ID": a, "ICAO_ID": i, "ARPT_STATUS": "O"} for a, i in listed]).to_csv(nasr / "APT_BASE.csv", index=False)
    everywhere = [p["ident"] for p in places_in(40, -95, 48, -87, cache_path=us_airports_csv)]
    assert sorted(everywhere) == ["C81", "KDLH", "KPWK"]
    assert search_airports("minneapolis", cache_path=us_airports_csv) == []
    assert search_airports("MSP", cache_path=us_airports_csv) == []
    assert {a["ident"] for a in search_airports("campbell", cache_path=us_airports_csv)} == {"C81"}
    assert "KMSP" not in [a["ident"] for a in airports.nearest(44.88, -93.22, limit=3, cache_path=us_airports_csv)]
    assert find_place("KMSP", cache_path=us_airports_csv) is None


def test_with_no_faa_file_every_field_is_kept(us_airports_csv):
    assert "KMSP" in [p["ident"] for p in places_in(40, -95, 48, -87, cache_path=us_airports_csv)]


def test_the_us_table_is_built_once_however_many_ask_at_once(tmp_path, monkeypatch):
    """After a restart some twenty requests asked for it while it was being
    built, and each built its own: the planner answered nothing for twelve
    minutes (2026-10-28)."""
    import functools
    import threading
    import time

    built = []

    def slow(*args):
        built.append(1)
        time.sleep(0.2)
        return pd.DataFrame()

    monkeypatch.setattr(airport_us, "_us_airports_of", functools.lru_cache(maxsize=2)(slow))
    path = tmp_path / "airports.csv"
    path.write_text("ident\n")
    monkeypatch.setattr(airport_us, "_ensure_cached", lambda url, p: path)
    threads = [threading.Thread(target=airport_us._us_airports, args=(path,)) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(built) == 1


def _place_as_before(ident: str, cache_path):
    """find_place as it was before its idents were indexed: each column
    upper-cased and compared whole, the first match's row -- the oracle."""
    from wingtip.airport_us import _us_airports

    ident = ident.strip().upper()
    if not ident:
        return None
    df = _us_airports(cache_path)
    for column in ("_display_ident", "_ident_upper", "_local_upper"):
        match = df[df[column].astype(str).str.upper() == ident]
        if not match.empty:
            return _place_of(match.iloc[0])
    return None


def test_the_indexed_place_is_the_one_each_column_scan_found(us_airports_csv):
    # C81 is two rows' local code (the old record and its successor), and
    # a missing local code reads "NAN" both ways.
    asked = ["C81", "kc81", "KC81", " c81 ", "KDLH", "DLH", "PWK", "KPWK", "US-0043", "MN02", "MN01", "CYQT", "NAN", "nan", "", "ZZZZ"]
    for ident in asked:
        assert find_place(ident, cache_path=us_airports_csv) == _place_as_before(ident, us_airports_csv), ident


@pytest.mark.skipif(not (Path(__file__).resolve().parents[3] / "data/raw/airports.csv").exists(), reason="needs OurAirports' table on disk")
def test_the_indexed_place_matches_on_the_real_table():
    from wingtip.airport_us import _us_airports
    from wingtip.airports import DEFAULT_CACHE_PATH

    df = _us_airports(DEFAULT_CACHE_PATH)
    picked = df.sample(150, random_state=91)
    asked = [
        *picked["_display_ident"].fillna(""),
        *picked["ident"].fillna("").str.lower(),
        *picked["local_code"].fillna(""),
        "KORD",
        "C81",
        "KMKE",
        "NAN",
        "NOPE",
    ]
    for ident in asked:
        assert find_place(ident) == _place_as_before(ident, DEFAULT_CACHE_PATH), ident
