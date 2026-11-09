"""POST /api/logbook-draft held to the shared fixture the engine's own
tests read (apps/web/src/lib/fixtures/logbookTrack.json): a C81 to KDLH
flight with a hold at CHERL, a touch-and-go after civil dusk and a night
full stop off two ILS RWY 27s. The fields and the CIFP drawings round
the track are the fixture's, put in for the FAA files this would fetch."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from wingtip import logbook_draft

from app.main import app

client = TestClient(app)
TRACK = json.loads((Path(__file__).parents[3] / "apps/web/src/lib/fixtures/logbookTrack.json").read_text())


@pytest.fixture
def the_fixtures_fields(monkeypatch):
    asked: dict = {}

    def fields_near(places, within_nm):
        asked["places"] = places
        asked["within_nm"] = within_nm
        return TRACK["fields"]

    def drawings(idents, on):
        asked["idents"] = idents
        return TRACK["drawings"]

    monkeypatch.setattr(logbook_draft, "_fields_near", fields_near)
    monkeypatch.setattr(logbook_draft, "_approach_drawings", drawings)
    return asked


def test_the_draft_logs_the_flight_as_flown(the_fixtures_fields):
    answer = client.post("/api/logbook-draft", json={
        "points": TRACK["points"], "aircraft": "N3429J", "aircraftType": "C150", "utcOffsetMin": -360, "picked": "I27"})
    assert answer.status_code == 200, answer.text
    d = answer.json()
    e = d["entry"]
    assert (e["flownOn"], e["route"], e["totalHours"]) == ("2026-11-09", "C81 KDLH", 4.0)
    assert (e["dayLandings"], e["nightLandings"]) == (1, 1)
    assert e["crossCountryHours"] == e["totalHours"]
    assert [a["name"] for a in d["approaches"]] == ["ILS RWY 27", "ILS RWY 27"]
    assert d["instrument"] == {"approaches": 2, "holding": True, "tracking": True}
    assert d["holds"][0]["fix"] == "CHERL" and "from" in d["holds"][0]
    # The fields were looked for where the engine said, as far as it said.
    assert the_fixtures_fields["within_nm"] == 2.5
    assert {p["kind"] for p in the_fixtures_fields["places"]} >= {"takeoff", "landing"}


def test_a_track_of_one_point_is_refused():
    answer = client.post("/api/logbook-draft", json={"points": [{"t": 0, "lat": 42, "lon": -88}]})
    assert answer.status_code == 422


def test_the_gateway_forwards_it_to_a_signed_in_pilot():
    spec = app.openapi()["paths"]["/api/logbook-draft"]["post"]["x-gateway"]
    assert spec == {"access": "signed-in", "csrf": False}
