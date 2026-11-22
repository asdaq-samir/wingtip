"""POST /api/pilot/instructor-verification, the gateway's ask before an
instructor signs (the deep security review of 2026-11-21, N1): the
registry's flight instructors of the name read from ingest's store
(wingtip.airmen, stubbed here), the verdict the engine's
instructor_verification, held to the shared fixture
apps/web/src/lib/fixtures/instructorVerification.json."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from wingtip import airmen

from app.main import app

client = TestClient(app)
CASES = json.loads((Path(__file__).parents[3] / "apps/web/src/lib/fixtures/instructorVerification.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_the_verdict_is_the_engines_over_the_registrys_instructors(case, monkeypatch):
    given = case["input"]
    monkeypatch.setattr(airmen, "instructors_named", lambda name: given["registry"])
    got = client.post(
        "/api/pilot/instructor-verification",
        json={k: given[k] for k in ("instructor_name", "student_name", "signed_on", "bound_elsewhere")},
    )
    assert got.status_code == 200
    body = got.json()
    assert (body["verified"], body["reason"], body["registry_id"]) == (case["verified"], case["reason"], case["registry_id"])
    assert body["words"].startswith("Verified" if case["verified"] else "Not verified")
