"""A plan's winds aloft from the grid the map draws (wingtip.winds_aloft):
the weather service's flow record and its numbers, recorded here as the
service writes them (services/weather/app/flow.py, flow_store), read at a
leg's place, altitude and time; NOAA's GFS where the frame has it in
AWC's place, said so; the GFS stations past the grid's timeline. And the
engine's rule held to the shared fixture (windsAloftGrid.json)."""

import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest

from wingtip import weather, weather_store, winds_aloft, winds_stations
from wingtip.engine import ask

FIXTURE = Path(__file__).resolve().parents[3] / "apps/web/src/lib/fixtures/windsAloftGrid.json"
GRID = {"north": 75.0, "west": -180.0, "step": 0.5, "rows": 141, "cols": 261}
LEVELS = [{"id": "030", "ft": 3000.0}, {"id": "060", "ft": 6000.0}]
# Near Oshkosh, between the grid's points.
LAT, LON = 44.02, -88.56


def _numbers(name: str, fields: dict[str, list[float]]) -> dict:
    """A part's numbers: each field's value a level, the same at every
    point, so a place between points reads it too."""
    stack = np.zeros((len(fields), len(LEVELS), GRID["rows"], GRID["cols"]), dtype=np.float16)
    for i, values in enumerate(fields.values()):
        for j, value in enumerate(values):
            stack[i, j, :, :] = value
    weather_store.write_array(name, stack)
    return {"array": name, "fields": list(fields), "levels": LEVELS}


def _frame(valid: datetime, west_kt: tuple[float, float], fallback: bool = False) -> dict:
    """An hour with a west wind of `west_kt` at 3,000 and 6,000 ft (u
    positive: toward the east), 10 and 4 C there; AWC's or, with
    `fallback`, the GFS's in its place."""
    tag = f"{valid:%Y%m%d%H}"
    awc = {
        "key": {"cycle": f"{valid - timedelta(hours=1):%Y-%m-%dT%H:00:00Z}", "forecast_hour": 1},
        "files": {},
        "numbers": _numbers(f"flowwinds-{tag}-awc", {"u": list(west_kt), "v": [0.0, 0.0]}),
    }
    aloft_fields = {"temp": [10.0, 4.0]}
    if fallback:
        aloft_fields |= {"u": [w + 10 for w in west_kt], "v": [0.0, 0.0]}
    aloft = {
        "key": {"run": f"{valid:%Y-%m-%d}T06:00:00Z", "forecast_hour": 6, "fallback": fallback},
        "files": {},
        "numbers": _numbers(f"flowwinds-{tag}-aloft", aloft_fields),
    }
    source = "aloft" if fallback else "awc"
    return {
        "valid": f"{valid:%Y-%m-%dT%H:00:00Z}",
        "parts": {"awc": awc, "aloft": aloft},
        "files": {},
        "sources": {"wind-030": source, "wind-060": source, "temp-030": "aloft", "temp-060": "aloft"},
    }


@pytest.fixture
def grid():
    """The timeline: this hour and two hours on, the wind from the west
    rising from 20/30 kt to 40/50 kt."""
    hour = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    frames = [_frame(hour, (20.0, 30.0)), _frame(hour + timedelta(hours=2), (40.0, 50.0))]
    record = {"frames": frames, "numbers_grid": GRID}
    weather_store.write("flow", record, fetched_at=time.time(), until=time.time() + 3 * 3600)
    return hour


def test_the_rule_reads_as_the_shared_fixture_says():
    for case in json.loads(FIXTURE.read_text())["cases"]:
        got = ask("wind_aloft_at", **case["input"])
        want = case["expected"]
        if want["wind"] is None:
            assert got["wind"] is None, case["why"]
        else:
            assert got["wind"]["wind_speed_kt"] == pytest.approx(want["wind"]["wind_speed_kt"]), case["why"]
            assert got["wind"]["wind_dir_true_deg"] == pytest.approx(want["wind"]["wind_dir_true_deg"]), case["why"]
        assert got["temp_c"] == pytest.approx(want["temp_c"]), case["why"]


