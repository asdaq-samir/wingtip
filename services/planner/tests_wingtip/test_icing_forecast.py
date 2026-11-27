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


def _grid(severity: tuple[int, int] | None, rows: slice = slice(None)) -> np.ndarray:
    """The stored grid: `severity` (level ft, category) over `rows`, 0 elsewhere."""
    grid = np.zeros((len(KEPT), GRID["rows"], GRID["cols"]), dtype=np.int8)
    if severity is not None:
        grid[KEPT.index(severity[0]), rows] = severity[1]
    return grid


def _store_hours(hours: list[tuple[int, str, np.ndarray]], until: float | None = None) -> None:
    """Hours (from CYCLE, source, grid) as the weather service stores them."""
    stored = []
    for step, source, grid in hours:
        name = f"icingf-{source}-{CYCLE:%Y%m%d%H}-{step:02d}"
        weather_store.write_array(name, grid)
        stored.append({"valid": utc.iso(CYCLE + timedelta(hours=step)), "array": name, "source": source})
    data = {"cycle": utc.iso(CYCLE), "analysis": None, "levels_ft": KEPT, "grid": GRID, "hours": stored}
    last = (CYCLE + timedelta(hours=max(h[0] for h in hours), minutes=30)).timestamp()
    weather_store.write(icing_forecast.STORE_NAME, data, fetched_at=time.time(), until=until or last)


def _store(severity_at: dict[int, tuple[int, int]], steps: int = 4, until: float | None = None) -> None:
    """IFI hours 0 to `steps` - 1; at each step in `severity_at`, a (level
    ft, category) over the whole grid, 0 elsewhere."""
    _store_hours([(step, "ifi", _grid(severity_at.get(step))) for step in range(steps)], until)


@pytest.fixture(autouse=True)
def _flat_ground(monkeypatch):
    monkeypatch.setattr(icing_forecast, "_ground_m", lambda lats, lons: [200.0] * len(lats))


def test_the_levels_are_the_awcs_39():
    assert len(icing_forecast.LEVELS_FT) == 39
    assert icing_forecast.LEVELS_FT[:3] == [500, 1000, 2000]
    assert icing_forecast.LEVELS_FT[-1] == 50000


def test_each_leg_is_read_for_the_hour_of_its_middle():
    # Leaving at 14:20Z: leg 1's middle at 14:50 (the 15Z hour, step 2),
    # 30 minutes on the ground, leg 2's middle at 16:20 (the 16Z hour,
    # step 3). Steps 1 and 4 are clear, and the hours beside each leg's
    # are read too, so the icing is put on no leg it is not near.
    _store({2: (8000, 2), 3: (6000, 2)}, steps=5)
    answer = icing_forecast.along([(41.9, -87.9), (42.5, -89.0), (43.1, -90.0)], [8000, 9000], [60, 60], [30, 0], NOW, now=NOW)
    assert answer["issued"] == "2026-11-08T13:00:00Z"
    # Light at 8,000 on leg 1; at 9,000 leg 2 reads 9,000 alone: clear,
    # the icing it has at 6,000 its layer.
    assert [leg["severity"] for leg in answer["legs"]] == ["light", "none"]
    assert answer["legs"][1]["layer"] == {"bottom_ft": 6000, "top_ft": 6000}
    assert answer["line"] == "Forecast icing, light, at 8,000 ft on leg 1"


def test_a_section_has_the_awcs_shape_and_the_ground_under_it():
    _store({0: (6000, 3)})
    grid = weather_store.read_array(f"icingf-ifi-{CYCLE:%Y%m%d%H}-00")
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


def test_a_leg_is_never_read_under_the_worst_stored_near_it():
    # Leaving at 14:00Z for 20 minutes: the middle at 14:10, the CIP's
    # hour (CYCLE + 1). The CIP has trace at 8,000 over the north of the
    # grid; the IFI has moderate there at 15Z, 50 minutes off: the leg reads
    # moderate, the worst near it, its share the CIP's own.
    depart = (CYCLE + timedelta(hours=1)).timestamp()
    north = slice(GRID["rows"] // 2, None)
    leg = ([(41.0, -90.0), (44.5, -89.0)], [8000], [20], None, depart)
    _store_hours([(1, "cip", _grid((8000, 1), north))])
    alone = icing_forecast.along(*leg, now=depart)
    assert alone["legs"][0]["severity"] == "trace"
    _store_hours([(1, "cip", _grid((8000, 1), north)), (1, "ifi", _grid(None)), (2, "ifi", _grid((8000, 3)))])
    answer = icing_forecast.along(*leg, now=depart)
    assert answer["legs"][0]["severity"] == "moderate"
    assert answer["line"] == "Forecast icing, moderate, at 8,000 ft on leg 1"
    assert 0 < answer["legs"][0]["share"] == alone["legs"][0]["share"] < 1


def test_the_cip_and_the_ifis_same_hour_are_both_read():
    # The CIP's analysis and the IFI's same hour, both on the leg's hour:
    # both read, the worst of them; half an hour and a minute past, neither
    # (the engine's icing_forecast_hours picks them, the CIP's first).
    _store_hours([(0, "ifi", _grid((6000, 2))), (0, "cip", _grid(None))])
    leg = [(41.9, -87.9), (42.5, -89.0)]
    on_time = icing_forecast.along(leg, [6000], [0], None, CYCLE.timestamp(), now=CYCLE.timestamp())["legs"][0]
    # The IFI's light is merged in; the share the CIP's own, none, gives way to the merged.
    assert on_time["severity"] == "light" and on_time["share"] == 1
    late = (CYCLE + timedelta(minutes=31)).timestamp()
    assert icing_forecast.along(leg, [6000], [0], None, late, now=CYCLE.timestamp())["unchecked"] == [0]


def test_icing_only_another_hour_has_takes_that_hours_share():
    depart = (CYCLE + timedelta(hours=1)).timestamp()
    north = slice(GRID["rows"] // 2, None)
    _store_hours([(1, "cip", _grid(None)), (2, "ifi", _grid((8000, 2), north))])
    leg = icing_forecast.along([(41.0, -90.0), (44.5, -89.0)], [8000], [20], None, depart, now=depart)["legs"][0]
    assert leg["severity"] == "light" and 0 < leg["share"] < 1
