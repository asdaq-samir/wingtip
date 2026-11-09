"""/api/checkpoint-notes/generate (app.notes): a POST, a line a
checkpoint, the planner's own notes kept, each written note seeded at the
planner, a failure for every checkpoint said once -- Claude and the
planner stood in for."""

import json
from types import SimpleNamespace

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from app import notes
from app.generated.planner_models import NoteToWrite
from app.main import app
from app.generated.planner_client import PlannerError

client = TestClient(app)

CHECKPOINT = {
    "lat": 45.0,
    "lon": -90.0,
    "id": "water@45.00000,-90.00000",
    "name": "Lake Mary",
    "category": "water",
    "along_track_nm": 12.0,
    "hop_key": "C81->KDLH",
    "saved": None,
}
SECOND = {**CHECKPOINT, "lat": 46.0, "id": "town@46", "name": "Ashland", "category": "town", "along_track_nm": 200.0}


def _generate(headers=None) -> list[dict]:
    resp = client.post(
        "/api/checkpoint-notes/generate", json={"departure_ident": "C81", "destination_ident": "KDLH"}, headers=headers or {}
    )
    assert resp.status_code == 200, resp.text
    return [json.loads(line) for line in resp.text.splitlines() if line]


def test_generation_is_not_reachable_with_a_get():
    assert client.get("/api/checkpoint-notes/generate").status_code == 405


def test_a_saved_note_is_kept_and_a_missing_one_written_and_seeded(monkeypatch, fake_planner):
    fake_planner.answer(
        "/api/checkpoint-notes/pending", {"departure_ident": "C81", "checkpoints": [{**CHECKPOINT, "saved": "Mine: the island"}, SECOND]}
    )
    fake_planner.answer("/api/checkpoint-notes/seed", lambda body: {"description": body["description"], "written": True})
    asked = []
    monkeypatch.setattr(notes, "_describe_checkpoint", lambda cp, dep, prev, nxt: asked.append((cp.name, dep, prev, nxt)) or "Generated")

    lines = _generate({"X-Pilot-Id": "42"})

    assert [(m["type"], m.get("source")) for m in lines] == [
        ("start", None),
        ("checkpoint", "saved"),
        ("checkpoint", "generated"),
        ("done", None),
    ]
    assert lines[1]["description"] == "Mine: the island" and lines[2]["description"] == "Generated"
    assert asked == [("Ashland", "C81", "Lake Mary", None)]
    # The pilot is named to the planner, whose notes they see first.
    assert fake_planner.calls[0][3] == {"X-Pilot-Id": "42"}
    assert fake_planner.calls[1][2] == {"hop_key": "C81->KDLH", "lat": 46.0, "lon": -90.0, "description": "Generated"}


def test_a_shared_note_saved_meanwhile_stays(monkeypatch, fake_planner):
    fake_planner.answer("/api/checkpoint-notes/pending", {"departure_ident": "C81", "checkpoints": [CHECKPOINT]})
    fake_planner.answer("/api/checkpoint-notes/seed", {"description": "Edited: the island", "written": False})
    monkeypatch.setattr(notes, "_describe_checkpoint", lambda *args: "Generated")
    checkpoint = _generate()[1]
    assert (checkpoint["source"], checkpoint["description"]) == ("saved", "Edited: the island")


def test_a_refused_key_is_said_once_and_every_checkpoint_still_gets_a_row(monkeypatch, fake_planner):
    fake_planner.answer("/api/checkpoint-notes/pending", {"departure_ident": "C81", "checkpoints": [CHECKPOINT, SECOND]})
    calls = []

    def refused(*args):
        calls.append(1)
        raise anthropic.AuthenticationError(
            "invalid x-api-key", body=None, response=httpx.Response(401, request=httpx.Request("POST", "https://api.anthropic.com"))
        )

    monkeypatch.setattr(notes, "_describe_checkpoint", refused)
    lines = _generate()
    assert [m["type"] for m in lines] == ["start", "error", "checkpoint", "checkpoint", "done"]
    assert [m["source"] for m in lines if m["type"] == "checkpoint"] == ["error", "error"]
    assert len(calls) == 1


def test_an_ident_the_planner_does_not_know_is_its_404(fake_planner):
    fake_planner.answer("/api/checkpoint-notes/pending", PlannerError(404, "No US airport goes by 'ZZZZ'."))
    resp = client.post("/api/checkpoint-notes/generate", json={"departure_ident": "ZZZZ", "destination_ident": "KDLH"})
    assert resp.status_code == 404 and resp.json()["detail"] == "No US airport goes by 'ZZZZ'."


def _claude_replies(monkeypatch, blocks, stop_reason):
    """notes' own Claude call, answered with these blocks and stop reason."""
    messages = SimpleNamespace(create=lambda **kw: SimpleNamespace(content=blocks, stop_reason=stop_reason))
    monkeypatch.setattr(notes.anthropic, "Anthropic", lambda: SimpleNamespace(messages=messages))


def test_a_note_is_the_text_block_after_the_thinking(monkeypatch):
    _claude_replies(
        monkeypatch,
        [SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=" Look for the lake south of the highway. ")],
        "end_turn",
    )
    assert notes._describe_checkpoint(NoteToWrite(**CHECKPOINT), "C81", None, None) == "Look for the lake south of the highway."


def test_a_note_cut_off_at_the_cap_is_refused_rather_than_saved(monkeypatch):
    """The note is saved as the one every pilot sees: half a sentence is
    worse than the row's own "no note" and a pilot's edit."""
    _claude_replies(monkeypatch, [SimpleNamespace(type="text", text="Look for the lake south of")], "max_tokens")
    with pytest.raises(RuntimeError, match="max_tokens"):
        notes._describe_checkpoint(NoteToWrite(**CHECKPOINT), "C81", None, None)
