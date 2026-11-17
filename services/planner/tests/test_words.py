"""What changed in a briefing as lines a sentence can cite (app.words_changes,
POST /api/words/changes/sources), and none to send where nothing changed."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
METAR_C81 = "KC81 061353Z AUTO 27008KT 10SM CLR 15/07 A2992"
METAR_KDLH = "KDLH 061353Z 09012KT 2SM BR OVC008 08/07 A2988"


def briefing(**over) -> dict:
    return {
        "hazards": [],
        "weather_unavailable": [],
        "airports": {},
        "metars": {"C81": {"raw": METAR_C81, "flight_category": "VFR", "visibility_sm": 10, "wind_speed_kt": 8}, "KDLH": None},
        "forecast": {
            "min_ceiling_ft": 3500,
            "min_visibility_sm": 6,
            "stations": [
                {
                    "icaoId": "KDLH",
                    "ceiling_ft": 3500,
                    "visibility_sm": 6,
                    "along_track_nm": 300.0,
                    "eta": "2026-10-06T16:30:00Z",
                    "eta_ceiling_ft": 3500,
                    "eta_visibility_sm": 6,
                    "raw": "KDLH 061130Z 0612/0712 09010KT P6SM BKN035",
                }
            ],
        },
        **over,
    }


def test_the_changes_sources_are_none_when_nothing_changed_and_the_flight_first_when_something_did():
    body = {"dep": "C81", "dest": "KDLH", "then": briefing(), "now": briefing()}
    assert client.post("/api/words/changes/sources", json=body).json()["sources"] == []

    body["now"] = briefing(metars={"C81": {"raw": METAR_KDLH, "flight_category": "IFR"}, "KDLH": None})
    found = client.post("/api/words/changes/sources", json=body).json()["sources"]
    assert [s["id"] for s in found] == ["flight:route", "metar:C81"]
