"""GET /api/emergency/fields: the fields round the airplane in the shape
the engine's best_fields reads, the wind aloft and the stock profile's
glide figures, with the tables the planner reads stood in for."""

from fastapi.testclient import TestClient
from wingtip import emergency, engine

from app.main import app

client = TestClient(app)

C02 = {
    "ident": "C02",
    "source_ident": "KC02",
    "name": "Grand Geneva Resort",
    "lat": 42.6149,
    "lon": -88.3896,
    "elevation_ft": 835,
    "distance_nm": 2.4,
    "bearing_deg": 54,
    "kind": "small",
}
WI89 = {
    "ident": "WI89",
    "source_ident": "WI89",
    "name": "Lake Geneva Aire Estates",
    "lat": 42.572,
    "lon": -88.3672,
    "elevation_ft": 880,
    "distance_nm": 3.2,
    "bearing_deg": 112,
    "kind": "small",
}


def stand_in(monkeypatch, wind=None):
    monkeypatch.setattr(emergency.airports, "nearest", lambda lat, lon, limit: [C02, WI89][:limit])
    runways = {
        "KC02": [{"end_headings": [("05", 53.1), ("23", 233.1)], "length_ft": 4100, "surface": "ASP", "closed": False}],
        "WI89": [
            {"end_headings": [("04", None), ("22", None)], "length_ft": 2300, "surface": "ASPH", "closed": False},
            {"end_headings": [("18", None), ("36", None)], "length_ft": 1500, "surface": "TURF", "closed": True},
        ],
    }
    monkeypatch.setattr(emergency.airports, "get_runways", lambda source: runways[source])
    monkeypatch.setattr(
        emergency.weather,
        "metar_for_idents",
        lambda idents: {
            "KC02": {
                "raw": "KC02 091250Z AUTO 25010KT 10SM CLR 08/M02 A3001",
                "flight_category": "VFR",
                "wind_dir_true_deg": 250,
                "wind_speed_kt": 10,
                "wind_gust_kt": None,
                "altimeter_in_hg": 30.01,
                "temp_c": 8,
                # The AWC's "10+" for 10SM, as the engine reads it (awc_metars_read).
                "visibility_sm": 10.0,
                "visibility_plus": True,
            },
            "WI89": None,
        },
    )
    monkeypatch.setattr(
        emergency.airports,
        "get_frequencies_for",
        lambda idents: {
            "KC02": [
                {"type": "CTAF", "description": None, "frequency_mhz": 122.7},
                {"type": "AWOS", "description": None, "frequency_mhz": 118.375},
            ]
        },
    )
    monkeypatch.setattr(emergency.faa_data, "military_fields", lambda cache: {})
    monkeypatch.setattr(emergency.faa_data, "private_fields", lambda cache: {"WI89"})
    monkeypatch.setattr(emergency.faa_data, "airport_contact", lambda ident, cache: {"phone": "262-555-0100" if ident == "C02" else None})
    monkeypatch.setattr(emergency.weather, "wind_at_altitude", lambda lat, lon, alt: wind)


def test_the_fields_come_as_the_engine_reads_them(monkeypatch):
    stand_in(monkeypatch, wind={"wind_dir_true_deg": 270, "wind_speed_kt": 20})
    body = client.get("/api/emergency/fields", params={"lat": 42.5917, "lon": -88.4334, "altitude_ft": 4500, "aircraft": "c172"}).json()
    c02, wi89 = body["fields"]
    assert c02["runways"][0]["runway_ends"][0] == {"ident": "05", "heading_true_deg": 53.1}
    # No heading in the table: the number's magnetic heading turned true.
    assert 30 < wi89["runways"][0]["runway_ends"][0]["heading_true_deg"] < 40
    assert len(wi89["runways"]) == 1, "a closed runway is left out"
    assert c02["metar"]["dir_true_deg"] == 250 and c02["metar"]["raw"].startswith("KC02")
    assert (c02["metar"]["visibility_sm"], c02["metar"]["visibility_plus"]) == (10.0, True)
    assert [f["kind"] for f in c02["frequencies"]] == ["CTAF"], "the weather broadcast is not called"
    assert (c02["phone"], wi89["phone"]) == ("262-555-0100", None)
    assert (wi89["private"], c02["private"]) == (True, False)
    assert body["wind"] == {"from_deg": 270, "kt": 20}
    assert body["airplane"]["glide"]["best_glide_kias"] == 68 and body["airplane"]["landing"]["tables"]

    # And the engine ranks them as the app asks it.
    ranked = engine.ask(
        "best_fields",
        mode="glide",
        at={"lat": 42.5917, "lon": -88.4334},
        altitude_ft=4500,
        wind=body["wind"],
        airplane=body["airplane"],
        fields=body["fields"],
    )
    assert [f["ident"] for f in ranked["fields"]] == ["C02", "WI89"]
    assert ranked["fields"][0]["reach"] == "within" and ranked["fields"][0]["runway"]["end"] == "23"


def test_no_airplane_and_no_wind_are_none_not_guesses(monkeypatch):
    stand_in(monkeypatch)
    body = client.get("/api/emergency/fields", params={"lat": 42.5917, "lon": -88.4334, "aircraft": "../c172"}).json()
    assert body["airplane"] is None and body["wind"] is None
    assert len(body["fields"]) == 2


def test_a_report_with_no_visibility_says_none():
    # A report the engine read no visibility from gives none, not a guess.
    read = emergency._metar({"raw": "KXYZ 091250Z AUTO 25010KT CLR 08/M02 A3001"})
    assert (read["visibility_sm"], read["visibility_plus"]) == (None, False)
