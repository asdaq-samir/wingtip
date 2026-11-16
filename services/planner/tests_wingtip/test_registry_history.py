"""The rest of the FAA's registry download (wingtip.registry,
wingtip.registry_history, wingtip.aircraft_details): the reference files
in full, every MASTER field, the deregistered, document and reserved
files, from an archive in the FAA's own shape (its headers, byte-order
mark and padded fields; rows as the FAA writes them, the DOCINDEX and
DEREG ones copied from its download of 2026-11-13), and one check against
the real file where it is on disk."""

import csv
import io
import zipfile
from pathlib import Path

import pytest

from tests_wingtip.test_registry import MASTER_HEADER, _master
from wingtip import aircraft_details, registry, registry_history, traffic
from wingtip.history import ntsb

DEREG_HEADER = (
    "N-NUMBER,SERIAL-NUMBER,MFR-MDL-CODE,STATUS-CODE,NAME,STREET-MAIL,STREET2-MAIL,CITY-MAIL,STATE-ABBREV-MAIL,"
    "ZIP-CODE-MAIL,ENG-MFR-MDL,YEAR-MFR,CERTIFICATION,REGION,COUNTY-MAIL,COUNTRY-MAIL,AIR-WORTH-DATE,CANCEL-DATE,"
    "MODE-S-CODE,INDICATOR-GROUP,EXP-COUNTRY,LAST-ACT-DATE,CERT-ISSUE-DATE,STREET-PHYSICAL,STREET2-PHYSICAL,"
    "CITY-PHYSICAL,STATE-ABBREV-PHYSICAL,ZIP-CODE-PHYSICAL,COUNTY-PHYSICAL,COUNTRY-PHYSICAL,OTHER-NAMES(1),"
    "OTHER-NAMES(2),OTHER-NAMES(3),OTHER-NAMES(4),OTHER-NAMES(5),KIT MFR, KIT MODEL,MODE S CODE HEX,"
).split(",")
RAW = Path(__file__).resolve().parents[3] / "data/raw/faa_registry"


def _dereg(n, serial, model, status, name, city, year, cancel, kind="1", export=""):
    row = dict.fromkeys(DEREG_HEADER, "")
    row.update(
        {
            "N-NUMBER": f"{n:<5}",
            "SERIAL-NUMBER": f"{serial:<30}",
            "MFR-MDL-CODE": model,
            "STATUS-CODE": f"{status:<2}",
            "NAME": f"{name:<50}",
            "STREET-MAIL": f"{'1 MAIN ST':<33}",
            "CITY-MAIL": f"{city:<18}",
            "STATE-ABBREV-MAIL": "ID",
            "ZIP-CODE-MAIL": "836427341 ",
            "YEAR-MFR": year,
            "CERTIFICATION": "1NU       ",
            "CANCEL-DATE": cancel,
            "INDICATOR-GROUP": kind,
            "EXP-COUNTRY": f"{export:<18}",
        }
    )
    out = io.StringIO()
    csv.writer(out, lineterminator="").writerow([row[k] for k in DEREG_HEADER])
    return out.getvalue()


@pytest.fixture
def directory(tmp_path):
    """The registry file built from a small archive: N654FL registered; two
    earlier registrations of its airframe and one of another airplane
    that had N654FL; a bill of sale filed; N1FL reserved."""
    path = tmp_path / "ReleasableAircraft.zip"
    master = _master(
        "654FL", "28-7125569", "7102802", "41508", "1971", "7", "ROCA ROJA Y CABALLO GRIS DE IDAHO LLC", "MERIDIAN", "ID",
        "20260112", "1NU", "4", "1", "V", "19711102", "20330131", "A89C1E",
    )  # fmt: skip
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("MASTER.txt", "﻿" + MASTER_HEADER + "\r\n" + master + "\r\n")
        z.writestr(
            "ACFTREF.txt",
            "﻿CODE,MFR,MODEL,TYPE-ACFT,TYPE-ENG,AC-CAT,BUILD-CERT-IND,NO-ENG,NO-SEATS,AC-WEIGHT,SPEED,"
            "TC-DATA-SHEET,TC-DATA-HOLDER,\r\n"
            "7102802,PIPER                         ,PA-28-140           ,4,1 ,1,0,01,004,CLASS 1,0107,"
            "               ,                                                  ,\r\n"
            "0050100,ADAMS BALLOON                 ,A B                 ,2,0 ,1,0,00,001,CLASS 1,0000,"
            "A15SO          ,ADAMS AEROSTATS LLC                               ,\r\n",
        )
        z.writestr("ENGINE.txt", "﻿CODE,MFR,MODEL,TYPE,HORSEPOWER,THRUST,\r\n41508,LYCOMING  ,0-320 SERIES ,1 ,00180,000000,\r\n")
        z.writestr(
            "DEREG.txt",
            "﻿"
            + ",".join(DEREG_HEADER)
            + "\r\n"
            + "\r\n".join(
                [
                    # This airframe as N4512R, canceled for a new N-number.
                    _dereg("4512R", "28-7125569", "7102802", "V", "SMITH JOHN A", "BOISE", "1971", "19990301"),
                    # This airframe, exported and brought back.
                    _dereg("654FL", "28-7125569", "7102806", "V", "JONES AIR LLC", "NAMPA", "1971", "20100615", "7", "CANADA"),
                    # Another airplane that had N654FL before.
                    _dereg("654FL", "1234", "0050100", "13", "BALLOON CLUB", "BURLEY", "1985", "19800102"),
                    # Another maker's airplane with the same serial: not this one.
                    _dereg("77X", "28-7125569", "0050100", "V", "SOMEONE ELSE", "TWIN FALLS", "1971", "20200101"),
                ]
            )
            + "\r\n",
        )
        z.writestr(
            "DOCINDEX.txt",
            "﻿TYPE-COLLATERAL,COLLATERAL,PARTY,DOC-ID,DRDATE,PROCESSING-DATE,CORR-DATE,CORR-ID,SERIAL-ID,DOC-TYPE,\r\n"
            f"1,{'654FL':<37},{' ' * 50},{' ' * 12},20261105,20261105,{' ' * 8}, ,{' ' * 30},BOS,\r\n"
            f"2,{'LYCOMING O-320 L-1234':<37},{' ' * 50},{' ' * 12},20261105,20261105,{' ' * 8}, ,L-1234{' ' * 24},S/A,\r\n",
        )
        z.writestr(
            "RESERVED.txt",
            "﻿N-NUMBER,REGISTRANT,STREET,STREET2,CITY,STATE,ZIP CODE,RSV DATE,TR,EXP DATE,N-NUM-CHG,PURGE DATE,\r\n"
            f"1FL  ,{'FLYING CLUB INC':<50},{'1 MAIN ST':<33},{' ' * 33},{'BOISE':<18},"
            "ID,83702     ,20250301,FP,20260301,     ,        ,\r\n",
        )
    registry.build(path, tmp_path / registry.DB_NAME)
    return tmp_path


