"""The flow layer's model weather (app.flow, app.flow_grid): the
timeline's hours, the HRRR's wind turned to east and north, the models
put on one grid, each field's PNG, and a frame already held not fetched
again. NOMADS is stubbed."""

from datetime import datetime, timezone

import numpy as np
import pytest
from wingtip import weather_store

from app import flow, flow_grid

NOW = datetime(2026, 11, 12, 1, 40, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _nothing_not_up(monkeypatch):
    monkeypatch.setattr(flow, "_NOT_UP", {})


def test_the_timeline_is_the_last_hour_now_and_even_hours_to_twelve_ahead():
    hours = [t.hour for t in flow.frame_times(NOW)]
    assert hours == [0, 1, 2, 4, 6, 8, 10, 12]
    # An hour later most of them are the same hours, so are not fetched again.
    later = [t.hour for t in flow.frame_times(NOW.replace(hour=2))]
    assert later == [1, 2, 4, 6, 8, 10, 12, 14]


def test_the_hrrrs_wind_on_its_central_meridian_is_already_east_and_north():
    u, v = flow_grid._earth_relative(np.array([10.0]), np.array([0.0]), np.array([-97.5]))
    assert u[0] == pytest.approx(10.0) and v[0] == pytest.approx(0.0)


def test_the_hrrrs_wind_east_of_its_meridian_is_turned_by_the_cone_times_the_longitude():
    # 20 degrees east of -97.5, the grid's north leans sin(38.5) * 20 = 12.45 degrees.
    u, v = flow_grid._earth_relative(np.array([0.0]), np.array([10.0]), np.array([-77.5]))
    angle = np.degrees(np.arctan2(u[0], v[0]))
    assert angle == pytest.approx(12.45, abs=0.01)
    assert np.hypot(u[0], v[0]) == pytest.approx(10.0)


def test_the_hrrrs_cells_take_the_place_of_the_gfss_where_it_has_enough_points():
    gfs = {"u": np.full((flow_grid.ROWS, flow_grid.COLS), 1.0, dtype=np.float32)}
    hrrr = {"u": np.full_like(gfs["u"], np.nan)}
    hrrr["u"][100, 300] = 5.0
    out = flow_grid.blend(gfs, hrrr)["u"]
    assert out[100, 300] == 5.0 and out[0, 0] == 1.0


def test_a_cell_with_too_few_hrrr_points_is_left_to_the_gfs():
    lats = np.full(10, 40.0)
    lons = np.full(10, -100.0)
    values = {"u": np.full(10, 3.0, dtype=np.float32), "v": np.zeros(10, dtype=np.float32)}
    grid = flow_grid.on_grid(values, (lats, lons), hrrr=True)
    assert np.isnan(grid["u"]).all()
    many = np.full(flow_grid.HRRR_LEAST_POINTS, 40.0), np.full(flow_grid.HRRR_LEAST_POINTS, -100.0)
    values = {
        "u": np.full(flow_grid.HRRR_LEAST_POINTS, 3.0, dtype=np.float32),
        "v": np.zeros(flow_grid.HRRR_LEAST_POINTS, dtype=np.float32),
    }
    grid = flow_grid.on_grid(values, many, hrrr=True)
    row, col = int(round((flow_grid.NORTH - 40.0) / 0.25)), int(round((-100.0 - flow_grid.WEST) / 0.25))
    assert np.nanmax(grid["u"]) == pytest.approx(grid["u"][row, col])


def test_units_are_knots_degrees_celsius_statute_miles_and_reflectivity():
    one = np.ones((1, 1), dtype=np.float32)
    kept = flow_grid.in_units(
        {"u": one * 10, "v": one * 0, "gust": one * 10, "temp": one * 273.15, "vis": one * 1609.344, "prate": one * 0}
    )
    assert kept["u"][0, 0] == pytest.approx(19.44, abs=0.01)
    assert kept["gust"][0, 0] == pytest.approx(19.44, abs=0.01)
    assert kept["temp"][0, 0] == pytest.approx(0.0, abs=1e-4)
    assert kept["vis"][0, 0] == pytest.approx(1.0)
    assert kept["precip"][0, 0] == 0.0


def test_a_rate_is_the_reflectivity_the_wsr88ds_z_r_relation_gives():
    # Z = 300 R^1.4: 10 mm/h is 10 log10(300 * 10^1.4) = 38.8 dBZ.
    assert flow_grid.precip_dbz(np.array([10.0]))[0] == pytest.approx(38.77, abs=0.01)


def test_a_fields_png_holds_its_value_scaled_and_no_data_clear():
    from io import BytesIO

    from PIL import Image

    kept = {"temp": np.array([[0.0, np.nan]], dtype=np.float32), "u": np.zeros((1, 2)), "v": np.zeros((1, 2))}
    pixels = np.asarray(Image.open(BytesIO(flow_grid.png("temp", kept))))
    assert pixels[0, 0, 0] == 128 and pixels[0, 0, 3] == 255  # 0 C halfway from -50 to 50
    assert pixels[0, 1, 3] == 0
    assert flow_grid.png("vis", kept) is None


def test_a_frame_held_from_the_same_runs_is_not_downloaded_again(monkeypatch):
    asked = []
    monkeypatch.setattr(flow, "_GET", {"gfs": lambda r, s: asked.append(("gfs", r, s)), "hrrr": lambda r, s: asked.append(("hrrr", r, s))})
    valid = flow.frame_times(NOW)[3]
    tries = flow._tries(valid, NOW)
    run, step = tries["gfs"][0]
    weather_store.write_blob("flow-x-wind", b"png", ".png")
    held = {"key": {"gfs": {"run": flow._iso(run), "forecast_hour": step}, "hrrr": None}, "files": {"wind": "flow-x-wind"}}
    assert flow._frame(valid, NOW, held) is held
    assert asked == []
