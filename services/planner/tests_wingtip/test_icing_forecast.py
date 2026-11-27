"""wingtip.icing_forecast reading the weather store's forecast icing (the
weather service's "icing-forecast", services/weather/app/icing.py): each
leg read for the stored hour nearest its middle, off the grid along the
leg, the ground under it handed on; a leg past the forecast's reach, a
level above the IFI's or a place off its grid unchecked; no stored
forecast unavailable, never "no icing"; and the engine's reading of what
came back (its rule is held to apps/web/src/lib/fixtures/icingForecast.json).
No request leaves the planner: the store is all it reads."""

import time
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from wingtip import icing_forecast, utc, weather_store

CYCLE = datetime(2026, 11, 8, 13, 0, tzinfo=timezone.utc)
NOW = datetime(2026, 11, 8, 14, 20, tzinfo=timezone.utc).timestamp()
#: The weather service's grid, cut to round Chicago and Wisconsin.
GRID = {"south": 40.0, "west": -92.0, "step_deg": 0.125, "rows": 41, "cols": 49}
KEPT = [ft for ft in icing_forecast.LEVELS_FT if ft <= 30000]


def _store(severity_at: dict[int, tuple[int, int]], steps: int = 4, until: float | None = None) -> None:
    """A cycle at CYCLE of `steps` hours; at each step in `severity_at`, a
    (level ft, category) over the whole grid, 0 elsewhere."""
    hours = []
    for step in range(steps):
        grid = np.zeros((len(KEPT), GRID["rows"], GRID["cols"]), dtype=np.int8)
        if step in severity_at:
            ft, category = severity_at[step]
            grid[KEPT.index(ft)] = category
        name = f"icingf-{CYCLE:%Y%m%d%H}-{step:02d}"
        weather_store.write_array(name, grid)
        hours.append({"valid": utc.iso(CYCLE + timedelta(hours=step)), "array": name})
    data = {"cycle": utc.iso(CYCLE), "levels_ft": KEPT, "grid": GRID, "hours": hours}
    last = (CYCLE + timedelta(hours=steps - 1, minutes=30)).timestamp()
    weather_store.write(icing_forecast.STORE_NAME, data, fetched_at=time.time(), until=until or last)


@pytest.fixture(autouse=True)
def _flat_ground(monkeypatch):
    monkeypatch.setattr(icing_forecast, "_ground_m", lambda lats, lons: [200.0] * len(lats))


def test_the_levels_are_the_awcs_39():
    assert len(icing_forecast.LEVELS_FT) == 39
    assert icing_forecast.LEVELS_FT[:3] == [500, 1000, 2000]
    assert icing_forecast.LEVELS_FT[-1] == 50000


def test_each_leg_is_read_for_the_hour_of_its_middle():
    # Leaving at 14:20Z: leg 1's middle at 14:50 (the 15Z hour, step 2),
    # 30 minutes on the ground, leg 2's middle at 16:20 (the 16Z hour, step 3).
    _store({2: (8000, 2), 3: (6000, 2)})
    answer = icing_forecast.along([(41.9, -87.9), (42.5, -89.0), (43.1, -90.0)], [8000, 9000], [60, 60], [30, 0], NOW, now=NOW)
    assert answer["issued"] == "2026-11-08T13:00:00Z"
    # Light at 8,000 on leg 1; at 9,000 leg 2 reads 9,000 alone: clear,
    # the icing it has at 6,000 its layer.
    assert [leg["severity"] for leg in answer["legs"]] == ["light", "none"]
    assert answer["legs"][1]["layer"] == {"bottom_ft": 6000, "top_ft": 6000}
    assert answer["line"] == "Forecast icing, light, at 8,000 ft on leg 1"


def test_a_section_has_the_awcs_shape_and_the_ground_under_it():
    _store({0: (6000, 3)})
    grid = weather_store.read_array(f"icingf-{CYCLE:%Y%m%d%H}-00")
    found = icing_forecast.section(grid, GRID, KEPT, (41.9, -87.9), (42.5, -89.0))
    levels = len(icing_forecast.LEVELS_FT)
    assert found["width"] == icing_forecast.COLUMNS and found["data_levels"] == levels
    assert len(found["values"]) == icing_forecast.COLUMNS * levels
    column = found["values"][:levels]
    assert column[icing_forecast.LEVELS_FT.index(6000)] == 3
    assert column[icing_forecast.LEVELS_FT.index(30000)] == 0
    # Above the IFI's 30,000 ft: no forecast, never "none".
    assert column[icing_forecast.LEVELS_FT.index(32000)] == icing_forecast.NONE
    assert found["sfc_hgt"] == [200.0] * icing_forecast.COLUMNS


def test_a_leg_off_the_grid_is_unchecked():
    _store({0: (6000, 3)})
    answer = icing_forecast.along([(35.0, -80.0), (35.5, -81.0)], [6000], [40], None, NOW, now=NOW)
    assert answer["unchecked"] == [0] and answer["legs"][0]["severity"] is None


def test_a_leg_past_the_forecasts_reach_is_unchecked():
    _store({3: (6000, 2)}, until=NOW + 86400)
    later = (CYCLE + timedelta(hours=4)).timestamp()
    answer = icing_forecast.along([(41.9, -87.9), (42.5, -89.0)], [6000], [40], None, later, now=NOW)
    assert answer["unchecked"] == [0]
    assert answer["legs"][0]["severity"] is None
    assert answer["line"] is None


def test_no_stored_forecast_is_unavailable_not_clear():
    with pytest.raises(icing_forecast.IcingForecastUnavailable):
        icing_forecast.along([(41.9, -87.9), (42.5, -89.0)], [6000], [40], None, NOW, now=NOW)
    # Nor one past its own validity.
    _store({0: (6000, 2)}, until=NOW - 1)
    with pytest.raises(icing_forecast.IcingForecastUnavailable):
        icing_forecast.along([(41.9, -87.9), (42.5, -89.0)], [6000], [40], None, NOW, now=NOW)


def test_an_hours_grid_gone_is_unchecked():
    _store({2: (6000, 2)})
    for path in weather_store.store_dir().glob("icingf-*.npy"):
        path.unlink()
    answer = icing_forecast.along([(41.9, -87.9), (42.5, -89.0)], [6000], [40], None, NOW, now=NOW)
    assert answer["unchecked"] == [0]


def test_the_legs_and_fixes_must_agree():
    with pytest.raises(ValueError):
        icing_forecast.along([(41.9, -87.9)], [6000], [40], None, NOW, now=NOW)
