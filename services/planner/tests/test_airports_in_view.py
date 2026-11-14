"""The map's own list of fields (/api/airports/in-view): the fields in a
box, those that report first, each with its weather, its airspace and its
marks. The tables, the airspace and the weather are stubbed -- these test
what the router makes of them. Apart from test_airports.py, the field's
card, to keep each file a size a reader takes in."""

import gzip
import json

from fastapi.testclient import TestClient
from wingtip import airports, airspace, airspace_primaries, faa_data, field_marks, weather

from app.main import app

from .test_airports import DULUTH

client = TestClient(app)


def test_the_fields_in_view_come_from_the_box_and_the_limit_those_that_report_first(monkeypatch):
    asked = {}

    def places_in(south, west, north, east, limit, first=None):
        asked.update(south=south, west=west, north=north, east=east, limit=limit, first=first)
        return [{**DULUTH}]

    monkeypatch.setattr(airports, "places_in", places_in)
    monkeypatch.setattr(weather, "reporting_idents", lambda: {"KDLH"})
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {i: None for i in idents})
    body = client.get("/api/airports/in-view", params={"south": 46, "west": -93, "north": 47, "east": -92, "limit": 50}).json()
    assert asked == {"south": 46, "west": -93, "north": 47, "east": -92, "limit": 50, "first": {"KDLH"}}
    assert body["airports"][0]["ident"] == "KDLH"
    assert "source_ident" not in body["airports"][0]


def test_the_fields_in_view_carry_their_metars_flight_category(monkeypatch):
    # A chip on the map for each field that reports, in its category's
    # colour; nothing for one with no station, or with the weather out.
    no_station = {**DULUTH, "ident": "1D2", "source_ident": "1D2", "name": "A Small Field", "kind": "small"}
    monkeypatch.setattr(airports, "places_in", lambda *args, **kwargs: [{**DULUTH}, no_station])
    monkeypatch.setattr(weather, "reporting_idents", lambda: {"KDLH"})
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {"KDLH": {"flight_category": "MVFR"}, "1D2": None})
    body = client.get("/api/airports/in-view", params={"south": 46, "west": -93, "north": 47, "east": -92}).json()
    assert [(a["ident"], a["flight_category"]) for a in body["airports"]] == [("KDLH", "MVFR"), ("1D2", None)]

    def down(*args):
        raise weather.WeatherServiceError("aviationweather.gov is down")

    monkeypatch.setattr(weather, "reporting_idents", down)
    monkeypatch.setattr(weather, "metar_for_idents", down)
    body = client.get("/api/airports/in-view", params={"south": 46, "west": -93, "north": 47, "east": -92}).json()
    assert [a["flight_category"] for a in body["airports"]] == [None, None]


def test_the_fields_in_view_carry_their_metar_for_the_maps_marks(monkeypatch):
    # The station model and the wind arrow read the METAR as the engine
    # read it; the least crosswind only where the wind earns an arrow
    # (wind_arrow: 10 kt or more, or gusting), from the field's runways.
    from wingtip import map_weather

    calm_field = {**DULUTH, "ident": "1D2", "source_ident": "1D2", "kind": "small"}
    monkeypatch.setattr(airports, "places_in", lambda *args, **kwargs: [{**DULUTH}, calm_field])
    monkeypatch.setattr(weather, "reporting_idents", lambda: {"KDLH", "1D2"})
    windy = {"flight_category": "MVFR", "wind_dir_true_deg": 220, "wind_speed_kt": 18, "wind_gust_kt": 26}
    windy |= {"visibility_sm": 2, "wx": "BR", "ceiling_ft": 800, "ceiling_cover": "OVC", "ceiling_unknown": False}
    # P6SM: at least 6 sm, as the engine's awc_metars_read says it.
    light = {"flight_category": "VFR", "wind_dir_true_deg": 220, "wind_speed_kt": 5, "wx": "", "visibility_sm": 6, "visibility_plus": True}
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {"KDLH": windy, "1D2": light})
    asked = []
    monkeypatch.setattr(
        map_weather, "end_headings", lambda ident: asked.append(ident) or [[["18", 180.0], ["36", 360.0]], [["27", 270.0], ["09", 90.0]]]
    )
    monkeypatch.setattr(map_weather, "magnetic_variation_deg", lambda lat, lon: 0.0)
    body = client.get("/api/airports/in-view", params={"south": 46, "west": -93, "north": 47, "east": -92}).json()
    dlh, small = body["airports"]
    # 40 degrees off runway 18, the gust's 26 sin 40 = 16.71 kt, unrounded
    # so the arrow is judged on the crosswind itself (the engine's AV-10).
    assert dlh["weather"] == {
        "wind_dir_true_deg": 220,
        "wind_speed_kt": 18,
        "wind_gust_kt": 26,
        "visibility_sm": 2,
        "visibility_plus": False,
        "wx": "BR",
        "ceiling_ft": 800,
        "ceiling_cover": "OVC",
        "ceiling_unknown": False,
        "crosswind_kt": 16.712478,
    }
    assert small["weather"]["crosswind_kt"] is None and small["weather"]["wx"] is None
    assert (small["weather"]["visibility_sm"], small["weather"]["visibility_plus"]) == (6, True)
    assert asked == ["KDLH"]


