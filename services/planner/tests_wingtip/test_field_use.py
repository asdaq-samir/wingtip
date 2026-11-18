"""Who may use a field and NASR's record of it (wingtip.field_use), from
rows of the 2026-10-29 APT_BASE.csv: IL11 and 3LL4 private and
owner-reported (INSPECT_METHOD_CODE 2), 3CK public and state-inspected,
KMXF military, KFHU joint use, IL02 named Ravenwood where OurAirports has
an older name; a heliport and a seaplane base (SITE_TYPE_CODE H and C)
beside them."""

from wingtip import faa_data, field_use

HEADER = (
    "SITE_TYPE_CODE,ARPT_ID,ICAO_ID,NOTAM_ID,ARPT_NAME,OWNERSHIP_TYPE_CODE,FACILITY_USE_CODE,"
    "INSPECT_METHOD_CODE,LAST_INSPECTION,LAST_INFO_RESPONSE,TPA\n"
)
ROWS = [
    "A,IL11,,,DONALD ALFRED GADE,PR,PR,2,,2025/06/10,",
    "A,3LL4,,,PILLOW HILL,PR,PR,2,,2023/08/23,",
    "A,IL02,,,RAVENWOOD,PR,PR,2,,2026/03/18,",
    "A,3CK,,IKK,LAKE IN THE HILLS,PU,PU,S,2025/07/30,,",
    "A,MXF,KMXF,MXF,MAXWELL AFB,MA,PR,F,2020/01/01,,",
    "A,FHU,KFHU,FHU,SIERRA VISTA MUNI-LIBBY AAF,MR,PU,F,2014/02/25,,",
    "H,IL72,,,ADVOCATE CONDELL MEDICAL CENTER,PR,PR,2,,2025/01/15,",
    "C,LOT,,LOT,LAKE MICHIGAN SEAPLANE BASE,PU,PU,S,2024/06/01,,",
]


def _apt(tmp_path, monkeypatch):
    path = tmp_path / "APT_BASE.csv"
    path.write_text(HEADER + "\n".join(ROWS) + "\n")
    monkeypatch.setattr(faa_data, "ensure_nasr_file", lambda name, cache_dir: path)


def test_the_use_of_each_kind_of_field(tmp_path, monkeypatch):
    _apt(tmp_path, monkeypatch)
    assert field_use.use_of("IL11", tmp_path) == {"private": True, "military": None}
    assert field_use.use_of("KMXF", tmp_path) == {"private": False, "military": "military"}
    assert field_use.use_of("FHU", tmp_path) == {"private": False, "military": "joint"}
    assert field_use.use_of("3CK", tmp_path) == {"private": False, "military": None}


def test_the_record_says_who_reported_it_and_when(tmp_path, monkeypatch):
    _apt(tmp_path, monkeypatch)
    assert field_use.record_of("3LL4", tmp_path) == {
        "data_source": "owner-reported",
        "info_date": "2023-08-23",
        "icao_id": "",
        "notam_id": "",
        "name": "Pillow Hill",
        "status": None,
        "site_type": None,
    }
    three_ck = field_use.record_of("3CK", tmp_path)
    assert (three_ck["data_source"], three_ck["info_date"], three_ck["notam_id"]) == ("inspected", "2025-07-30", "IKK")
    # By the ICAO identifier too.
    assert field_use.record_of("KMXF", tmp_path)["icao_id"] == "KMXF"
    assert field_use.nasr_name("IL02", tmp_path) == "Ravenwood"
    assert field_use.record_of("ZZZ9", tmp_path) is None


def test_without_the_file_there_is_no_record(tmp_path, monkeypatch):
    def missing(name, cache_dir):
        raise OSError("no APT_BASE.csv")

    monkeypatch.setattr(faa_data, "ensure_nasr_file", missing)
    assert field_use.record_of("IL11", tmp_path) is None


def test_the_faas_codes_stay_in_capitals(tmp_path, monkeypatch):
    # NASR's FHU and MXF: the field types are the FAA's codes, kept.
    _apt(tmp_path, monkeypatch)
    assert field_use.nasr_name("KFHU", tmp_path) == "Sierra Vista Muni-Libby AAF"
    assert field_use.nasr_name("MXF", tmp_path) == "Maxwell AFB"


def test_the_record_names_a_field_that_is_not_an_airport(tmp_path, monkeypatch):
    # NASR's SITE_TYPE_CODE in the engine's words (field_site_type); an
    # airport (A) has none, as the card needs no word for it.
    _apt(tmp_path, monkeypatch)
    assert field_use.record_of("IL72", tmp_path)["site_type"] == "Heliport"
    assert field_use.record_of("LOT", tmp_path)["site_type"] == "Seaplane base"
    assert field_use.record_of("3CK", tmp_path)["site_type"] is None
