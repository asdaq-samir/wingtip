"""wingtip.remarks: an airport's lighting and mic-click remarks, from the
FAA's own text: the lights read by the engine (lighting_read), the radio's
in plain English."""

import pytest

from wingtip import faa_data, remarks


@pytest.fixture
def remarks_csv(tmp_path, monkeypatch):
    path = tmp_path / "APT_RMK.csv"
    path.write_text(
        '"EFF_DATE","SITE_NO","SITE_TYPE_CODE","STATE_CODE","ARPT_ID","CITY","COUNTRY_CODE","LEGACY_ELEMENT_NUMBER",'
        '"TAB_NAME","REF_COL_NAME","ELEMENT","REF_COL_SEQ_NO","REMARK"\n'
        '"2026/09/03","1","A","IL","3CK","LAKE","US","A110-4","AIRPORT","GENERAL_REMARK","",4,'
        '"WX ADZY - CTAF 5 CLICKS OR 815-444-1729."\n'
        '"2026/09/03","1","A","IL","3CK","LAKE","US","A81-APT","AIRPORT","LGT_SKED","",1,'
        '"ACTVT REIL RWY 08 & 26; PAPI RWY 08 & 26; MIRL RWY 08/26 - CTAF."\n'
        '"2026/09/03","2","A","FL","JTC","X","US","A81-APT","AIRPORT","LGT_SKED","",1,'
        '"ACTVT MIRL RWY 03/21 - CTAF: 5 CLICKS ON; 7 CLICKS OFF."\n'
        '"2026/09/03","3","A","IL","RFD","ROCKFORD","US","A110-1","AIRPORT","GENERAL_REMARK","",1,'
        '"BIRDS ON AND INVOF ARPT."\n'
        # The three the owner sent (2026-11-11), as NASR's 2026-10-29 cycle has them.
        '"2026/10/29","27469.","A","WI","OSH","OSHKOSH","US","A81-APT","AIRPORT","LGT_SKED","",1,'
        '"WHEN ATCT CLSD, ACTVT MALSR RWY 36; REIL RWY 18 & 27; HIRL RWY 09/27 & 18/36 - CTAF. HIRL 18/36 PRESET ON LOW INTST '
        'SS-SR, TO INCR INTST & ACTVT - CTAF. PAPI RWY 09, 27, 18 & 36 OPR CONSLY."\n'
        '"2026/10/29","04503.","A","IL","UGN","CHICAGO/WAUKEGAN","US","A81-APT","AIRPORT","LGT_SKED","",1,'
        '"ATCTVT MALSR RWY 23; REIL RWY 05; HIRL RWY 05/23; MIRL RWY 14/32 TWY LGTS - CTAF. WHEN ATCT CLSD TO INCR INTST & ACTVT - CTAF"\n'
        '"2026/10/29","27346.","A","WI","MSN","MADISON","US","A81-APT","AIRPORT","LGT_SKED","",1,'
        '"ACTVT MALSR RWY 18 & 21;  REIL RWY 03, 14 & 32; HIRL RWY 03/21, 14/32 & 18/36 - CTAF.  WHEN ATCT CLSD HIRL RWY 18/36 '
        'PRESET LOW INTST; INCR INTST - CTAF."\n'
        '"2026/09/03","4","A","IL","C81","GRAYSLAKE","US","A31-06/24","RUNWAY","RWY_LEN","06/24",1,'
        '"SW 1000 FT TURF-GRVL."\n'
        '"2026/09/03","4","A","IL","C81","GRAYSLAKE","US","A51-24","RUNWAY_END","DISPLACED_THR_LEN","24",1,'
        '"RWY 24 NSTD DSPLCD THLD WHITE STRIPE MKGS ONLY."\n'
        '"2026/09/03","5","A","KS","K78","ABILENE","US","A110-2","AIRPORT","GENERAL_REMARK","",2,"COURTESY CAR AVBL."\n'
        '"2026/09/03","5","A","KS","K78","ABILENE","US","A110-3","AIRPORT","GENERAL_REMARK","",3,"24 HOUR SELF SERVE FUEL."\n'
        '"2026/09/03","6","A","KS","GCK","GARDEN CITY","US","A70-100LL","FUEL_TYPE","FUEL_TYPE","100LL",1,'
        '"FOR MILITARY FUEL CALL 620-275-5055."\n'
        '"2026/09/03","7","A","WI","RPD","RICE LAKE","US","A17-M1","AIRPORT_ATTEND_SCHED","MONTH","1",1,'
        '"AIRPORT ATNDD OTHER HOURS O/R THRU FBO."\n'
    )
    monkeypatch.setattr(faa_data, "ensure_nasr_file", lambda name, cache_dir: path)
    return path


