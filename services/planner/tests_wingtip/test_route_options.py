"""wingtip.route_options: the ways round storms, weather under the pilot's
minimums, prohibited airspace and high ground, with the fuel stops -- the
engine's (route_options, engine/crates/route/src/route/options.rs, whose
own tests hold the grid's measures and the naming of the kinds), asked on
what the planner reads, here put in by each test."""

import time

import numpy as np
import pytest
from shapely.geometry import Polygon

from wingtip import fixes, route_options, sua, terrain_detour, water

from .route_options_world import DEP, DEST, NO_FIELDS, PROFILE, nearest_nm, taf
from .route_options_world import sky  # noqa: F401 -- the fixture the tests take by name


def test_a_clear_day_is_the_straight_line_for_every_kind(sky):  # noqa: F811
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    assert len(out["options"]) == 1
    only = out["options"][0]
    assert only["stops"] == [] and only["landings"] == 0
    assert only["kinds"] == ["fastest", "weather", "stops", "land"]
    assert out["direct"] == []
    assert only["distance_nm"] == pytest.approx(240, abs=2)


def test_a_thunderstorm_on_the_line_is_gone_round_by_twenty_miles(sky):  # noqa: F811
    sky["tafs"].append(taf("STRM", 0.0, 2.0, wx="TSRA"))
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    names = [out["hazards"][i]["name"] for i in out["direct"]]
    assert names == ["Thunderstorms forecast at STRM"]
    fastest = out["options"][0]
    assert fastest["stops"], "a way round needs a turn"
    assert fastest["crosses"] == []
    # AIM 7-1-27's 20 miles, less the grid's half cell.
    assert nearest_nm(fastest["path"], 0.0, 2.0) >= 20.0 - 8


def test_the_pilots_minimums_close_what_the_rules_alone_would_not(sky):  # noqa: F811
    # A 2,500 ft ceiling: legal (91.155) but under a 3,000 ft personal minimum.
    sky["tafs"].append(taf("LOWW", 0.0, 2.0, ceiling=2500))
    legal = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    assert legal["direct"] == []
    # Marginal (MVFR), so the best weather's way keeps off it where the fastest does not.
    fastest = next(o for o in legal["options"] if "fastest" in o["kinds"])
    best = next(o for o in legal["options"] if "weather" in o["kinds"])
    assert fastest["stops"] == [] and fastest["marginal"]
    assert best is not fastest and best["marginal"] == []
    personal = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS, min_ceiling_ft=3000)
    assert [personal["hazards"][i]["kind"] for i in personal["direct"]] == ["weather"]
    assert all(o["crosses"] == [] for o in personal["options"])


def test_a_ceiling_forecast_with_no_height_is_marked_not_passed_as_vfr(sky):  # noqa: F811
    """OVC/// with ten miles (the AWC's layer with no base): a ceiling not
    known (14 CFR 1.1), so the field is marked as marginal weather is, not
    left as the clear day it would read as with no ceiling."""
    station = taf("UNKN", 0.0, 2.0, visibility=10.0)
    station["fcsts"][0].update(ceiling_ft=None, ceiling_unknown=True)
    sky["tafs"].append(station)
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    fastest = next(o for o in out["options"] if "fastest" in o["kinds"])
    marked = [out["hazards"][i]["name"] for i in fastest["marginal"]]
    assert marked == ["UNKN forecast marginal (ceiling of unknown height, visibility 10 sm)"]


def test_minimums_never_go_under_the_rules(sky):  # noqa: F811
    sky["tafs"].append(taf("FOGG", 0.0, 2.0, ceiling=800))
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS, min_ceiling_ft=500)
    assert [out["hazards"][i]["kind"] for i in out["direct"]] == ["weather"]


def test_a_prohibited_area_is_gone_round(monkeypatch, sky):  # noqa: F811
    box = Polygon([(1.8, -0.2), (2.2, -0.2), (2.2, 0.2), (1.8, 0.2)])
    monkeypatch.setattr(sua, "areas_in", lambda bbox: [({"name": "P-99", "type": "P"}, box)])
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    assert [out["hazards"][i]["name"] for i in out["direct"]] == ["Prohibited area P-99"]
    assert out["options"][0]["crosses"] == []


