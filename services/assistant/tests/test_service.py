"""The service itself: its health answer, its settings, its committed
OpenAPI document (what apps/web/ builds its assistant types from), and
the planner client's reading of the planner's refusals."""
import pytest
import requests
from fastapi.testclient import TestClient

from app import planner
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


class _Response:
    def __init__(self, status, body):
        self.status_code, self._body = status, body

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


def test_the_planners_refusal_comes_back_in_its_own_words(monkeypatch):
    # The real client (planner.get and post are the tests' stand-ins,
    # conftest), over a stand-in for requests.
    asked = {}

    def request(method, url, params=None, json=None, headers=None, timeout=None):
        asked.update(method=method, url=url, params=params)
        return _Response(404, {"detail": "No US airport goes by 'ZZZZ'."})

    monkeypatch.setattr(planner.requests, "request", request)
    with pytest.raises(planner.PlannerError) as err:
        planner._call("GET", "/api/airport/ZZZZ", params={"depart": None, "stops": ""})
    assert (err.value.status, err.value.detail) == (404, "No US airport goes by 'ZZZZ'.")
    # What is not given is left out of the query, as the planner reads an absent field.
    assert asked["params"] == {} and asked["url"].endswith("/api/airport/ZZZZ")

    monkeypatch.setattr(planner.requests, "request", lambda *a, **k: _Response(422, {"detail": [
        {"loc": ["query", "dep"], "msg": "Field required"}]}))
    with pytest.raises(planner.PlannerError, match="dep: Field required"):
        planner._call("GET", "/api/plan")

    def down(*args, **kwargs):
        raise requests.ConnectionError("refused")

    monkeypatch.setattr(planner.requests, "request", down)
    with pytest.raises(planner.PlannerError) as err:
        planner._call("POST", "/api/go-no-go", json={})
    assert err.value.status == 502
