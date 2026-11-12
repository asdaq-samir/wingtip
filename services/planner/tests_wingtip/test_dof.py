"""wingtip.dof: the FAA's Digital Obstacle File read on the README's
columns (DOF README, 21 May 2026, "The DOF format"), checked whole so a
shifted layout stops the read, held one edition at a time, with its
Parquet copy beside it; and the newest released DOF zip off the FAA's
page.

fixtures/dof_sample.DAT is the 2 Aug 2026 edition's header and six of its
records, as the FAA sent them; the expected figures are read off those
lines by the README's columns, not from the code."""

import os
from datetime import date
from pathlib import Path

import pandas as pd
import pytest
from cachetools import LRUCache

from wingtip import dof

FIXTURES = Path(__file__).parent / "fixtures"
SAMPLE = FIXTURES / "dof_sample.DAT"


def _dof_line(city: str, agl: int = 350) -> str:
    """One fixed-column DOF.DAT record, laid out by _DOF_COLUMNS."""
    line = [" "] * 130
    fields = {
        "city": city,
        "lat_deg": "41",
        "lat_min": "30",
        "lat_sec": "00.00",
        "lat_hem": "N",
        "lon_deg": "093",
        "lon_min": "40",
        "lon_sec": "00.00",
        "lon_hem": "W",
        "type": "TOWER",
        "agl": f"{agl:05d}",
        "amsl": f"{agl + 1100:05d}",
        "lt": "R",
    }
    for name, text in fields.items():
        start, end = dof._DOF_COLUMNS[name]
        line[start:end] = list(text[: end - start].ljust(end - start))
    return "".join(line) + "\n"


def _write_dof(path, cities) -> None:
    path.write_text("".join(_dof_line(city) for city in cities), encoding="latin-1")


@pytest.fixture(autouse=True)
def empty_cache(monkeypatch):
    monkeypatch.setattr(dof, "_OBSTACLES_CACHE", LRUCache(maxsize=1))


# --- the README's columns ---


def test_the_faas_own_records_read_as_the_readme_lays_them_out():
    obstacles = dof._parse_dof(SAMPLE)

    assert len(obstacles) == 6
    # 01-001307: 30 10 45.00N 088 04 39.00W, a rig, AGL HT 00236 (84-88),
    # AMSL HT 00236 (90-94), lighting R (96).
    rig = obstacles.iloc[0]
    assert rig["city"] == "DAUPHIN ISLAND" and rig["type"] == "RIG"
    assert rig["lat"] == pytest.approx(30 + 10 / 60 + 45 / 3600)
    assert rig["lon"] == pytest.approx(-(88 + 4 / 60 + 39 / 3600))
    assert (rig["agl_ft"], rig["amsl_ft"], rig["lit"]) == (236, 236, True)
    # 06-327052 at El Centro: on ground below sea level, AMSL HT -0018.
    assert (obstacles.iloc[1]["agl_ft"], obstacles.iloc[1]["amsl_ft"]) == (31, -18)
    # AS-000023 at Leone: south of the equator, 14 21 19.00S.
    assert obstacles.iloc[2]["lat"] == pytest.approx(-(14 + 21 / 60 + 19 / 3600))
    # 02-292529 at Eareckson: east of 180, 174 06 36.60E.
    assert obstacles.iloc[3]["lon"] == pytest.approx(174 + 6 / 60 + 36.6 / 3600)
    # Lighting U (unknown) and N (none) are not lit.
    assert not obstacles.iloc[4]["lit"] and not obstacles.iloc[5]["lit"]
    # 08-081433, a catenary 1,380 ft above the ground, 7,673 ft MSL.
    assert (obstacles.iloc[5]["type"], obstacles.iloc[5]["agl_ft"], obstacles.iloc[5]["amsl_ft"]) == ("CATENARY", 1380, 7673)


def test_a_record_shifted_a_column_stops_the_read_at_its_line(tmp_path):
    lines = SAMPLE.read_text(encoding="latin-1").splitlines(keepends=True)
    lines[6] = " " + lines[6]
    shifted = tmp_path / "DOF.DAT"
    shifted.write_text("".join(lines), encoding="latin-1")

    with pytest.raises(ValueError, match=r"line 7 .*DOF README"):
        dof._parse_dof(shifted)


