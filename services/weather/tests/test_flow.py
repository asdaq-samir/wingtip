"""The flow layer's model weather (app.flow, app.flow_grid): the
timeline's hours, the HRRR's wind turned to east and north, the models
put on one grid, each field's PNG, and a frame already held not fetched
again. NOMADS and AWC are stubbed (app.flow's parts: test_flow_parts)."""

from datetime import datetime, timezone

import numpy as np
import pytest

from app import flow, flow_grid, flow_nomads

NOW = datetime(2026, 11, 12, 1, 40, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _nothing_not_up(monkeypatch):
    monkeypatch.setattr(flow_nomads, "NOT_UP", {})


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
    # With no wind in the file (AWC's now), the rest is still kept.
    assert "u" not in flow_grid.in_units({"temp": one * 273.15})


def test_the_freezing_level_is_feet_msl_and_at_the_surface_zero():
    # UPP's FRZLVL: MSL, and the surface's height where 2 m is below
    # freezing. 1,524 m over 300 m ground is 5,000 ft MSL; at the ground, 0.
    feet = flow_grid.freezing_level_ft(np.array([1524.0, 300.0, 300.5]), np.array([300.0, 300.0, 300.0]))
    assert feet[0] == pytest.approx(5000.0, abs=0.1)
    assert feet[1] == 0.0 and feet[2] == 0.0


def test_a_half_degree_grid_is_spread_to_the_quarter_by_its_neighbours_means():
    half = np.full((flow_grid.HALF_ROWS, flow_grid.HALF_COLS), np.nan, dtype=np.float32)
    half[10, 10], half[10, 11], half[11, 10], half[11, 11] = 0.0, 2.0, 4.0, 6.0
    out = flow_grid.upsample(half)
    assert out[20, 20] == 0.0 and out[20, 21] == 1.0 and out[21, 20] == 2.0 and out[21, 21] == 3.0
    # Beside a point with nothing, the one point there is.
    assert out[20, 19] == 0.0 and np.isnan(out[0, 0])


def test_icing_and_turbulence_keep_a_cells_worst():
    n = flow_grid.HRRR_LEAST_POINTS
    where = np.full(n, 40.0), np.full(n, -100.0)
    icing = np.zeros(n)
    icing[5] = 3.0
    grid = flow_grid.on_grid({"icing-060": icing, "turb-max": np.full(n, 0.1)}, where, hrrr=True)
    row, col = int(round((flow_grid.NORTH - 40.0) / 0.25)), int(round((-100.0 - flow_grid.WEST) / 0.25))
    assert grid["icing-060"][row, col] == 3.0 and grid["turb-max"][row, col] == pytest.approx(0.1)


def test_a_rate_is_the_reflectivity_the_wsr88ds_z_r_relation_gives():
    # The engine's precip_dbz, Z = 300 R^1.4: 10 mm/h is 10 log10(300 *
    # 10^1.4) = 38.8 dBZ; none falling is 0, and no value stays none.
    dbz = flow_grid.precip_dbz(np.array([10.0, 0.0, np.nan]))
    assert dbz[0] == pytest.approx(38.77, abs=0.01)
    assert dbz[1] == 0.0 and np.isnan(dbz[2])


def test_a_ceiling_is_feet_above_the_ground_and_none_is_clear():
    # 14 CFR 1.1: "the height above the earth's surface". 1,000 m MSL over
    # 700 m ground is 300 m, 984 ft; the GFS's 20,000 m and the HRRR's
    # missing value are no ceiling, infinity, which the picture draws clear.
    agl = flow_grid.ceiling_agl_ft(np.array([1000.0, 20000.0, np.nan, 500.0]), np.array([700.0, 0.0, 0.0, 600.0]))
    assert agl[0] == pytest.approx(984.25, abs=0.01)
    assert np.isinf(agl[1]) and np.isinf(agl[2])
    assert agl[3] == 0.0


def test_a_cells_ceiling_is_its_lowest_not_its_mean():
    n = flow_grid.HRRR_LEAST_POINTS
    where = np.full(n, 40.0), np.full(n, -100.0)
    ceiling = np.full(n, np.inf)
    ceiling[3] = 800.0
    values = {"u": np.zeros(n), "v": np.zeros(n), "ceiling": ceiling}
    grid = flow_grid.on_grid(values, where, hrrr=True)
    row, col = int(round((flow_grid.NORTH - 40.0) / 0.25)), int(round((-100.0 - flow_grid.WEST) / 0.25))
    assert grid["ceiling"][row, col] == 800.0
    assert np.isnan(grid["ceiling"][0, 0])


def test_no_ceiling_is_the_top_of_the_picture_and_clear_by_its_ramp():
    from io import BytesIO

    from PIL import Image

    kept = {"ceiling": np.array([[np.inf, 500.0, np.nan]], dtype=np.float32)}
    pixels = np.asarray(Image.open(BytesIO(flow_grid.png("ceiling", kept))))
    assert pixels[0, 0, 0] == 255 and pixels[0, 0, 3] == 255
    assert pixels[0, 1, 0] == 10  # 500 ft at 50 ft a step
    assert pixels[0, 2, 3] == 0


def test_each_request_asks_only_what_is_read(monkeypatch):
    asked = []

    def answer(url, params, **_):
        asked.append(sorted(k for k in params if k.startswith(("var_", "lev_"))))
        return type("R", (), {"status_code": 200, "ok": True, "content": b"GRIB" + str(len(asked)).encode()})()

    monkeypatch.setattr(flow_nomads.outside, "get", answer)
    body = flow_nomads.hrrr(NOW, 1)
    assert body == b"GRIB1GRIB2GRIB3"
    assert ["lev_surface", "var_CAPE", "var_PRATE", "var_VIS"] in asked
    # AWC gives the wind, gusts and cloud: NOMADS is not asked for them.
    assert not any("var_UGRD" in a or "var_GUST" in a or "var_TCDC" in a for a in asked)
    assert all("var_HGT" not in a or "lev_surface" not in a for a in asked)


def test_a_fields_png_holds_its_value_scaled_and_no_data_clear():
    from io import BytesIO

    from PIL import Image

    kept = {"temp": np.array([[0.0, np.nan]], dtype=np.float32), "u": np.zeros((1, 2)), "v": np.zeros((1, 2))}
    pixels = np.asarray(Image.open(BytesIO(flow_grid.png("temp", kept))))
    assert pixels[0, 0, 0] == 150 and pixels[0, 0, 3] == 255  # 0 C, 75 half-degrees up from -75
    assert pixels[0, 1, 3] == 0
    assert flow_grid.png("vis", kept) is None
    assert flow_grid.png("wind", {"temp": kept["temp"]}) is None
