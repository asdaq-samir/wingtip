"""POST /api/pilot/coach and its words' sources held to the shared fixture
pilots the engine's own tests read (apps/web/src/lib/fixtures/coach.json):
the fields near home are the fixture's, put in for the FAA files
wingtip.coach would read."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from wingtip import coach

from app.main import app

client = TestClient(app)
PILOTS = json.loads((Path(__file__).parents[3] / "apps/web/src/lib/fixtures/coach.json").read_text())["pilots"]


def _api_ask(ask: dict) -> dict:
    """The fixture's engine input as the app sends it to the planner."""
    return {"today": ask["today"], "entries": ask["entries"], "ratings": ask.get("ratings", []), "held": ask.get("held", []),
            "debriefs": ask.get("debriefs", []), "flightReviewOn": ask.get("flight_review_on"),
            "medicalExpiresOn": ask.get("medical_expires_on"), "home": "HOME"}


@pytest.fixture
def places(monkeypatch):
    given: dict = {}

    def practice_places(home):
        given["home"] = home
        return given["places"]

    monkeypatch.setattr(coach, "practice_places", practice_places)
    return given


@pytest.mark.parametrize("pilot", PILOTS, ids=[p["name"].split(":")[0] for p in PILOTS])
def test_the_plan_is_the_fixtures(places, pilot):
    places["places"] = pilot["ask"].get("places", [])
    answer = client.post("/api/pilot/coach", json=_api_ask(pilot["ask"]))
    assert answer.status_code == 200, answer.text
    plan, want = answer.json(), pilot["expected"]
    assert places["home"] == "HOME"
    due = {d["key"]: [d["status"], d["until"]] for d in plan["due"]}
    assert due == want["due"]
    assert [r["key"] for r in plan["reminders"]] == want["reminders"]
    assert {w["key"]: len(w["evidence"]) for w in plan["weak_areas"]} == want["weak_areas"]
    assert [[s["key"], (s["place"] or {}).get("ident")] for s in plan["sessions"]] == want["sessions"]


def test_the_sources_say_the_plan_with_ids_its_sessions_cite(places):
    avery = PILOTS[0]
    places["places"] = avery["ask"]["places"]
    plan = client.post("/api/pilot/coach", json=_api_ask(avery["ask"])).json()
    sources = client.post("/api/words/coach/sources", json=plan)
    assert sources.status_code == 200, sources.text
    lines = {s["id"]: s["text"] for s in sources.json()["sources"]}
    # Only what is not current is said of the currencies.
    assert "due:night_passengers" in lines and "due:day_passengers" not in lines
    assert lines["due:night_passengers"].startswith("Passengers at night: lapses soon, until 2026-11-18 (14 CFR 61.57(b)).")
    assert lines["ev:1"].startswith("2026-10-25 at KMSN: ")
    assert "At KMSN (Dane County Rgnl/Truax Fld, 7.6 nm from home), the ILS OR LOC RWY 36." in lines["session:3"]
    assert "May count toward a WINGS flight activity" in lines["session:3"]
    for s in plan["sessions"]:
        assert all(why in lines for why in s["why"]), s


def test_a_bad_debrief_is_a_422(places):
    places["places"] = []
    bad = {"today": "2026-11-09", "entries": [], "debriefs": [{"kind": "loop", "flown_on": "2026-11-01"}]}
    assert client.post("/api/pilot/coach", json=bad).status_code == 422


def test_practice_places_are_the_lighted_fields_and_approaches_near_home(monkeypatch):
    monkeypatch.setattr(coach.airports, "find_place", lambda ident: {"ident": ident, "lat": 43.1, "lon": -89.5})
    monkeypatch.setattr(coach.airports, "nearest", lambda lat, lon, limit: [
        {"ident": "C29", "source_ident": "C29", "name": "Morey", "distance_nm": 0.0},
        {"ident": "KMSN", "source_ident": "KMSN", "name": "Truax", "distance_nm": 7.6},
        {"ident": "KFAR", "source_ident": "KFAR", "name": "Far", "distance_nm": 41.0},
    ])
    runways = {"C29": [{"lighted": False, "closed": False}], "KMSN": [{"lighted": True, "closed": False}]}
    monkeypatch.setattr(coach.airports, "get_runways", lambda ident: runways.get(ident, []))
    procs = {"KMSN": {"procedures": [{"kind": "approach", "name": "ILS OR LOC RWY 36"}, {"kind": "approach", "name": "RNAV (GPS) RWY 18"},
                                     {"kind": "departure", "name": "MADISON SIX"}]}}
    monkeypatch.setattr(coach.procedures, "procedures_at", lambda ident: procs.get(ident))
    found = coach.practice_places("C29")
    # KFAR is past the 40 nm a practice field is looked for in.
    assert [f["ident"] for f in found] == ["C29", "KMSN"]
    assert [f["lighted"] for f in found] == [False, True]
    assert found[1]["approaches"] == [{"name": "ILS OR LOC RWY 36", "precision": True}, {"name": "RNAV (GPS) RWY 18", "precision": False}]
    assert coach.practice_places(None) == []
