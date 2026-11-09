"""app.gonogo.weight_balance and app.gonogo.runways, with
apps/web/src/lib/weightBalance.test.ts's, runwayCheck.test.ts's and
runwayFlown.test.ts's cases, on the stock profile itself
(data/aircraft/c172.json, the 172S's POH figures)."""

import pytest
from wingtip.aircraft import load_aircraft_profile

from app.gonogo import ask
from app.gonogo.runways import runway_checks
from app.gonogo.weight_balance import balance, default_load


# The engine's names runway_checks asks inside the engine,
# asked by name as the native app's Go / No-Go would.
def soft_surface(runway: dict | None) -> bool:
    return ask("gonogo_soft_surface", surface=(runway or {}).get("surface"))


def picked_end(picks: dict | None, ident: str, kind: str, departure: bool) -> str | None:
    return ask("gonogo_picked_end", picks=picks or None, ident=ident, kind=kind, departure=departure)


C172 = {"name": "c172", **load_aircraft_profile("c172")}
LOADING = C172["loading"]


def test_the_pohs_own_sample_loading_weighs_2550_lb_at_takeoff_within_the_envelope():
    # Figure 6-5's sample: empty 1,642 lb at 62.6 (thousand lb-in), 30 gal,
    # 340 lb in front, 340 behind, 56 lb of baggage in area 1 at its arm of 95 in.
    b = balance(LOADING, {"empty_weight_lb": 1642, "empty_arm_in": 62600 / 1642, "stations_lb": [340, 340, 56, 0], "fuel_gal": 30}, 0)
    assert b["takeoff"]["weight_lb"] == 2550
    assert b["takeoff"]["arm_in"] == pytest.approx((62600 + 180 * 48 + 340 * 37 + 340 * 73 + 56 * 95 - 8 * 48) / 2550, abs=1e-6)
    assert b["problems"] == []


def test_over_its_weight_and_the_baggage_over_its_own():
    b = balance(LOADING, {"empty_weight_lb": 1642, "empty_arm_in": 38.1, "stations_lb": [170, 400, 120, 50], "fuel_gal": 53}, 10)
    assert "The takeoff weight, 2,692 lb, is 142 lb over its most" in b["problems"]
    assert "The baggage, 170 lb in all, is over its 120 lb" in b["problems"]


def test_the_default_load_is_the_sample_airplane_and_a_pilot():
    assert default_load(LOADING, 40) == {"empty_weight_lb": 1642, "empty_arm_in": 38.12, "stations_lb": [170, 0, 0, 0], "fuel_gal": 40}


def test_takes_turf_grass_dirt_and_gravel_as_soft_and_asphalt_not():
    assert [soft_surface({"surface": s}) for s in ["TURF", "GRS", "grass", "DIRT", "GRAVEL-G"]] == [True] * 5
    assert soft_surface({"surface": "ASPH-G"}) is False
    assert soft_surface(None) is False


def runway(length: int, headwind: float, crosswind: float, **extra) -> dict:
    return {
        "ends": "09/27",
        "length_ft": length,
        "width_ft": 75,
        "surface": "ASP",
        "lighted": True,
        "closed": False,
        "runway_ends": [],
        "wind": {"end": "27", "headwind_kt": headwind, "crosswind_kt": crosswind},
        **extra,
    }


FIELDS = [{"ident": "C81", "elevation_ft": 900}, {"ident": "KDLH", "elevation_ft": 1400}]
BRIEFING = {
    "metars": {"C81": {"temp_c": 30, "altimeter_in_hg": 29.92}, "KDLH": None},
    "airports": {"C81": {"runways": [runway(1500, 2, 18)]}, "KDLH": {"runways": [runway(9000, 10, 3), runway(12000, 0, 0, closed=True)]}},
}


def test_takes_off_from_the_departure_and_lands_at_the_destination_on_the_runway_the_wind_favours():
    start, end = runway_checks(C172, BRIEFING, FIELDS, 2550, 2400)
    assert start["role"] == "Departure"
    assert [d["kind"] for d in start["distances"]] == ["takeoff"]
    assert [d["kind"] for d in end["distances"]] == ["landing"]
    # A closed runway is not one to land on, however long.
    assert end["runway"]["length_ft"] == 9000
    assert end["reported"] is False


