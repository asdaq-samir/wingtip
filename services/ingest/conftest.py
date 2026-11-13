"""What every test of ingest shares: a live store of its own, no history
thread, and fresh settings either side of each test."""

import pytest
from wingtip import live_reports
from wingtip.config import get_settings as wingtip_settings
from wingtip.traffic import store

from ingest.settings import get_settings


@pytest.fixture(autouse=True)
def _own_store_and_settings(monkeypatch, tmp_path):
    """The live store in the test's own folder, never the data folder's."""
    store.reset()
    live_reports.reset()
    monkeypatch.setattr(store, "STORE", tmp_path / "live.sqlite")
    monkeypatch.setattr(live_reports, "STORE", tmp_path / "reports.sqlite")
    # The health check reads the store's path from the settings.
    monkeypatch.setenv("LIVE_STORE", str(tmp_path / "live.sqlite"))
    # No history thread: it would ask the NTSB over the internet.
    monkeypatch.setenv("HISTORY", "0")
    get_settings.cache_clear()
    wingtip_settings.cache_clear()
    yield
    store.reset()
    live_reports.reset()
    get_settings.cache_clear()
    wingtip_settings.cache_clear()
