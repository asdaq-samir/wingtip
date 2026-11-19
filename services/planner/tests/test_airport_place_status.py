"""An airport's card carries NASR's ARPT_STATUS as sent, for the hosts'
Go / No-Go to ask the engine's field_status of (decision 0043): "closed
indefinitely", not a bare "closed"; and what kind of field it is where it is not an airport
("Heliport", "Seaplane base")."""

from fastapi.testclient import TestClient

from app.main import app
from app.routers import airport_card

from .airport_world import DULUTH, stub_place

client = TestClient(app)


def test_a_closed_fields_card_carries_its_code_beside_its_label(monkeypatch):
    stub_place(monkeypatch, place={**DULUTH, "status": "CI", "closed": "Closed indefinitely"})
    body = client.get("/api/airport/KDLH").json()
    assert (body["status"], body["closed"]) == ("CI", "Closed indefinitely")


def test_a_field_nasr_has_no_record_of_has_no_code(monkeypatch):
    stub_place(monkeypatch)
    assert client.get("/api/airport/KDLH").json()["status"] is None


def test_a_heliports_and_a_seaplane_bases_card_says_what_kind_of_field_it_is(monkeypatch):
    # NASR's record (wingtip.field_use) carries the engine's words for
    # SITE_TYPE_CODE H and C; an airport's has none.
    stub_place(monkeypatch)
    for words in ("Heliport", "Seaplane base", None):
        monkeypatch.setattr(airport_card.field_use, "record_of", lambda ident, words=words: {"site_type": words})
        assert client.get("/api/airport/KDLH").json()["site_type"] == words
