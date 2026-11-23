"""Fuel stops in the trip's totals (wingtip.flight_plan.fuel_stops_of)."""

from datetime import datetime, timezone

from app.router_basics import Route
from wingtip import flight_plan as plan
from wingtip import fuelstops, geo
from wingtip.fuelstops import FuelStop

ROUTE = Route(("C81", "KJAX"), ({"lat": 42.3, "lon": -88.1}, {"lat": 30.5, "lon": -81.7}))
SHORT = {
    "fuel_margin_gal": -15.0,
    "usable_fuel_gal": 48.0,
    "distance_nm": 774.0,
    "fuel_gal": 61.0,
    "ete_min": 387.0,
    "taxi_gal": 1.4,
    "reserve_gal": 4.75,
}
STOP = FuelStop(
    ident="KSCX",
    name="SCOTT MUNI",
    city="ONEIDA",
    lat=36.45,
    lon=-84.59,
    from_nm=388.0,
    added_nm=0.0,
    lands_with_gal=16.0,
    minutes=194.0,
    fuel_types="100LL,A+",
    runway_ft=5505,
    elevation_ft=1545.0,
)
#: Its legs (none here: the flight's average stands) and a June morning's
#: departure, the whole trip in daylight.
FLOWN = [([], datetime(2026, 6, 21, 12, 0, tzinfo=timezone.utc))]


def test_a_flight_the_tanks_do_not_hold_gets_its_stops(monkeypatch):
    asked = {}

    def suggest(start, end, **figures):
        asked.update(figures, start=start, end=end)
        return [STOP], []

    monkeypatch.setattr(fuelstops, "suggest", suggest)
    out, none = plan.fuel_stops_of(ROUTE, [SHORT], FLOWN)
    assert none == []
    assert out == [
        {"departure": "C81", "destination": "KJAX", "usable_gal": 48.0, "reason": "fuel", "stops": [STOP.as_dict()], "choices": []}
    ]
    # The flight's own burn and minutes a mile, on the miles it flies for
    # each straight one, its day reserve, and none of the route's own
    # fields offered.
    straight = float(geo.distance_nm(42.3, -88.1, 30.5, -81.7))
    detour = max(1.0, SHORT["distance_nm"] / straight)
    assert abs(asked["fuel_per_nm"] - SHORT["fuel_gal"] / SHORT["distance_nm"] * detour) < 1e-9
    assert abs(asked["min_per_nm"] - SHORT["ete_min"] / SHORT["distance_nm"] * detour) < 1e-9
    assert asked["reserve_gal"] == 4.75 and asked["skip"] == {"C81", "KJAX"}


def test_none_where_the_fuel_check_passes_or_cannot_be_made(monkeypatch):
    monkeypatch.setattr(fuelstops, "suggest", lambda *a, **k: (_ for _ in ()).throw(AssertionError("asked")))
    assert plan.fuel_stops_of(ROUTE, [{**SHORT, "fuel_margin_gal": 2.0}], FLOWN) == ([], [])
    assert plan.fuel_stops_of(ROUTE, [{**SHORT, "usable_fuel_gal": None}], FLOWN) == ([], [])
    assert plan.fuel_stops_of(ROUTE, [{**SHORT, "fuel_gal": None}], FLOWN) == ([], [])


def test_the_first_stretch_is_flown_on_the_fuel_on_board(monkeypatch):
    # The pilot's own 30 gal at engine start (the query's `tanks`, the
    # totals' on_board_gal): the stops are looked for from it, the tanks
    # full at each stop after.
    asked = {}

    def suggest(start, end, **figures):
        asked.update(figures)
        return [STOP], []

    monkeypatch.setattr(fuelstops, "suggest", suggest)
    plan.fuel_stops_of(ROUTE, [{**SHORT, "on_board_gal": 30.0}], FLOWN)
    assert (asked["start_gal"], asked["usable_gal"]) == (30.0, 48.0)
    plan.fuel_stops_of(ROUTE, [SHORT], FLOWN)
    assert asked["start_gal"] == 48.0


