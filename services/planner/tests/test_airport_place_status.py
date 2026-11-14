"""An airport's card carries NASR's ARPT_STATUS as sent, for the hosts'
Go / No-Go to ask the engine's field_status of (decision 0043): "closed
indefinitely", not a bare "closed"."""

from fastapi.testclient import TestClient

from app.main import app

from .test_airports import DULUTH, stub_place

client = TestClient(app)


def test_a_closed_fields_card_carries_its_code_beside_its_label(monkeypatch):
    stub_place(monkeypatch, place={**DULUTH, "status": "CI", "closed": "Closed indefinitely"})
    body = client.get("/api/airport/KDLH").json()
    assert (body["status"], body["closed"]) == ("CI", "Closed indefinitely")


def test_a_field_nasr_has_no_record_of_has_no_code(monkeypatch):
    stub_place(monkeypatch)
    assert client.get("/api/airport/KDLH").json()["status"] is None
