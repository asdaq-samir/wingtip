"""Airports as places: the fields in a box, and one field's card. The
tables, the airspace and the weather are stubbed -- these test what the
router makes of them, not OurAirports or aviationweather.gov."""

from fastapi.testclient import TestClient
from wingtip import airport_photos, airports, airspace, faa_data, geocode, glmp, nearby, pattern, publications, remarks, weather

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


# The engine's reading of "ACTVT MIRL RWY 09/27 - CTAF." (lighting_read).
MIRL = {
    "code": "MIRL",
    "name": "Runway edge lights, medium intensity",
    "runways": ["09/27"],
    "pilot_controlled": True,
    "frequency": "CTAF",
    "clicks": None,
    "tower_closed": False,
    "preset": None,
    "brighter": False,
    "schedule": None,
    "continuous": False,
    "nonstandard": False,
    "how": "Key the mic on CTAF",
    "as_written": "ACTVT MIRL RWY 09/27 - CTAF.",
}


def stub_place(monkeypatch, place=DULUTH, frequencies=(), runways=(), metar=None, surface_class="C", nearby=None, modelled=None, taf=None):
    monkeypatch.setattr(airports, "find_place", lambda ident: place if ident.upper() in ("KDLH", "DLH") else None)
    monkeypatch.setattr(airports, "get_frequencies", lambda ident: list(frequencies))
    monkeypatch.setattr(airports, "get_runways", lambda ident: list(runways))
    monkeypatch.setattr(airspace, "ensure_class_airspace_shapefile", lambda cache_dir: "airspace.shp")
    monkeypatch.setattr(airspace, "surface_class_at", lambda lat, lon, shp: surface_class)
    monkeypatch.setattr(
        remarks,
        "airport_notes",
        lambda faa_id: {
            "lighting": ["ACTVT MIRL RWY 09/27 - CTAF."] if faa_id == "DLH" else [],
            "lights": [MIRL] if faa_id == "DLH" else [],
            "light_notes": [],
            "radio": [],
            "standard_keying": faa_id == "DLH",
        },
    )
    monkeypatch.setattr(remarks, "runway_turf", lambda faa_id: {})
    if isinstance(metar, Exception):

        def fail(idents):
            raise metar

        monkeypatch.setattr(weather, "metar_for_idents", fail)
    else:
        monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {i: metar for i in idents})
    monkeypatch.setattr(weather, "nearest_report", lambda lat, lon, exclude=None: nearby)
    if isinstance(taf, Exception):

        def no_tafs(idents):
            raise taf

        monkeypatch.setattr(weather, "taf_for_idents", no_tafs)
    else:
        monkeypatch.setattr(weather, "taf_for_idents", lambda idents: {i: taf for i in idents})
    if isinstance(modelled, Exception):

        def down(lat, lon):
            raise modelled

        monkeypatch.setattr(glmp, "at", down)
    else:
        monkeypatch.setattr(glmp, "at", lambda lat, lon: modelled)


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


