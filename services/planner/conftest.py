"""The guards every suite here shares (pytest_guards.py, docs/CI.md, "Flaky
tests"), for both of the planner's suites: tests/ and tests_wingtip/; and
the live store (wingtip.traffic.store) in each test's own folder, so a
test that asks for traffic writes nothing to the data folder's; and the
traffic sources asked through requests' own functions."""

import pytest
import requests
from pytest_guards import _module_doubles_restored, pytest_collection_modifyitems  # noqa: F401
from wingtip import outside
from wingtip.traffic import legs, store


@pytest.fixture(autouse=True)
def _own_live_store(monkeypatch, tmp_path):
    store.reset()
    monkeypatch.setattr(store, "STORE", tmp_path / "live" / "live.sqlite")
    yield
    store.reset()


@pytest.fixture(autouse=True)
def _traffic_asks_through_requests(monkeypatch):
    """The traffic sources' kept-alive session (outside.live_get) asks
    through requests.get and requests.post, which the tests stand in for."""
    monkeypatch.setattr(outside, "_live", lambda: requests)


@pytest.fixture(autouse=True)
def _no_fields_kept_near_flights():
    """No test is given another's fields near a flight's end (legs._near)."""
    legs._NEAR.clear()