def test_every_master_field_but_the_address_and_the_reference_records(directory):
    found = registry.lookup(n_number="N654FL", directory=directory)
    assert (found["model_code"], found["engine_code"], found["region"]) == ("7102802", "41508", "Great Lakes")
    assert (found["last_action"], found["mode_s_octal"], found["certification_code"]) == ("2025-10-17", "50133730", "1NU")
    assert found["co_owner_names"] == [] and "606067147" not in str(found)
    model = registry.model(found["model_code"], directory)
    assert (model["category"], model["builder_certification"], model["weight_class"]) == ("Land", "Type certificated", "Up to 12,499 lb")
    # The FAA's reference cruise, statute mph, as the file gives it.
    assert (model["cruise_mph"], model["tc_data_sheet"]) == (107, None)
    balloon = registry.model("0050100", directory)
    assert (balloon["tc_data_sheet"], balloon["tc_holder"], balloon["cruise_mph"]) == ("A15SO", "Adams Aerostats LLC", None)
    engine = registry.engine_model("41508", directory)
    assert (engine["manufacturer"], engine["model"], engine["horsepower"]) == ("Lycoming", "0-320 SERIES", 180)


def test_past_registrations_of_the_airframe_and_of_the_n_number(directory):
    past = registry_history.past_registrations(directory / registry.DB_NAME, "N654FL", "28-7125569", "7102802", 1971)
    assert [(p["n_number"], p["same_airframe"]) for p in past] == [("N654FL", True), ("N4512R", True), ("N654FL", False)]
    exported = past[0]
    assert (exported["owner"], exported["owner_type"], exported["city"]) == ("Jones Air LLC", "LLC", "Nampa")
    assert (exported["cancel_date"], exported["export_country"], exported["status"]) == ("2010-06-15", "Canada", "Valid")
    assert "1 MAIN ST" not in str(past)
    assert past[2]["status"] == "Registration expired"


def test_documents_and_a_reservation(directory):
    (doc,) = registry_history.documents(directory / registry.DB_NAME, "N654FL")
    assert (doc["kind"], doc["received"]) == ("Evidence of ownership", "2026-11-05")
    held = registry_history.reservation(directory / registry.DB_NAME, "N1FL")
    assert (held["registrant"], held["city"], held["kind"], held["reserved"]) == ("Flying Club Inc", "Boise", "Fee paid", "2025-03-01")
    assert registry_history.reservation(directory / registry.DB_NAME, "N654FL") is None


def test_an_older_registry_file_is_read_again(directory, tmp_path):
    assert registry.schema(directory / registry.DB_NAME) == registry.SCHEMA
    assert registry.schema(tmp_path / "none.sqlite") == 0


def test_the_card_gathers_every_part(directory, monkeypatch):
    monkeypatch.setattr(ntsb, "cases", lambda n: [])
    monkeypatch.setattr(traffic, "based_judged", lambda hex_id: None)
    card = aircraft_details.details("654fl", directory)
    assert card["n_number"] == "N654FL" and card["registration"]["owner"] == "Roca Roja Y Caballo Gris De Idaho LLC"
    assert card["model"]["code"] == "7102802" and len(card["past_registrations"]) == 3
    assert card["based"] is None and card["based_pending"] is True
    # Reserved and never registered: its reservation alone.
    reserved = aircraft_details.details("N-1FL", directory)
    assert reserved["registration"] is None and reserved["reservation"]["kind"] == "Fee paid" and not reserved["based_pending"]
    assert aircraft_details.details("G-EUPT", directory) is None


@pytest.mark.skipif(
    not (RAW / registry.DB_NAME).exists() or registry.schema(RAW / registry.DB_NAME) != registry.SCHEMA,
    reason="the FAA's registry is not read on this machine in this shape",
)
def test_the_real_registry_has_every_part():
    found = registry.lookup(n_number="N654FL", directory=RAW)
    assert found and found["model_code"] and found["region"]
    model = registry.model(found["model_code"], RAW)
    assert model["category"] == "Land" and model["builder_certification"] == "Type certificated"
    assert registry.engine_model(found["engine_code"], RAW)["horsepower"]
    db = RAW / registry.DB_NAME
    assert registry_history.reservation(db, "N1") is not None
    assert isinstance(registry_history.past_registrations(db, "N654FL", found["serial"], found["model_code"], found["year"]), list)
