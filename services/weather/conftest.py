"""The guards every suite here shares (services/planner/pytest_guards.py,
docs/CI.md, "Flaky tests"), and each test's weather store a folder of its
own, so none writes into data/raw/weather."""

import pytest
from pytest_guards import _module_doubles_restored, pytest_collection_modifyitems  # noqa: F401


@pytest.fixture(autouse=True)
def _weather_store_of_its_own(tmp_path_factory, monkeypatch):
    from wingtip import weather_store
    from wingtip.config import get_settings

    from app.settings import get_settings as weather_settings

    monkeypatch.setenv("WEATHER_STORE", str(tmp_path_factory.mktemp("weather")))
    weather_store._ASKED.clear()
    get_settings.cache_clear()
    weather_settings.cache_clear()
    yield
    get_settings.cache_clear()
    weather_settings.cache_clear()
