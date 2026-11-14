"""The owner's hard rule (2026-11-13, decision 0043): a field the FAA's NASR
lists as closed (APT_BASE ARPT_STATUS CI, closed indefinitely, or CP,
closed permanently; anything but O) is never shown or offered as an open
one. It is in no list a pilot picks a landing site, a stop or an
alternate from, nor on the map; a search for its ident finds it after
the open fields, labelled; its card says so. The rule is the engine's
(field_status); these hold every planner path that hands fields to a
pilot to it, over fields seeded beside open ones -- and, where the real
NASR and OurAirports files are on disk, over every closed field in them."""

import gzip
import json
from pathlib import Path

import pandas as pd
import pytest

from wingtip import airports, copilot, emergency, faa_data, field_status, fuelstops
from wingtip.engine import ask as engine

ROW = {"municipality": "", "iso_region": "US-IL", "iso_country": "US", "elevation_ft": 800, "icao_code": None, "gps_code": None}
#: OurAirports' rows: two open fields and, beside them, two NASR lists as
#: closed -- 9II2 Nelund Field, CI in the 2026-10-29 cycle, and one CP --
#: each a small airport to OurAirports, as the audit found (PF-1).
FIELDS = [
    {
        **ROW,
        "ident": "KC81",
        "local_code": "C81",
        "name": "Campbell Airport",
        "type": "small_airport",
        "latitude_deg": 42.3246,
        "longitude_deg": -88.0741,
    },
    {
        **ROW,
        "ident": "KPWK",
        "icao_code": "KPWK",
        "local_code": "PWK",
        "name": "Chicago Executive",
        "type": "medium_airport",
        "latitude_deg": 42.1142,
        "longitude_deg": -87.9015,
    },
    {
        **ROW,
        "ident": "9II2",
        "local_code": "9II2",
        "name": "Nelund Field",
        "type": "small_airport",
        "latitude_deg": 42.30,
        "longitude_deg": -88.06,
    },
    {
        **ROW,
        "ident": "XCP1",
        "local_code": "XCP1",
        "name": "Campbell Gone Field",
        "type": "small_airport",
        "latitude_deg": 42.31,
        "longitude_deg": -88.05,
    },
]
#: NASR's APT_BASE rows for them, with what fuelstops reads: all four sell 100LL.
NASR = [("C81", None, "O"), ("PWK", "KPWK", "O"), ("9II2", None, "CI"), ("XCP1", None, "CP")]
CLOSED = {"9II2": "Closed indefinitely", "XCP1": "Closed permanently"}
#: Over Grayslake, a mile from each.
AT = (42.31, -88.06)


@pytest.fixture
def table(tmp_path):
    """OurAirports' table with NASR's APT_BASE beside it, as the planner keeps them."""
    path = tmp_path / "airports.csv"
    pd.DataFrame(FIELDS).to_csv(path, index=False)
    (tmp_path / "faa_nasr").mkdir()
    lat_lon = {f["local_code"]: (f["latitude_deg"], f["longitude_deg"]) for f in FIELDS}
    pd.DataFrame(
        [
            {
                "ARPT_ID": faa,
                "ICAO_ID": icao,
                "ARPT_STATUS": status,
                "ARPT_NAME": faa,
                "CITY": "GRAYSLAKE",
                "SITE_TYPE_CODE": "A",
                "FACILITY_USE_CODE": "PU",
                "FUEL_TYPES": "100LL",
                "ELEV": 800,
                "LAT_DECIMAL": lat_lon[faa][0],
                "LONG_DECIMAL": lat_lon[faa][1],
            }
            for faa, icao, status in NASR
        ]
    ).to_csv(tmp_path / "faa_nasr" / "APT_BASE.csv", index=False)
    return path


def test_the_engine_rules_each_nasr_status():
    # Only O is open; CI and CP are labelled; no NASR record is the host's.
    assert engine("field_status", status="O") == {"open": True, "closed": None}
    assert engine("field_status", status="CI") == {"open": False, "closed": "Closed indefinitely"}
    assert engine("field_status", status="CP") == {"open": False, "closed": "Closed permanently"}
    assert engine("field_status", status="")["open"] is False
    assert engine("field_status", status=None) == {"open": True, "closed": None}
    assert field_status.is_open("O") and not field_status.is_open("CP")


def test_a_closed_field_is_not_on_the_map_or_in_nearest(table):
    assert sorted(p["ident"] for p in airports.places_in(40, -90, 44, -86, cache_path=table)) == ["C81", "KPWK"]
    near = [p["ident"] for p in airports.nearest(*AT, limit=10, cache_path=table)]
    assert near == ["C81", "KPWK"]


