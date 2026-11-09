"""GET /api/icing/route through its response model, wingtip.icing_forecast
stubbed: the nav log's fixes, altitudes and times handed on as numbers, the
engine's answer returned as it is, and the AWC down a 502 the page says
in its own section, never "no icing"."""

from fastapi.testclient import TestClient
from wingtip import icing_forecast

from app.main import app

client = TestClient(app)
PARAMS = {
    "fixes": "41.9,-87.9;42.5,-89.0;43.1,-90.0",
    "alt_ft": "8000,9000",
    "leg_min": "60,60",
    "ground_min": "30,0",
    "depart": "2026-11-08T14:20:00Z",
}


def test_the_legs_are_handed_on_and_the_answer_returned(monkeypatch):
    asked = {}

    def along(fixes, altitudes, minutes, ground, start):
        asked.update(fixes=fixes, altitudes=altitudes, minutes=minutes, ground=ground, start=start)
        return {
            "legs": [
                {
                    "index": 0,
                    "altitude_ft": 8000,
                    "severity": "light",
                    "share": 0.4,
                    "layer": {"bottom_ft": 5000, "top_ft": 9000},
                    "valid_s": 1794195000,
                },
                {"index": 1, "altitude_ft": 9000, "severity": None, "share": None, "layer": None, "valid_s": None},
            ],
            "worst": {"severity": "light", "altitudes_ft": [8000], "legs": [0]},
            "unchecked": [1],
            "line": "Forecast icing, light, at 8,000 ft on leg 1",
            "issued": "2026-11-08T14:00:00Z",
        }

    monkeypatch.setattr(icing_forecast, "along", along)
    resp = client.get("/api/icing/route", params=PARAMS)
    assert resp.status_code == 200, resp.text
    assert asked["fixes"] == [(41.9, -87.9), (42.5, -89.0), (43.1, -90.0)]
    assert asked["altitudes"] == [8000, 9000] and asked["ground"] == [30, 0]
    assert asked["start"] == 1794147600
    body = resp.json()
    assert body["worst"]["severity"] == "light" and body["unchecked"] == [1]
    assert body["legs"][1]["severity"] is None


def test_the_awc_down_is_a_502(monkeypatch):
    def along(*args):
        raise icing_forecast.IcingForecastUnavailable("down")

    monkeypatch.setattr(icing_forecast, "along", along)
    resp = client.get("/api/icing/route", params=PARAMS)
    assert resp.status_code == 502
    assert "forecast icing could not be checked" in resp.json()["detail"]


def test_legs_and_fixes_that_do_not_agree_are_a_422(monkeypatch):
    resp = client.get("/api/icing/route", params={**PARAMS, "alt_ft": "8000"})
    assert resp.status_code == 422