def test_says_a_runway_too_short_and_a_crosswind_past_the_172s_demonstrated_15_kt():
    start, end = runway_checks(C172, BRIEFING, FIELDS, 2550, 2400)
    assert start["distances"][0]["over"] is True
    assert start["crosswind_kt"] == 18
    assert start["crosswind_over"] is True
    assert start["density_alt_ft"] > start["pressure_alt_ft"]
    assert end["distances"][0]["over"] is False
    assert end["crosswind_over"] is False


def ends(a: str, b: str) -> list[dict]:
    return [{"ident": a, "heading_true_deg": 0}, {"ident": b, "heading_true_deg": 180}]


def test_checks_the_runway_the_pilot_picked_whatever_the_wind_with_the_wind_on_the_end_picked():
    # KDLH: a long runway into the wind, and a short one the pilot picked.
    picked = {
        **BRIEFING,
        "airports": {
            **BRIEFING["airports"],
            "KDLH": {
                "runways": [
                    runway(9000, 10, 3, ends="09/27", runway_ends=ends("09", "27")),
                    runway(1200, 8, 0, ends="18/36", runway_ends=ends("18", "36"), wind={"end": "36", "headwind_kt": 8, "crosswind_kt": 0}),
                ]
            },
        },
    }
    into = runway_checks(C172, picked, FIELDS, 2550, 2400)[1]
    assert [into["end"], into["picked"], into["distances"][0]["over"]] == ["27", False, False]
    flown = runway_checks(C172, picked, FIELDS, 2550, 2400, {"pattern": {"KDLH": "18"}, "takeoff": {}})[1]
    # 18 is the far end of the wind's 36: its headwind is a tailwind.
    assert [flown["end"], flown["picked"], flown["headwind_kt"], flown["runway"]["length_ft"]] == ["18", True, -8, 1200]
    assert flown["distances"][0]["over"] is True


def test_is_not_worked_out_without_the_pohs_tables():
    assert runway_checks({**C172, "takeoff": None}, BRIEFING, FIELDS, 2550, 2400) == []


PICKS = {"pattern": {"C81": "24", "UES": "10", "KDLH": "NONE"}, "takeoff": {"UES": "28"}}


def test_picked_end_the_departures_runway_out_and_every_fields_runway_in_from_pattern_a_stops_runway_out_from_takeoff():
    assert picked_end(PICKS, "C81", "takeoff", True) == "24"
    assert picked_end(PICKS, "UES", "landing", False) == "10"
    assert picked_end(PICKS, "UES", "takeoff", False) == "28"


def test_picked_end_by_the_fields_icao_or_faa_ident_alike_none_for_no_pick_or_the_pilots_none():
    assert picked_end(PICKS, "KUES", "landing", False) == "10"
    assert picked_end(PICKS, "KDLH", "landing", False) is None
    assert picked_end(PICKS, "KMSN", "landing", False) is None
    assert picked_end(None, "C81", "takeoff", True) is None


def test_picked_end_matches_a_field_as_the_web_does_trimmed_any_case_k_only_before_three():
    # lib/procedures sameField: trimmed, upper-cased, a K taken off only
    # before three letters or figures.
    picks = {"pattern": {" kues ": "10", "K-1A": "5"}, "takeoff": {}}
    assert picked_end(picks, "UES", "landing", False) == "10"
    assert picked_end(picks, "KUES", "landing", False) == "10"
    assert picked_end(picks, "-1A", "landing", False) is None
    assert picked_end(picks, "K-1A", "landing", False) == "5"


def test_a_variable_wind_with_no_runway_component_is_all_crosswind_gusts_included():
    # runwayCheck.ts: VRB (AIM 7-1-28) gives the runways no wind, and all of
    # it may be across -- past the 172's demonstrated 15 kt, a caution.
    vrb = {
        **BRIEFING,
        "metars": {
            "C81": {"temp_c": 15, "altimeter_in_hg": 29.92, "wind_dir_true_deg": None, "wind_speed_kt": 12, "wind_gust_kt": 22},
            "KDLH": None,
        },
        "airports": {**BRIEFING["airports"], "C81": {"runways": [runway(5000, 0, 0, wind=None)]}},
    }
    start = runway_checks(C172, vrb, FIELDS, 2550, 2400)[0]
    assert (start["crosswind_kt"], start["crosswind_over"], start["headwind_kt"]) == (22, True, 0)
    # A wind with a direction gives every runway its components: none here.
    steady = {**vrb, "metars": {"C81": {**vrb["metars"]["C81"], "wind_dir_true_deg": 270}}}
    assert runway_checks(C172, steady, FIELDS, 2550, 2400)[0]["crosswind_kt"] == 0
