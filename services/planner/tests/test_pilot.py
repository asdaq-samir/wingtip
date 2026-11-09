"""POST /api/pilot/currency, /api/pilot/experience, /api/pilot/endorsements
and /api/aircraft/inspections held to the shared fixtures
(apps/web/src/lib/fixtures/currency.json, records.json) the engine's own
tests read: 14 CFR 61.56, 61.57 and 61.109(a) from a logbook, 61.87 and
61.93(d) from the endorsements, and 91.171, 91.207, 91.409, 91.411 and
91.413 from an airplane's records, as the gateway asks for them."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURE = json.loads((Path(__file__).parents[3] / "apps/web/src/lib/fixtures/currency.json").read_text())
RECORDS = json.loads((Path(__file__).parents[3] / "apps/web/src/lib/fixtures/records.json").read_text())


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


def test_endorsements_answer_the_shared_fixture():
    for case in RECORDS["endorsements"]:
        given = case["input"]
        ask = {"held": [{"code": h["code"], "on": h["on"], "makeModel": h.get("make_model")} for h in given["held"]],
               "flightOn": given.get("flight_on")}
        answer = client.post("/api/pilot/endorsements", json=ask)
        assert answer.status_code == 200, answer.text
        body, want = answer.json(), case["answer"]
        assert (body["until"], body["soloUntil"], body["checks"]) == (want["until"], want["solo_until"], want["checks"]), case["name"]


def test_inspections_answer_the_shared_fixture():
    camel = {"annual_on": "annualOn", "elt_on": "eltOn", "static_check_on": "staticCheckOn",
             "transponder_check_on": "transponderCheckOn", "hundred_hour_at_hours": "hundredHourAtHours"}
    for case in RECORDS["inspections"]:
        given = case["input"]
        ask = {camel[k]: v for k, v in given.items() if k in camel}
        if given.get("vor_check"):
            v = given["vor_check"]
            ask["vorCheck"] = {"on": v["on"], "kind": v["kind"], "errorDeg": v["error_deg"]}
        answer = client.post("/api/aircraft/inspections", json=ask)
        assert answer.status_code == 200, answer.text
        body, want = answer.json(), case["answer"]
        assert body["annualUntil"] == want["annual_until"] and body["staticCheckUntil"] == want["static_check_until"]
        assert body["hundredHourDueAtHours"] == want["hundred_hour_due_at_hours"]
        assert body["vorCheck"] == {"limitDeg": want["vor_check"]["limit_deg"], "within": want["vor_check"]["within"],
                                    "until": want["vor_check"]["until"]}


def test_endorsement_fill_answers_the_shared_fixture():
    for case in RECORDS["fills"]:
        given = case["input"]
        answer = client.post("/api/pilot/endorsement-fill", json={k: given[k] for k in ("code", "student", "fields") if k in given})
        if case["answer"] is None:
            assert answer.status_code == 404, case["name"]
            continue
        assert answer.status_code == 200, answer.text
        assert answer.json() == case["answer"], case["name"]


def test_the_endorsement_kinds_are_ac_61_65ks():
    kinds = client.get("/api/pilot/endorsement-kinds").json()
    assert [k["code"] for k in kinds][:3] == ["pre-solo-knowledge", "pre-solo-flight", "solo-first"]
    assert {k["paragraph"] for k in kinds} >= {"A.1", "A.10", "A.37"}
