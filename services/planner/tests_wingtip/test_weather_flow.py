"""The flow layer's timeline as the planner serves it (wingtip.weather_flow),
from a record written here as the weather service writes it."""

import time

from wingtip import weather_flow, weather_store


def _iso(at: float) -> str:
    return time.strftime("%Y-%m-%dT%H:00:00Z", time.gmtime(at))


def _store(now: float, valid: str = "2026-11-12T02:00:00Z", awc_cycle: str | None = None, fallback: bool = False):
    """A record as app.flow writes one: the wind AWC's (or, with
    `fallback`, NOMADS' in its place), the temperature NOMADS'."""
    awc_cycle = awc_cycle or _iso(now)
    nomads_key = {"gfs": {"run": "2026-11-11T18:00:00Z", "forecast_hour": 8}, "hrrr": None, "fallback": fallback}
    parts = {
        "awc": {"key": {"cycle": awc_cycle, "forecast_hour": 1}, "files": {"wind": "flow-2026111202-wind-c2026111201f01"}},
        "nomads": {"key": nomads_key, "files": {"temp": "flow-2026111202-temp-c2026111118f08"}},
    }
    record = {
        "frames": [
            {
                "valid": valid,
                "parts": parts,
                "key": nomads_key,
                "files": {"wind": "flow-2026111202-wind-c2026111201f01", "temp": "flow-2026111202-temp-c2026111118f08"},
                "sources": {"wind": "nomads" if fallback else "awc", "temp": "nomads"},
                "model": "GFS",
            }
        ],
        "bounds": [-180.125, 4.875, -49.875, 75.125],
        "world_bounds": [-180.5, -90.5, 179.5, 90.5],
        "levels": {"wind": ["sfc", "060", "max"], "icing": ["060"], "turbulence": ["max"]},
        "fields": {"wind": {"unit": "kt", "unscale": [-100, 100], "vector": True}},
    }
    weather_store.write("flow", record, fetched_at=now, until=now + 3600)
    for name in record["frames"][0]["files"].values():
        weather_store.write_blob(name, b"\x89PNG", ".png")


def test_the_timeline_says_each_frames_runs_and_its_fields():
    now = time.time()
    _store(now)
    layer = weather_flow.layer(now)
    frame = layer["frames"][0]
    assert frame["id"] == "2026111202" and frame["gfs_forecast_hour"] == 8 and frame["hrrr_run"] is None
    assert frame["fields"] == ["temp", "wind"]
    assert "Aviation Weather Center" in layer["credit"] and "not an observation" not in layer["credit"]
    assert layer["levels"]["wind"] == ["sfc", "060", "max"]
    # Each picture's version is the run that made it, its address's v.
    assert frame["versions"]["wind"] == "c2026111201f01"


def test_each_field_names_its_source_and_when_its_run_was_made():
    now = time.time()
    _store(now)
    sources = weather_flow.layer(now)["frames"][0]["sources"]
    assert sources["wind"]["label"] == "AWC winds" and not sources["wind"]["stale"] and not sources["wind"]["fallback"]
    assert sources["temp"]["label"] == "NOAA GFS"


def test_a_cycle_past_its_cadence_and_margin_is_said_stale_but_still_served():
    # The GFA runs hourly: a cycle four hours old is past its margin (three).
    now = time.time()
    _store(now, awc_cycle=_iso(now - 4 * 3600))
    layer = weather_flow.layer(now)
    assert layer is not None
    assert layer["frames"][0]["sources"]["wind"]["stale"] is True


def test_noaas_wind_in_awcs_place_is_said_so():
    now = time.time()
    _store(now, fallback=True)
    wind = weather_flow.layer(now)["frames"][0]["sources"]["wind"]
    assert wind["fallback"] is True and wind["label"] == "NOAA GFS"


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
    path, version = weather_flow.picture("2026111202", "wind")
    assert version == "c2026111201f01" and path.name.endswith(".png")
    assert weather_flow.picture("2026111202", "cape") is None
    assert weather_flow.picture("../../etc", "wind") is None
