"""wingtip.route_options' fuel stops: where the airplane lands with its
reserve, the kind of field that is landed at, the stops put in among the
pilot's own points, and the weather and the meals at the fields chosen.
The ways round storms are test_route_options's."""

from wingtip import route_options, weather

from .route_options_world import DEP, DEST, NO_FIELDS, PROFILE, fields, taf
from .route_options_world import sky  # noqa: F401 -- the fixture the tests take by name


def test_fuel_stops_land_with_the_reserve_and_the_fewest_kind_lands_least(sky):  # noqa: F811
    # 600 nm at 120 kt is 5 h, 50 gal; the tanks hold 49 less 5 of
    # reserve (30 minutes by day, 91.151), 4.4 h or 528 nm.
    dest = {"ident": "CCC", "lat": 0.0, "lon": 10.0}
    table = fields(*[(f"F{k}", 0.0, float(k)) for k in range(1, 10)])
    out = route_options.options(DEP, dest, PROFILE, fields=table)
    fastest = next(o for o in out["options"] if "fastest" in o["kinds"])
    assert fastest["landings"] >= 1
    assert set(fastest["fuel"]) <= set(fastest["stops"])
    # Each flight between landings within the tanks.
    ends = [0.0] + [float(f[1:]) for f in fastest["fuel"]] + [10.0]
    assert all((b - a) * 60 <= 528 + 1 for a, b in zip(ends, ends[1:]))
    fewest = next(o for o in out["options"] if "stops" in o["kinds"])
    assert fewest["landings"] <= fastest["landings"]


def test_the_pilots_own_route_gets_its_fuel_stops_put_in_among_its_points(sky):  # noqa: F811
    dest = {"ident": "CCC", "lat": 0.0, "lon": 10.0}
    table = fields(*[(f"F{k}", 0.0, float(k)) for k in range(1, 10)])
    # The pilot's route through their own point at 2 degrees east.
    current = [(0.0, 0.0), (0.0, 2.0), (0.0, 10.0)]
    out = route_options.options(DEP, dest, PROFILE, fields=table, current=current, current_idents=["MINE"])
    own = out["own"]
    assert own["kind"] == "own" and own["landings"] >= 1
    assert own["stops"][0] == "MINE"
    assert set(own["fuel"]) < set(own["stops"])
    # In order along it: each fuel stop east of the one before.
    east = [float(s[1:]) for s in own["stops"][1:]]
    assert east == sorted(east)


def test_a_landing_the_pilot_makes_is_a_refuel_not_a_stop_to_add(sky):  # noqa: F811
    # Two hops of 300 nm in tanks for 400: each is flown on its own, so no
    # fuel stop is needed -- and the field landed at was offered as the
    # stop to add, twice over in the route (the audit of 2026-10-24).
    dest = {"ident": "CCC", "lat": 0.0, "lon": 10.0}
    table = fields(("MID", 0.0, 5.0), *[(f"F{k}", 0.0, float(k)) for k in (2, 3, 7, 8)])
    current = [(0.0, 0.0), (0.0, 5.0), (0.0, 10.0)]
    out = route_options.options(DEP, dest, PROFILE, fields=table, current=current, current_idents=["MID"], current_landed=[True])
    own = out["own"]
    assert own["stops"] == ["MID"]
    assert own["fuel"] == []
    # Its landing counted, with the owner's 30 minutes on the ground.
    assert own["landings"] == 1 and own["ground_min"] == 30.0
    # Flown over instead (a fix), the whole 600 nm is one flight that needs a stop.
    over = route_options.options(DEP, dest, PROFILE, fields=table, current=current, current_idents=["MINE"], current_landed=[False])
    assert over["own"]["fuel"], "a stop is needed when nothing is landed at"
    assert "MINE" not in over["own"]["fuel"]


def test_a_way_no_fuel_field_reaches_is_offered_with_that_said(sky):  # noqa: F811
    # 600 nm in tanks for 400 and no field at all: the way is offered, the
    # want of fuel one of the things it meets, never dropped.
    dest = {"ident": "CCC", "lat": 0.0, "lon": 10.0}
    out = route_options.options(DEP, dest, PROFILE, fields=NO_FIELDS)
    assert out["options"], "offered all the same"
    kinds = {out["hazards"][i]["kind"] for i in out["options"][0]["crosses"]}
    assert "fuel" in kinds
    assert out["own"] is not None and "fuel" in {out["hazards"][i]["kind"] for i in out["own"]["crosses"]}


