"""One airport's card (/api/airport/{ident}): its class, tower, runways,
radio and weather, its turf, its services and what is near it. The tables,
the airspace and the weather are stubbed -- these test what the router
makes of them, not OurAirports or aviationweather.gov."""

from fastapi.testclient import TestClient
from wingtip import faa_data, glmp, nearby, pattern, publications, remarks, weather

from app.main import app

from .airport_world import stub_place

client = TestClient(app)


def test_an_airports_card_names_its_class_tower_runways_radio_and_weather(monkeypatch):
    stub_place(
        monkeypatch,
        frequencies=[{"type": "TWR", "description": "Tower", "frequency_mhz": 118.3}],
        runways=[
            {"ends": "09/27", "length_ft": 10162, "width_ft": 150, "surface": "CON", "lighted": True, "closed": False},
            {"ends": "03/21", "length_ft": 5718, "width_ft": 150, "surface": "ASP", "lighted": True, "closed": True},
        ],
        metar={"raw": "KDLH 011853Z 28012KT 10SM CLR", "flight_category": "VFR"},
    )
    body = client.get("/api/airport/kdlh").json()
    assert body["ident"] == "KDLH"
    assert "source_ident" not in body
    assert body["airspace_class"] == "C"
    assert body["towered"] is True
    # A closed runway is not one a pilot can use.
    assert [r["ends"] for r in body["runways"]] == ["09/27"]
    assert body["metar"]["flight_category"] == "VFR"
    assert body["weather_unavailable"] is False
    # Its lights, by the FAA's own identifier (DLH): turned on from the
    # cockpit, with no count of clicks of their own.
    assert body["lighting"] == ["ACTVT MIRL RWY 09/27 - CTAF."]
    assert [(light["code"], light["how"]) for light in body["lights"]] == [("MIRL", "Key the mic on CTAF")]
    assert body["standard_keying"] is True


def test_a_field_with_no_station_is_given_its_nearest_report(monkeypatch):
    nearby = {
        "ident": "KDYT",
        "distance_nm": 6.2,
        "bearing_deg": 118,
        "near": True,
        "metar": {"raw": "KDYT 102153Z AUTO 25007KT 10SM OVC025 12/04 A3001", "flight_category": "MVFR", "lat": 46.72, "lon": -92.04},
    }
    stub_place(monkeypatch, nearby=nearby)
    body = client.get("/api/airport/KDLH").json()
    assert body["metar"] is None
    assert body["nearby_metar"]["ident"] == "KDYT" and body["nearby_metar"]["near"] is True
    assert body["nearby_metar"]["metar"]["flight_category"] == "MVFR"
    # A field with a report of its own is given none.
    stub_place(monkeypatch, metar={"raw": "KDLH 102155Z 27008KT 10SM CLR", "flight_category": "VFR"}, nearby=nearby)
    assert client.get("/api/airport/KDLH").json()["nearby_metar"] is None


def test_a_field_with_no_station_is_given_the_weather_modelled_there(monkeypatch):
    modelled = {"ceiling_ft": 1800.0, "visibility_sm": 10.0, "flight_category": "MVFR", "valid_at": "2026-10-10T21:00Z"}
    stub_place(monkeypatch, modelled=modelled)
    assert client.get("/api/airport/KDLH").json()["modelled_weather"] == modelled
    # Not where the field reports its own.
    stub_place(monkeypatch, metar={"raw": "KDLH 102155Z 27008KT 10SM CLR", "flight_category": "VFR"}, modelled=modelled)
    assert client.get("/api/airport/KDLH").json()["modelled_weather"] is None
    # NOMADS out: the card all the same, with none.
    stub_place(monkeypatch, modelled=glmp.GlmpUnavailable("down"))
    body = client.get("/api/airport/KDLH").json()
    assert body["modelled_weather"] is None and body["name"] == "Duluth International Airport"


def test_a_fields_card_carries_its_own_taf_as_issued(monkeypatch):
    raw = "TAF KDLH 291720Z 2918/3018 27012G22KT P6SM SCT050 FM300000 30008KT P6SM BKN025"
    stub_place(
        monkeypatch,
        metar={"raw": "KDLH 291753Z 27012KT 10SM SCT050", "flight_category": "VFR"},
        taf={"raw": raw, "ceiling_ft": None, "visibility_sm": 6.0, "change": "", "valid_from": 0, "valid_to": 0},
    )
    # The text as sent: the card reads its hours from it (web lib/hourly).
    assert client.get("/api/airport/KDLH").json()["taf"] == raw
    # Most fields issue none.
    stub_place(monkeypatch, taf=None)
    assert client.get("/api/airport/KDLH").json()["taf"] is None
    # The forecasts out: the card all the same, with none.
    stub_place(monkeypatch, taf=weather.WeatherServiceError("aviationweather.gov is down"))
    body = client.get("/api/airport/KDLH").json()
    assert body["taf"] is None and body["name"] == "Duluth International Airport"