def test_the_destinations_own_weather_is_said_not_gone_round(sky):  # noqa: F811
    sky["tafs"].append(taf("BBB", 0.0, 4.0, ceiling=300, visibility=1))
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    assert [out["hazards"][i]["name"] for i in out["ends"]] == ["BBB forecast under minimums (ceiling 300 ft, visibility 1 sm)"]
    assert out["options"][0]["crosses"] == []


def test_the_pilots_own_route_is_kept_and_what_it_crosses_said(sky):  # noqa: F811
    sky["tafs"].append(taf("STRM", 0.0, 2.0, wx="TSRA"))
    through = [(0.0, 0.0), (0.0, 2.0), (0.0, 4.0)]
    round_it = [(0.0, 0.0), (1.0, 2.0), (0.0, 4.0)]
    crossing = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS, current=through)
    assert [crossing["hazards"][i]["name"] for i in crossing["current"]] == ["Thunderstorms forecast at STRM"]
    clear = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS, current=round_it)
    assert clear["current"] == []


def test_an_ifr_g_airmet_between_the_fields_is_gone_round(sky):  # noqa: F811
    sky["gairmets"].append(
        {
            "hazard": "IFR conditions",
            "valid": time.time(),
            "altitude_low_ft": None,
            "coords": [(-0.3, 1.7), (0.3, 1.7), (0.3, 2.3), (-0.3, 2.3)],
        }
    )
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    assert [out["hazards"][i]["name"] for i in out["direct"]] == ["G-AIRMET for IFR conditions"]
    assert out["options"][0]["crosses"] == []


def test_where_nothing_keeps_clear_the_way_crossing_least_is_offered_with_what_it_crosses(monkeypatch, sky):  # noqa: F811
    # A wall of high ground across the whole grid, over the airplane's reach.
    monkeypatch.setattr(terrain_detour, "heights_ft", lambda lats, lons: np.where(np.abs(lons - 2.0) < 0.3, 20000.0, 0.0))
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    assert out["options"], "a way is offered all the same"
    crossing = out["options"][0]
    assert [out["hazards"][i]["kind"] for i in crossing["crosses"]] == ["terrain"]
    # The engine's most turns a pilot would fly (MAX_TURNS).
    assert len(crossing["stops"]) <= 8


def test_each_way_says_the_weather_it_meets_its_wind_and_its_floor(sky):  # noqa: F811
    sky["tafs"].append(taf("LOWW", 0.0, 2.0, ceiling=2500))
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    fastest = next(o for o in out["options"] if "fastest" in o["kinds"])
    kinds = [b["kind"] for b in fastest["bands"]]
    assert kinds == ["vfr", "mvfr", "vfr"]
    assert sum(b["min"] for b in fastest["bands"]) == pytest.approx(fastest["air_min"], rel=0.05)
    assert fastest["tail_kt"] == 0.0  # no wind in this sky
    # Flat ground at sea level: 91.119's 1,000 ft alone, the coarse read's
    # own margin kept by the planner, not told.
    assert fastest["floor_ft"] == 1000
    assert [b["kind"] for b in out["current_along"]["bands"]] == ["vfr", "mvfr", "vfr"]


def test_a_turn_with_no_fix_near_is_a_position_of_the_pilots_own(monkeypatch, sky):  # noqa: F811
    sky["tafs"].append(taf("STRM", 0.0, 2.0, wx="TSRA"))
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    way = out["options"][0]
    assert way["stops"], "the way round the storm turns somewhere"
    assert all(s.startswith("@") for s in way["stops"])


def test_terrain_that_cannot_be_read_is_said_not_fatal(monkeypatch, sky):  # noqa: F811
    def down(lats, lons):
        raise OSError("tiles unreachable")

    monkeypatch.setattr(terrain_detour, "heights_ft", down)
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    assert "terrain" in out["unchecked"]
    assert out["options"]


def test_the_floor_told_is_the_ground_with_its_thousand_feet_alone(sky):  # noqa: F811
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    # Sea level everywhere: 91.119's 1,000 ft, not the coarse read's margin too.
    assert out["options"][0]["floor_ft"] == 1000


