"""The NTSB's record (wingtip.history.ntsb): the store made from the
database's tables as mdb-export gives them (fixtures/history/ntsb_*.csv,
real rows of avall.mdb of 2026-11-01, trimmed to three cases and a few
others' occurrences), each phase in the NTSB's own words, the cases of a
registration within a day either side, texts verbatim, and a weekly
delta (ntsb_delta_*.csv, up08NOV.mdb's rows of two cases) written over
the store case by case."""

import csv
from pathlib import Path

import pytest

from wingtip.history import ntsb

FIXTURES = Path(__file__).parent / "fixtures" / "history"
TABLES = {
    "events": "ntsb_events.csv",
    "aircraft": "ntsb_aircraft.csv",
    "narratives": "ntsb_narratives.csv",
    "Events_Sequence": "ntsb_events_sequence.csv",
    "eADMSPUB_DataDictionary": "ntsb_data_dictionary.csv",
}


def _rows(table: str, prefix: str = "ntsb_"):
    with (FIXTURES / TABLES[table].replace("ntsb_", prefix)).open(newline="", encoding="utf-8") as f:
        yield from csv.DictReader(f)


def _delta(table: str):
    # The delta's own data dictionary is avall's; the fixture keeps one copy.
    return _rows(table, "ntsb_" if table == "eADMSPUB_DataDictionary" else "ntsb_delta_")


@pytest.fixture
def store(tmp_path):
    path = tmp_path / "ntsb.sqlite"
    assert ntsb.build(_rows, path) == 3
    return path


def test_each_phase_is_the_words_its_occurrences_begin_with():
    words = ntsb.phase_words(_rows("Events_Sequence"))
    assert words["404"] == "Enroute-descent"
    assert words["400"] == "Enroute"
    assert words["550"] == "Landing"
    assert words["100"] == "Prior to flight"


def test_a_preliminary_case_by_its_n_number_a_day_either_side(store):
    for day in ("2026-10-21", "2026-10-22", "2026-10-23"):
        (case,) = ntsb.events("N5393W", day, store)
        assert case["ntsb_no"] == "CEN27LA029"
    assert ntsb.events("N5393W", "2026-10-24", store) == []
    assert case["date"] == "2026-10-22"
    assert (case["city"], case["state"], case["country"]) == ("Claremore", "OK", "USA")
    assert case["phase"] == "Enroute-descent"
    assert case["highest_injury"] == "None"
    assert case["probable_cause"] is None
    assert case["narrative_kind"] == "preliminary"
    assert case["narrative"].startswith("On October 22, 2026, about 1510 central daylight time, a Piper PA-28-160 airplane, N5393W,")
    assert case["carol_url"] == "https://data.ntsb.gov/carol-repgen/api/Aviation/ReportMain/GenerateNewestReport/204059/pdf"
    assert case["docket_url"] == "https://data.ntsb.gov/Docket/?NTSBNumber=CEN27LA029"


def test_a_final_case_gives_its_probable_cause_and_final_narrative_verbatim(store):
    (case,) = ntsb.events("n594ba", "2025-07-26", store)
    with (FIXTURES / "ntsb_narratives.csv").open(newline="", encoding="utf-8") as f:
        kept = next(r for r in csv.DictReader(f) if r["ev_id"] == "20260317202660")
    assert case["narrative_kind"] == "final"
    assert case["probable_cause"] == kept["narr_cause"]
    assert case["narrative"] == kept["narr_accf"]
    assert case["phase"] == "Enroute"


def test_a_registration_is_matched_without_its_n_or_dashes(store):
    assert [c["ntsb_no"] for c in ntsb.events("5393W", "2026-10-22", store)] == ["CEN27LA029"]
    assert [c["ntsb_no"] for c in ntsb.events("N-5393W", "2026-10-22", store)] == ["CEN27LA029"]
    assert ntsb.registration("C-GBHZ") == "CGBHZ"


def test_no_store_yet_is_no_cases(tmp_path):
    assert ntsb.events("N5393W", "2026-10-22", tmp_path / "none.sqlite") == []


def test_an_older_id_points_at_carols_search():
    assert ntsb._carol("20080210X00161") == ntsb.CAROL_SEARCH


def test_a_delta_replaces_a_case_it_has_and_adds_a_new_one(store):
    # CEN27LA009 in avall: no narrative yet.
    (before,) = ntsb.events("N473AS", "2026-10-12", store)
    assert before["narrative"] is None and before["highest_injury"] == "Serious"
    assert ntsb.events("N1297G", "2026-11-02", store) == []

    assert ntsb.apply(_delta, store) == 2

    (after,) = ntsb.events("N473AS", "2026-10-12", store)
    assert after["narrative"].startswith("On October 12, 2026, about 1513 central daylight time, a Monnett Sonerai")
    assert after["narrative_kind"] == "preliminary"
    (added,) = ntsb.events("N1297G", "2026-11-02", store)
    assert (added["ntsb_no"], added["city"], added["state"]) == ("ERA27LA028", "Dayton", "OH")
    # Its one occurrence cannot tell the phase's words; avall's could.
    assert added["phase"] == "Takeoff-rejected takeoff"
    # The cases it does not name are left as they were.
    assert [c["ntsb_no"] for c in ntsb.events("N5393W", "2026-10-22", store)] == ["CEN27LA029"]


def test_a_delta_applied_twice_leaves_one_of_each(store):
    ntsb.apply(_delta, store)
    ntsb.apply(_delta, store)
    assert len(ntsb.events("N473AS", "2026-10-12", store)) == 1


def test_every_case_of_an_airplane_with_its_kind_and_damage_newest_first(store):
    (case,) = ntsb.cases("N5393W", store)
    # The NTSB's words for ev_type ACC and damage SUBS (its data dictionary).
    assert (case["ntsb_no"], case["date"], case["kind"], case["damage"]) == ("CEN27LA029", "2026-10-22", "Accident", "Substantial")
    assert (case["city"], case["state"], case["highest_injury"], case["phase"]) == ("Claremore", "OK", "None", "Enroute-descent")
    assert case["carol_url"].endswith("/204059/pdf")
    assert ntsb.cases("594BA", store)[0]["ntsb_no"] == "ERA25LA382"
    assert ntsb.cases("N12345", store) == []
    assert ntsb.schema(store) == ntsb.SCHEMA


def test_no_cases_where_the_store_is_not_built(tmp_path):
    assert ntsb.cases("N5393W", tmp_path / "ntsb.sqlite") == []
