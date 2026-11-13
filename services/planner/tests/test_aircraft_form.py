"""POST /api/aircraft/problems (app.routers.aircraft_form): the gateway's
check of an airplane before a save, the engine's aircraft_problems held to
the shared fixture the apps' forms are (apps/web/src/lib/fixtures/
aircraftForm.json), and the gateway's numbers read as typed text."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURE = Path(__file__).resolve().parents[3] / "apps" / "web" / "src" / "lib" / "fixtures" / "aircraftForm.json"


def test_each_case_of_the_shared_fixture_is_refused_on_the_fields_it_names():
    for case in json.loads(FIXTURE.read_text())["cases"]:
        resp = client.post("/api/aircraft/problems", json=case["form"])
        assert resp.status_code == 200
        assert resp.json() == case["problems"], case["form"]


def test_the_gateways_numbers_and_nulls_are_read_as_the_form_types_them():
    sent = {"tailNumber": "N1", "typeDesignator": "C172", "cruiseTasKt": 110.0, "fuelBurnGph": 8.5, "cruisePowerPct": None}
    assert client.post("/api/aircraft/problems", json=sent).json() == {}
    # A power no cruise table has (40 to 100%, form.rs's POWER_PCT).
    sent["cruisePowerPct"] = 30.0
    assert list(client.post("/api/aircraft/problems", json=sent).json()) == ["cruisePowerPct"]
