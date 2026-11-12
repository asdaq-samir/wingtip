"""/api/studio: the Studio's day of an airplane and the airplanes watched
here, the store stubbed."""

from fastapi.testclient import TestClient
from wingtip import elevation, traffic
from wingtip.traffic import day_tracks

from app.main import app

client = TestClient(app)

DAY = {
    "hex": "a0b7d8",
    "registration": "N14511",
    "type": "A21N",
    "day": "2026-11-10",
    "points": [{"t": 1762736400.0, "lat": 29.98, "lon": -95.36, "alt_ft": 1200.0, "gs_kt": 161.9, "track_deg": 152.0, "ground": False}],
    "altitude": "pressure",
    "source": "adsb.lol",
    "license": "ODbL 1.0",
}


def test_a_day_of_an_airplane_with_its_source_and_licence(monkeypatch):
    monkeypatch.setattr(day_tracks, "day_track", lambda q, day: DAY)
    resp = client.get("/api/studio/track", params={"q": "N14511", "day": "2026-11-10"})
    assert resp.status_code == 200
    assert resp.json()["license"] == "ODbL 1.0"
    assert resp.json()["points"][0]["alt_ft"] == 1200.0


def test_an_unknown_airplane_is_a_404_and_an_unreadable_archive_a_503(monkeypatch):
    def unknown(q, day):
        raise day_tracks.NotAnAirplane(q)

    monkeypatch.setattr(day_tracks, "day_track", unknown)
    assert client.get("/api/studio/track", params={"q": "N99999", "day": "2026-11-10"}).status_code == 404

    def down(q, day):
        raise traffic.TrafficUnavailable("refused")

    monkeypatch.setattr(day_tracks, "day_track", down)
    assert client.get("/api/studio/track", params={"q": "N14511", "day": "2026-11-10"}).status_code == 503


def test_the_airplanes_watched_here_with_their_days(monkeypatch):
    monkeypatch.setattr(day_tracks, "watched_days", lambda: [{"hex": "a128b9", "registration": "N174HA", "days": ["2026-11-11"]}])
    assert client.get("/api/studio/watched").json() == [{"hex": "a128b9", "registration": "N174HA", "days": ["2026-11-11"]}]


def test_the_studio_is_the_developers():
    paths = app.openapi()["paths"]
    assert paths["/api/studio/track"]["get"]["x-gateway"] == {"access": "developer"}


def test_the_ground_under_a_track_in_feet(monkeypatch):
    monkeypatch.setattr(elevation, "get_elevations_m", lambda points: {p: 304.8 for p in points})
    resp = client.post("/api/studio/ground", json={"points": [[45.0, -93.0], [45.1, -93.1]]})
    assert resp.json() == {"ground_ft": [1000.0, 1000.0]}