def test_a_field_with_no_tower_or_station_says_so_rather_than_failing(monkeypatch):
    stub_place(monkeypatch, frequencies=[{"type": "CTAF", "description": None, "frequency_mhz": 122.8}], surface_class=None)
    body = client.get("/api/airport/KDLH").json()
    assert body["towered"] is False
    assert body["airspace_class"] is None
    assert body["metar"] is None
    assert body["weather_unavailable"] is False


def test_a_weather_outage_is_not_a_field_without_weather(monkeypatch):
    stub_place(monkeypatch, metar=weather.WeatherServiceError("aviationweather.gov is down"))
    body = client.get("/api/airport/KDLH").json()
    assert body["metar"] is None
    assert body["weather_unavailable"] is True


def test_an_ident_nobody_uses_is_a_404(monkeypatch):
    stub_place(monkeypatch)
    response = client.get("/api/airport/ZZZZ")
    assert response.status_code == 404
    assert "ZZZZ" in response.json()["detail"]


def test_the_card_names_the_cycle_its_diagram_is_drawn_from(monkeypatch):
    stub_place(monkeypatch)
    monkeypatch.setattr(publications, "airport_diagram_url", lambda ident: "https://aeronav.faa.gov/d-tpp/2610/00125AD.PDF")
    monkeypatch.setattr(publications, "airport_diagram_cycle", lambda ident: "2610")
    monkeypatch.setattr(
        publications,
        "terminal_charts",
        lambda ident: [{"kind": "IAP", "name": "ILS OR LOC RWY 09", "url": "https://aeronav.faa.gov/d-tpp/2610/00125IL9.PDF"}],
    )
    card = client.get("/api/airport/KDLH").json()
    assert card["airport_diagram_cycle"] == "2610"
    assert card["procedures"] == [{"kind": "IAP", "name": "ILS OR LOC RWY 09", "url": "https://aeronav.faa.gov/d-tpp/2610/00125IL9.PDF"}]


def test_the_card_has_the_fields_phone_and_street_address(monkeypatch):
    stub_place(monkeypatch)
    duluth = {"phone": "218-727-2968", "address": "4701 Grinden Drive, Duluth, MN 55811"}
    monkeypatch.setattr(
        faa_data, "airport_contact", lambda ident, cache_dir: duluth if ident == "KDLH" else {"phone": None, "address": None}
    )
    card = client.get("/api/airport/KDLH").json()
    assert (card["phone"], card["address"]) == ("218-727-2968", "4701 Grinden Drive, Duluth, MN 55811")


def test_a_runway_part_turf_says_which_part_by_its_own_end(monkeypatch):
    # The remarks name its end "06"; OurAirports' runway names it "6".
    stub_place(
        monkeypatch,
        runways=[
            {
                "ends": "6/24",
                "length_ft": 3573,
                "width_ft": 40,
                "surface": "ASPH-TURF",
                "lighted": False,
                "closed": False,
                "end_headings": [("6", 58.0), ("24", 238.0)],
            }
        ],
    )
    monkeypatch.setattr(pattern, "end_positions", lambda ident, cache_dir=None: {})
    turf = {"06/24": [{"end": "06", "from_ft": 0, "to_ft": 1000}]}
    monkeypatch.setattr(remarks, "runway_turf", lambda faa_id: turf if faa_id == "DLH" else {})
    runway = client.get("/api/airport/KDLH").json()["runways"][0]
    assert runway["turf"] == [{"end": "6", "from_ft": 0, "to_ft": 1000}]


def test_turf_named_from_the_far_end_keeps_the_runways_own_end_name(monkeypatch):
    # The remarks measure from 24, and OurAirports lists the ends the other way round.
    stub_place(
        monkeypatch,
        runways=[
            {
                "ends": "24/6",
                "length_ft": 3573,
                "width_ft": 40,
                "surface": "ASPH-TURF",
                "lighted": False,
                "closed": False,
                "end_headings": [("24", 238.0), ("6", 58.0)],
            }
        ],
    )
    monkeypatch.setattr(pattern, "end_positions", lambda ident, cache_dir=None: {})
    turf = {"06/24": [{"end": "24", "from_ft": 0, "to_ft": 500}]}
    monkeypatch.setattr(remarks, "runway_turf", lambda faa_id: turf if faa_id == "DLH" else {})
    runway = client.get("/api/airport/KDLH").json()["runways"][0]
    assert runway["turf"] == [{"end": "24", "from_ft": 0, "to_ft": 500}]


