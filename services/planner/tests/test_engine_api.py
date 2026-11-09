"""POST /api/engine/{name} (app.routers.engine): the engine's rules the
contract tags "x-tool": true, asked by name for the assistant's tools
(issue #569), and "x-assistant": true, its own checks (a photographed
page's figures), and no other rule; internal, so the gateway never
forwards it."""

import json
from pathlib import Path
from typing import get_args

from fastapi.testclient import TestClient

from app.generated.engine_tools import EngineToolName
from app.main import app

client = TestClient(app)
CONTRACT = Path(__file__).resolve().parents[3] / "engine" / "contract" / "engine.schema.json"


def test_the_allow_list_is_the_contracts_tagged_rules():
    contract = json.loads(CONTRACT.read_text())
    assert list(get_args(EngineToolName)) == [n for n, e in contract["properties"].items() if e.get("x-tool") or e.get("x-assistant")]


def test_the_assistants_own_check_is_asked_by_name():
    # A logbook row whose night is longer than the flight (14 CFR 61.51(b)).
    row = {"date": "2026-10-03", "aircraft_id": "N12345", "from": "KANE", "to": "KSTC", "total": 1.2, "night": 1.5, "day_landings": 1}
    resp = client.post("/api/engine/logbook_read_check", json={"rows": [row], "today": "2026-11-09"})
    assert resp.status_code == 200
    flags = resp.json()["rows"][0]["flags"]
    assert any(f["field"] == "nightHours" and f["level"] == "wrong" for f in flags)


def test_a_tagged_rule_answers_as_the_engine_does():
    # 14 CFR 91.159(a): eastbound, odd thousands plus 500 at or above the floor.
    resp = client.post("/api/engine/lowest_vfr_cruising_altitude", json={"floor_ft": 3200, "magnetic_course_deg": 95})
    assert resp.status_code == 200 and resp.json() == 3500
    # Westbound, even thousands plus 500.
    resp = client.post("/api/engine/lowest_vfr_cruising_altitude", json={"floor_ft": 3200, "magnetic_course_deg": 275})
    assert resp.json() == 4500


def test_a_rule_not_tagged_is_not_asked():
    resp = client.post("/api/engine/checkpoints_select", json={})
    assert resp.status_code == 422


def test_an_input_not_of_the_rules_shape_is_the_engines_words():
    resp = client.post("/api/engine/lowest_vfr_cruising_altitude", json={"floor_ft": "high"})
    assert resp.status_code == 422 and resp.json()["detail"]


def test_it_is_internal_to_the_stack():
    op = app.openapi()["paths"]["/api/engine/{name}"]["post"]
    assert "x-gateway" not in op and op["x-internal"] == "assistant"
