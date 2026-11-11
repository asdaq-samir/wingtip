"""The fields nearest a position (app.routers.airports): the map's Nearest
and a search's results, each with its way, runway and frequency, and what
a search filters by. The tables, the airspace and the weather are
stubbed -- these test what the router makes of them."""

from fastapi.testclient import TestClient
from wingtip import airports, faa_data, field_facts, field_forecast, weather

from app.main import app

client = TestClient(app)

DULUTH = {
    "ident": "KDLH",
    "source_ident": "KDLH",
    "name": "Duluth International Airport",
    "municipality": "Duluth",
    "region": "US-MN",
    "lat": 46.8421,
    "lon": -92.1936,
    "elevation_ft": 1428.0,
    "kind": "medium",
}


def test_the_nearest_fields_are_the_nearest_first_with_their_way_and_runway(monkeypatch):
    monkeypatch.setattr(
        airports,
        "nearest",
        lambda lat, lon, limit: [
            {
                "ident": "C81",
                "source_ident": "KC81",
                "name": "Campbell",
                "municipality": "Grayslake",
                "region": "US-IL",
                "lat": 42.32,
                "lon": -88.07,
                "elevation_ft": 788.0,
                "kind": "small",
                "distance_nm": 2.1,
                "bearing_deg": 45,
            }
        ],
    )
    monkeypatch.setattr(
        airports,
        "get_runways",
        lambda ident: [{"ends": "06/24", "length_ft": 3573, "closed": False}, {"ends": "09/27", "length_ft": 3270, "closed": False}],
    )
    monkeypatch.setattr(
        airports,
        "get_frequencies_for",
        lambda idents: {
            "KC81": [
                {"type": "CTAF", "description": "CTAF", "frequency_mhz": 122.7},
                {"type": "UNIC", "description": "UNICOM", "frequency_mhz": 122.7},
            ]
        },
    )
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {i: None for i in idents})
    no_facts = {"fuel": [], "runway_surfaces": [], "instrument_approach": None}
    monkeypatch.setattr(field_facts, "facts_for", lambda places: [no_facts for _ in places])
    monkeypatch.setattr(faa_data, "towered_fields", lambda cache_dir: frozenset())
    body = client.get("/api/airports/nearest", params={"lat": 42.3, "lon": -88.1}).json()
    assert body["airports"][0] == {
        "ident": "C81",
        "name": "Campbell",
        "lat": 42.32,
        "lon": -88.07,
        "kind": "small",
        "flight_category": None,
        "primary_of": None,
        "towered": False,
        "municipality": "Grayslake",
        "elevation_ft": 788.0,
        "distance_nm": 2.1,
        "bearing_deg": 45,
        "longest_runway_ft": 3573,
        "military": None,
        "private": False,
        "airspace_class": "G",
        "radio": {"kind": "CTAF", "mhz": 122.7},
        "fuel": [],
        "runway_surfaces": [],
        "instrument_approach": None,
        "wind_dir_true_deg": None,
        "wind_speed_kt": None,
        "wind_gust_kt": None,
        "visibility_sm": None,
        "forecast": None,
    }


def test_the_nearest_fields_carry_what_a_search_filters_by(monkeypatch):
    """A search's results (the one search's Filters, 2026-11-10): towered,
    fuel, runway surfaces, an instrument approach, the METAR's wind and
    visibility, and with `at` the forecast then -- each from where the
    planner reads it (wingtip.field_facts, wingtip.field_forecast)."""
    duluth = {**DULUTH, "faa_id": "DLH", "distance_nm": 3.0, "bearing_deg": 90}
    monkeypatch.setattr(airports, "nearest", lambda lat, lon, limit: [duluth])
    monkeypatch.setattr(airports, "get_runways", lambda ident: [])
    monkeypatch.setattr(airports, "get_frequencies_for", lambda idents: {})
    metar = {"flight_category": "VFR", "wind_dir_true_deg": 270.0, "wind_speed_kt": 12.0, "wind_gust_kt": 18.0, "visibility_sm": 10.0}
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {"KDLH": metar})
    monkeypatch.setattr(
        field_facts, "facts_for", lambda places: [{"fuel": ["100LL", "Jet A"], "runway_surfaces": ["paved"], "instrument_approach": True}]
    )
    monkeypatch.setattr(faa_data, "towered_fields", lambda cache_dir: frozenset({"KDLH", "DLH"}))
    asked = []

    def categories_at(places, at):
        asked.append(at)
        return [{"at": at, "category": "MVFR", "station": "KDLH", "distance_nm": None} if at else None for _ in places]

    monkeypatch.setattr(field_forecast, "categories_at", categories_at)
    field = client.get("/api/airports/nearest", params={"lat": 46.8, "lon": -92.2, "at": 1_800_000_000}).json()["airports"][0]
    assert field["towered"] is True
    assert (field["fuel"], field["runway_surfaces"], field["instrument_approach"]) == (["100LL", "Jet A"], ["paved"], True)
    assert (field["wind_dir_true_deg"], field["wind_speed_kt"], field["wind_gust_kt"], field["visibility_sm"]) == (270.0, 12.0, 18.0, 10.0)
    assert field["forecast"] == {"at": 1_800_000_000.0, "category": "MVFR", "station": "KDLH", "distance_nm": None}
    # No time asked: no forecast read.
    assert client.get("/api/airports/nearest", params={"lat": 46.8, "lon": -92.2}).json()["airports"][0]["forecast"] is None
    assert asked == [1_800_000_000.0, None]


def test_the_nearest_list_survives_the_frequencies_failing(monkeypatch):
    monkeypatch.setattr(
        airports,
        "nearest",
        lambda lat, lon, limit: [
            {
                "ident": "C81",
                "source_ident": "KC81",
                "name": "Campbell",
                "municipality": "Grayslake",
                "region": "US-IL",
                "lat": 42.32,
                "lon": -88.07,
                "elevation_ft": 788.0,
                "kind": "small",
                "distance_nm": 2.1,
                "bearing_deg": 45,
            }
        ],
    )
    monkeypatch.setattr(airports, "get_runways", lambda ident: [])

    def fail(idents):
        raise OSError("frequencies table unavailable")

    monkeypatch.setattr(airports, "get_frequencies_for", fail)
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {})
    monkeypatch.setattr(field_facts, "facts_for", lambda places: [{} for _ in places])
    resp = client.get("/api/airports/nearest", params={"lat": 42.3, "lon": -88.1})
    assert resp.status_code == 200
    assert resp.json()["airports"][0]["radio"] is None


def test_a_field_is_called_on_its_tower_else_its_ctaf_else_unicom():
    from app.routers.airports import _inbound_radio

    unicom = {"type": "UNIC", "description": "UNICOM", "frequency_mhz": 122.95}
    ctaf = {"type": "CTAF", "description": "CTAF", "frequency_mhz": 120.7}
    tower = {"type": "TWR", "description": "TWR", "frequency_mhz": 120.7}
    ground = {"type": "GND", "description": "GND", "frequency_mhz": 121.6}
    assert _inbound_radio([unicom, ctaf, tower, ground]) == {"kind": "TWR", "mhz": 120.7}
    assert _inbound_radio([unicom, ctaf]) == {"kind": "CTAF", "mhz": 120.7}
    assert _inbound_radio([ground, unicom]) == {"kind": "UNICOM", "mhz": 122.95}
    assert _inbound_radio([ground]) is None
    assert _inbound_radio([]) is None
