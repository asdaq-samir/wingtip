"""The lists of places: the VFR waypoints in view, a place typed, and a
field's forecast wind (app.routers.airports)."""

from fastapi.testclient import TestClient
from wingtip import airports, geocode, weather

from app.main import app

from .airport_world import DULUTH, stub_place

client = TestClient(app)


def test_the_vfr_waypoints_in_view_are_the_sectionals_magenta_flags_only(monkeypatch):
    from wingtip import fixes

    monkeypatch.setattr(
        fixes,
        "_TABLE",
        fixes._Table(
            {
                "VPBNG": {"ident": "VPBNG", "lat": 42.0, "lon": -88.0, "vfr": True, "kind": "VFR waypoint"},
                "BEPKE": {"ident": "BEPKE", "lat": 42.0, "lon": -88.1, "vfr": False, "kind": "GPS waypoint"},
                "VPFAR": {"ident": "VPFAR", "lat": 45.0, "lon": -88.0, "vfr": True, "kind": "VFR waypoint"},
            },
            {},
        ),
    )
    client = TestClient(app)

    resp = client.get("/api/waypoints/in-view", params={"south": 41.5, "west": -88.5, "north": 42.5, "east": -87.5})

    assert resp.status_code == 200
    assert resp.json() == {"waypoints": [{"ident": "VPBNG", "lat": 42.0, "lon": -88.0, "description": None}]}


def test_a_place_typed_is_an_airport_a_town_or_an_address_with_where_it_is(monkeypatch):
    stub_place(monkeypatch)
    monkeypatch.setattr(airports, "search_airports", lambda q, limit=8: [{"ident": "KDLH", "name": "Duluth International Airport"}])
    monkeypatch.setattr(geocode, "find_towns", lambda q: [{"label": "Duluth, MN", "lat": 46.78, "lon": -92.1}])
    monkeypatch.setattr(geocode, "find_addresses", lambda q: [])
    found = client.get("/api/places/search", params={"q": "dul"}).json()["places"]
    assert found == [
        {"label": "KDLH · Duluth International Airport", "kind": "airport", "lat": 46.8421, "lon": -92.1936},
        {"label": "Duluth, MN", "kind": "town", "lat": 46.78, "lon": -92.1},
    ]
    assert client.get("/api/places/search", params={"q": "d"}).json() == {"places": []}


def test_a_fields_forecast_wind_for_a_time_is_its_tafs_or_none(monkeypatch):
    """For the runway an arrival will find in use (the owner's pick,
    2026-10-20): the field asked by its own TAF, a naive time as UTC."""
    monkeypatch.setattr(airports, "find_place", lambda ident: DULUTH if ident.upper() in ("KDLH", "DLH") else None)
    asked = []
    wind = {
        "ident": "KDLH",
        "distance_nm": 0.0,
        "dir_true_deg": 90.0,
        "speed_kt": 8.0,
        "gust_kt": 18.0,
        "valid_from": 1790000000.0,
        "valid_to": 1790021600.0,
    }
    monkeypatch.setattr(weather, "forecast_wind", lambda lat, lon, at, ident: asked.append((at, ident)) or wind)
    answer = client.get("/api/airport/DLH/forecast-wind", params={"at": "2026-09-20T07:00:00"})
    assert answer.status_code == 200 and answer.json() == wind
    assert asked == [(1789887600.0, "KDLH")]
    monkeypatch.setattr(weather, "forecast_wind", lambda lat, lon, at, ident: None)
    assert client.get("/api/airport/KDLH/forecast-wind", params={"at": "2026-09-20T07:00:00Z"}).json() is None
    assert client.get("/api/airport/KXXX/forecast-wind", params={"at": "2026-09-20T07:00:00Z"}).status_code == 404
