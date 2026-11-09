"""What every test here shares: a planner that answers from the test's
own table (no test reaches a real one), and fresh settings. The table
stands in for the HTTP call alone (the generated client's _send), so
every answer still goes through the client's typed functions and is
read into the planner's own models, as a real one is."""

import pytest

from app.generated import planner_client
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

    def send(self, method: str, path: str, *, query=None, body=None, headers=None):
        given = {k: v for k, v in (query or {}).items() if v is not None and v != ""} if method == "GET" else body
        self.calls.append((method, path, given, {k: v for k, v in (headers or {}).items() if v is not None} or None))
        if path not in self.answers:
            raise AssertionError(f"the planner was asked {method} {path}, which this test did not expect")
        value = self.answers[path]
        if isinstance(value, Exception):
            raise value
        return value(given) if callable(value) else value


@pytest.fixture(autouse=True)
def fake_planner(monkeypatch) -> FakePlanner:
    fake = FakePlanner()
    monkeypatch.setattr(planner_client, "_send", fake.send)
    return fake


@pytest.fixture(autouse=True)
def _fresh_settings():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
