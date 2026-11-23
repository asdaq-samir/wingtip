"""The flight scripts: the one kept here flies, and a script that cannot
is refused with its reason."""

import copy
import math

import pytest
from conftest import HERE
from sim_flight import scenario
from wingtip.units import M_PER_FT, M_PER_NM

FLIGHT = HERE / "flights" / "kmsn-kosh-r36.json"
SEATTLE = HERE / "flights" / "kbfi-kpae-rnav.json"
FLIGHTS = sorted((HERE / "flights").glob("*.json"))


@pytest.mark.parametrize("path", FLIGHTS, ids=lambda p: p.stem)
def test_every_kept_flight_reads_and_names_each_airplane_once(path):
    scn = scenario.load(path)
    idents = [scn["own"]["callsign"]] + [t["callsign"] for t in scn["traffic"]]
    assert len(set(idents)) == len(idents) == 2
    assert scenario.for_plugin(scn, "path", ("127.0.0.1", 49010))["traffic"][0]["callsign"] == "N4SIM"


def test_the_default_flight_is_the_one_the_x_plane_demo_can_fly():
    runner = (HERE.parents[1] / "scripts" / "dev" / "sim-flight.sh").read_text()
    assert "flights/kbfi-kpae-rnav.json}" in runner
    assert scenario.load(SEATTLE)["scenery"]["tiles"] == ["+47-123"]


def test_the_seattle_flight_flies_the_rnav_34l_from_raryo_to_paine_field():
    scn = scenario.load(SEATTLE)
    assert scn["plan"] == "/app/plan?dep=KBFI&dest=KPAE&procs=KPAE:R34L"
    fixes = {p["name"]: p for p in scn["points"] if "lat" in p}
    # The CIFP's legs: RARYO 3,000, USDAW (FAF) at or above 2,000, ZEREN 1,160, the threshold 629.
    assert {k: v["alt_ft"] for k, v in fixes.items()} == {"RARYO": 3000, "USDAW": 2000, "ZEREN": 1160}
    threshold = next(p for p in scn["points"] if p["name"] == "KPAE 34L")
    assert threshold["alt_ft"] == 629
    assert scn["expect"]["checkpoints"] == ["RARYO", "USDAW", "ZEREN", "KPAE"]
    assert [(a["class"], a["name"]) for a in scn["expect"]["alerts"]] == [("B", "SEATTLE"), ("D", "EVERETT")]
    assert scn["expect"]["route_has"] == ["BFI", "PAE"]


def test_the_seattle_flight_descends_no_steeper_than_its_rate_allows():
    out = scenario.for_plugin(scenario.load(SEATTLE), "path", ("127.0.0.1", 49010))
    pts = [p for p in out["points"] if not p["ground"]]
    for a, b in zip(pts, pts[1:]):
        drop_m = a["alt_m"] - b["alt_m"]
        if drop_m <= 0:
            continue
        # The leg's length, flat earth over a few miles, and its time at the slower end's speed.
        dy = (b["lat"] - a["lat"]) * 60 * M_PER_NM
        dx = (b["lon"] - a["lon"]) * 60 * M_PER_NM * math.cos(math.radians(a["lat"]))
        seconds = math.hypot(dx, dy) / min(a["speed_mps"], b["speed_mps"])
        assert drop_m / seconds <= out["descent_mps"], f"{a['name']} to {b['name']}"


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
        (lambda s: s["traffic"][0].update(callsign="N1SIM"), "a hex and callsign of its own"),
        (lambda s: s["traffic"][0].update(hex="F0F0F0"), "a hex and callsign of its own"),
        (lambda s: s["own"].pop("callsign"), "own: hex"),
        (lambda s: s.pop("start"), "start, where"),
        (lambda s: s.update(scenery={"tiles": ["+47-123"]}), "not the scenery.s"),
    ],
)
def test_a_script_that_cannot_be_flown_is_refused(change, why):
    with pytest.raises(scenario.ScenarioError, match=why):
        scenario.check(broken(change))
