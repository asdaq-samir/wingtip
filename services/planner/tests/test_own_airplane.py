"""A pilot's own airplane of no stock type ("own"): planned on its record's
figures alone, never a Cessna 172's under them (the owner, 2026-11-09)."""

import pytest
from wingtip.aircraft import load_aircraft_profile
from wingtip.planning import OWN_AIRPLANE, UnknownAircraft, aircraft_profile


def test_an_own_airplane_carries_only_its_own_figures():
    own = aircraft_profile(OWN_AIRPLANE, cruise_tas_kt=120.0, fuel_burn_gph=9.0)
    assert own["cruise_tas_kt"] == 120.0 and own["fuel_burn_gph"] == 9.0
    # Nothing of any stock profile: no ceiling, climb, taxi, glide or loading.
    c172 = load_aircraft_profile("c172")
    for key in ("service_ceiling_ft", "climb_rate_fpm_sea_level", "climb_tas_kt", "taxi_fuel_gal", "glide", "loading", "takeoff"):
        assert key not in own, key
        assert key in c172, key


def test_an_own_airplanes_record_figures_are_its_profile():
    own = aircraft_profile(
        OWN_AIRPLANE,
        cruise_tas_kt=120.0,
        fuel_burn_gph=9.0,
        service_ceiling_ft=13000.0,
        climb_tas_kt=75.0,
        climb_rate_fpm=650.0,
        taxi_fuel_gal=1.1,
        glide_ratio=8.5,
    )
    assert own["service_ceiling_ft"] == 13000.0
    assert own["climb_rate_fpm_sea_level"] == 650.0
    assert own["taxi_fuel_gal"] == 1.1
    assert own["glide"] == {"ratio": 8.5}


def test_an_own_airplane_needs_its_cruise_speed_and_burn():
    with pytest.raises(UnknownAircraft):
        aircraft_profile(OWN_AIRPLANE, cruise_tas_kt=120.0)


def test_a_pilots_glide_over_a_stock_profile_keeps_its_best_glide_speed():
    mine = aircraft_profile("c172", glide_ratio=8.0)
    assert mine["glide"]["ratio"] == 8.0
    assert mine["glide"]["best_glide_kias"] == load_aircraft_profile("c172")["glide"]["best_glide_kias"]


def test_a_profile_with_no_ceiling_has_no_ceiling_in_the_altitude_band():
    from wingtip.altitude import _service_ceiling_ft

    own = aircraft_profile(OWN_AIRPLANE, cruise_tas_kt=120.0, fuel_burn_gph=9.0)
    assert _service_ceiling_ft(own, (43.0, -89.0), (44.0, -90.0), "06", temperatures=False) is None


def test_an_own_airplanes_emergency_glide_is_its_ratio_alone():
    from app.routers.emergency import _airplane

    own = _airplane(OWN_AIRPLANE, 8.5)
    assert own["glide"] == {"ratio": 8.5}
    assert "landing" not in own and "crosswind" not in own
    assert _airplane(OWN_AIRPLANE, None)["glide"] is None
    # A pilot's ratio over a stock profile keeps its book's best-glide speed.
    c172 = _airplane("c172", 8.0)
    assert c172["glide"]["ratio"] == 8.0
    assert c172["glide"]["best_glide_kias"] == load_aircraft_profile("c172")["glide"]["best_glide_kias"]
