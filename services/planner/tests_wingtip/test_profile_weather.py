"""The weather on a route's side view: cloud bases, freezing level, icing."""

import pytest

from wingtip import profile_weather

#: North along -88 from 42 to 43, 60 nm.
PATH = [(42.0, -88.0), (43.0, -88.0)]
SOURCE = {"label": "NOAA GFS", "run": "2026-11-21T12:00:00Z", "valid_at": "2026-11-21T15:00:00Z"}


@pytest.fixture
def store(monkeypatch):
    """A TAF station beside the line half way, freezing at 6,500 ft
    everywhere, and one icing snapshot over the route's middle third."""
    station = {"icaoId": "KMID", "lat": 42.5, "lon": -88.05, "elevation_ft": 800.0, "ceiling_ft": 3000.0, "issued": "2026-11-21T11:20:00Z"}
    monkeypatch.setattr(profile_weather.weather, "ceiling_visibility_along_route", lambda a, b, window: {"stations": [station]})
    monkeypatch.setattr(profile_weather.weather, "freezing_level", lambda lat, lon, key: {"ft": 6500.0, "at_or_below": False})
    monkeypatch.setattr(profile_weather.winds_aloft, "winds_key_for", lambda depart: "06")
    monkeypatch.setattr(profile_weather.winds_aloft, "temperatures_source", lambda key: SOURCE)
    icing = {
        "hazard": "Icing",
        "severity": "MOD",
        "valid": 1000,
        "valid_at": "2026-11-21T15:00:00Z",
        "issued": "2026-11-21T14:45:00Z",
        "altitude_low_ft": None,
        "from_freezing_level": True,
        "altitude_high_ft": 12000.0,
        "coords": [[42.33, -89.0], [42.33, -87.0], [42.67, -87.0], [42.67, -89.0]],
    }
    monkeypatch.setattr(profile_weather.weather, "gairmet_snapshots_along_route", lambda path, window: [icing])


def test_clouds_freezing_and_icing_placed_along_the_route_with_their_sources(store):
    got = profile_weather.along(PATH, 0.0, 3600.0, None)
    (cloud,) = got["clouds"]
    # The TAF's 3,000 ft ceiling over an 800 ft field: a 3,800 ft MSL base, half way.
    assert cloud["station"] == "KMID" and cloud["base_ft"] == 3800.0 and cloud["along_nm"] == pytest.approx(30.0, abs=0.5)
    assert cloud["issued"] == "2026-11-21T11:20:00Z"
    # Every 20 nm, both ends included: 0, 20, 40 and 60.
    assert [f["along_nm"] for f in got["freezing"]] == pytest.approx([0.0, 20.0, 40.0, 60.0], abs=0.2)
    assert got["freezing_source"] == SOURCE
    (ice,) = got["icing"]
    assert ice["from_freezing_level"] and ice["high_ft"] == 12000.0 and ice["valid_at"] == "2026-11-21T15:00:00Z"
    assert ice["from_nm"] == pytest.approx(20.0, abs=0.5) and ice["to_nm"] == pytest.approx(40.0, abs=0.5)
    assert got["unavailable"] == []


def test_a_product_not_in_the_store_is_said_unavailable_not_none(store, monkeypatch):
    def missing(*_args, **_kwargs):
        raise profile_weather.weather.WeatherServiceError("The TAFs are not in.")

    monkeypatch.setattr(profile_weather.weather, "ceiling_visibility_along_route", missing)
    monkeypatch.setattr(profile_weather.weather, "gairmet_snapshots_along_route", missing)
    got = profile_weather.along(PATH, 0.0, 3600.0, None)
    assert got["clouds"] == [] and got["icing"] == []
    assert got["unavailable"] == ["clouds", "icing"]
