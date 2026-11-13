"""/api/studio/weather, /ntsb and /notams: the day of a replayed flight,
wingtip.history stubbed."""

from fastapi.testclient import TestClient
from wingtip.history import iem, notam_archive, ntsb, weather_then

from app.main import app

client = TestClient(app)

WEATHER = {
    "metars": [
        {
            "station": "KORD",
            "lat": 41.96,
            "lon": -87.93,
            "time": "2026-11-10T00:51:00Z",
            "raw": "KORD 100051Z 19006KT 10SM SCT250 11/04 A3003",
        }
    ],
    "tafs": [{"station": "KORD", "issued": "2026-11-10T05:20:00Z", "raw": "TAF\nKORD 100520Z 1006/1112 24008KT P6SM FEW250="}],
    "radar": [
        {
            "valid": "2026-11-10T00:00:00Z",
            "tiles": "https://mesonet.agron.iastate.edu/c/tile.py/1.0.0/ridge::USCOMP-N0Q-202611100000/{z}/{x}/{y}.png",
        }
    ],
    "source": iem.SOURCE,
    "credit": iem.CREDIT,
}


def test_the_weather_as_it_was(monkeypatch):
    monkeypatch.setattr(weather_then, "weather_then", lambda start, end, points: WEATHER)
    resp = client.post("/api/studio/weather", json={"start": 1762732800, "end": 1762736400, "points": [[41.97, -87.9]]})
    assert resp.status_code == 200
    assert resp.json()["tafs"][0]["raw"].startswith("TAF\nKORD")


def test_a_span_backwards_or_too_long_is_a_422_and_iem_down_a_503(monkeypatch):
    assert client.post("/api/studio/weather", json={"start": 10, "end": 5, "points": []}).status_code == 422
    assert client.post("/api/studio/weather", json={"start": 0, "end": 3 * 86400, "points": []}).status_code == 422

    def down(start, end, points):
        raise iem.WeatherHistoryUnavailable("refused")

    monkeypatch.setattr(weather_then, "weather_then", down)
    assert client.post("/api/studio/weather", json={"start": 0, "end": 60, "points": []}).status_code == 503


def test_the_ntsbs_cases_of_an_airplane(monkeypatch):
    case = {
        "ntsb_no": "CEN27LA029",
        "ev_id": "20261023204059",
        "date": "2026-10-22",
        "city": "Claremore",
        "state": "OK",
        "country": "USA",
        "phase": "Enroute-descent",
        "highest_injury": "None",
        "probable_cause": None,
        "narrative": "On October 22, 2026, about 1510 central daylight time, ...",
        "narrative_kind": "preliminary",
        "carol_url": "https://data.ntsb.gov/carol-repgen/api/Aviation/ReportMain/GenerateNewestReport/204059/pdf",
        "docket_url": "https://data.ntsb.gov/Docket/?NTSBNumber=CEN27LA029",
    }
    monkeypatch.setattr(ntsb, "events", lambda reg, day: [case] if (reg, day) == ("N5393W", "2026-10-22") else [])
    assert client.get("/api/studio/ntsb", params={"registration": "N5393W", "day": "2026-10-22"}).json() == [case]
    assert client.get("/api/studio/ntsb", params={"registration": "N14511", "day": "2026-11-10"}).json() == []


def test_the_notams_as_they_were(monkeypatch):
    answer = {"archived": False, "day": "2026-11-09", "notams": [], "tfrs": []}
    monkeypatch.setattr(notam_archive, "as_it_was", lambda at, *box: answer)
    resp = client.get("/api/studio/notams", params={"at": 1762689600, "lat_min": 41, "lat_max": 43, "lon_min": -89, "lon_max": -87})
    assert resp.status_code == 200 and resp.json() == answer