def test_a_card_without_the_remarks_file_has_its_runways_and_no_turf(monkeypatch):
    stub_place(
        monkeypatch,
        runways=[
            {
                "ends": "6/24",
                "length_ft": 3573,
                "width_ft": 40,
                "surface": "ASPH-TURF",
                "lighted": False,
                "closed": False,
                "end_headings": [("6", 58.0), ("24", 238.0)],
            }
        ],
    )
    monkeypatch.setattr(pattern, "end_positions", lambda ident, cache_dir=None: {})

    def missing(faa_id):
        raise OSError("no remarks file")

    monkeypatch.setattr(remarks, "runway_turf", missing)
    runway = client.get("/api/airport/KDLH").json()["runways"][0]
    assert runway["length_ft"] == 3573 and not runway.get("turf")


def test_turf_is_found_under_the_faa_identifier_of_a_k_ident(monkeypatch):
    stub_place(
        monkeypatch,
        runways=[
            {
                "ends": "6/24",
                "length_ft": 3573,
                "width_ft": 40,
                "surface": "ASPH-TURF",
                "lighted": False,
                "closed": False,
                "end_headings": [("6", 58.0), ("24", 238.0)],
            }
        ],
    )
    monkeypatch.setattr(pattern, "end_positions", lambda ident, cache_dir=None: {})
    asked = []

    def turf(faa_id):
        asked.append(faa_id)
        return {"06/24": [{"end": "06", "from_ft": 0, "to_ft": 1000}]} if faa_id == "DLH" else {}

    monkeypatch.setattr(remarks, "runway_turf", turf)
    runway = client.get("/api/airport/KDLH").json()["runways"][0]
    assert "DLH" in asked and runway["turf"] == [{"end": "6", "from_ft": 0, "to_ft": 1000}]


def test_a_fields_services_are_the_faas_and_the_places_near_it(monkeypatch):
    stub_place(monkeypatch)
    monkeypatch.setattr(
        faa_data, "airport_services", lambda ident, cache_dir: {**faa_data.NO_SERVICES, "fuel_types": ["100LL", "A"], "tie_down": True}
    )
    monkeypatch.setattr(
        remarks,
        "service_notes",
        lambda faa_id: (
            {"fuel": ["24 hour self serve fuel."], "ground": ["Courtesy car available."], "courtesy_car": True}
            if faa_id == "DLH"
            else {"fuel": [], "ground": [], "courtesy_car": False}
        ),
    )
    diner = {
        "name": "Sky Diner",
        "kind": "Diner",
        "distance_m": 300,
        "walk_min": 4,
        "phone": None,
        "website": None,
        "lat": 46.84,
        "lon": -92.19,
        "on_field": True,
    }
    monkeypatch.setattr(nearby, "around", lambda ident, lat, lon: {"food": [diner], "lodging": [], "cars": []})
    body = client.get("/api/airport/KDLH/services").json()
    assert body["fuel_types"] == ["100LL", "A"] and body["tie_down"] is True
    # The remarks under the FAA's own identifier, DLH for KDLH.
    assert body["fuel_notes"] == ["24 hour self serve fuel."] and body["courtesy_car"] is True
    assert body["food"] == [diner] and body["nearby_unavailable"] is False


def test_overture_out_of_reach_is_said_not_a_field_with_nothing_near(monkeypatch):
    stub_place(monkeypatch)
    monkeypatch.setattr(faa_data, "airport_services", lambda ident, cache_dir: dict(faa_data.NO_SERVICES))
    monkeypatch.setattr(remarks, "service_notes", lambda faa_id: {"fuel": [], "ground": [], "courtesy_car": False})

    def unreadable(ident, lat, lon):
        raise nearby.NearbyUnavailable("S3 is out of reach")

    monkeypatch.setattr(nearby, "around", unreadable)
    body = client.get("/api/airport/KDLH/services").json()
    assert body["nearby_unavailable"] is True and body["food"] == []
    assert client.get("/api/airport/ZZZZ/services").status_code == 404
