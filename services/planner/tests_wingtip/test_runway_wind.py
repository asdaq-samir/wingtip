"""A runway end's true heading, and the wind a field last reported."""
import pytest

from wingtip import runway_wind

def test_an_end_with_no_heading_takes_its_number_turned_true():
    # Runway 18 at 3 degrees west: 177 true.
    assert runway_wind.end_heading_true_deg("18L", None, -3.0) == pytest.approx(177.0)


def test_a_fields_last_wind_is_the_one_the_weather_service_kept():
    # The newest of its METARs with a direction and some speed
    # (services/weather/app/aviationweather.py keeps them, "recent-winds").
    import time

    from wingtip import weather, weather_store

    weather_store.write("recent-winds", {"KDLH": {"wind_dir_true_deg": 270.0, "wind_speed_kt": 8.0, "observed": time.time() - 600}},
                        fetched_at=time.time(), until=None)
    assert weather.recent_wind("KDLH") == {"wind_dir_true_deg": 270.0, "wind_speed_kt": 8.0}


def test_calm_with_a_last_wind_puts_the_one_runway_it_favoured_in_use():
    runways = [{"end_headings": [("6", 58.0), ("24", 238.0)]}, {"end_headings": [("9", 88.0), ("27", 268.0)]}]
    calm = {"wind_dir_true_deg": 0.0, "wind_speed_kt": 0.0}
    out = runway_wind.with_winds(runways, calm, 42.3, -88.1, recent={"wind_dir_true_deg": 270.0, "wind_speed_kt": 8.0})
    assert [w["wind"].get("in_use", False) for w in out] == [False, True]
    assert out[1]["wind"]["end"] == "27"