def test_a_departure_in_the_timeline_flies_the_grid_at_its_quarter_hour(grid):
    key = winds_aloft.winds_key_for(grid + timedelta(minutes=58))
    assert key == f"{grid + timedelta(hours=1):%Y-%m-%dT%H:%MZ}"
    assert winds_aloft.later(key, 1800) == f"{grid + timedelta(hours=1, minutes=30):%Y-%m-%dT%H:%MZ}"
    assert winds_aloft.later("12", 1800) == "12"


def test_the_wind_is_read_between_the_levels_and_the_hours(grid):
    # An hour in, halfway between the two hours: 30 kt at 3,000, 40 at
    # 6,000; at 4,500 ft halfway between, 35 kt from the west.
    key = winds_aloft.winds_key_for(grid + timedelta(hours=1))
    wind = weather.wind_at_altitude(LAT, LON, 4500.0, key)
    assert wind["wind_speed_kt"] == pytest.approx(35.0, abs=0.1)
    assert wind["wind_dir_true_deg"] == pytest.approx(270.0, abs=0.1)
    assert weather.temperature_at_altitude(LAT, LON, 4500.0, key) == pytest.approx(7.0, abs=0.05)
    assert weather.temperatures_aloft(LAT, LON, key) == [(3000.0, pytest.approx(10.0)), (6000.0, pytest.approx(4.0))]


def test_the_nav_log_names_awcs_winds_and_their_cycle(grid):
    period = weather.winds_period(winds_aloft.winds_key_for(grid))
    assert period["label"] == f"AWC winds, {grid - timedelta(hours=1):%H}Z"
    assert period["source"] == "awc" and not period["fallback"] and not period["modelled"]
    assert period["use_from"] == f"{grid:%Y-%m-%dT%H:00:00Z}"
    assert period["use_to"] == f"{grid + timedelta(hours=2):%Y-%m-%dT%H:00:00Z}"


def test_noaas_wind_stands_in_where_the_map_draws_it_and_the_label_says_so():
    hour = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    frames = [_frame(hour, (20.0, 30.0), fallback=True), _frame(hour + timedelta(hours=2), (20.0, 30.0), fallback=True)]
    weather_store.write("flow", {"frames": frames, "numbers_grid": GRID}, fetched_at=time.time(), until=time.time() + 3600)
    key = winds_aloft.winds_key_for(hour)
    # The GFS's wind, 10 kt more than AWC's in the recording.
    assert weather.wind_at_altitude(LAT, LON, 3000.0, key)["wind_speed_kt"] == pytest.approx(30.0, abs=0.1)
    period = weather.winds_period(key)
    assert period["label"] == "NOAA GFS winds, 06Z, in place of AWC" and period["fallback"] and period["source"] == "gfs"


def test_past_the_timeline_the_gfs_stations_period_is_flown(grid, monkeypatch):
    monkeypatch.setattr(winds_stations, "station_period_for", lambda depart: "24")
    assert winds_aloft.winds_key_for(grid + timedelta(hours=20)) == "24"


def test_with_no_grid_held_the_stations_are_read(monkeypatch):
    monkeypatch.setattr(
        winds_stations, "fd_stations", lambda fcst_hr: {"DLH": {6000: {"wind_dir_true_deg": 250, "wind_speed_kt": 25, "temp_c": 2}}}
    )
    monkeypatch.setattr(winds_stations, "nearest_station", lambda lat, lon, ids, df: "DLH")
    from wingtip import airports

    monkeypatch.setattr(airports, "load_airports", lambda: None)
    assert winds_aloft.winds_key_for(None) == "06"
    assert weather.wind_at_altitude(46.8, -92.2, 6000.0) == {"wind_dir_true_deg": 250.0, "wind_speed_kt": 25.0}