def test_a_height_with_a_space_in_it_is_no_height(tmp_path):
    """A shift inside one field: 00236 read as 0023 and a blank would be
    a tenth of the obstacle's height."""
    lines = SAMPLE.read_text(encoding="latin-1").splitlines(keepends=True)
    lines[4] = lines[4][:83] + " 0236" + lines[4][88:]
    damaged = tmp_path / "DOF.DAT"
    damaged.write_text("".join(lines), encoding="latin-1")

    with pytest.raises(ValueError, match=r"line 5 has agl ' ?0236'"):
        dof._parse_dof(damaged)


def test_a_header_that_moved_is_not_read(tmp_path):
    lines = SAMPLE.read_text(encoding="latin-1").splitlines(keepends=True)
    lines[1] = " " + lines[1]
    moved = tmp_path / "DOF.DAT"
    moved.write_text("".join(lines), encoding="latin-1")

    with pytest.raises(ValueError, match="header is not the DOF README's"):
        dof._parse_dof(moved)


def test_a_file_with_no_records_is_a_failure_not_a_country_without_obstacles(tmp_path):
    header = tmp_path / "DOF.DAT"
    header.write_text("".join(SAMPLE.read_text(encoding="latin-1").splitlines(keepends=True)[:4]), encoding="latin-1")

    with pytest.raises(ValueError):
        dof._parse_dof(header)


# --- the Parquet copy and the one edition held ---


def test_obstacles_round_trip_through_the_parquet_cache(tmp_path, monkeypatch):
    path = tmp_path / "DOF.DAT"
    _write_dof(path, ["DES MOINES", "AMES"])

    parsed = dof._load_all_obstacles(path)

    assert list(parsed["city"]) == ["DES MOINES", "AMES"]
    assert parsed["lat"].iloc[0] == pytest.approx(41.5) and parsed["lon"].iloc[0] == pytest.approx(-93.6667, abs=1e-4)
    assert dof._obstacle_cache_path(path).exists()

    # A fresh process: nothing in memory, the Parquet copy answers, and
    # the text file is not walked again.
    monkeypatch.setattr(dof, "_OBSTACLES_CACHE", LRUCache(maxsize=1))
    monkeypatch.setattr(dof, "_parse_dof", lambda path: pytest.fail("parsed instead of reading the cache"))
    cached = dof._load_all_obstacles(path)

    pd.testing.assert_frame_equal(cached, parsed, check_dtype=False)


def test_a_new_dof_cycle_rebuilds_the_cache_and_lets_the_old_one_go(tmp_path, monkeypatch):
    path = tmp_path / "DOF.DAT"
    _write_dof(path, ["DES MOINES"])
    dof._load_all_obstacles(path)

    # The next cycle: a re-downloaded file with different content.
    _write_dof(path, ["DES MOINES", "OMAHA"])
    later = os.stat(path).st_mtime + 100
    os.utime(path, (later, later))
    parses = []
    real_parse = dof._parse_dof
    monkeypatch.setattr(dof, "_parse_dof", lambda path: parses.append(path) or real_parse(path))

    rebuilt = dof._load_all_obstacles(path)

    assert parses == [path]
    assert list(rebuilt["city"]) == ["DES MOINES", "OMAHA"]
    # The edition before is no longer held beside it.
    assert len(dof._OBSTACLES_CACHE) == 1


def test_load_obstacles_is_the_typed_dof_columns_filtered(tmp_path):
    path = tmp_path / "DOF.DAT"
    path.write_text(_dof_line("TALL", agl=350) + _dof_line("SHORT", agl=150), encoding="latin-1")

    tall = dof.load_obstacles(path, (41.0, -94.0, 42.0, -93.0), min_agl_ft=200)
    assert list(tall["city"]) == ["TALL"]
    assert tall["amsl_ft"].iloc[0] == 350 + 1100

    elsewhere = dof.load_obstacles(path, (45.0, -90.0, 46.0, -89.0), min_agl_ft=0)
    assert elsewhere.empty and "amsl_ft" in elsewhere.columns


# --- which zip ---


def test_the_newest_released_dof_zip_not_the_first_link():
    """The FAA's page (fixtures/dof_page.html, 2026-11-12) lists 2 Aug
    first and 27 Sep second, released 4 Aug and 29 Sep."""
    page = (FIXTURES / "dof_page.html").read_text()

    assert dof.dof_zip_url(page, date(2026, 11, 12)).endswith("DOF_260927.zip")
    # The day before 27 Sep's release, 2 Aug's is still the one out.
    assert dof.dof_zip_url(page, date(2026, 9, 28)).endswith("DOF_260802.zip")
    assert dof.dof_zip_url(page, date(2026, 9, 29)).endswith("DOF_260927.zip")
    with pytest.raises(RuntimeError):
        dof.dof_zip_url(page, date(2026, 8, 3))