def test_the_fields_in_view_carry_their_surface_class_for_their_marks(monkeypatch):
    # Asked once for all of them, each field's own point.
    small = {**DULUTH, "ident": "1D2", "source_ident": "1D2", "lat": 46.5, "lon": -92.5, "kind": "small"}
    monkeypatch.setattr(airports, "places_in", lambda *args, **kwargs: [{**DULUTH}, small])
    monkeypatch.setattr(weather, "reporting_idents", lambda: set())
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {})
    asked = []
    monkeypatch.setattr(airspace, "surface_classes", lambda points, shp: asked.append(points) or ["C", "G"])
    body = client.get("/api/airports/in-view", params={"south": 46, "west": -93, "north": 47, "east": -92}).json()
    assert asked == [[(46.8421, -92.1936), (46.5, -92.5)]]
    assert [(a["ident"], a["airspace_class"]) for a in body["airports"]] == [("KDLH", "C"), ("1D2", "G")]

    # Without the FAA's airspace, the fields all the same, their class unknown.
    def unreachable(cache_dir):
        raise OSError("nfdc.faa.gov is down")

    monkeypatch.setattr(airspace, "ensure_class_airspace_shapefile", unreachable)
    body = client.get("/api/airports/in-view", params={"south": 46, "west": -93, "north": 47, "east": -92}).json()
    assert [(a["ident"], a["airspace_class"]) for a in body["airports"]] == [("KDLH", None), ("1D2", None)]


def test_the_fields_in_view_say_which_airspace_each_is_the_primary_field_of(monkeypatch):
    # Zoomed out, the map shows the field a Class B or C is named for at its
    # middle, not another inside it (Love Field for Dallas's). The FAA's
    # airspace file names the primary by its location identifier.

    love = {**DULUTH, "ident": "KDAL", "source_ident": "KDAL", "faa_id": "DAL", "lat": 32.85, "lon": -96.85, "kind": "large"}
    dfw = {**DULUTH, "ident": "KDFW", "source_ident": "KDFW", "faa_id": "DFW", "lat": 32.9, "lon": -97.04, "kind": "large"}
    monkeypatch.setattr(airports, "places_in", lambda *args, **kwargs: [love, dfw, {**DULUTH}])
    monkeypatch.setattr(weather, "reporting_idents", lambda: set())
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {})
    monkeypatch.setattr(airspace, "surface_classes", lambda points, shp: ["B", "B", "C"])
    monkeypatch.setattr(airspace_primaries, "primaries", lambda: {"DFW": "B", "DLH": "C"})
    body = client.get("/api/airports/in-view", params={"south": 30, "west": -100, "north": 50, "east": -90}).json()
    assert [(a["ident"], a["airspace_class"], a["primary_of"]) for a in body["airports"]] == [
        ("KDAL", "B", None),
        ("KDFW", "B", "B"),
        ("KDLH", "C", None),
    ]
    assert "faa_id" not in body["airports"][0]


def test_the_primaries_come_from_the_airspace_file_by_their_highest_class(monkeypatch):

    monkeypatch.setattr(
        airspace,
        "_load_all_controlled_airspace",
        lambda shp: [
            {"ident": "DFW", "class": "B"},
            {"ident": "DAL", "class": "D"},
            {"ident": "DFW", "class": "D"},
            {"ident": "", "class": "C"},
            {"ident": "ORD", "class": "E"},
        ],
    )
    airspace_primaries.primaries_of.cache_clear()
    assert airspace_primaries.primaries_of("airspace.shp", 1.0) == {"DFW": "B", "DAL": "D"}