def test_a_remark_reads_in_plain_english_with_the_names_a_pilot_uses_kept():
    assert remarks.plain("VOR UNUSBL 010-030 BYD 20 NM BLW 5000.") == "VOR unusable 010-030 beyond 20 nm below 5000."
    assert remarks.plain("WX ADZY - CTAF 5 CLICKS OR 815-444-1729.") == "Weather advisory - CTAF 5 clicks or 815-444-1729."


def test_an_airports_lights_turned_on_from_the_cockpit_and_its_weather_on_the_ctaf(remarks_csv):
    notes = remarks.airport_notes("3CK")
    # As sent, and each system read by the engine.
    assert notes["lighting"] == ["ACTVT REIL RWY 08 & 26; PAPI RWY 08 & 26; MIRL RWY 08/26 - CTAF."]
    assert [(s["code"], s["runways"], s["how"]) for s in notes["lights"]] == [
        ("REIL", ["08", "26"], "Key the mic on CTAF"),
        ("PAPI", ["08", "26"], "Key the mic on CTAF"),
        ("MIRL", ["08/26"], "Key the mic on CTAF"),
    ]
    assert notes["radio"] == ["Weather advisory - CTAF 5 clicks or 815-444-1729."]
    # Pilot-controlled, with no count of its own: AIM 2-1-8's keying applies.
    assert notes["standard_keying"]


def lights(faa_id):
    return [(s["code"] or s["name"], s["runways"], s["how"]) for s in remarks.airport_notes(faa_id)["lights"]]


def test_oshkosh_keyed_when_the_tower_is_closed_its_hirl_preset_and_its_papi_always_on(remarks_csv):
    key = "Key the mic on CTAF when the tower is closed"
    assert lights("OSH") == [
        ("MALSR", ["36"], key),
        ("REIL", ["18", "27"], key),
        ("HIRL", ["09/27", "18/36"], key),
        ("HIRL", ["18/36"], "Preset low, sunset to sunrise; key the mic on CTAF for more"),
        ("PAPI", ["09", "27", "18", "36"], "On all the time"),
    ]


def test_waukegans_atctvt_is_nasrs_misspelt_actvt_and_what_names_no_light_is_kept_as_written(remarks_csv):
    # It read "Atctvt MALSR runway 23; ..." before the engine.
    key = "Key the mic on CTAF"
    assert lights("UGN") == [
        ("MALSR", ["23"], key),
        ("REIL", ["05"], key),
        ("HIRL", ["05/23"], key),
        ("MIRL", ["14/32"], key),
        ("Taxiway lights", [], key),
    ]
    assert remarks.airport_notes("UGN")["light_notes"] == [
        {
            "words": "When the tower closed to increase intensity & activate - CTAF.",
            "as_written": "WHEN ATCT CLSD TO INCR INTST & ACTVT - CTAF.",
        }
    ]


def test_madisons_hirl_preset_low_when_the_tower_is_closed(remarks_csv):
    key = "Key the mic on CTAF"
    assert lights("MSN") == [
        ("MALSR", ["18", "21"], key),
        ("REIL", ["03", "14", "32"], key),
        ("HIRL", ["03/21", "14/32", "18/36"], key),
        ("HIRL", ["18/36"], "When the tower is closed, preset low; key the mic on CTAF for more"),
    ]