def test_a_closed_field_is_found_by_its_ident_labelled_and_after_the_open_ones(table):
    (found,) = airports.search_airports("9II2", cache_path=table)
    assert (found["ident"], found["closed"]) == ("9II2", "Closed indefinitely")
    # "campbell": the open field first, the closed one after it, labelled.
    found = airports.search_airports("campbell", cache_path=table)
    assert [(f["ident"], f["closed"]) for f in found] == [("C81", None), ("XCP1", "Closed permanently")]
    found = airports.search_airports("campbell gone", cache_path=table)
    assert [(f["ident"], f["closed"]) for f in found] == [("XCP1", "Closed permanently")]


def test_a_closed_fields_card_says_so(table):
    assert airports.find_place("9II2", cache_path=table)["closed"] == "Closed indefinitely"
    assert airports.find_place("XCP1", cache_path=table)["closed"] == "Closed permanently"
    assert airports.find_place("C81", cache_path=table)["closed"] is None


def test_the_phones_search_index_labels_every_closed_field(table):
    index = json.loads(gzip.decompress(airports.search_index(cache_path=table)))
    assert index["closed"] == CLOSED
    assert {row[0] for row in index["airports"]} == {"C81", "KPWK", "9II2", "XCP1"}


@pytest.fixture
def near_here(table, monkeypatch):
    """emergency.fields_near over the seeded table, its weather, radio and
    contacts none: what it hands the engine's best_fields."""
    nearest = airports.nearest
    monkeypatch.setattr(airports, "nearest", lambda lat, lon, limit=10: nearest(lat, lon, limit, cache_path=table))
    monkeypatch.setattr(emergency.weather, "metar_for_idents", lambda idents: {})
    monkeypatch.setattr(airports, "get_frequencies_for", lambda idents: {})
    monkeypatch.setattr(emergency, "_runways", lambda source, variation: [])
    monkeypatch.setattr(faa_data, "military_fields", lambda cache_dir: {})
    monkeypatch.setattr(faa_data, "private_fields", lambda cache_dir: frozenset())
    monkeypatch.setattr(faa_data, "airport_contact", lambda ident, cache_dir: {})
    return table


def test_a_closed_field_is_no_emergency_or_glide_candidate(near_here):
    fields = emergency.fields_near(*AT, limit=12)
    assert [f["ident"] for f in fields] == ["C81", "KPWK"]
    assert all(f["status"] == "O" for f in fields)
    ranked = engine("best_fields", mode="glide", at={"lat": AT[0], "lon": AT[1]}, fields=fields)
    assert {f["ident"] for f in ranked["fields"]} == {"C81", "KPWK"}


def test_a_closed_field_is_not_the_copilots_diversion(near_here, monkeypatch):
    find_place = airports.find_place
    monkeypatch.setattr(copilot.airports, "find_place", lambda ident: find_place(ident, cache_path=near_here))
    monkeypatch.setattr(copilot.fuelstops, "fields_with_fuel", lambda: pd.DataFrame({"ident": [], "faa_ident": []}))
    idents = {f["ident"] for f in copilot.fields(*AT, "C81", "9II2")}
    assert idents == {"C81", "KPWK"}


def test_a_closed_field_sells_no_fuel_stop_and_is_no_public_field(table):
    apt = table.parent / "faa_nasr" / "APT_BASE.csv"
    selling = fuelstops._fields_of(str(apt), apt.stat().st_mtime)
    assert sorted(selling["faa_ident"]) == ["C81", "PWK"]
    every = fuelstops._fields_of(str(apt), apt.stat().st_mtime, False)
    assert sorted(every["faa_ident"]) == ["C81", "PWK"]


def test_the_closed_fields_by_ident_are_nasrs(table):
    assert field_status.closed_fields(table.parent / "faa_nasr") == CLOSED


# The guard over the real files (CI's data/raw cache, the planner's own
# disk): whatever the cycle, no closed field is drawn, listed or offered,
# and every one the search finds is labelled.
RAW = Path(__file__).resolve().parents[3] / "data/raw"


@pytest.mark.skipif(
    not (RAW / "airports.csv").exists() or not (RAW / "faa_nasr/APT_BASE.csv").exists(),
    reason="needs OurAirports' and NASR's tables on disk",
)
def test_no_real_closed_field_is_shown_as_open():
    us = airports._us_airports(airports.DEFAULT_CACHE_PATH)
    closed = us[us["_closed"].notna()]
    assert len(closed) > 0, "NASR lists closed fields every cycle (229 in 2026-10-29's)"
    shown = {p["ident"] for p in airports.places_in(17, -180, 72, -60, limit=100_000)}
    assert shown.isdisjoint(set(closed["_display_ident"]))
    for _, field in closed.head(50).iterrows():
        assert {p["ident"] for p in airports.nearest(field["latitude_deg"], field["longitude_deg"], limit=5)}.isdisjoint(
            set(closed["_display_ident"])
        )
        hits = [h for h in airports.search_airports(field["_display_ident"], limit=25) if h["ident"] == field["_display_ident"]]
        assert hits and all(h["closed"] for h in hits), field["_display_ident"]
    index = json.loads(gzip.decompress(airports.search_index()))
    assert set(index["closed"]) == set(closed["_display_ident"])
