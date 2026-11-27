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
        ask = {
            "entries": case["entries"],
            "today": case["today"],
            **{k: case[k] for k in ("flightReviewOn", "medicalExpiresOn", "ipcOn") if k in case},
        }
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
        ask = {
            "held": [{"code": h["code"], "on": h["on"], "makeModel": h.get("make_model")} for h in given["held"]],
            "flightOn": given.get("flight_on"),
            # 61.93(d)(4), (5) and 61.87(n): the flight's make and model, where the case gives one.
            "makeModel": given.get("make_model"),
        }
        answer = client.post("/api/pilot/endorsements", json=ask)
        assert answer.status_code == 200, answer.text
        body, want = answer.json(), case["answer"]
        assert (body["until"], body["soloUntil"], body["checks"]) == (want["until"], want["solo_until"], want["checks"]), case["name"]


def test_inspections_answer_the_shared_fixture():
    camel = {
        "annual_on": "annualOn",
        "elt_on": "eltOn",
        "static_check_on": "staticCheckOn",
        "transponder_check_on": "transponderCheckOn",
        "hundred_hour_at_hours": "hundredHourAtHours",
        "tail_number": "tailNumber",
        "for_hire": "forHire",
        "elt_battery_due_on": "eltBatteryDueOn",
    }
    for case in RECORDS["inspections"]:
        given = case["input"]
        ask = {camel[k]: v for k, v in given.items() if k in camel}
        if given.get("vor_check"):
            v = given["vor_check"]
            ask["vorCheck"] = {"on": v["on"], "kind": v["kind"], "errorDeg": v["error_deg"]}
        ask["kept"] = [
            {
                "id": k["id"],
                "kind": k["kind"],
                "title": k["title"],
                "reference": k["reference"],
                "dueOn": k["due_on"],
                "dueAtHours": k["due_at_hours"],
            }
            for k in given.get("kept", [])
        ]
        answer = client.post("/api/aircraft/inspections", json=ask)
        assert answer.status_code == 200, answer.text
        body, want = answer.json(), case["answer"]
        assert body["annualUntil"] == want["annual_until"] and body["staticCheckUntil"] == want["static_check_until"]
        assert body["hundredHourDueAtHours"] == want["hundred_hour_due_at_hours"]
        vor = want["vor_check"]
        assert body["vorCheck"] == (vor and {"limitDeg": vor["limit_deg"], "within": vor["within"], "until": vor["until"]})
        # The list the gateway shows, each named and cited, passed through as the engine gives it.
        assert body["due"] == want["due"]


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


def test_same_field_reads_each_ident_by_its_nasr_names(monkeypatch):
    """A lesson at BUR's approach finds a flight planned to KBUR, and one at
    PANC a flight to ANC, by NASR's ICAO_ID (FAA JO 7350.9GG 4-1), which no
    K rule finds; a field NASR does not list is named by the ident alone."""
    from wingtip import nasr_fields

    nasr = {
        "BUR": {"faa_id": "BUR", "icao_id": "KBUR"},
        "KBUR": {"faa_id": "BUR", "icao_id": "KBUR"},
        "ANC": {"faa_id": "ANC", "icao_id": "PANC"},
        "PANC": {"faa_id": "ANC", "icao_id": "PANC"},
        "VNY": {"faa_id": "VNY", "icao_id": "KVNY"},
    }
    monkeypatch.setattr(nasr_fields, "of_ident", lambda ident, beside: nasr.get(ident.strip().upper()))
    ask = lambda field, idents: client.post("/api/pilot/same-field", json={"field": field, "idents": idents})  # noqa: E731
    answer = ask("KBUR", ["BUR", "VNY", "kbur", " "])
    assert answer.status_code == 200, answer.text
    assert answer.json() == {"same": [True, False, True, False]}
    assert ask("PANC", ["ANC", "MRI"]).json() == {"same": [True, False]}
    # Neither in NASR: the K form of three letters still meets them.
    assert ask("KXYZ", ["XYZ", "C81"]).json() == {"same": [True, False]}
