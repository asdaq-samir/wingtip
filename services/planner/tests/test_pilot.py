"""POST /api/pilot/currency and /api/pilot/experience held to the shared
fixture (apps/web/src/lib/fixtures/currency.json) the engine's own test
reads: 14 CFR 61.56, 61.57 and 61.109(a) from a logbook, as the gateway
asks for them."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURE = json.loads((Path(__file__).parents[3] / "apps/web/src/lib/fixtures/currency.json").read_text())


def test_currency_answers_the_shared_fixture():
    for case in FIXTURE["currency"]:
        ask = {"entries": case["entries"], "today": case["today"],
               **{k: case[k] for k in ("flightReviewOn", "medicalExpiresOn", "ipcOn") if k in case}}
        answer = client.post("/api/pilot/currency", json=ask)
        assert answer.status_code == 200, answer.text
        body = answer.json()
        for key, want in case["expected"].items():
            assert body[key] == want, (case["name"], key)


def test_experience_answers_the_shared_fixture():
    for case in FIXTURE["experience"]:
        answer = client.post("/api/pilot/experience", json={"entries": case["entries"], "today": case["today"]})
        assert answer.status_code == 200, answer.text
        items = {i["key"]: i for i in answer.json()}
        assert len(items) == 12
        for key, (have, met) in case["expected"].items():
            assert (items[key]["have"], items[key]["met"]) == (have, met), (case["name"], key)


def test_a_day_that_is_none_is_refused():
    answer = client.post("/api/pilot/currency", json={"entries": [{"flownOn": "2026-02-30"}], "today": "2026-10-11"})
    assert answer.status_code == 422