def test_a_count_of_clicks_in_the_lighting_is_its_own_and_other_remarks_are_left_out(remarks_csv):
    # "- CTAF: 5 CLICKS ON; 7 CLICKS OFF." is not the legend's form: said
    # as written, and AIM 2-1-8's keying is not offered for it.
    jtc = remarks.airport_notes("JTC")
    assert jtc["lights"] == [] and len(jtc["light_notes"]) == 1 and not jtc["standard_keying"]
    assert remarks.airport_notes("RFD") == {"lighting": [], "lights": [], "light_notes": [], "radio": [], "standard_keying": False}


def test_the_turf_on_a_runway_of_two_surfaces_is_read_from_its_remarks(remarks_csv):
    # C81's 06/24: the south-west 1,000 ft, from runway 06's end.
    assert remarks.runway_turf("C81") == {"06/24": [{"end": "06", "from_ft": 0, "to_ft": 1000}]}
    assert remarks.runway_turf("3CK") == {}


@pytest.mark.parametrize(
    ("remark", "ends", "turf"),
    [
        # A compass point names the end whose threshold lies that way.
        ("NE 3400 FT ASPH; SW 1200 FT TURF.", "05/23", [{"end": "05", "from_ft": 0, "to_ft": 1200}]),
        ("581 FT BY 100 FT TURF ON S END.", "18/36", [{"end": "36", "from_ft": 0, "to_ft": 581}]),
        ("3000 FT X 20 FT CHIP & SEAL W END; 1100 FT GRASS E END.", "08G/26G", [{"end": "26G", "from_ft": 0, "to_ft": 1100}]),
        ("RWY 09/27 800 FT ASPHALT ON RWY 09 END, 1200 FT TURF ON RWY 27 END..", "09/27", [{"end": "27", "from_ft": 0, "to_ft": 1200}]),
        ("FIRST 2200 FT RY 15 LENGTH IS CONC; FIRST 300 FT RY 33 LENGTH IS TURF.", "15/33", [{"end": "33", "from_ft": 0, "to_ft": 300}]),
        # The rest turf after a length paved from one end: from there on.
        ("RWY 18/36 2000 FT ASPH ON RWY 36 END, REMAINDER TURF.", "18/36", [{"end": "36", "from_ft": 2000, "to_ft": None}]),
        ("RWY 15/33 2200 FT BY 32 FT ASPH ON NORTH END, REMAINDER TURF.", "15/33", [{"end": "15", "from_ft": 2200, "to_ft": None}]),
        # No end said, or ends with no number to point by: nothing guessed.
        ("RWY 09/27 2600 FT X 20 FT ASPH, REMAINDER TURF.", "09/27", []),
        ("1300 FT ASPH ON  E END, REMAINDER TURF.", "E/W", []),
    ],
)
def test_the_wordings_of_a_runways_turf(remark, ends, turf):
    assert remarks._turf_of(remark, ends.split("/")) == turf


def test_an_airports_fuel_and_courtesy_car_remarks_in_plain_english(remarks_csv):
    # In words by the engine (remarks_read), the fuel's as sent beside them.
    assert remarks.service_notes("K78") == {
        "fuel": ["24 hour self serve fuel."],
        "fuel_as_written": ["24 HOUR SELF SERVE FUEL."],
        "ground": ["Courtesy car available."],
        "courtesy_car": True,
    }
    # The FAA's own remark on a fuel type, whatever its words.
    assert remarks.service_notes("GCK")["fuel"] == ["For military fuel call 620-275-5055."]
    assert remarks.service_notes("RFD") == {"fuel": [], "fuel_as_written": [], "ground": [], "courtesy_car": False}
    # The attendance remarks' own contractions, in words.
    assert remarks.service_notes("RPD")["fuel"] == ["Airport attended other hours on request through FBO."]
