"""HTTP-layer tests of /api/briefing: why VFR is not recommended, the
forecast read over the flight, each TAF station placed along the route,
the TFRs, pilot reports and G-AIRMETs, and each field's pattern and
runway ends. The weather and the airport tables are mocked at the names
the router calls."""

from fastapi.testclient import TestClient
from wingtip import airports, airspace, faa_data, pattern
from wingtip import tfr, weather

from app.main import app

client = TestClient(app)


# --- /api/briefing ---


def test_the_briefing_says_why_vfr_is_not_recommended(monkeypatch):
    """The reasons are the planner's to give (wingtip.weather); the page only
    shows them."""
    monkeypatch.setattr(weather, "hazards_along_route", lambda start, end: [])
    windows = []

    def forecast(start, end, window=None):
        windows.append(window)
        return {"min_ceiling_ft": 800.0, "min_visibility_sm": 6.0, "stations": []}

    monkeypatch.setattr(weather, "ceiling_visibility_along_route", forecast)
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {ident: None for ident in idents})
    monkeypatch.setattr(airports, "get_runways", lambda ident: [])
    monkeypatch.setattr(airports, "get_frequencies", lambda ident: [])

    resp = client.get("/api/briefing", params={"dep": "C81", "dest": "KDLH"})

    assert resp.status_code == 200
    assert resp.json()["vfr_not_recommended"] == ["forecast ceiling as low as 800 ft along the route"]


def test_the_briefing_carries_a_ceiling_of_unknown_height_through(monkeypatch):
    """OVC/// reported at the departure and forecast at the destination
    (wingtip.weather._sky_ceiling): not known, not none, so the briefing
    says so where it would say no ceiling."""
    monkeypatch.setattr(weather, "hazards_along_route", lambda start, end: [])
    monkeypatch.setattr(
        weather,
        "ceiling_visibility_along_route",
        lambda start, end, window=None: {
            "min_ceiling_ft": None,
            "min_visibility_sm": 10.0,
            "ceiling_unknown_at": ["KDLH"],
            "stations": [
                {
                    "icaoId": "KDLH",
                    "lat": 46.8421,
                    "lon": -92.1936,
                    "elevation_ft": 1424,
                    "ceiling_ft": None,
                    "ceiling_unknown": True,
                    "visibility_sm": 10.0,
                }
            ],
        },
    )
    monkeypatch.setattr(
        weather,
        "metar_for_idents",
        lambda idents: {
            ident: (
                {
                    "raw": "KC81 251755Z AUTO 10SM OVC///",
                    "flight_category": None,
                    "ceiling_ft": None,
                    "ceiling_unknown": True,
                    "visibility_sm": 10.0,
                }
                if ident in ("C81", "KC81")
                else None
            )
            for ident in idents
        },
    )
    monkeypatch.setattr(
        weather,
        "tafs_over",
        lambda asked: {"KDLH": {"ceiling_ft": None, "ceiling_unknown": True, "visibility_sm": 10.0, "raw": "TAF KDLH ..."}},
    )
    monkeypatch.setattr(airports, "get_runways", lambda ident: [])
    monkeypatch.setattr(airports, "get_frequencies", lambda ident: [])

    body = client.get("/api/briefing", params={"dep": "C81", "dest": "KDLH"}).json()

    assert body["forecast"]["ceiling_unknown_at"] == ["KDLH"]
    station = body["forecast"]["stations"][0]
    assert (station["ceiling_unknown"], station["eta_ceiling_unknown"]) == (True, True)
    assert body["metars"]["C81"]["ceiling_unknown"] is True
    assert body["vfr_not_recommended"] == [
        "C81 currently reporting a ceiling of unknown height",
        "forecast ceiling of unknown height at KDLH",
    ]


def test_the_briefing_forecast_is_read_over_the_flight(monkeypatch):
    """From the departure to an hour past arrival, not whenever it was asked."""
    windows = []
    monkeypatch.setattr(weather, "hazards_along_route", lambda start, end: [])
    monkeypatch.setattr(
        weather,
        "ceiling_visibility_along_route",
        lambda start, end, window=None: windows.append(window) or {"min_ceiling_ft": None, "min_visibility_sm": None, "stations": []},
    )
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {ident: None for ident in idents})
    monkeypatch.setattr(airports, "get_runways", lambda ident: [])
    monkeypatch.setattr(airports, "get_frequencies", lambda ident: [])

    resp = client.get("/api/briefing", params={"dep": "C81", "dest": "KDLH", "depart": "2026-09-25T13:00:00Z", "ete_min": 150})

    assert resp.status_code == 200
    start = 1790341200.0  # 2026-09-25T13:00:00Z
    assert windows == [(start, start + 150 * 60 + 3600)]


