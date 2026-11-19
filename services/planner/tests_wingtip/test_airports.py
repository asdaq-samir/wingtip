"""airports.get_airport/get_runways/get_frequencies, against small local
CSVs shaped like OurAirports' real ones -- no network call, and no
collision with the real disk cache, since each test gets its own
tmp_path and _load_table keys its cache on that exact path.
"""

import pandas as pd
import pytest

from wingtip import airport_tables, faa_data
from wingtip.airports import get_airport, get_frequencies, get_frequencies_for, get_runways


def test_get_airport_finds_by_ident(airports_csv):
    airport = get_airport("KDLH", cache_path=airports_csv)

    assert airport["name"] == "Duluth Intl"
    assert airport["lat"] == pytest.approx(46.8421)
    assert airport["elevation_ft"] == 1428.0


def test_get_airport_finds_by_local_code(airports_csv):
    airport = get_airport("C81", cache_path=airports_csv)

    assert airport["ident"] == "US-0C81"


def test_get_airport_is_case_insensitive(airports_csv):
    assert get_airport("kdlh", cache_path=airports_csv)["ident"] == "KDLH"


def test_get_airport_takes_the_k_form_of_a_local_code(tmp_path):
    # Lamoni, IA: "LWD" in OurAirports with no ICAO code of its own, and
    # "KLWD" in the FAA's NASR file, which the fuel stops are offered from.
    path = tmp_path / "airports.csv"
    pd.DataFrame(
        [
            {
                "ident": "LWD",
                "local_code": "LWD",
                "name": "Lamoni Municipal",
                "latitude_deg": 40.63,
                "longitude_deg": -93.90,
                "elevation_ft": 1131,
                "municipality": "Lamoni",
                "iso_region": "US-IA",
            }
        ]
    ).to_csv(path, index=False)
    assert get_airport("KLWD", cache_path=path)["ident"] == "LWD"


def test_get_airport_raises_for_an_unknown_ident(airports_csv):
    with pytest.raises(ValueError, match="ZZZZ"):
        get_airport("ZZZZ", cache_path=airports_csv)


def test_get_runways_joins_le_and_he_idents(runways_csv):
    runways = get_runways("KDLH", cache_path=runways_csv)

    ends = {r["ends"] for r in runways}
    assert ends == {"09L/27R", "03"}


def test_get_runways_returns_nothing_for_an_airport_with_none_listed(runways_csv):
    assert get_runways("KMSP", cache_path=runways_csv) == []


def test_get_frequencies_sorts_ctaf_first(frequencies_csv):
    frequencies = get_frequencies("KDLH", cache_path=frequencies_csv, faa_cache_dir=None)

    assert [f["type"] for f in frequencies] == ["CTAF", "TWR", "ATIS"]


def test_the_faas_frequencies_come_first_with_ourairports_weather_beside_them(frequencies_csv, monkeypatch):

    monkeypatch.setattr(
        faa_data,
        "airport_frequencies",
        lambda ident, cache_dir: (
            [
                {"type": "ATIS", "description": None, "frequency_mhz": 124.1},
                {"type": "TWR", "description": "DULUTH", "frequency_mhz": 118.3},
            ]
            if ident == "KDLH"
            else None
        ),
    )
    frequencies = get_frequencies("KDLH", cache_path=frequencies_csv, faa_cache_dir="faa")
    assert [(f["type"], f["frequency_mhz"]) for f in frequencies] == [("TWR", 118.3), ("ATIS", 124.1)]
    # A field the FAA's file lists nothing for: OurAirports' own.
    monkeypatch.setattr(faa_data, "airport_frequencies", lambda ident, cache_dir: None)
    assert [f["type"] for f in get_frequencies("KDLH", cache_path=frequencies_csv, faa_cache_dir="faa")] == ["CTAF", "TWR", "ATIS"]


def test_ourairports_ctaf_stays_where_the_faa_lists_only_the_approach(frequencies_csv, monkeypatch):

    only_approach = [{"type": "A/D", "description": "Duluth", "frequency_mhz": 125.45}]
    monkeypatch.setattr(faa_data, "airport_frequencies", lambda ident, cache_dir: only_approach)
    monkeypatch.setattr(faa_data, "airport_frequencies_for", lambda idents, cache_dir: {"KDLH": only_approach})
    for frequencies in (
        get_frequencies("KDLH", cache_path=frequencies_csv, faa_cache_dir="faa"),
        get_frequencies_for(["KDLH"], cache_path=frequencies_csv, faa_cache_dir="faa")["KDLH"],
    ):
        assert [f["type"] for f in frequencies] == ["CTAF", "TWR", "ATIS", "A/D"]


def test_two_stages_asking_for_a_table_at_once_download_it_once_and_both_read_it_whole(tmp_path, monkeypatch):
    """A briefing asks for the runways from two stages at once. On a
    cold cache each downloaded the table, and one read the other's
    half-written file: "No columns to parse from file", a 500 for the
    first briefing after a fresh start."""
    import threading

    downloads = []
    body = b"id,airport_ident,le_ident,he_ident\n1,KDLH,09,27\n" + b"2,KDLH,03,21\n" * 20000

    class SlowResponse:
        content = body

        @staticmethod
        def raise_for_status():
            pass

    def slow_get(url, headers=None, timeout=None):
        downloads.append(url)
        threading.Event().wait(0.05)
        return SlowResponse()

    monkeypatch.setattr(airport_tables.outside, "get", slow_get)
    path = tmp_path / "runways.csv"
    sizes, errors = [], []

    def read():
        try:
            sizes.append(airport_tables._ensure_cached("https://example.test/runways.csv", path).stat().st_size)
        except Exception as err:  # noqa: BLE001 -- the assertion below names it
            errors.append(err)

    threads = [threading.Thread(target=read) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == []
    assert downloads == ["https://example.test/runways.csv"]
    assert sizes == [len(body)] * 4
    assert not list(tmp_path.glob("*.part"))


def test_get_airport_takes_the_first_row_when_a_code_is_one_rows_ident_and_anothers_local_code(tmp_path):
    path = tmp_path / "airports.csv"
    base = dict(latitude_deg=40.0, longitude_deg=-90.0, elevation_ft=100, municipality="X", iso_region="US-IL")
    pd.DataFrame(
        [
            dict(ident="US-0AB", local_code="ABC", name="Local code first", **base),
            dict(ident="ABC", local_code=None, name="Ident second", **base),
            dict(ident=" kxyz ", local_code=None, name="Padded", **base),
        ]
    ).to_csv(path, index=False)
    assert get_airport("abc", cache_path=path)["name"] == "Local code first"
    assert get_airport("KXYZ", cache_path=path)["name"] == "Padded"
    with pytest.raises(ValueError):
        get_airport("NAN", cache_path=path)


def test_a_table_on_disk_is_read_without_the_lock_or_a_download(airports_csv, monkeypatch):
    def refuse(*a, **k):
        raise AssertionError("touched the lock or the network")

    monkeypatch.setattr(airport_tables, "locked", refuse)
    monkeypatch.setattr(airport_tables.outside, "get", refuse)
    assert airport_tables._ensure_cached("http://unused", airports_csv) == airports_csv
    assert get_airport("KDLH", cache_path=airports_csv)["name"] == "Duluth Intl"
