"""wingtip.field_facts and wingtip.field_forecast: what a search's filters
read of a field -- its fuel and runway surfaces from the FAA's airport
file, an instrument approach from the CIFP, and the forecast category at
a time from the TAF that speaks for it, by the engine's rules. The files
and TAFs are made here; the codes are the FAA's and the readings the
engine's."""

import pytest

from wingtip import faa_data, field_facts, field_forecast, procedures, weather

AT = 1_800_000_000.0  # an hour boundary
HOUR = 3600.0


def test_the_chart_supplements_fuel_codes_group_into_the_filters_fuels():
    # A, A+ and A1+ are the Jet A family; 100 (green avgas) and MOGAS are
    # not among the filters.
    assert field_facts.fuels_of(["A1+", "100LL", "MOGAS", "100", "A+"]) == ["100LL", "Jet A"]
    assert field_facts.fuels_of(["UL94", "A"]) == ["Jet A", "UL94"]
    assert field_facts.fuels_of([]) == []


@pytest.mark.parametrize(
    ("code", "kinds"),
    [
        ("ASPH", ["paved"]),
        ("CONC", ["paved"]),
        ("ASPH-CONC", ["paved"]),
        ("PEM", ["paved"]),
        # Distinct sections (the APT layout): paved only where all of it is.
        ("ASPH-TURF", ["turf"]),
        ("ASPH/GRVL", ["other"]),
        ("TURF", ["turf"]),
        ("TURF-DIRT", ["turf", "other"]),
        ("GRASS", ["turf"]),
        ("WATER", ["water"]),
        ("GRVL", ["other"]),
        ("DIRT", ["other"]),
        ("ROOF-TOP", ["other"]),
        ("", []),
    ],
)
def test_a_runways_surfaces_as_nasr_codes_them(code, kinds):
    assert field_facts.surface_of(code) == kinds


def test_the_cifp_names_the_fields_with_an_approach(tmp_path):
    # ARINC 424-18: column 1 S, 5-6 the airport section "P ", 7-10 the
    # airport, 13 the subsection -- F an approach, D a departure.
    cifp = tmp_path / "FAACIFP18"
    cifp.write_bytes(
        b"SUSAP KDLHK3FR09   ...approach\nSUSAP C81 K3FR24   ...approach\nSUSAP KMSPK6DBAEE1 ...departure only\nHDR01 header\n"
    )
    assert field_facts._approach_fields_of(cifp) == {"KDLH", "C81"}


@pytest.fixture
def files(monkeypatch):
    """The FAA's tables as a test sets them."""
    monkeypatch.setattr(faa_data, "ensure_nasr_file", lambda name, cache_dir: (_ for _ in ()).throw(OSError("no file")))
    monkeypatch.setattr(field_facts, "fuel_table", lambda: {"DLH": {"fuel_types": ["100LL", "A"]}, "KDLH": {"fuel_types": ["100LL", "A"]}})
    monkeypatch.setattr(field_facts, "runway_surfaces", lambda: {"DLH": ["paved"], "C81": ["paved", "turf"]})
    monkeypatch.setattr(field_facts, "approach_fields", lambda: frozenset({"KDLH"}))


def test_each_field_gets_its_fuel_surfaces_and_approach_by_any_of_its_idents(files):
    duluth = {"ident": "KDLH", "source_ident": "KDLH", "faa_id": "DLH"}
    campbell = {"ident": "C81", "source_ident": "C81", "faa_id": "C81"}
    assert field_facts.facts_for([duluth, campbell]) == [
        {"fuel": ["100LL", "Jet A"], "runway_surfaces": ["paved"], "instrument_approach": True},
        {"fuel": [], "runway_surfaces": ["paved", "turf"], "instrument_approach": False},
    ]


def test_with_no_cifp_an_approach_is_not_known_rather_than_none(files, monkeypatch):
    monkeypatch.setattr(field_facts, "approach_fields", lambda: None)
    assert field_facts.facts_for([{"ident": "KDLH", "faa_id": "DLH"}])[0]["instrument_approach"] is None


def test_the_tables_missing_give_no_facts_not_a_failure(monkeypatch):
    monkeypatch.setattr(faa_data, "ensure_nasr_file", lambda name, cache_dir: (_ for _ in ()).throw(OSError("no file")))
    monkeypatch.setattr(procedures, "cifp_path", lambda: (_ for _ in ()).throw(RuntimeError("no cifp")))
    assert field_facts.facts_for([{"ident": "KDLH", "faa_id": "DLH"}]) == [{"fuel": [], "runway_surfaces": [], "instrument_approach": None}]


def _period(start, end, ceiling=None, visibility=6.0, change=""):
    # A period as the weather store keeps it, read by the engine (awc_tafs_read).
    return {
        "timeFrom": start,
        "timeTo": end,
        "change": change,
        "ceiling_ft": ceiling,
        "ceiling_unknown": False,
        "visibility_sm": visibility,
    }


@pytest.fixture
def tafs(monkeypatch):
    held = []
    monkeypatch.setattr(weather, "_dataset", lambda name: held)
    return held


DULUTH = {"ident": "KDLH", "lat": 46.84, "lon": -92.19}


def test_the_forecast_category_at_a_time_is_the_worst_the_taf_says_then(tafs):
    tafs.append(
        {
            "icaoId": "KDLH",
            "lat": 46.84,
            "lon": -92.19,
            "fcsts": [
                _period(AT - 6 * HOUR, AT + 12 * HOUR, ceiling=5000),
                # A TEMPO under 1,000 ft: IFR at times, so not VFR then (AIM 7-1-7).
                _period(AT + 2 * HOUR, AT + 4 * HOUR, ceiling=800, change="TEMPO"),
            ],
        }
    )
    assert field_forecast.categories_at([DULUTH], AT) == [{"at": AT, "category": "VFR", "station": "KDLH", "distance_nm": None}]
    assert field_forecast.categories_at([DULUTH], AT + 3 * HOUR)[0]["category"] == "IFR"


def test_a_field_without_a_taf_takes_the_nearest_within_reach_and_none_past_it(tafs):
    tafs.append({"icaoId": "KDLH", "lat": 46.84, "lon": -92.19, "fcsts": [_period(AT - HOUR, AT + HOUR, ceiling=2000)]})
    near = {"ident": "KSUW", "lat": 46.69, "lon": -92.09}  # Superior, some 10 nm away
    far = {"ident": "KHIB", "lat": 47.39, "lon": -92.84}  # Hibbing, some 40 nm away
    got = field_forecast.categories_at([near, far], AT)
    assert got[0]["station"] == "KDLH" and got[0]["category"] == "MVFR" and got[0]["distance_nm"] > 0
    assert got[1] is None


def test_no_time_asked_or_no_tafs_held_give_no_forecast(monkeypatch):
    assert field_forecast.categories_at([DULUTH], None) == [None]

    def out(name):
        raise weather.WeatherServiceError("TAFs unavailable")

    monkeypatch.setattr(weather, "_dataset", out)
    assert field_forecast.categories_at([DULUTH], AT) == [None]
