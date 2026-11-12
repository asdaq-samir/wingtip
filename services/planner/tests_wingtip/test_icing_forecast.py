"""wingtip.icing_forecast with the AWC's answers stubbed: each leg asked for
the hour of its middle, from this hour's issue or the last's; a leg past
the forecast's reach, or one the AWC had nothing for, unchecked; no
answer at all unavailable, never "no icing"; and the engine's reading of
what came back (its rule is held to apps/web/src/lib/fixtures/icingForecast.json)."""

from datetime import datetime, timezone

import pytest
import requests

from wingtip import icing_forecast

NOW = datetime(2026, 11, 8, 14, 20, tzinfo=timezone.utc).timestamp()
ISSUED = datetime(2026, 11, 8, 14, 0, tzinfo=timezone.utc)
LEVELS = len(icing_forecast.LEVELS_FT)


def _section(at_ft: float, category: int, width: int = 2) -> dict:
    """A section with `category` at the level `at_ft` over every column."""
    level = icing_forecast.LEVELS_FT.index(at_ft)
    column = [category if i == level else 0 for i in range(LEVELS)]
    return {"width": width, "data_levels": LEVELS, "param": "icing_severity", "values": column * width, "sfc_hgt": [200] * width}


class _Answer:
    def __init__(self, body, status=200):
        self.body, self.status_code = body, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))

    def json(self):
        return self.body


@pytest.fixture(autouse=True)
def _nothing_held():
    icing_forecast._HELD.clear()
    yield
    icing_forecast._HELD.clear()


def test_the_levels_are_the_awcs_39():
    assert len(icing_forecast.LEVELS_FT) == 39
    assert icing_forecast.LEVELS_FT[:3] == [500, 1000, 2000]
    assert icing_forecast.LEVELS_FT[-1] == 50000


def test_each_leg_is_read_for_the_hour_of_its_middle(monkeypatch):
    asked = []

    def get(url, headers, timeout):
        asked.append(url)
        return _Answer(_section(8000, 2))

    monkeypatch.setattr(icing_forecast.outside, "get", get)
    # Leaving at 14:20Z: leg 1's middle at 14:50 (hour 1 of the 14Z issue),
    # 30 minutes on the ground, leg 2's middle at 16:20 (hour 2).
    start = NOW
    answer = icing_forecast.along([(41.9, -87.9), (42.5, -89.0), (43.1, -90.0)], [8000, 9000], [60, 60], [30, 0], start, now=NOW)
    assert asked[0].startswith("https://aviationweather.gov/data/cross/section/20261108/14/01/icing/41.90,-87.90,42.50,-89.00")
    assert "/20261108/14/02/icing/42.50,-89.00,43.10,-90.00" in asked[1]
    assert answer["issued"] == "2026-11-08T14:00:00Z"
    # Light at 8,000 on leg 1; at 9,000 leg 2 reads 9,000 alone: clear.
    assert [leg["severity"] for leg in answer["legs"]] == ["light", "none"]
    assert answer["line"] == "Forecast icing, light, at 8,000 ft on leg 1"


def test_an_issue_not_posted_yet_is_asked_of_the_hour_before(monkeypatch):
    asked = []

    def get(url, headers, timeout):
        asked.append(url)
        return _Answer({"width": 300, "data_levels": LEVELS, "values": []} if "/14/" in url else _section(6000, 3))

    monkeypatch.setattr(icing_forecast.outside, "get", get)
    answer = icing_forecast.along([(41.9, -87.9), (42.5, -89.0)], [6000], [40], None, NOW, now=NOW)
    assert "/20261108/14/01/" in asked[0] and "/20261108/13/02/" in asked[1]
    assert answer["legs"][0]["severity"] == "moderate"


def test_a_leg_past_the_forecasts_reach_is_unchecked(monkeypatch):
    monkeypatch.setattr(icing_forecast.outside, "get", lambda url, headers, timeout: _Answer(_section(6000, 0)))
    later = NOW + 14 * 3600
    answer = icing_forecast.along([(41.9, -87.9), (42.5, -89.0)], [6000], [40], None, later, now=NOW)
    assert answer["unchecked"] == [0]
    assert answer["legs"][0]["severity"] is None
    assert answer["line"] is None


def test_no_answer_at_all_is_unavailable_not_clear(monkeypatch):
    def get(url, headers, timeout):
        raise requests.ConnectionError("down")

    monkeypatch.setattr(icing_forecast.outside, "get", get)
    with pytest.raises(icing_forecast.IcingForecastUnavailable):
        icing_forecast.along([(41.9, -87.9), (42.5, -89.0)], [6000], [40], None, NOW, now=NOW)


def test_a_section_of_another_shape_is_unchecked(monkeypatch):
    monkeypatch.setattr(
        icing_forecast.outside, "get", lambda url, headers, timeout: _Answer({"width": 2, "data_levels": 30, "values": [0] * 60})
    )
    answer = icing_forecast.along([(41.9, -87.9), (42.5, -89.0)], [6000], [40], None, NOW, now=NOW)
    assert answer["unchecked"] == [0]


def test_the_legs_and_fixes_must_agree():
    with pytest.raises(ValueError):
        icing_forecast.along([(41.9, -87.9)], [6000], [40], None, NOW, now=NOW)
