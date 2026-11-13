"""The planner's rules that moved into the engine (#482 phase 0), asked
through wingtip's own functions, held to the answers its Python gave
before the move: the shared fixture apps/web/src/lib/fixtures/plannerRules.json,
which engine/facade/tests/planner_rules.rs holds the engine to by name."""

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
import wingtip_native

from wingtip import airspace_at, notams, tfr, weather
from wingtip.engine import ask as engine

FIXTURE = json.loads((Path(__file__).parents[3] / "apps/web/src/lib/fixtures/plannerRules.json").read_text())


@pytest.mark.parametrize("case", FIXTURE["airspaceColumn"])
def test_the_airspace_over_a_point_in_bands(case):
    assert airspace_at.column(41.9, -88.0, case["ground_ft"], case["volumes"], in_veil=case["in_veil"]) == case["bands"]


@pytest.mark.parametrize("case", FIXTURE["modeCVeil"])
def test_the_nearest_mode_c_veil(case):
    assert airspace_at.mode_c_veil(case["lat"], case["lon"], case["airports"]) == case["veil"]


@pytest.mark.parametrize("case", FIXTURE["notamsFns"])
def test_an_fns_messages_notams(case):
    assert notams.notams(case["text"]) == case["notams"]


@pytest.mark.parametrize("case", FIXTURE["ceiling"])
def test_a_reports_ceiling(case):
    # The weather store keeps the engine's reading (awc_tafs_read), its
    # ceiling the engine's ceiling_ft.
    asked = {"layers": case["layers"], "vert_vis_ft": case["vert_vis_ft"]}
    assert json.loads(wingtip_native.call("ceiling_ft", json.dumps(asked))) == case["ceiling_ft"]


def test_a_tfr_is_in_force_when_its_window_meets_the_span():
    # 14:00 to 16:00 against spans before, across and after it; no times
    # is in force, an open end open that way.
    at = lambda h, m=0: datetime(2026, 11, 6, h, m, tzinfo=timezone.utc)  # noqa: E731
    window = {"effective": "2026-11-06T14:00:00Z", "expires": "2026-11-06T16:00:00Z"}
    assert not tfr.in_force(window, at(12), at(13, 59))
    assert tfr.in_force(window, at(12), at(14))
    assert tfr.in_force(window, at(16), at(17))
    assert not tfr.in_force(window, at(16, 1), at(17))
    assert tfr.in_force({}, at(1), at(2))
    assert tfr.in_force({"effective": "2026-11-06T14:00:00Z"}, at(20), at(21))


def test_the_reserve_is_the_engines():
    profile = {"fuel_burn_gph": 8.0}
    # 91.151(a): 30 minutes by day, 45 at night, and 45 with no time (night
    # not ruled out); 91.167(a)(3): 45 under IFR.
    assert [
        engine("navlog_fuel_plan", total_fuel_gal=10.0, profile=profile, night=night, rules=rules)["reserve_gal"]
        for rules, night in (("vfr", False), ("vfr", None), ("vfr", True), ("ifr", False))
    ] == [4.0, 6.0, 6.0, 6.0]


def test_the_basic_vfr_minimums_are_the_engines():
    # 14 CFR 91.155(c), (d).
    assert engine("vfr_basic_minimums") == {"ceiling_ft": 1000, "visibility_sm": 3}
    assert weather.below_vfr_minimums(999, 3) and not weather.below_vfr_minimums(1000, 3)