def test_the_pilots_own_route_is_given_as_a_path_for_the_map(sky):  # noqa: F811
    current = [(0.0, 0.0), (1.0, 2.0), (0.0, 4.0)]
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS, current=current)
    assert out["current_path"] == [[0.0, 0.0], [1.0, 2.0], [0.0, 4.0]]
    straight = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    assert straight["current_path"] == [[0.0, 0.0], [0.0, 4.0]]


def test_the_way_over_land_goes_round_a_lake_out_of_glide_of_the_shore(monkeypatch, sky):  # noqa: F811
    # A lake 1.6 degrees across (96 nm) across the straight line, a band of
    # land to the north of it: the fastest crosses it, the way over land
    # keeps within a glide of the shore (the owner's ask, 2026-10-25).
    def lake(lats, lons):
        return (np.abs(np.asarray(lons) - 2.0) < 0.8) & (np.asarray(lats) < 1.2)

    monkeypatch.setattr(water, "is_water", lake)
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    fastest = next(o for o in out["options"] if "fastest" in o["kinds"])
    land = next(o for o in out["options"] if "land" in o["kinds"])
    assert fastest["water_nm"] > 60
    assert land["water_nm"] < fastest["water_nm"] / 4
    assert land is not fastest and land["air_min"] > fastest["air_min"]


def test_water_that_cannot_be_read_is_said_not_fatal(monkeypatch, sky):  # noqa: F811
    def down(lats, lons):
        raise water.WaterUnavailable("no shores")

    monkeypatch.setattr(water, "is_water", down)
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    assert "water" in out["unchecked"] and out["options"]


def test_the_options_judge_water_from_the_lowest_cruise_and_the_airplanes_speed(monkeypatch, sky):  # noqa: F811
    seen = {}

    def spy(lat0, lon0, rows, cols, cell, height_ft, speed_kt, glide_ratio=None):
        seen.update(height_ft=height_ft, speed_kt=speed_kt)
        per = int(round(cell / water.STEP_DEG))
        return np.zeros((rows * per, cols * per), dtype=bool)

    monkeypatch.setattr(water, "out_of_glide_samples", spy)
    route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    # The engine's lowest cruise, 2,500 ft (LOWEST_CRUISE_FT).
    assert seen["height_ft"] == 2500.0
    assert seen["speed_kt"] > 40.0


def test_a_turn_is_made_at_a_fix_nearby_where_one_keeps_the_way(monkeypatch, sky):  # noqa: F811
    # A storm on the straight line, so the way turns; a GPS waypoint 3 nm
    # off where it turns, away from the storm, is loaded instead of a point of the pilot's own
    # (the owner's "Isn't there a gps fix nearby ... that we can use?").
    sky["tafs"].append(taf("STRM", 0.0, 2.0, wx="TSRA"))
    first = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    way = first["options"][0]
    turn = way["path"][1]
    # On the storm's far side of the turn: one nearer it would close the way.
    away = -0.05 if turn[0] < 0 else 0.05
    fix = {"ident": "BUCKY", "lat": turn[0] + away, "lon": turn[1], "kind": "fix"}

    def within(south, west, north, east):
        return [fix] if south <= fix["lat"] <= north and west <= fix["lon"] <= east else []

    monkeypatch.setattr(fixes, "within", within)
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    snapped = out["options"][0]
    assert "BUCKY" in snapped["stops"]
    assert [fix["lat"], fix["lon"]] in snapped["path"]
    assert snapped["crosses"] == way["crosses"]


def test_a_fix_that_would_take_the_way_into_the_storm_is_not_turned_at(monkeypatch, sky):  # noqa: F811
    sky["tafs"].append(taf("STRM", 0.0, 2.0, wx="TSRA"))
    turn = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)["options"][0]["path"][1]
    # Toward the storm's middle, 7 nm: inside its 20 nm.
    toward = 0.12 if turn[0] < 0 else -0.12
    fix = {"ident": "STORM", "lat": turn[0] + toward, "lon": turn[1], "kind": "fix"}

    def within(south, west, north, east):
        return [fix] if south <= fix["lat"] <= north and west <= fix["lon"] <= east else []

    monkeypatch.setattr(fixes, "within", within)
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    assert "STORM" not in out["options"][0]["stops"]