def test_the_search_may_be_kept_and_the_fields_in_view_with_their_weather_may_not(monkeypatch):
    # The search is the same for every pilot until the tables change, so
    # a browser and the CDN may keep it; the fields in view carry each
    # one's METAR, which changes within the hour, so they say nothing
    # (and the gateway marks them no-store).
    monkeypatch.setattr(airports, "places_in", lambda *args, **kwargs: [{**DULUTH}])
    monkeypatch.setattr(weather, "reporting_idents", lambda: {"KDLH"})
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {"KDLH": {"flight_category": "VFR"}})
    in_view = client.get("/api/airports/in-view", params={"south": 46, "west": -93, "north": 47, "east": -92})
    assert "cache-control" not in in_view.headers

    monkeypatch.setattr(airports, "search_airports", lambda q, near=None: [])
    search = client.get("/api/airports/search", params={"q": "KD"})
    assert search.headers["cache-control"] == "public, max-age=300, s-maxage=3600"


def test_the_search_index_goes_gzipped_and_kept_a_day(monkeypatch):
    # The phone's own copy of the search (wingtip.airports.search_index), as
    # the planner keeps it, and the same for every pilot.
    body = gzip.compress(json.dumps({"airports": [["KDLH", "Duluth Intl", "Duluth", "MN", 1, "DLH"]]}).encode())
    monkeypatch.setattr(airports, "search_index", lambda: body)
    response = client.get("/api/airports/index")
    assert response.headers["content-encoding"] == "gzip"
    assert response.headers["cache-control"] == "public, max-age=86400"
    assert response.json() == {"airports": [["KDLH", "Duluth Intl", "Duluth", "MN", 1, "DLH"]]}


def test_a_field_the_armed_services_own_is_marked_military_or_joint_use(monkeypatch):
    # From the FAA's airport file (wingtip.faa_data.military_fields), by the
    # FAA's ident or the ICAO one: most pilots may not land at the first
    # without permission, and may at the second.
    base = {**DULUTH, "kind": "medium"}
    fields = [{**base, "ident": "KMXF", "source_ident": "KMXF"}, {**base, "ident": "KFHU", "source_ident": "KFHU"}, {**base}]
    monkeypatch.setattr(airports, "places_in", lambda *args, **kwargs: fields)
    monkeypatch.setattr(weather, "reporting_idents", lambda: set())
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {})
    monkeypatch.setattr(faa_data, "military_fields", lambda cache_dir: {"MXF": "military", "KMXF": "military", "KFHU": "joint"})
    body = client.get("/api/airports/in-view", params={"south": 30, "west": -100, "north": 47, "east": -80}).json()
    assert [(a["ident"], a["military"]) for a in body["airports"]] == [("KMXF", "military"), ("KFHU", "joint"), ("KDLH", None)]


def test_a_field_closed_to_the_public_is_marked_private(monkeypatch):
    # From the FAA's airport file (wingtip.faa_data.private_fields), by either ident.
    base = {**DULUTH, "kind": "small"}
    fields = [{**base, "ident": "IL22", "source_ident": "IL22"}, {**base}]
    monkeypatch.setattr(airports, "places_in", lambda *args, **kwargs: fields)
    monkeypatch.setattr(weather, "reporting_idents", lambda: set())
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {})
    monkeypatch.setattr(faa_data, "private_fields", lambda cache_dir: frozenset({"IL22"}))
    body = client.get("/api/airports/in-view", params={"south": 30, "west": -100, "north": 47, "east": -80}).json()
    assert [(a["ident"], a["private"]) for a in body["airports"]] == [("IL22", True), ("KDLH", False)]


