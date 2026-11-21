"""The flight scripts: the one kept here flies, and a script that cannot
is refused with its reason."""

import copy

import pytest
from conftest import HERE
from sim_flight import scenario
from wingtip.units import M_PER_FT, M_PER_NM

FLIGHT = HERE / "flights" / "kmsn-kosh-r36.json"


def test_the_kept_flight_reads_and_starts_and_ends_on_a_runway():
    scn = scenario.load(FLIGHT)
    assert scn["points"][0]["ground"] and scn["points"][-1]["ground"]
    assert scn["plan"].startswith("/app/plan?")


def test_the_plugins_file_is_metric_with_the_places_resolved():
    out = scenario.for_plugin(scenario.load(FLIGHT), "path", ("127.0.0.1", 49010))
    climb = next(p for p in out["points"] if p["name"] == "Climb-out")
    assert climb["alt_m"] == pytest.approx(5500 * M_PER_FT)
    assert (climb["toward_lat"], climb["fraction"]) == (43.148042, 1.0)
    assert out["climb_mps"] == pytest.approx(700 * M_PER_FT / 60)
    assert out["autopilot"] is None  # flown on the path
    assert out["traffic"][0]["ahead_m"] == pytest.approx(4 * M_PER_NM)
    assert out["feed"] == {"host": "127.0.0.1", "port": 49010}


def test_flown_on_the_autopilot_the_file_says_where_it_takes_over():
    out = scenario.for_plugin(scenario.load(FLIGHT), "autopilot", ("127.0.0.1", 49010))
    assert out["autopilot"] == {"from": "Climb-out", "to": "JUMVO"}


def test_the_test_reads_the_plan_the_points_and_what_to_expect():
    seen = scenario.for_test(scenario.load(FLIGHT))
    assert [p["name"] for p in seen["points"]][:2] == ["KMSN 36", "Lift-off"]
    assert seen["traffic"] == ["N4SIM"]
    assert seen["expect"]["landings"] == 1


def broken(change):
    bad = copy.deepcopy(scenario.load(FLIGHT))
    change(bad)
    return bad


@pytest.mark.parametrize(
    "change, why",
    [
        (lambda s: s["points"][3].update(phase="cruise"), "phase is one of"),
        (lambda s: s["points"][3].update(name="KMSN 36"), "a name of its own"),
        (lambda s: s["points"][3].pop("alt_ft"), "alt_ft, or on the ground"),
        (lambda s: s["points"][1].update(at="KXYZ 01"), "no place"),
        (lambda s: s["points"][-1].update(ground=False, alt_ft=900), "ends on the ground"),
        (lambda s: s.update(autopilot={"from": "JUMVO", "to": "Climb-out"}), "hands back after"),
        (lambda s: s["traffic"][0].update(after="Nowhere"), "after names a point"),
    ],
)
def test_a_script_that_cannot_be_flown_is_refused(change, why):
    with pytest.raises(scenario.ScenarioError, match=why):
        scenario.check(broken(change))
