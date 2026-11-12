"""The flow layer's timeline as the planner serves it (wingtip.weather_flow),
from a record written here as the weather service writes it."""

import time

from wingtip import weather_flow, weather_store


def _store(now: float, valid: str = "2026-11-12T02:00:00Z"):
    record = {
        "frames": [
            {
                "valid": valid,
                "key": {"gfs": {"run": "2026-11-11T18:00:00Z", "forecast_hour": 8}, "hrrr": None},
                "files": {"wind": "flow-2026111202-wind"},
                "model": "GFS",
            }
        ],
        "bounds": [-180.125, 4.875, -49.875, 75.125],
        "fields": {"wind": {"unit": "kt", "unscale": [-100, 100], "vector": True}},
    }
    weather_store.write("flow", record, fetched_at=now, until=now + 3600)
    weather_store.write_blob("flow-2026111202-wind", b"\x89PNG", ".png")


def test_the_timeline_says_each_frames_runs_and_its_fields():
    now = time.time()
    _store(now)
    layer = weather_flow.layer(now)
    frame = layer["frames"][0]
    assert frame["id"] == "2026111202" and frame["gfs_forecast_hour"] == 8 and frame["hrrr_run"] is None
    assert frame["fields"] == ["wind"]
    assert "Model forecast, not an observation" in layer["credit"]


def test_a_past_hour_carries_the_radar_mosaic_made_by_then():
    now = time.time()
    _store(now, valid=time.strftime("%Y-%m-%dT%H:00:00Z", time.gmtime(now)))
    weather_store.write("radar", {"valid": time.strftime("%Y-%m-%dT%H:%M:00Z", time.gmtime(now))}, fetched_at=now, until=None)
    frame = weather_flow.layer(now)["frames"][0]
    assert frame["past"] and "USCOMP-N0Q" in frame["radar_tiles"]


def test_nothing_is_served_past_the_records_time():
    now = time.time()
    _store(now)
    assert weather_flow.layer(now + 7200) is None


def test_a_picture_is_found_only_for_a_frame_and_field_the_record_lists():
    _store(time.time())
    assert weather_flow.picture("2026111202", "wind") is not None
    assert weather_flow.picture("2026111202", "temp") is None
    assert weather_flow.picture("../../etc", "wind") is None