def test_the_airport_file_is_read_once_for_all_the_fields_in_view(monkeypatch):
    # With APT_BASE.csv missing each read retries the NASR download, so a
    # read per field would repeat it hundreds of times on a wide map.
    calls = []
    fields = [{**DULUTH, "kind": "small", "ident": f"X{n}", "source_ident": f"X{n}"} for n in range(5)]
    monkeypatch.setattr(airports, "places_in", lambda *args, **kwargs: fields)
    monkeypatch.setattr(weather, "reporting_idents", lambda: set())
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {})
    monkeypatch.setattr(faa_data, "military_fields", lambda cache_dir: calls.append("military") or {})
    monkeypatch.setattr(faa_data, "private_fields", lambda cache_dir: calls.append("private") or frozenset())
    monkeypatch.setattr(faa_data, "towered_fields", lambda cache_dir: calls.append("towered") or frozenset())
    client.get("/api/airports/in-view", params={"south": 30, "west": -100, "north": 47, "east": -80})
    assert sorted(calls) == ["military", "private", "towered"]


def test_a_field_with_a_control_tower_is_marked_towered(monkeypatch):
    # From NASR's APT_BASE TWR_TYPE_CODE (wingtip.faa_data.towered_fields),
    # by either ident: the sectional's blue airport symbol.
    base = {**DULUTH, "kind": "small"}
    fields = [{**base, "ident": "06C", "source_ident": "06C"}, {**base}]
    monkeypatch.setattr(airports, "places_in", lambda *args, **kwargs: fields)
    monkeypatch.setattr(weather, "reporting_idents", lambda: set())
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {})
    monkeypatch.setattr(faa_data, "towered_fields", lambda cache_dir: frozenset({"KDLH"}))
    body = client.get("/api/airports/in-view", params={"south": 30, "west": -100, "north": 47, "east": -80}).json()
    assert [(a["ident"], a["towered"]) for a in body["airports"]] == [("06C", False), ("KDLH", True)]


def test_reporting_asks_for_the_fields_with_a_metar_alone(monkeypatch):
    asked = {}

    def places_in(south, west, north, east, limit, only=None):
        asked["only"] = only
        return [{**DULUTH}]

    monkeypatch.setattr(airports, "places_in", places_in)
    monkeypatch.setattr(weather, "reporting_idents", lambda: {"KDLH", "KMSP"})
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {"KDLH": {"flight_category": "VFR"}})
    body = client.get("/api/airports/in-view", params={"south": 44, "west": -94, "north": 47, "east": -92, "reporting": True}).json()
    assert asked["only"] == {"KDLH", "KMSP"}
    assert body["airports"][0]["flight_category"] == "VFR"


def test_a_box_turned_inside_out_is_refused(monkeypatch):
    monkeypatch.setattr(airports, "places_in", lambda *args, **kwargs: [])
    response = client.get("/api/airports/in-view", params={"south": 47, "west": -93, "north": 46, "east": -92})
    assert response.status_code == 422


def test_the_fields_in_view_carry_their_marks_rank_as_the_tiles_do(monkeypatch):
    # The engine's field_mark_rank on NASR's facts, as the overlay tiles
    # carry it (wingtip.field_marks): a Class B's field the largest and
    # first; a public field without a tower but 5,000 ft of asphalt the
    # regular size, where the iPhone drew it small (2026-11-14).
    dfw = {**DULUTH, "ident": "KDFW", "source_ident": "KDFW", "faa_id": "DFW", "kind": "large"}
    long_hard = {**DULUTH, "ident": "1D2", "source_ident": "1D2", "faa_id": "1D2", "kind": "small"}
    monkeypatch.setattr(airports, "places_in", lambda *args, **kwargs: [dfw, long_hard])
    monkeypatch.setattr(weather, "reporting_idents", lambda: set())
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {})
    monkeypatch.setattr(airspace, "surface_classes", lambda points, shp: ["B", "G"])
    monkeypatch.setattr(airspace_primaries, "primaries", lambda: {"DFW": "B"})
    monkeypatch.setattr(faa_data, "towered_fields", lambda cache_dir: frozenset({"DFW", "KDFW"}))
    monkeypatch.setattr(field_marks, "sites", lambda cache_dir=None: {"DFW": ("A", "PU", 13401), "1D2": ("A", "PU", 5000)})
    body = client.get("/api/airports/in-view", params={"south": 30, "west": -100, "north": 50, "east": -90}).json()
    marks = [(a["ident"], a["mark_size"], a["mark_order"]) for a in body["airports"]]
    assert marks == [("KDFW", "largest", 86598), ("1D2", "regular", 394999)]
