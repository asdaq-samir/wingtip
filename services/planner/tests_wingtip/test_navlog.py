"""The nav log as the planner asks the engine for it: the air each leg is
looked up in (wingtip.navlog's edge) and the engine's leg made of it. The
leg's own figures -- the wind triangle, the airplane in the leg's air,
the fuel plan -- are the engine's and tested there
(engine/facade/tests/navlog.rs); the winds' interpolation is the
planner's (wingtip.weather)."""

import pytest

from wingtip.winds_stations import wind_in_levels


def test_circular_interpolation_across_the_360_wrap():
    # Halfway between two levels, the engine's (winds.rs) short way round.
    def between(d1, d2, frac):
        levels = {3000: {"wind_dir_true_deg": d1, "wind_speed_kt": 10}, 7000: {"wind_dir_true_deg": d2, "wind_speed_kt": 10}}
        return wind_in_levels(levels, 3000 + 4000 * frac)["wind_dir_true_deg"] % 360

    assert min(between(350, 10, 0.5), 360 - between(350, 10, 0.5)) == pytest.approx(0.0, abs=1e-9)
    assert min(between(10, 350, 0.5), 360 - between(10, 350, 0.5)) == pytest.approx(0.0, abs=1e-9)


def test_circular_interpolation_normal_case():
    levels = {3000: {"wind_dir_true_deg": 100, "wind_speed_kt": 10}, 7000: {"wind_dir_true_deg": 200, "wind_speed_kt": 10}}
    assert wind_in_levels(levels, 4000)["wind_dir_true_deg"] == pytest.approx(125.0, abs=1e-9)


def _leg_with_wind(monkeypatch, wind_dir, wind_speed, tas=100.0, oat_c=None, altitude_ft=6000.0):
    from wingtip import navlog

    asked = []

    def wind(lat, lon, alt, fcst_hr="06"):
        asked.append((round(lat, 6), round(lon, 6), alt, fcst_hr))
        return {"wind_dir_true_deg": wind_dir, "wind_speed_kt": wind_speed}

    monkeypatch.setattr(navlog, "wind_at_altitude", wind)
    monkeypatch.setattr(navlog, "temperature_at_altitude", lambda lat, lon, alt, fcst_hr="06": oat_c)
    monkeypatch.setattr(navlog, "magnetic_variation_deg", lambda lat, lon: 0.0)
    a = {"name": "A", "category": "departure", "lat": 45.0, "lon": -90.0}
    b = {"name": "B", "category": "destination", "lat": 45.0, "lon": -89.0}  # due east, 090
    leg = navlog.legs([a, b], altitude_ft, {"cruise_tas_kt": tas, "fuel_burn_gph": 8.5}, "12")[0]
    # Looked up once, at the leg's midpoint, for the forecast period asked.
    assert asked == [(45.0, -89.5, altitude_ft, "12")]
    return leg


def test_a_crosswind_stronger_than_tas_is_unflyable(monkeypatch):
    leg = _leg_with_wind(monkeypatch, 190, 150)
    assert leg["ete_min"] is None and leg["groundspeed_kt"] is None and leg["fuel_gal"] is None


def test_a_leg_flies_the_aeroplanes_figures_in_its_own_air(monkeypatch):
    standard = _leg_with_wind(monkeypatch, 270, 20)
    assert standard["from"] == "A" and standard["to"] == "B"
    assert standard["tas_kt"] == pytest.approx(100.0) and standard["oat_c"] is None
    assert standard["groundspeed_kt"] == pytest.approx(120.0, abs=0.01)
    warm = _leg_with_wind(monkeypatch, 270, 20, oat_c=18.0)
    assert warm["density_altitude_ft"] > 7500 and warm["oat_c"] == 18.0
