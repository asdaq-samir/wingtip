"""The world the plan tests stub, shared by test_plan, test_navlog,
test_plan_altitude, test_plan_ifr and the tests that plan a route the same
way (test_stops, test_no_airplane, test_mcp_flight): the chart read's two
candidates, the one legal altitude, and the air every leg is flown in."""

import pytest
from wingtip import altitude as altitude_module
from wingtip import navlog

from app import checkpoint_scoring

from .conftest import select_cruise_altitude_stub

CANDIDATES = [
    {
        "id": "water@42.35000,-88.09000",
        "category": "water",
        "name": "Lake",
        "lat": 42.35,
        "lon": -88.09,
        "predicted_score": 4.4,
        "along_track_nm": 3.9,
    },
    {
        "id": "town@42.60000,-88.40000",
        "category": "town",
        "name": "Town",
        "lat": 42.6,
        "lon": -88.4,
        "predicted_score": 3.9,
        "along_track_nm": 22.0,
    },
]


def stub_wind(lat, lon, altitude_ft, fcst_hr="06") -> dict:
    """The wind every leg is flown in, minus the live winds call."""
    return {"wind_dir_true_deg": 270.0, "wind_speed_kt": 15.0}


def stub_air(monkeypatch, wind=stub_wind):
    """The air the nav log's legs are flown in (wingtip.navlog's lookups),
    the engine working the legs out of it: `wind`, 4 degC aloft and 3
    degrees west variation."""
    monkeypatch.setattr(navlog, "air_at", lambda lat, lon, alts, key="06": [{"wind": wind(lat, lon, a, key), "temp_c": 4.0} for a in alts])
    monkeypatch.setattr(navlog, "magnetic_variation_deg", lambda lat, lon, on=None: -3.0)


def no_winds(monkeypatch):
    from wingtip.weather import WeatherServiceError

    def fail(*args, **kwargs):
        raise WeatherServiceError("aviationweather.gov winds-06 unavailable: timed out")

    stub_air(monkeypatch, fail)


@pytest.fixture(autouse=True)
def _stubbed_world(monkeypatch, altitude):
    monkeypatch.setattr(checkpoint_scoring, "score", lambda dep, dest: [dict(c) for c in CANDIDATES])
    monkeypatch.setattr(altitude_module, "select_cruise_altitude", select_cruise_altitude_stub(altitude))
    stub_air(monkeypatch)
