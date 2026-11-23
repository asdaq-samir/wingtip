import pandas as pd
import pytest

from wingtip import cycle_pack
from wingtip.config import get_settings


@pytest.fixture(autouse=True)
def _weather_store_of_its_own(tmp_path_factory, monkeypatch):
    """Each test's weather store an empty folder of its own: none reads the
    copies the weather service keeps in data/raw/weather, or leaves the
    planner's `asked` mark there (wingtip.weather_store). A test about the
    weather writes what it wants in it."""
    from wingtip import weather_store

    monkeypatch.setenv("WEATHER_STORE", str(tmp_path_factory.mktemp("weather")))
    weather_store._ASKED.clear()
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _no_cycle_pack(tmp_path_factory, monkeypatch):
    """No test reads the cycle pack the planner keeps in data/raw/packs:
    each starts with none, and those that want one write their own."""
    monkeypatch.setattr(cycle_pack, "PACK_DIR", tmp_path_factory.mktemp("packs"))


@pytest.fixture(autouse=True)
def _settings_from_this_tests_environment(monkeypatch):
    """wingtip.config.get_settings() reads the environment once and keeps
    it; a test that sets a variable clears it after (get_settings.cache_clear()),
    and this clears it either side of every test so none sees another's.
    The followed airplanes' share key is a test's own, as the planner
    starts with none unset (wingtip.traffic.recorded)."""
    monkeypatch.setenv("FOLLOW_SHARE_KEY", "test-follow-share-key-0123456789abcdef")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


# OurAirports' tables, small and local, for the airport modules' tests.
@pytest.fixture
def airports_csv(tmp_path):
    path = tmp_path / "airports.csv"
    pd.DataFrame(
        [
            {
                "ident": "KDLH",
                "local_code": "DLH",
                "name": "Duluth Intl",
                "latitude_deg": 46.8421,
                "longitude_deg": -92.1936,
                "elevation_ft": 1428,
                "municipality": "Duluth",
                "iso_region": "US-MN",
            },
            {
                "ident": "US-0C81",
                "local_code": "C81",
                "name": "C81 Field",
                "latitude_deg": 42.3172,
                "longitude_deg": -88.0905,
                "elevation_ft": 860,
                "municipality": "Wonder Lake",
                "iso_region": "US-IL",
            },
        ]
    ).to_csv(path, index=False)
    return path


@pytest.fixture
def runways_csv(tmp_path):
    path = tmp_path / "runways.csv"
    # le_ident/he_ident deliberately mix a lettered suffix ("09L") in with
    # a bare-digit one ("03") in the same column -- a fixture of purely
    # numeric idents (e.g. all "09"/"27"/"03") reads back through
    # pd.read_csv as an int/float column, silently dropping the leading
    # zero this real OurAirports data actually has; real runways.csv is
    # never purely numeric end to end, so this fixture shouldn't be either.
    pd.DataFrame(
        [
            {
                "airport_ident": "KDLH",
                "le_ident": "09L",
                "he_ident": "27R",
                "length_ft": 10152,
                "width_ft": 150,
                "surface": "ASP",
                "lighted": 1,
                "closed": 0,
            },
            {
                "airport_ident": "KDLH",
                "le_ident": "03",
                "he_ident": None,
                "length_ft": 5001,
                "width_ft": 100,
                "surface": "ASP",
                "lighted": 0,
                "closed": 0,
            },
        ]
    ).to_csv(path, index=False)
    return path


@pytest.fixture
def frequencies_csv(tmp_path):
    path = tmp_path / "frequencies.csv"
    pd.DataFrame(
        [
            {"airport_ident": "KDLH", "type": "ATIS", "description": "DULUTH ATIS", "frequency_mhz": 124.15},
            {"airport_ident": "KDLH", "type": "CTAF", "description": "DULUTH CTAF", "frequency_mhz": 118.3},
            {"airport_ident": "KDLH", "type": "TWR", "description": "DULUTH TOWER", "frequency_mhz": 118.3},
        ]
    ).to_csv(path, index=False)
    return path


@pytest.fixture
def us_airports_csv(tmp_path):
    """The columns the US-only slice reads: a real ICAO ident (KDLH), a
    field OurAirports gave a made-up one (KC81, local code C81), a small
    field, a heliport, a closed field and one abroad."""
    path = tmp_path / "us_airports.csv"
    row = {"municipality": "", "iso_region": "US-MN", "iso_country": "US", "elevation_ft": 1000}
    pd.DataFrame(
        [
            {
                **row,
                "ident": "KDLH",
                "icao_code": "KDLH",
                "local_code": "DLH",
                "name": "Duluth Intl",
                "type": "medium_airport",
                "latitude_deg": 46.8421,
                "longitude_deg": -92.1936,
            },
            {
                **row,
                "ident": "KC81",
                "icao_code": None,
                "local_code": "C81",
                "name": "Campbell Airport",
                "type": "small_airport",
                "latitude_deg": 42.3246,
                "longitude_deg": -88.0741,
            },
            {
                **row,
                "ident": "KMSP",
                "icao_code": "KMSP",
                "local_code": "MSP",
                "name": "Minneapolis-St Paul",
                "type": "large_airport",
                "latitude_deg": 44.8848,
                "longitude_deg": -93.2223,
            },
            {
                **row,
                "ident": "MN01",
                "icao_code": None,
                "local_code": "MN01",
                "name": "A Helipad",
                "type": "heliport",
                "latitude_deg": 46.8,
                "longitude_deg": -92.2,
            },
            {
                **row,
                "ident": "MN02",
                "icao_code": None,
                "local_code": "MN02",
                "name": "Gone Field",
                "type": "closed",
                "latitude_deg": 46.7,
                "longitude_deg": -92.3,
            },
            {
                **row,
                "ident": "CYQT",
                "icao_code": "CYQT",
                "local_code": None,
                "name": "Thunder Bay",
                "type": "medium_airport",
                "latitude_deg": 48.3719,
                "longitude_deg": -89.3239,
                "iso_country": "CA",
            },
            {
                **row,
                "ident": "US-0043",
                "icao_code": None,
                "local_code": "C81",
                "name": "Campbell (old record)",
                "type": "small_airport",
                "latitude_deg": 42.3245,
                "longitude_deg": -88.0742,
            },
            # A real ICAO code OurAirports left out of icao_code: Chicago
            # Executive, KPWK in its METAR and on every chart.
            {
                **row,
                "ident": "KPWK",
                "icao_code": None,
                "local_code": "PWK",
                "name": "Chicago Executive",
                "type": "medium_airport",
                "iso_region": "US-IL",
                "latitude_deg": 42.1142,
                "longitude_deg": -87.9015,
            },
        ]
    ).to_csv(path, index=False)
    return path
