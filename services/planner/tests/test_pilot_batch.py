"""POST /api/pilot/records-batch and /api/aircraft/inspections-batch, the
gateway's one call for an instructor's page and for an aircraft list: each
answer in a batch is the one the single ask gives, in the order asked, so
the batch holds to the same shared fixtures (apps/web/src/lib/fixtures)
test_pilot.py reads."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURES = Path(__file__).parents[3] / "apps/web/src/lib/fixtures"
CURRENCY = json.loads((FIXTURES / "currency.json").read_text())
RECORDS = json.loads((FIXTURES / "records.json").read_text())


def _endorsements_ask(case):
    given = case["input"]
    return {
        "held": [{"code": h["code"], "on": h["on"], "makeModel": h.get("make_model")} for h in given["held"]],
        "flightOn": given.get("flight_on"),
    }


def test_a_records_batch_answers_each_ask_as_the_single_one_does():
    experience = [{"entries": c["entries"], "today": c["today"]} for c in CURRENCY["experience"]]
    endorsements = [_endorsements_ask(c) for c in RECORDS["endorsements"]]
    answer = client.post("/api/pilot/records-batch", json={"experience": experience, "endorsements": endorsements})
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert len(body["experience"]) == len(experience) and len(body["endorsements"]) == len(endorsements)
    for ask, got in zip(experience, body["experience"], strict=True):
        assert got == client.post("/api/pilot/experience", json=ask).json()
    for ask, got in zip(endorsements, body["endorsements"], strict=True):
        assert got == client.post("/api/pilot/endorsements", json=ask).json()


def test_an_empty_records_batch_is_empty():
    answer = client.post("/api/pilot/records-batch", json={})
    assert answer.status_code == 200, answer.text
    assert answer.json() == {"experience": [], "endorsements": []}


def test_a_records_batch_with_a_day_that_is_none_is_refused():
    bad = {"experience": [{"entries": [{"flownOn": "2026-02-30"}], "today": "2026-10-11"}]}
    assert client.post("/api/pilot/records-batch", json=bad).status_code == 422


def test_an_inspections_batch_answers_each_airplane_in_order():
    asks = [
        {"annualOn": "2026-03-14"},
        {},
        {"annualOn": "2025-11-02", "hundredHourAtHours": 1234.5, "vorCheck": {"on": "2026-10-01", "kind": "VOT", "errorDeg": 2}},
    ]
    answer = client.post("/api/aircraft/inspections-batch", json=asks)
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert len(body) == len(asks)
    for ask, got in zip(asks, body, strict=True):
        assert got == client.post("/api/aircraft/inspections", json=ask).json()
    assert body[1]["annualUntil"] is None
    assert client.post("/api/aircraft/inspections-batch", json=[]).json() == []


def test_a_batch_longer_than_its_bound_is_refused_before_any_engine_call():
    """The deep security review of 2026-11-21: a batch of any length held a
    worker through one engine call an ask. MAX_BATCH (500) is well above an
    instructor's students or an owner's airplanes; one more is a 422."""
    from app.schemas.pilot import MAX_BATCH

    too_many = [{}] * (MAX_BATCH + 1)
    assert client.post("/api/aircraft/inspections-batch", json=too_many).status_code == 422
    asks = [{"held": [], "flightOn": None}] * (MAX_BATCH + 1)
    assert client.post("/api/pilot/records-batch", json={"endorsements": asks}).status_code == 422
    assert client.post("/api/aircraft/inspections-batch", json=[{}] * MAX_BATCH).status_code == 200
