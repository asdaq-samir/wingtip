"""/api/airplanes/{n_number} and its /photo: an airplane's public record and
photo, wingtip's parts stubbed."""

from fastapi.testclient import TestClient
from wingtip import aircraft_details, aircraft_photo, registry

from app.main import app

client = TestClient(app)


def test_the_record_by_its_n_number(monkeypatch):
    card = {
        "n_number": "N654FL",
        "registration": None,
        "model": {"code": "7102802", "manufacturer": "Piper", "category": "Land", "cruise_mph": 107},
        "past_registrations": [{"n_number": "N4512R", "cancel_date": "1999-03-01", "same_airframe": True}],
        "ntsb": [
            {"ev_id": "20261023204059", "ntsb_no": "CEN27LA029", "kind": "Accident", "damage": "Substantial", "carol_url": "https://x"}
        ],
        "based": {"field": {"ident": "KMAN", "name": "Nampa Muni"}, "count": 6, "ends": 9},
        "based_pending": False,
        "sources": [{"name": "FAA", "credit": "FAA"}],
    }
    monkeypatch.setattr(aircraft_details, "details", lambda n: card if n == "n654fl" else None)
    got = client.get("/api/airplanes/n654fl")
    assert got.status_code == 200
    body = got.json()
    assert body["model"]["cruise_mph"] == 107 and body["past_registrations"][0]["same_airframe"] is True
    assert body["ntsb"][0]["damage"] == "Substantial" and body["based"]["field"]["ident"] == "KMAN"
    assert client.get("/api/airplanes/G-EUPT").status_code == 422


def test_the_photo_or_null(monkeypatch):
    monkeypatch.setattr(registry, "lookup", lambda n_number: {"mode_s_hex": "a89c1e"})
    photo = {"thumbnail": "https://cdn/t.jpg", "photographer": "A Spotter", "link": "https://www.planespotters.net/photo/1"}
    monkeypatch.setattr(aircraft_photo, "photo", lambda hex_id, reg: photo if hex_id == "a89c1e" and reg == "N654FL" else None)
    assert client.get("/api/airplanes/654FL/photo").json()["photographer"] == "A Spotter"
    monkeypatch.setattr(aircraft_photo, "photo", lambda hex_id, reg: None)
    assert client.get("/api/airplanes/N654FL/photo").json() is None