def test_a_fuel_stop_in_marginal_weather_gives_way_to_one_in_the_clear(sky):  # noqa: F811
    # Tanks for some 290 nm on a 600 nm flight: two stops. A field a third
    # of the way is under MVFR; one a little further on is in the clear,
    # and is landed at instead (the owner's "Or even a different fuel stop
    # to avoid weather?", 2026-10-25).
    dest = {"ident": "CCC", "lat": 0.0, "lon": 10.0}
    sky["tafs"].append(taf("WETT", 0.0, 3.0, ceiling=2500))
    table = fields(("WETT", 0.0, 3.0), ("DRYY", 0.0, 3.6), ("MIDD", 0.0, 6.5), ("LATE", 0.0, 7.0))
    small = {**PROFILE, "usable_fuel_gal": 30.0}  # some 290 nm with the reserve
    out = route_options.options(DEP, dest, small, fields=table)
    fastest = next(o for o in out["options"] if "fastest" in o["kinds"])
    assert "WETT" not in fastest["fuel"] and "DRYY" in fastest["fuel"]


def test_a_fuel_stop_whose_way_in_crosses_a_storm_is_not_landed_at(sky):  # noqa: F811
    dest = {"ident": "CCC", "lat": 0.0, "lon": 10.0}
    # A storm between the way and a field 12 nm off it.
    sky["tafs"].append(taf("STRM", 0.1, 4.0, wx="TSRA"))
    table = fields(("BEHIND", 0.2, 4.0), ("CLEAR", 0.0, 3.0), ("MIDD", 0.0, 6.5))
    out = route_options.options(DEP, dest, PROFILE, fields=table)
    for option in out["options"]:
        assert "BEHIND" not in option["fuel"]


def test_the_most_filed_route_is_flown_over_its_fixes_with_its_fuel_stops_put_in(sky):  # noqa: F811
    dest = {"ident": "CCC", "lat": 0.0, "lon": 10.0}
    table = fields(*[(f"F{k}", 0.0, float(k)) for k in range(1, 10)])
    # Filed by way of a fix a degree north of the line: the grid reaches it.
    out = route_options.options(DEP, dest, PROFILE, fields=table, filed=([(1.0, 5.0)], ["NORTH"]))
    filed = out["filed"]
    assert (filed["kind"], filed["title"]) == ("filed", "Most Filed")
    assert "NORTH" in filed["stops"] and "NORTH" not in filed["fuel"] and filed["fuel"]
    assert [1.0, 5.0] in filed["path"]
    assert route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)["filed"] is None


def test_a_fuel_stop_with_somewhere_to_eat_is_landed_at_among_chains_of_as_many_stops(sky):  # noqa: F811
    # The owner, 2026-10-27: "try to find a fuel stop that also has food
    # while still maintaining min stops". 600 nm on 528 nm of reach: one
    # stop, and of the fields that would do, the one with a meal.
    dest = {"ident": "CCC", "lat": 0.0, "lon": 10.0}
    table = fields(*[(f"F{k}", 0.0, float(k)) for k in range(1, 10)])
    out = route_options.options(DEP, dest, PROFILE, fields=table, food=lambda ident: ident == "F6")
    own = out["own"]
    assert own["fuel"] == ["F6"] and own["food"] == ["F6"] and own["landings"] == 1
    for option in out["options"]:
        assert option["landings"] == 1 and option["food"] == ["F6"]


def test_a_meal_never_costs_another_landing(sky):  # noqa: F811
    # Food only at F1, a degree out: landing there leaves 540 nm, past the
    # reach, so a second stop -- the one stop elsewhere is kept, no meal.
    dest = {"ident": "CCC", "lat": 0.0, "lon": 10.0}
    table = fields(*[(f"F{k}", 0.0, float(k)) for k in range(1, 10)])
    out = route_options.options(DEP, dest, PROFILE, fields=table, food=lambda ident: ident == "F1")
    assert out["own"]["landings"] == 1 and out["own"]["fuel"] != ["F1"] and out["own"]["food"] == []


def test_the_fields_whose_places_to_eat_were_not_read_are_said(sky):  # noqa: F811
    # Food not read yet at any field: the stops are chosen as with none,
    # and the fields weighed are named for the planner to read on the side.
    dest = {"ident": "CCC", "lat": 0.0, "lon": 10.0}
    table = fields(*[(f"F{k}", 0.0, float(k)) for k in range(1, 10)])
    out = route_options.options(DEP, dest, PROFILE, fields=table, food=lambda ident: None)
    assert out["own"]["landings"] == 1 and out["own"]["food"] == []
    assert {f["ident"] for f in out["food_unread"]} >= set(out["own"]["fuel"])
    assert route_options.options(DEP, dest, PROFILE, fields=table)["food_unread"] == []


def test_a_source_not_read_is_said_unchecked(monkeypatch, sky):  # noqa: F811
    def down(name):
        raise weather.WeatherServiceError("down")

    monkeypatch.setattr(weather, "_dataset", down)
    out = route_options.options(DEP, DEST, PROFILE, fields=NO_FIELDS)
    assert {"forecasts and reports", "SIGMETs", "G-AIRMETs"} <= set(out["unchecked"])
    assert out["options"]
