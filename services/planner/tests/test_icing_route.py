"""GET /api/icing/route through its response model, wingtip.icing_forecast
stubbed: the nav log's fixes, altitudes and times handed on as numbers, the
engine's answer returned as it is, and no icing forecast in the weather
store a 502 the page says in its own section, never "no icing"."""

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


def test_no_forecast_stored_is_a_502(monkeypatch):
    def along(*args):
        raise icing_forecast.IcingForecastUnavailable("down")

    monkeypatch.setattr(icing_forecast, "along", along)
    resp = client.get("/api/icing/route", params=PARAMS)
    assert resp.status_code == 502
    assert "icing on the route could not be checked" in resp.json()["detail"]


def test_legs_and_fixes_that_do_not_agree_are_a_422(monkeypatch):
    resp = client.get("/api/icing/route", params={**PARAMS, "alt_ft": "8000"})
    assert resp.status_code == 422


def test_severe_icing_is_answered_not_a_500(monkeypatch):
    # The NWS grids' top category is "severe" (GRIB2 code table 4.228); the
    # response model kept the AWC's "heavy" and answered 500 for Boston to
    # New York at 14,000 ft (the planner's re-audit, 2026-11-27).
    def along(fixes, altitudes, minutes, ground, start):
        leg = {"index": 0, "altitude_ft": 14000, "severity": "severe", "share": 0.2, "layer": None, "valid_s": 1794195000}
        return {
            "legs": [leg, {**leg, "index": 1, "altitude_ft": 9000, "severity": "moderate"}],
            "worst": {"severity": "severe", "altitudes_ft": [14000], "legs": [0]},
            "unchecked": [],
            "line": "Forecast icing, severe, at 14,000 ft on leg 1",
            "issued": "2026-11-27T18:00:00Z",
        }

    monkeypatch.setattr(icing_forecast, "along", along)
    resp = client.get("/api/icing/route", params=PARAMS)
    assert resp.status_code == 200, resp.text
    assert resp.json()["worst"]["severity"] == "severe"
