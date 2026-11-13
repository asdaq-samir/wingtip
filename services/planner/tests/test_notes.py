"""/api/checkpoint-notes: a route's checkpoints with the note kept for
each; a pilot's own edit is what that pilot sees while everyone else
keeps the shared note."""

from fastapi.testclient import TestClient
from wingtip import checkpoint_notes

from app.main import app
from app.routers import notes

client = TestClient(app)

CHECKPOINT = {"lat": 45.0, "lon": -90.0, "id": "water@45.00000,-90.00000", "name": "Lake Mary", "category": "water", "along_track_nm": 12.0}


def _setup(monkeypatch, tmp_path):
    path = tmp_path / "notes.csv"
    monkeypatch.setattr(checkpoint_notes, "NOTES_PATH", path)
    monkeypatch.setattr(notes, "route_checkpoints", lambda r: ([CHECKPOINT], [CHECKPOINT], [[CHECKPOINT]]))


def _route_notes(headers=None) -> list[dict]:
    resp = client.post("/api/checkpoint-notes/route", json={"departure_ident": "C81", "destination_ident": "KDLH"}, headers=headers or {})
    assert resp.status_code == 200, resp.text
    assert resp.json()["departure_ident"] == "C81"
    return resp.json()["checkpoints"]


def test_a_checkpoint_without_a_note_is_listed_with_its_hop(monkeypatch, tmp_path):
    _setup(monkeypatch, tmp_path)

    assert _route_notes() == [{**CHECKPOINT, "hop_key": checkpoint_notes.route_key("C81", "KDLH"), "saved": None}]


def test_a_pilots_edit_is_theirs(monkeypatch, tmp_path):
    _setup(monkeypatch, tmp_path)
    checkpoint_notes.save_note(checkpoint_notes.route_key("C81", "KDLH"), 45.0, -90.0, "Shared: the lake south of the highway")
    resp = client.post(
        "/api/checkpoint-notes",
        headers={"X-Pilot-Id": "42"},
        json={"departure_ident": "C81", "destination_ident": "KDLH", "lat": 45.0, "lon": -90.0, "description": "Mine: look for the island"},
    )
    assert resp.status_code == 200

    assert _route_notes({"X-Pilot-Id": "42"})[0]["saved"] == "Mine: look for the island"
    assert _route_notes({"X-Pilot-Id": "7"})[0]["saved"] == "Shared: the lake south of the highway"


def test_a_deleted_account_takes_its_own_notes_and_only_those(monkeypatch, tmp_path):
    path = tmp_path / "notes.csv"
    monkeypatch.setattr(checkpoint_notes, "NOTES_PATH", path)
    checkpoint_notes.save_note("C81->KDLH", 45.0, -90.0, "Shared", path=path)
    checkpoint_notes.save_note("C81->KDLH", 45.0, -90.0, "Mine", pilot="42", path=path)

    resp = client.delete("/api/checkpoint-notes/mine", headers={"X-Pilot-Id": "42"})
    assert resp.status_code == 200 and resp.json() == {"removed": 1}
    assert [n["description"] for n in checkpoint_notes.load_notes(path=path)] == ["Shared"]
    # Nobody named: refused, rather than read as the shared notes' empty pilot.
    assert client.delete("/api/checkpoint-notes/mine").status_code == 422


def test_a_pilots_own_notes_are_theirs_to_export_and_nobody_elses(monkeypatch, tmp_path):
    path = tmp_path / "notes.csv"
    monkeypatch.setattr(checkpoint_notes, "NOTES_PATH", path)
    checkpoint_notes.save_note("C81->KDLH", 45.0, -90.0, "Shared", path=path)
    checkpoint_notes.save_note("C81->KDLH", 45.0, -90.0, "Mine", pilot="42", path=path)
    checkpoint_notes.save_note("C81->KDLH", 45.0, -90.0, "Theirs", pilot="7", path=path)

    resp = client.get("/api/checkpoint-notes/mine", headers={"X-Pilot-Id": "42"})
    assert resp.status_code == 200
    assert [n["description"] for n in resp.json()["notes"]] == ["Mine"]
    assert client.get("/api/checkpoint-notes/mine").status_code == 422


def test_a_note_longer_than_500_characters_is_refused(monkeypatch, tmp_path):
    _setup(monkeypatch, tmp_path)
    long = "x" * 501
    assert (
        client.post(
            "/api/checkpoint-notes",
            json={"departure_ident": "C81", "destination_ident": "KDLH", "lat": 45.0, "lon": -90.0, "description": long},
        ).status_code
        == 422
    )
