"""The flight's figures -- the wind triangle, 14 CFR 91.159's cruising
altitudes, 91.151's reserve, the atmosphere, WMM-2025 variation and when
offline weather expires -- are the engine's (wingtip_engine::flight, wmm,
validity), one copy for the planner and the phones. Held here to the
shared fixture the web and the iOS app are held to too
(apps/web/src/lib/fixtures/flightRules.json), and the variation to pygeomag,
the model's Python, at points round the world."""

import json
import random
from datetime import date
from pathlib import Path

import pytest
from pygeomag import GeoMag

from wingtip import navlog, performance
from wingtip.engine import ask as engine
from wingtip.magnetic import magnetic_variation_deg

FIXTURE = json.loads((Path(__file__).parents[3] / "apps/web/src/lib/fixtures/flightRules.json").read_text())


@pytest.mark.parametrize("case", FIXTURE["windTriangle"], ids=lambda c: f"{c['tc']}-{c['windFrom']}@{c['windKt']}")
def test_the_wind_triangle_is_the_fixtures(case):
    got = engine("wind_triangle", tc=case["tc"], tas=case["tas"], wind_from_deg=case["windFrom"], wind_kt=case["windKt"])
    got = None if got is None else (got["wca"], got["th"], got["gs"])
    want = case["expected"]
    if want is None:
        assert got is None
        return
    assert got == pytest.approx((want["wca"], want["th"], want["gs"]), abs=1e-9)
    # The nav log's own groundspeed agrees with it where a heading holds.
    sides = {"true_course_deg": case["tc"], "wind_from_deg": case["windFrom"], "wind_kt": case["windKt"], "tas_kt": case["tas"]}
    assert engine("groundspeed_kt", **sides, wca_deg=want["wca"]) == pytest.approx(want["gs"], abs=1e-9)


@pytest.mark.parametrize("case", FIXTURE["cruisingAltitude"], ids=lambda c: f"{c['floorFt']}@{c['courseDeg']}")
def test_cruising_altitudes_are_91_159s(case):
    assert engine("lowest_vfr_cruising_altitude", floor_ft=case["floorFt"], magnetic_course_deg=case["courseDeg"]) == case["altitudeFt"]
    assert engine("is_eastbound", magnetic_course_deg=case["courseDeg"]) == case["eastbound"]


def test_the_reserves_are_91_151s_and_91_167s():
    for case in FIXTURE["reserve"]:
        assert engine("reserve_min", ifr=case["ifr"], night=case["night"]) == case["minutes"]
    assert (navlog.DAY_RESERVE_MIN, navlog.NIGHT_RESERVE_MIN) == (30.0, 45.0)


def test_density_and_pressure_altitude():
    for case in FIXTURE["densityAltitude"]:
        sigma = performance.density_ratio(case["pressureAltitudeFt"], case["oatC"])
        assert performance.density_altitude_ft(sigma) == pytest.approx(case["densityAltitudeFt"], abs=1e-6)
    for case in FIXTURE["pressureAltitude"]:
        got = engine("pressure_altitude_ft", elevation_ft=case["elevationFt"], altimeter_inhg=case["altimeterInHg"])
        # The handbook's table (FAA-H-8083-25C Figure 11-3) is whole feet off
        # the standard atmosphere: within 2 ft.
        assert got == pytest.approx(case["pressureAltitudeFt"], abs=2.0)


@pytest.mark.parametrize("case", FIXTURE["declination"], ids=lambda c: f"{c['lat']},{c['lon']}@{c['year']}")
def test_variation_is_the_fixtures(case):
    assert engine("magnetic_variation", lat=case["lat"], lon=case["lon"], year=case["year"]) == pytest.approx(case["deg"], abs=1e-9)


def test_variation_is_pygeomags_round_the_world():
    model = GeoMag()
    first, last = model.life_span
    rng = random.Random(11)
    for _ in range(2000):
        lat, lon, year = rng.uniform(-89.9, 89.9), rng.uniform(-180, 180), rng.uniform(2024, 2031)
        want = model.calculate(glat=lat, glon=lon, alt=0, time=min(max(year, first), last - 1e-6)).d
        assert engine("magnetic_variation", lat=lat, lon=lon, year=year) == pytest.approx(want, abs=1e-9)
    # And wingtip.magnetic's day is the model's decimal year.
    assert magnetic_variation_deg(46.8421, -92.1936, date(2026, 11, 2)) == pytest.approx(
        model.calculate(glat=46.8421, glon=-92.1936, alt=0, time=2026 + 305 / 365).d, abs=1e-9
    )


@pytest.mark.parametrize("case", FIXTURE["weatherInForce"], ids=lambda c: c["why"])
def test_offline_weather_counts_only_until_it_expires(case):
    got = engine(
        "weather_in_force",
        product=case["product"],
        now=case["now"],
        observed=case.get("observed"),
        last_routine=case.get("lastRoutine"),
        valid_from=case.get("validFrom"),
        valid_to=case.get("validTo"),
    )
    assert got == case["inForce"]
