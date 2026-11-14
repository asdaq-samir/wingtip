"""wingtip.field_marks: each field's NASR facts for the engine's
field_mark_rank, read as the overlay tiles read them -- the longest hard
runway (the engine's runway_hard_surface), helipads not runways."""

from wingtip import field_marks


def test_the_longest_hard_runway_by_either_ident(tmp_path):
    apt = tmp_path / "APT_BASE.csv"
    apt.write_text("ARPT_ID,ICAO_ID,SITE_TYPE_CODE,FACILITY_USE_CODE\nIGQ,KIGQ,A,PU\nLL22,,A,PR\n")
    rwy = tmp_path / "APT_RWY.csv"
    rwy.write_text(
        "ARPT_ID,RWY_ID,RWY_LEN,SURFACE_TYPE_CODE\n"
        "IGQ,09/27,4002,ASPH\nIGQ,18/36,4500,TURF\nIGQ,H1,9000,CONC\n"  # turf and a helipad are not hard runways
        "LL22,18/36,2813,ASPH-TURF\n"  # part turf: not hard
    )
    sites = field_marks._sites_of(str(apt), 1.0, str(rwy), 1.0)
    assert sites["IGQ"] == sites["KIGQ"] == ("A", "PU", 4002)
    assert sites["LL22"] == ("A", "PR", 0)
    # Lansing: public, no tower, 4,002 ft of asphalt -- tier 1, regular size.
    assert field_marks.fields({"faa_id": "IGQ"}, False, None, sites) == {"mark_order": 395997, "mark_size": "regular"}