def test_the_diagram_is_a_picture_kept_for_its_cycle_and_none_for_another(monkeypatch, tmp_path):
    picture = tmp_path / "00125AD.png"
    picture.write_bytes(b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr(publications, "airport_diagram_png", lambda ident, cycle: picture if (ident, cycle) == ("KDLH", "2610") else None)
    answer = client.get("/api/airport-diagram/2610/KDLH.png")
    assert answer.status_code == 200
    assert answer.headers["content-type"] == "image/png"
    assert answer.headers["cache-control"] == "public, max-age=2419200, immutable"
    assert answer.content == b"\x89PNG\r\n\x1a\n"
    assert client.get("/api/airport-diagram/2609/KDLH.png").status_code == 404


def test_the_card_has_the_fields_phone_and_street_address(monkeypatch):
    stub_place(monkeypatch)
    duluth = {"phone": "218-727-2968", "address": "4701 Grinden Drive, Duluth, MN 55811"}
    monkeypatch.setattr(
        faa_data, "airport_contact", lambda ident, cache_dir: duluth if ident == "KDLH" else {"phone": None, "address": None}
    )
    card = client.get("/api/airport/KDLH").json()
    assert (card["phone"], card["address"]) == ("218-727-2968", "4701 Grinden Drive, Duluth, MN 55811")


def test_an_faa_charts_pages_are_listed_and_drawn_for_its_edition(monkeypatch, tmp_path):
    page = {"source": "dtpp", "edition": "2610", "pdf": "EC3TO.PDF", "page": 33, "width": 1935, "height": 2970}
    monkeypatch.setattr(
        publications,
        "chart_pages",
        lambda url, ident: [page] if (url, ident) == ("https://aeronav.faa.gov/d-tpp/2610/EC3TO.PDF", "KMSN") else None,
    )
    answer = client.get("/api/faa-chart", params={"url": "https://aeronav.faa.gov/d-tpp/2610/EC3TO.PDF", "airport": "KMSN"})
    assert answer.status_code == 200
    assert answer.json() == {"pages": [page]}
    assert answer.headers["cache-control"] == "public, max-age=2419200, immutable"
    assert client.get("/api/faa-chart", params={"url": "https://example.com/x.pdf"}).status_code == 404

    picture = tmp_path / "EC3TO-33.png"
    picture.write_bytes(b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr(
        publications,
        "chart_page_png",
        lambda source, edition, pdf, n: picture if (source, edition, pdf, n) == ("dtpp", "2610", "EC3TO.PDF", 33) else None,
    )
    drawn = client.get("/api/faa-chart/page/dtpp/2610/EC3TO.PDF/33.png")
    assert drawn.status_code == 200 and drawn.headers["content-type"] == "image/png"
    assert client.get("/api/faa-chart/page/dtpp/2610/EC3TO.PDF/34.png").status_code == 404

    # The FAA not answering is a 502, which the edge does not keep; a bad address is the 404.
    def down(*args):
        raise publications.FaaUnreachable("down")

    monkeypatch.setattr(publications, "chart_pages", down)
    monkeypatch.setattr(publications, "chart_page_png", down)
    assert client.get("/api/faa-chart", params={"url": "https://aeronav.faa.gov/d-tpp/2610/EC3TO.PDF"}).status_code == 502
    assert client.get("/api/faa-chart/page/dtpp/2610/EC3TO.PDF/33.png").status_code == 502


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


def test_the_diagrams_runways_are_its_crop_with_the_fields_ends(monkeypatch, tmp_path):
    stub_place(
        monkeypatch,
        runways=[
            {
                "ends": "09/27",
                "end_headings": [("09", 90.0), ("27", 270.0)],
                "length_ft": 10162,
                "width_ft": 150,
                "surface": "CON",
                "lighted": True,
                "closed": False,
            }
        ],
    )
    monkeypatch.setattr(pattern, "end_positions", lambda ident, cache_dir=None: {"9": (46.84, -92.21), "27": (46.84, -92.17)})
    asked = []
    picture = tmp_path / "00125AD-runways.png"
    picture.write_bytes(b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr(
        publications,
        "airport_diagram_runways_png",
        lambda ident, cycle, ends: asked.append((ident, cycle, ends)) or (picture if cycle == "2610" else None),
    )
    answer = client.get("/api/airport-diagram/2610/runways/KDLH.png")
    assert answer.status_code == 200 and answer.headers["cache-control"] == "public, max-age=2419200, immutable"
    assert asked == [("KDLH", "2610", [(46.84, -92.21), (46.84, -92.17)])]
    assert client.get("/api/airport-diagram/2609/runways/KDLH.png").status_code == 404


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


def test_a_fields_procedures_are_listed_and_one_drawn_from_the_cifp(monkeypatch):
    from wingtip import procedures

    listed = {
        "airport": "KBUR",
        "cycle": "261001",
        "stale": False,
        "procedures": [
            {"kind": "approach", "id": "I08-Y", "name": "ILS Y RWY 08", "runway": "08", "transitions": ["LAX"], "runway_transitions": []}
        ],
    }
    drawn = {
        "airport": "KBUR",
        "kind": "approach",
        "id": "I08-Y",
        "name": "ILS Y RWY 08",
        "transition": "LAX",
        "cycle": "261001",
        "stale": False,
        "lines": [{"role": "transition", "name": "LAX", "points": [[33.93, -118.43], [34.2, -118.61]]}],
        "holds": [{"fix": "SILEX", "turn": "R", "inbound_deg": 91, "missed": False, "points": [[34.2, -118.61], [34.19, -118.6]]}],
        "fixes": [
            {
                "ident": "SILEX",
                "lat": 34.2,
                "lon": -118.61,
                "roles": ["IAF"],
                "min_ft": 3700,
                "max_ft": None,
                "speed_kt": None,
                "missed": False,
            }
        ],
    }
    asked = []
    monkeypatch.setattr(procedures, "procedures_at", lambda ident: listed if ident == "KBUR" else None)

    def drawing(ident, proc, transition=None):
        asked.append((ident, proc, transition))
        return drawn if proc == "I08-Y" else None

    monkeypatch.setattr(procedures, "procedure_drawing", drawing)

    assert client.get("/api/airport/KBUR/procedures").json() == listed
    # A field with none has an empty list, not a 404: most small ones.
    none = client.get("/api/airport/C81/procedures").json()
    assert none["airport"] == "C81" and none["procedures"] == []
    got = client.get("/api/airport/KBUR/procedures/I08-Y", params={"transition": "LAX"})
    assert got.status_code == 200 and got.json()["holds"][0]["fix"] == "SILEX"
    assert asked == [("KBUR", "I08-Y", "LAX")]
    assert client.get("/api/airport/KBUR/procedures/I99").status_code == 404


def test_the_procedures_say_when_the_faas_file_cannot_be_had(monkeypatch):
    from wingtip import procedures

    def unreachable(ident):
        raise RuntimeError("Download of the CIFP failed")

    monkeypatch.setattr(procedures, "procedures_at", unreachable)
    got = client.get("/api/airport/KBUR/procedures")
    assert got.status_code == 503 and "could not be had" in got.json()["detail"]


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


def test_an_airports_photos_are_its_aerial_and_its_wikipedia_photo(monkeypatch):
    stub_place(monkeypatch)
    monkeypatch.setattr(airports, "wikipedia_link", lambda ident: "https://en.wikipedia.org/wiki/Duluth_International_Airport")
    photo = {
        "url": "https://upload.wikimedia.org/d.jpg",
        "width": 900,
        "height": 675,
        "credit": "A. Pilot",
        "license": "CC BY 2.0",
        "source_url": None,
    }
    monkeypatch.setattr(airport_photos, "ground_photo", lambda ident, link: photo if link else None)
    body = client.get("/api/airport/KDLH/photos").json()
    # The photo served from the planner, as the aerial is.
    assert body == {"aerial_url": "/api/planner/airport-aerial/KDLH.jpg", "photo": {**photo, "url": "/api/planner/airport-photo/KDLH.jpg"}}


def test_the_aerial_is_a_picture_and_a_usgs_outage_a_503(monkeypatch, tmp_path):
    stub_place(monkeypatch)
    picture = tmp_path / "KDLH.jpg"
    picture.write_bytes(b"\xff\xd8jpeg")
    monkeypatch.setattr(airport_photos, "aerial", lambda ident, lat, lon, ends: picture)
    response = client.get("/api/airport-aerial/KDLH.jpg")
    assert response.status_code == 200 and response.headers["content-type"] == "image/jpeg"

    def down(ident, lat, lon, ends):
        raise airport_photos.PhotoUnavailable("the USGS is down")

    monkeypatch.setattr(airport_photos, "aerial", down)
    assert client.get("/api/airport-aerial/KDLH.jpg").status_code == 503