def test_each_taf_station_is_placed_along_the_route_and_read_for_when_the_flight_is_there(monkeypatch):
    """For the Weather tab's places: the destination's TAF is read for the
    arrival, an hour either side, not over the whole flight."""
    monkeypatch.setattr(weather, "hazards_along_route", lambda start, end: [])
    monkeypatch.setattr(
        weather,
        "ceiling_visibility_along_route",
        lambda start, end, window=None: {
            "min_ceiling_ft": 900.0,
            "min_visibility_sm": 4.0,
            "stations": [
                {"icaoId": "KDLH", "lat": 46.8421, "lon": -92.1936, "elevation_ft": 1424, "ceiling_ft": 900.0, "visibility_sm": 4.0}
            ],
        },
    )
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {ident: None for ident in idents})
    monkeypatch.setattr(airports, "get_runways", lambda ident: [])
    monkeypatch.setattr(airports, "get_frequencies", lambda ident: [])
    windows = {}
    monkeypatch.setattr(
        weather,
        "tafs_over",
        lambda asked: windows.update(asked) or {"KDLH": {"ceiling_ft": 3000.0, "visibility_sm": 6.0, "raw": "TAF KDLH 251720Z ..."}},
    )

    body = client.get("/api/briefing", params={"dep": "C81", "dest": "KDLH", "depart": "2026-09-25T13:00:00Z", "ete_min": 150}).json()

    station = body["forecast"]["stations"][0]
    arrival = 1790341200.0 + 150 * 60
    assert windows == {"KDLH": (arrival - 3600, arrival + 3600)}
    assert station["eta"] == "2026-09-25T15:30:00Z" and station["along_track_nm"] > 250
    assert (station["eta_ceiling_ft"], station["eta_visibility_sm"]) == (3000.0, 6.0)
    # The whole flight's worst stays the go/no-go read.
    assert (station["ceiling_ft"], body["forecast"]["min_ceiling_ft"]) == (900.0, 900.0)
    assert station["raw"].startswith("TAF KDLH")


def test_the_briefing_tells_the_tfrs_pilot_reports_and_g_airmets_on_the_route(monkeypatch):
    monkeypatch.setattr(weather, "hazards_along_route", lambda start, end: [])
    monkeypatch.setattr(
        weather,
        "ceiling_visibility_along_route",
        lambda start, end, window=None: ({"min_ceiling_ft": None, "min_visibility_sm": None, "stations": []}),
    )
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {ident: None for ident in idents})
    monkeypatch.setattr(airports, "get_runways", lambda ident: [])
    monkeypatch.setattr(airports, "get_frequencies", lambda ident: [])
    paths = []
    monkeypatch.setattr(
        tfr,
        "along_route",
        lambda path, start, end: (
            paths.append(path)
            or [
                {
                    "notam_id": "6/6664",
                    "kind": "Security",
                    "floor_ft": 0.0,
                    "floor_ref": "AGL",
                    "ceiling_ft": 400.0,
                    "ceiling_ref": "AGL",
                    "effective": "2026-10-06T23:00:00Z",
                    "expires": "2026-10-07T01:00:00Z",
                    "along_track_nm": 12.0,
                    "crosses": True,
                    "active_now": False,
                    "geometry": {"type": "MultiPolygon"},
                }
            ]
        ),
    )
    monkeypatch.setattr(
        weather,
        "pireps_along_route",
        lambda path: [
            {
                "observed_at": "2026-10-04T04:07:00Z",
                "altitude_ft": 7000.0,
                "aircraft": "BE58",
                "urgent": False,
                "turbulence": "MOD",
                "icing": None,
                "raw": "UA /OV ...",
                "along_track_nm": 40.0,
            }
        ],
    )
    monkeypatch.setattr(
        weather,
        "gairmet_snapshots_along_route",
        lambda path, window: [
            {
                "hazard": "Icing",
                "severity": "MOD",
                "due_to": "ICE",
                "valid_at": "2026-10-04T03:00:00Z",
                "valid": 1791085200.0,
                "altitude_low_ft": None,
                "from_freezing_level": True,
                "altitude_high_ft": 22000.0,
            }
        ],
    )

    body = client.get("/api/briefing", params={"dep": "C81", "dest": "KDLH", "stops": "KMSN"}).json()

    # Along the whole route, through its stop.
    assert [len(path) for path in paths] == [3]
    assert body["tfrs"][0]["notam_id"] == "6/6664" and body["tfrs"][0]["crosses"] and "geometry" not in body["tfrs"][0]
    assert body["pireps"][0]["turbulence"] == "MOD"
    assert body["gairmets"][0]["hazard"] == "Icing"


