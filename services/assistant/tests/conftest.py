"""What every test here shares: a planner that answers from the test's
own table (no test reaches a real one), and fresh settings."""
import pytest

from app import planner
from app.settings import get_settings


class FakePlanner:
    """The planner's HTTP API as a test sets it: each path's answer, a
    callable of the call's params or body, or a PlannerError to raise;
    every call kept in `calls` as (method, path, params or body, headers)."""

    def __init__(self):
        self.answers: dict = {}
        self.calls: list = []

    def answer(self, path: str, value) -> None:
        self.answers[path] = value

    def _reply(self, method: str, path: str, given: dict, headers: dict | None = None):
        self.calls.append((method, path, given, headers))
        if path not in self.answers:
            raise AssertionError(f"the planner was asked {method} {path}, which this test did not expect")
        value = self.answers[path]
        if isinstance(value, Exception):
            raise value
        return value(given) if callable(value) else value

    def get(self, path: str, **params):
        return self._reply("GET", path, {k: v for k, v in params.items() if v is not None and v != ""})

    def post(self, path: str, body: dict, headers: dict | None = None):
        return self._reply("POST", path, body, headers)


@pytest.fixture(autouse=True)
def fake_planner(monkeypatch) -> FakePlanner:
    fake = FakePlanner()
    monkeypatch.setattr(planner, "get", fake.get)
    monkeypatch.setattr(planner, "post", fake.post)
    return fake


@pytest.fixture(autouse=True)
def _fresh_settings():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