def test_under_ifr_the_search_keeps_the_alternates_fuel(monkeypatch):
    # 14 CFR 91.167(a)(2): the last flight's fuel on to its alternate is
    # what its last stretch keeps with the reserve; under VFR none.
    asked = {}

    def suggest(start, end, **figures):
        asked.update(figures)
        return [STOP], []

    monkeypatch.setattr(fuelstops, "suggest", suggest)
    plan.fuel_stops_of(ROUTE, [{**SHORT, "rules": "ifr", "alternate": {"fuel_gal": 3.2}}], FLOWN)
    assert asked["alternate_gal"] == 3.2
    plan.fuel_stops_of(ROUTE, [{**SHORT, "alternate": {"fuel_gal": 3.2}}], FLOWN)
    assert asked["alternate_gal"] == 0.0


def test_a_flight_with_no_stop_says_why(monkeypatch):
    # No field in reach: no stop, and the flight named. With 5 gal on board
    # at engine start against a 1.4 gal taxi and 4.75 gal reserve, no field
    # is in reach of the fuel on board at all, which it says (on_board).
    monkeypatch.setattr(fuelstops, "suggest", lambda *a, **k: ([], []))
    out, none = plan.fuel_stops_of(ROUTE, [SHORT], FLOWN)
    assert out == [] and none == [{"departure": "C81", "destination": "KJAX", "on_board": False}]
    _, none = plan.fuel_stops_of(ROUTE, [{**SHORT, "on_board_gal": 5.0}], FLOWN)
    assert none == [{"departure": "C81", "destination": "KJAX", "on_board": True}]


def test_each_flights_check_is_against_what_the_tanks_leave_with():
    from wingtip.planning import flight_totals

    profile = {"fuel_burn_gph": 8.0, "usable_fuel_gal": 40.0, "taxi_fuel_gal": 1.4}
    leg = {"distance_nm": 100.0, "ete_min": 60.0, "fuel_gal": 8.0, "tas_kt": 100.0, "wind": {}}
    depart = datetime(2026, 6, 21, 15, 0, tzinfo=timezone.utc)
    full = flight_totals([leg], profile, ROUTE, depart)
    own = flight_totals([leg], profile, ROUTE, depart, tanks=(20.0, None))
    assert (full["on_board_gal"], own["on_board_gal"]) == (40.0, 20.0)
    assert round(full["fuel_margin_gal"] - own["fuel_margin_gal"], 1) == 20.0
    # At a stop with no fuel bought (0): what the flight before landed with.
    assert flight_totals([leg], profile, ROUTE, depart, tanks=(0.0, 12.5))["on_board_gal"] == 12.5


def test_the_tanks_asked_are_read_by_field():
    import pytest
    from fastapi import HTTPException

    from app.plan_query import PlanQuery

    assert PlanQuery(dep="KOSH", dest="KJVL", tanks="kosh:30,KJVL:0").own_tanks() == {"KOSH": 30.0, "KJVL": 0.0}
    # More than any tanks hold is the pilot's word (warn, never limit).
    assert PlanQuery(dep="KOSH", dest="KJVL", tanks="KOSH:900").own_tanks() == {"KOSH": 900.0}
    with pytest.raises(HTTPException):
        PlanQuery(dep="KOSH", dest="KJVL", tanks="KOSH:full").own_tanks()


def test_the_plans_fuel_stops_are_checked_with_the_route_planned_again(monkeypatch):
    # app.fuel_replan plans the pilot's own query through the stops
    # (wingtip.fuel_rounds): here the route with KSCX in has no flight short.
    from types import SimpleNamespace

    from app import fuel_replan

    asked = []

    def replanned(q, _asked, stops):
        asked.append(stops)
        return {"hops": [{"departure": "C81", "destination": "KSCX", "totals": {"fuel_margin_gal": 2.0}}], "fuel_stops": []}

    monkeypatch.setattr(fuel_replan, "replanned", replanned)
    q = SimpleNamespace(dep="C81", dest="KJAX", stops="")
    suggested = [
        {"departure": "C81", "destination": "KJAX", "usable_gal": 48.0, "reason": "fuel", "stops": [STOP.as_dict()], "choices": []}
    ]
    out = fuel_replan.checked(q, None, {"fuel_stops": suggested})["fuel_stops"]
    assert asked == [["KSCX"]]
    assert [s["ident"] for s in out[0]["stops"]] == ["KSCX"] and out[0]["passes"] is True
    # No stops suggested: nothing planned again.
    assert fuel_replan.checked(q, None, {"fuel_stops": []}) == {"fuel_stops": []}
