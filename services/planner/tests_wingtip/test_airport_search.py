"""airports.search_airports and its index: the one search box's ranking,
against small US tables (the us_airports_csv fixture)."""

import gzip
import json

import pandas as pd

from wingtip import airports
from wingtip.airports import search_airports


def test_a_search_finds_a_word_of_the_name_not_only_its_start(us_airports_csv):
    # "Executive", the second word of Chicago Executive's name; "Paul",
    # the last of Minneapolis-St Paul's.
    assert [a["ident"] for a in search_airports("exec", cache_path=us_airports_csv)] == ["KPWK"]
    assert [a["ident"] for a in search_airports("paul", cache_path=us_airports_csv)] == ["KMSP"]
    # An ident typed whole first, before the idents it starts.
    assert search_airports("kdlh", cache_path=us_airports_csv)[0]["ident"] == "KDLH"


def test_the_search_index_holds_every_us_field_the_search_answers_with(us_airports_csv):
    """The phone's own copy (search_index): each US row -- abroad left out
    -- its ident shown, name, town, state, size rank and the idents it is
    also found by where they differ from the one shown."""
    rows = json.loads(gzip.decompress(airports.search_index(cache_path=us_airports_csv)))["airports"]
    assert "CYQT" not in {r[0] for r in rows}
    # Where each is, to a hundredth of a degree, after the size; then the
    # idents it is also found by.
    shapes = [(r[:5], r[7:]) for r in rows]
    assert all(isinstance(v, float) for r in rows for v in r[5:7])
    assert (["KDLH", "Duluth Intl", "", "MN", 1], ["DLH"]) in shapes
    # C81 is found by OurAirports' made-up KC81 too.
    assert (["C81", "Campbell Airport", "", "MN", 2], ["KC81"]) in shapes
    assert (["MN01", "A Helipad", "", "MN", 3], []) in shapes


def test_a_search_puts_the_bigger_field_first(tmp_path):
    path = tmp_path / "airports.csv"
    row = {
        "iso_region": "US-WI",
        "iso_country": "US",
        "elevation_ft": 800,
        "latitude_deg": 44.0,
        "longitude_deg": -88.5,
        "local_code": None,
        "icao_code": None,
    }
    pd.DataFrame(
        [
            {**row, "ident": "2WN8", "name": "Oshkosh Sky Ranch Airport", "municipality": "Omro", "type": "small_airport"},
            {
                **row,
                "ident": "KOSH",
                "icao_code": "KOSH",
                "local_code": "OSH",
                "name": "Wittman Regional Airport",
                "municipality": "Oshkosh",
                "type": "medium_airport",
            },
        ]
    ).to_csv(path, index=False)

    # Wittman is Oshkosh's by its town, and the bigger field.
    assert [a["ident"] for a in search_airports("oshkosh", cache_path=path)] == ["KOSH", "2WN8"]


def test_a_search_puts_a_name_that_starts_with_it_and_then_the_nearest_first_among_fields_of_a_size(tmp_path):
    """The owner's ask (2026-10-22): "Campbell" typed at Grayslake found
    eight strips named or towned Campbell elsewhere, by their idents, and
    not Campbell Airport (C81)."""
    path = tmp_path / "airports.csv"
    row = {"iso_country": "US", "elevation_ft": 800, "icao_code": None, "type": "small_airport"}
    pd.DataFrame(
        [
            {
                **row,
                "ident": "06XS",
                "local_code": "06XS",
                "name": "Campbell Field",
                "municipality": "Aubrey",
                "iso_region": "US-TX",
                "latitude_deg": 33.3,
                "longitude_deg": -96.9,
            },
            {
                **row,
                "ident": "1A3",
                "local_code": "1A3",
                "name": "Martin Campbell Field",
                "municipality": "Copperhill",
                "iso_region": "US-TN",
                "latitude_deg": 35.0,
                "longitude_deg": -84.3,
            },
            {
                **row,
                "ident": "KC81",
                "local_code": "C81",
                "name": "Campbell Airport",
                "municipality": "Grayslake",
                "iso_region": "US-IL",
                "latitude_deg": 42.32,
                "longitude_deg": -88.07,
            },
        ]
    ).to_csv(path, index=False)
    grayslake = [(42.32, -88.07)]
    # Its name starts with it: before Martin Campbell Field, near or far.
    assert [a["ident"] for a in search_airports("campbell", cache_path=path)] == ["06XS", "C81", "1A3"]
    # And of those, the nearest first.
    assert [a["ident"] for a in search_airports("campbell", cache_path=path, near=grayslake)] == ["C81", "06XS", "1A3"]
    assert [a["ident"] for a in search_airports("campbell air", cache_path=path, near=grayslake)] == ["C81"]