def test_each_airport_landed_at_has_its_pattern_and_its_runway_ends(monkeypatch):
    """For the pattern card and the radio calls: how high the pattern is
    and which way round at each end, the class over the field and what
    it is called."""
    monkeypatch.setattr(weather, "hazards_along_route", lambda start, end: [])
    monkeypatch.setattr(
        weather,
        "ceiling_visibility_along_route",
        lambda start, end, window=None: ({"min_ceiling_ft": None, "min_visibility_sm": None, "stations": []}),
    )
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {ident: None for ident in idents})
    monkeypatch.setattr(
        airports,
        "get_runways",
        lambda ident: [
            {
                "ends": "09/27",
                "end_headings": [("09", 90.2), ("27", 270.2)],
                "length_ft": 3270,
                "width_ft": 40,
                "surface": "ASP",
                "lighted": True,
                "closed": False,
            }
        ],
    )
    monkeypatch.setattr(airports, "get_frequencies", lambda ident: [])
    monkeypatch.setattr(pattern, "right_traffic_ends", lambda ident, cache_dir=None: {"27"} if ident == "C81" else set())
    monkeypatch.setattr(faa_data, "published_pattern_agl_ft", lambda ident, cache_dir: 800.0 if ident == "DLH" else None)
    monkeypatch.setattr(airspace, "surface_class_at", lambda lat, lon, shp: "C" if lat > 46 else "E")

    body = client.get("/api/briefing", params={"dep": "C81", "dest": "KDLH"}).json()

    c81, dlh = body["airports"]["C81"], body["airports"]["KDLH"]
    assert c81["pattern"] == {"agl_ft": 1000.0, "altitude_ft": 1900.0, "published": False, "remarks": []}
    assert dlh["pattern"] == {"agl_ft": 800.0, "altitude_ft": 1700.0, "published": True, "remarks": []}
    assert [(e["ident"], e["traffic"]) for e in c81["runways"][0]["runway_ends"]] == [("09", "left"), ("27", "right")]
    assert c81["runways"][0]["runway_ends"][0]["heading_true_deg"] == 90.2
    assert (c81["airspace_class"], dlh["airspace_class"]) == ("E", "C")
    assert dlh["name"] == "KDLH" and dlh["elevation_ft"] == 900.0


def test_a_tfr_site_that_does_not_answer_is_said_not_taken_for_none(monkeypatch):
    monkeypatch.setattr(weather, "hazards_along_route", lambda start, end: [])
    monkeypatch.setattr(
        weather,
        "ceiling_visibility_along_route",
        lambda start, end, window=None: ({"min_ceiling_ft": None, "min_visibility_sm": None, "stations": []}),
    )
    monkeypatch.setattr(weather, "metar_for_idents", lambda idents: {ident: None for ident in idents})
    monkeypatch.setattr(airports, "get_runways", lambda ident: [])
    monkeypatch.setattr(airports, "get_frequencies", lambda ident: [])

    def down(*args):
        raise tfr.TfrUnavailable("down")

    monkeypatch.setattr(tfr, "along_route", down)
    monkeypatch.setattr(tfr, "all_tfrs", down)

    assert "tfrs" in client.get("/api/briefing", params={"dep": "C81", "dest": "KDLH"}).json()["weather_unavailable"]
    resp = client.get("/api/tfrs")
    assert resp.status_code == 502 and "tfr.faa.gov" in resp.json()["detail"]
