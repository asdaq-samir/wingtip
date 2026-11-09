"""The guards every suite here shares (pytest_guards.py, docs/CI.md, "Flaky
tests"), for both of the planner's suites: tests/ and tests_wingtip/; and
the live store (wingtip.traffic.store) in each test's own folder, so a
test that asks for traffic writes nothing to the data folder's."""

import pytest
from pytest_guards import _module_doubles_restored, pytest_collection_modifyitems  # noqa: F401
from wingtip.traffic import store


@pytest.fixture(autouse=True)
def _own_live_store(monkeypatch, tmp_path):
    store.reset()
    monkeypatch.setattr(store, "STORE", tmp_path / "live" / "live.sqlite")
    yield
    store.reset()
