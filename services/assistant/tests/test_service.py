"""The service itself: its health answer, its settings, its committed
OpenAPI document (what apps/web/ builds its assistant types from)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.openapi import OPENAPI_PATH, render
from app.settings import get_settings


def test_the_index_answers_with_the_models_and_the_planner():
    body = TestClient(app).get("/").json()
    assert body["service"] == "assistant" and body["models"]["assistant"] == get_settings().assistant_model


def test_the_committed_openapi_document_matches_the_app():
    assert OPENAPI_PATH.read_text() == render(), (
        "a schema or a route changed: run `python -m app.openapi` from services/assistant/ and commit openapi.json"
    )


def test_every_stream_message_union_is_published():
    document = render()
    for name in ("CheckpointNoteMessage", "NarrativeMessage"):
        assert f'"{name}"' in document


@pytest.mark.parametrize("value, on", [("1", True), ("0", False), ("true", False), ("", False)])
def test_the_assistant_fallback_is_on_only_for_one(monkeypatch, value, on):
    monkeypatch.setenv("ASSISTANT_FALLBACKS", value)
    assert get_settings().assistant_fallbacks is on


def test_the_planner_url_loses_its_slash(monkeypatch):
    monkeypatch.setenv("PLANNER_URL", " http://planner:8000/ ")
    assert get_settings().planner_url == "http://planner:8000"
