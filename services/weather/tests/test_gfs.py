"""The GFS's winds aloft, the planner's since the FB ended (NWS Service
Change Notice 26-47): each forecast hour stored for use only in its own
window, at the FB's old stations. Moved from the planner's tests of
wingtip.modelwinds (#535); NOMADS is stubbed."""

from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from wingtip import weather, weather_store, winds_stations

from app import gfs

RUN = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _nothing_not_up(monkeypatch):
    monkeypatch.setattr(gfs, "_NOT_UP", {})


def test_each_period_has_tbl_9_3_1s_window_round_its_forecast_hour():
    # FAA Order JO 7110.10 TBL 9-3-1: the 6-hour FB valid 1800Z was for use
    # 1400-2100Z, the 12-hour valid 0000Z 2100-0600Z, the 24-hour valid
    # 1200Z 0600-1800Z.
    assert gfs.period_of(RUN, 6, "06") == {
        "valid_at": "2026-11-07T18:00:00Z",
        "use_from": "2026-11-07T14:00:00Z",
        "use_to": "2026-11-07T21:00:00Z",
        "run": "2026-11-07T12:00:00Z",
        "forecast_hour": 6,
    }
    twelve = gfs.period_of(RUN, 12, "12")
    assert (twelve["use_from"], twelve["use_to"]) == ("2026-11-07T21:00:00Z", "2026-11-08T06:00:00Z")
    day = gfs.period_of(RUN, 24, "24")
    assert (day["use_from"], day["use_to"]) == ("2026-11-08T06:00:00Z", "2026-11-08T18:00:00Z")


def test_the_periods_windows_run_on_from_one_another_from_the_current_hour():
    # Valid times placed so 06 ends where 12 starts, and 12 where 24 does.
    ends = {hr: hours + after for hr, (hours, _, after) in gfs._PERIODS.items()}
    starts = {hr: hours - before for hr, (hours, before, _) in gfs._PERIODS.items()}
    assert starts["06"] <= 0 < ends["06"] == starts["12"] and ends["12"] == starts["24"]
    # The planner's rule by hours ahead (wingtip.weather.forecast_hour) ends where they do,
    # and reads the periods this service stores.
    assert [weather.forecast_hour(h) for h in (None, 6, 6.5, 15, 15.5)] == ["06", "06", "12", "12", "24"]
    assert gfs.PERIODS == weather_store.WIND_PERIODS


def test_forecast_hours_are_hourly_to_120_then_three_hourly():
    # NOMADS gfs.YYYYMMDD/HH/atmos: f000-f120 every hour, f123 on every third.
    run = RUN.replace(hour=0)
    at = lambda h: run + timedelta(hours=h)  # noqa: E731
    assert gfs.forecast_step(run, at(7)) == 7
    assert gfs.forecast_step(run, at(120)) == 120
    assert gfs.forecast_step(run, at(121)) == 120
    assert gfs.forecast_step(run, at(125)) == 126


def _fields(u: float, v: float, temp_k: float) -> dict:
    """A quarter-degree grid over the lower 48 with the same wind,
    temperature and a standard height at every level."""
    lats = np.arange(55, 19.75, -0.25)
    lons = np.arange(230, 300.25, 0.25)
    shape = (len(lats), len(lons))
    heights = {925: 760.0, 850: 1457.0, 700: 3012.0, 600: 4206.0, 500: 5574.0, 400: 7185.0, 300: 9164.0, 250: 10363.0, 200: 11784.0}
    fields = {}
    for hpa in gfs.LEVELS_HPA:
        fields[("HGT", hpa)] = (lats, lons, np.full(shape, heights[hpa], dtype=np.float32))
        fields[("TMP", hpa)] = (lats, lons, np.full(shape, temp_k, dtype=np.float32))
        fields[("UGRD", hpa)] = (lats, lons, np.full(shape, u, dtype=np.float32))
        fields[("VGRD", hpa)] = (lats, lons, np.full(shape, v, dtype=np.float32))
    return fields


def test_a_period_is_stored_at_the_stations_to_the_end_of_its_window(monkeypatch):
    """A west wind of 10 m/s (19 kt) everywhere, at -8 degC: each station's
    levels at their own heights, from where the wind blows, true, stored
    to the end of the period's window and read by the planner as the FB's
    columns were."""
    now = datetime(2026, 11, 7, 16, 30, tzinfo=timezone.utc)
    monkeypatch.setattr(gfs, "_fetch", lambda fcst_hr, at: (_fields(10.0, 0.0, 265.15), RUN, 6))
    monkeypatch.setattr(gfs.time, "time", lambda: now.timestamp())
    gfs.fetch_period("06")
    record = weather_store.read("winds-06")
    assert record.until == datetime(2026, 11, 7, 21, tzinfo=timezone.utc).timestamp()
    assert record.data["period"]["use_to"] == "2026-11-07T21:00:00Z"
    stations = winds_stations.fd_stations("06")
    assert set(stations) == set(gfs.STATIONS)
    assert stations["DLH"][round(5574 * 3.28084)] == {"wind_dir_true_deg": 270, "wind_speed_kt": 19, "temp_c": -8}
    assert stations.modelled and stations.period["forecast_hour"] == 6


def test_a_run_not_posted_falls_back_to_the_one_before_and_none_is_unavailable(monkeypatch):
    asked = []

    def download(run, step):
        asked.append(run)
        return None

    monkeypatch.setattr(gfs, "_download", download)
    with pytest.raises(gfs.ModelWindsUnavailable, match="no GFS run"):
        gfs._fetch("06", datetime(2026, 11, 7, 17, 0, tzinfo=timezone.utc))
    # 1700Z: the 1200Z run is not looked for until 1600Z, so 12Z, 06Z, 00Z.
    assert asked == [RUN, RUN - timedelta(hours=6), RUN - timedelta(hours=12)]
    # Not asked again within NOT_UP_RETRY_S.
    with pytest.raises(gfs.ModelWindsUnavailable):
        gfs._fetch("06", datetime(2026, 11, 7, 17, 1, tzinfo=timezone.utc))
    assert len(asked) == 3
