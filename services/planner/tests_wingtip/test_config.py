"""wingtip.config.Settings reads the environment as the code always has:
the tests pin each way a value is read, since the move from os.environ
was meant to change nothing but where a malformed value fails."""

import pytest

from wingtip.config import SettingsError, get_settings


def test_a_malformed_number_names_its_variable(monkeypatch):
    monkeypatch.setenv("CHARTS_PREPARE_AT_ONCE", "two")
    with pytest.raises(SettingsError, match="CHARTS_PREPARE_AT_ONCE='two'"):
        get_settings()


def test_every_malformed_variable_is_named(monkeypatch):
    monkeypatch.setenv("CHARTS_PREPARE_AT_ONCE", "two")
    monkeypatch.setenv("ADSBX_MONTHLY_REQUESTS", "many")
    with pytest.raises(SettingsError) as raised:
        get_settings()
    assert "CHARTS_PREPARE_AT_ONCE" in str(raised.value) and "ADSBX_MONTHLY_REQUESTS" in str(raised.value)


def test_the_defaults(monkeypatch):
    for name in ("CHARTS_PREPARE_AT_ONCE", "CHARTS_FETCH_FOR_TILES", "CHART_TILES_URL", "ADSBX_RAPIDAPI_KEY"):
        monkeypatch.delenv(name, raising=False)
    settings = get_settings()
    assert settings.charts_prepare_at_once == 2
    assert settings.charts_fetch_for_tiles is True
    assert settings.chart_tiles_url is None and settings.adsbx_rapidapi_key is None


@pytest.mark.parametrize("value, on", [("0", False), (" 0 ", False), ("1", True), ("", True), ("false", True)])
def test_a_switch_is_on_unless_it_is_zero(monkeypatch, value, on):
    monkeypatch.setenv("CHARTS_FETCH_FOR_TILES", value)
    assert get_settings().charts_fetch_for_tiles is on


def test_a_blank_is_unset_and_a_url_loses_its_slash(monkeypatch):
    monkeypatch.setenv("CHART_TILES_BUCKET", "  ")
    monkeypatch.setenv("CHART_LANDMARKS_DIR", "")
    monkeypatch.setenv("CHART_TILES_URL", "https://tiles.example/x/")
    monkeypatch.setenv("DEV_SERVICES_URL", "")
    settings = get_settings()
    assert settings.chart_tiles_bucket is None and settings.chart_landmarks_dir is None
    assert settings.chart_tiles_url == "https://tiles.example/x"
    assert settings.dev_services_url is None


def test_a_short_connector_secret_stops_the_planner_without_saying_it(monkeypatch):
    """MCP_INTERNAL_TOKEN opens every pilot's records on the gateway's
    internal port: 32 characters at the least, as the gateway asks, and
    the refusal names the variable but never its value."""
    monkeypatch.setenv("MCP_INTERNAL_TOKEN", "short-secret")
    with pytest.raises(SettingsError, match="MCP_INTERNAL_TOKEN=<hidden>: .*shorter than 32") as raised:
        get_settings()
    assert "short-secret" not in str(raised.value)
    monkeypatch.setenv("MCP_INTERNAL_TOKEN", "x" * 32)
    get_settings.cache_clear()
    assert get_settings().mcp_internal_token == "x" * 32
