"""The connector's edit tools (app.mcp.edit_tools) through the MCP SDK's
client, a test each: the flight handed in, changed, planned again by
/api/plan in test_plan's stubbed world, and handed back with what the
live view draws (app.mcp.flight_view) and the line the model reads."""

import json
import os
from pathlib import Path

import pytest
from mcp.types import TextContent

from app.mcp import calls, flight_view, procedure_picks, records
from app.settings import get_settings

from .mcp_harness import call
from .plan_world import _stubbed_world  # noqa: F401 -- the stubbed chart, altitude and air, autouse
from .test_mcp_tools import AIRPLANE, answer, refusal

ROUTE = {"departure": "C81", "destination": "KDLH"}
#: The route on the pilot's own airplane, which fuel stops need.
FLOWN = {**ROUTE, "airplane_tail": "N123AB"}


@pytest.fixture(autouse=True)
def _theirs(monkeypatch):
    calls._WINDOW.storage.reset()
    # The flight's link is to the gateway's public address.
    monkeypatch.setenv("MCP_ISSUER", "https://wingtip.test")
    get_settings.cache_clear()

    async def airplanes(pilot_id):
        return [AIRPLANE]

    monkeypatch.setattr(records, "airplanes", airplanes)


def edited(tool: str, flight: dict, **args) -> dict:
    return answer(call(tool, {"flight": flight, **args}))


def said(tool: str, flight: dict, **args) -> str:
    result = call(tool, {"flight": flight, **args})
    return " ".join(c.text for c in result.content if isinstance(c, TextContent))


def test_show_flight_draws_the_route_and_hands_the_flight_back():
    got = edited("show_flight", ROUTE)
    view = got["view"]
    assert [p["ident"] for p in view["points"]] == ["C81", "KDLH"]
    assert view["line"] and view["totals"]["distance_nm"] > 0
    # The strip's fuel is the engine's, asked here for a view that runs none.
    assert view["strip_fuel"] == {"required_gal": None, "short": []}
    assert view["chart"]["chart_cycle"] and view["open_in_wingtip"].startswith("https://wingtip.test/app/plan?dep=C81&dest=KDLH")
    assert got["flight"]["departure"] == "C81" and view["seq"] >= 1 and view["created_at"] > 0


def test_the_model_reads_a_line_and_the_flight_to_hand_on():
    text = said("show_flight", ROUTE)
    assert text.startswith("C81 KDLH at ") and "nm" in text
    assert 'flight (pass to the next change): {"departure": "C81", "destination": "KDLH"}' in text
    assert "No airplane picked" in text


def test_a_stop_is_added_at_its_place_and_taken_out():
    added = edited("add_stop", ROUTE, ident="kmsn")
    assert added["flight"]["stops"] == ["KMSN"] and [p["ident"] for p in added["view"]["points"]] == ["C81", "KMSN", "KDLH"]
    removed = edited("remove_stop", added["flight"], ident="MSN")
    assert removed["flight"]["stops"] == []


def test_a_stop_not_on_the_route_is_named_with_the_route_s():
    assert "KOSH is not a stop of this route. Its stops: KMSN" in refusal(
        call("remove_stop", {"flight": {**ROUTE, "stops": ["KMSN"]}, "ident": "KOSH"})
    )


def fake_plan(flight) -> dict:
    """A plan of the flight's points alone, where a test is of the tool's
    own change and not of /api/plan's figures (fields it has no world for)."""
    end = lambda ident: {"ident": ident, "name": ident, "lat": 44.0, "lon": -90.0}  # noqa: E731
    return {
        "departure": end(flight.departure),
        "destination": end(flight.destination),
        "stops": [end(s) for s in flight.stops],
        "course_line": [[44.0, -90.0]],
        "legs": [],
        "totals": {"distance_nm": 100.0},
        "altitude_ft": 5500.0,
        "chart_layers": [],
    }


def test_a_stop_moves_among_the_stops(monkeypatch):
    async def planned(flight, pilot_id):
        return fake_plan(flight), None

    monkeypatch.setattr(flight_view, "planned", planned)
    flight = {**ROUTE, "stops": ["KMSN", "KEAU", "KRST"]}
    assert edited("move_stop", flight, ident="KRST", place=1)["flight"]["stops"] == ["KRST", "KMSN", "KEAU"]


def test_the_cruise_altitude_is_set_and_cleared():
    set_ = edited("set_cruise_altitude", ROUTE, altitude_ft=5500)
    assert set_["flight"]["cruise_altitude_ft"] == 5500 and set_["view"]["altitude_ft"] == 5500
    assert "altitude_ft=5500" in set_["view"]["open_in_wingtip"]
    assert edited("set_cruise_altitude", set_["flight"], altitude_ft=None)["flight"]["cruise_altitude_ft"] is None


def test_the_departure_time_is_set_and_put_back_to_now():
    set_ = edited("set_departure_time", ROUTE, depart_at="2026-12-01T15:00:00Z")
    assert set_["flight"]["depart_at"].startswith("2026-12-01T15:00:00")
    assert edited("set_departure_time", set_["flight"], depart_at=None)["flight"]["depart_at"] is None


def test_the_airplane_is_the_pilot_s_own_or_none():
    flown = edited("pick_airplane", ROUTE, tail="123AB")
    assert flown["view"]["airplane"] == "N123AB (C172)" and flown["view"]["totals"]["ete_min"] > 0
    assert "No airplane N999ZZ" in refusal(call("pick_airplane", {"flight": ROUTE, "tail": "N999ZZ"}))
    assert edited("pick_airplane", flown["flight"], tail=None)["view"]["airplane"] is None


def test_the_fuel_on_board_is_kept_by_field_and_flown():
    got = edited("set_fuel_on_board", {**ROUTE, "airplane_tail": "N123AB"}, gallons=30)
    assert got["flight"]["fuel_on_board"] == {"C81": 30.0}
    assert "tanks=C81%3A30" in got["view"]["open_in_wingtip"]
    assert "KOSH is not the departure or a stop" in refusal(call("set_fuel_on_board", {"flight": ROUTE, "gallons": 10, "airport": "KOSH"}))


def test_fuel_stops_go_in_where_the_planner_says_and_come_out(monkeypatch):
    async def short(flight, pilot_id):
        p = fake_plan(flight)
        p["totals"] |= {"usable_fuel_gal": 53.0, "fuel_margin_gal": -10.0 if not flight.stops else 5.0}
        if not flight.stops:
            p["totals"]["fuel_stops"] = [
                {"departure": "C81", "destination": "KDLH", "usable_gal": 53, "reason": "fuel", "stops": [{"ident": "KMSN"}]}
            ]
        return p, None

    monkeypatch.setattr(flight_view, "planned", short)
    added = edited("add_fuel_stops", FLOWN)
    assert added["flight"]["stops"] == ["KMSN"] and added["flight"]["fuel_stops"] == ["KMSN"]
    assert added["view"]["points"][1]["fuel_stop"] is True
    removed = edited("remove_fuel_stops", {**added["flight"], "stops": ["KMSN", "KRST"]})
    assert removed["flight"]["stops"] == ["KRST"] and removed["flight"]["fuel_stops"] == []


def test_no_fuel_stop_is_put_in_where_none_is_needed():
    assert said("add_fuel_stops", FLOWN).startswith("No fuel stops are needed")


def test_fuel_stops_without_an_airplane_ask_for_one_rather_than_say_none_is_needed():
    """With no airplane the plan has no fuel figures (decision 0011), so
    "the tanks reach each landing" would be said of tanks it never knew."""
    assert "pick_airplane" in refusal(call("add_fuel_stops", {"flight": ROUTE}))


def test_a_flight_short_of_fuel_with_no_field_in_reach_is_said_short(monkeypatch):
    async def short(flight, pilot_id):
        p = fake_plan(flight)
        p["totals"] |= {"usable_fuel_gal": 53.0, "fuel_margin_gal": -10.0}
        p["totals"]["no_fuel_stop"] = [{"departure": "C81", "destination": "KDLH", "on_board": False}]
        return p, None

    monkeypatch.setattr(flight_view, "planned", short)
    text = said("add_fuel_stops", FLOWN)
    assert text.startswith("No fuel stop put in, and the flight is short of fuel: C81 to KDLH: no field with fuel in reach")


def test_fuel_stops_for_an_airplane_with_no_usable_fuel_are_refused_not_said_unneeded(monkeypatch):
    """The mcp audit of 2026-11-23, H1: an own type with speed and burn and
    no usable fuel plans with no fuel check (fuel_margin_gal None), and the
    planner offers no stop it cannot judge. "No fuel stops are needed" was
    said of a 323 nm flight; now the missing figure is named."""
    own = {"id": 4, "tailNumber": "N9XY", "typeDesignator": "ZZZZ", "cruiseTasKt": 120.0, "fuelBurnGph": 9.0}

    async def airplanes(pilot_id):
        return [own]

    monkeypatch.setattr(records, "airplanes", airplanes)
    said = refusal(call("add_fuel_stops", {"flight": {**ROUTE, "airplane_tail": "N9XY"}}))
    assert "N9XY's usable fuel" in said and "Setup, Airplanes" in said
    assert "No fuel stops are needed" not in said


def test_a_flight_short_with_no_stop_offered_is_never_said_to_need_none(monkeypatch):
    async def short(flight, pilot_id):
        p = fake_plan(flight)
        p["totals"] |= {"usable_fuel_gal": 20.0, "fuel_margin_gal": -4.0}
        return p, None

    monkeypatch.setattr(flight_view, "planned", short)
    assert said("add_fuel_stops", FLOWN).startswith("No fuel stop put in, and the flight is short of fuel")


def test_the_model_s_line_has_the_rules_and_the_fuel_check():
    """The mcp audit of 2026-11-23, M3 and M5: the model reads no view, so
    the line carries the rules flown and the fuel check (required with the
    reserve, the margin), and asking "enough fuel?" needs no second plan."""
    text = said("show_flight", FLOWN)
    assert text.startswith("C81 KDLH at ") and ", VFR: " in text.splitlines()[0]
    fuel = next(line for line in text.splitlines() if line.startswith("Fuel: "))
    assert "-minute reserve" in fuel and " required with the " in fuel and "margin +" in fuel and "on board" in fuel
    assert ", IFR: " in said("show_flight", {**FLOWN, "rules": "ifr"}).splitlines()[0]


def test_the_line_says_the_fuel_check_was_not_worked_where_no_usable_fuel_is_known(monkeypatch):
    async def unknown(flight, pilot_id):
        return fake_plan(flight), {"tailNumber": "N9XY", "typeDesignator": "ZZZZ"}

    monkeypatch.setattr(flight_view, "planned", unknown)
    assert "Fuel check: not worked" in said("show_flight", {**ROUTE, "airplane_tail": "N9XY"})


def test_a_route_that_lands_on_the_way_reads_each_flight_s_fuel_check(monkeypatch):
    """The safety audit of 2026-11-23, H2: a route with a landing carries
    its fuel checks in totals.hops (one a flight, the tanks filled at each
    stop), none of its own. It was said "not worked" and its short second
    flight never said; add_fuel_stops refused for usable fuel it had."""

    def hop(dep, dest, margin):
        figures = {"usable_fuel_gal": 53.0, "fuel_required_gal": 30.0, "reserve_gal": 6.0, "reserve_min": 30.0, "fuel_margin_gal": margin}
        return {"departure": dep, "destination": dest, "totals": figures}

    async def landing(flight, pilot_id):
        p = fake_plan(flight)
        p["totals"]["hops"] = [hop("C81", "KMSN", 12.0), hop("KMSN", "KDLH", -3.5)]
        return p, AIRPLANE

    monkeypatch.setattr(flight_view, "planned", landing)
    flight = {**FLOWN, "stops": ["KMSN"]}
    fuel = next(line for line in said("show_flight", flight).splitlines() if line.startswith("Fuel"))
    assert "not worked" not in fuel and "C81-KMSN" in fuel and "KMSN-KDLH" in fuel
    assert "Least margin -3.5 gal" in fuel and "Short of fuel: " in fuel and "short by 3.5 gal" in fuel
    stops = call("add_fuel_stops", {"flight": flight})
    assert not stops.is_error
    assert said("add_fuel_stops", flight).startswith("No fuel stop put in, and the flight is short of fuel")


def test_an_edit_needs_only_the_read_scope():
    assert not call("show_flight", {"flight": ROUTE}, token="read-7").is_error


FIXTURE = Path(__file__).resolve().parents[3] / "apps/web/src/lib/fixtures/flightView.json"


def test_the_view_s_answer_is_the_shape_the_web_s_view_reads(monkeypatch):
    """The shared fixture the web's live view is tested on (features/claude-view)
    is this tool's answer; WRITE_FLIGHT_VIEW_FIXTURE=1 writes it again."""

    async def approaches_at(ident):
        ils = {"id": "I27", "name": "ILS OR LOC RWY 27", "kind": "approach", "transitions": [], "runway_transitions": []}
        return {"I27": ils} if ident == "KDLH" else {}

    monkeypatch.setattr(procedure_picks, "_approaches_at", approaches_at)
    flight = {**ROUTE, "stops": ["KMSN"], "fuel_stops": ["KMSN"], "airplane_tail": "N123AB", "procedures": "KDLH:I27:::L"}
    got = edited("show_flight", flight)
    got["view"]["seq"], got["view"]["created_at"], got["view"]["channel"] = 1, 1767225600000, "0" * 32
    if os.environ.get("WRITE_FLIGHT_VIEW_FIXTURE"):
        FIXTURE.write_text(json.dumps(got, indent=2, sort_keys=True) + "\n")
    kept = json.loads(FIXTURE.read_text())
    assert set(got) == set(kept) and set(got["view"]) == set(kept["view"]) and set(got["flight"]) == set(kept["flight"])
    assert got["view"]["approaches"][0]["state"] == "loaded" and got["view"]["points"][1]["fuel_stop"] is True


def test_a_flight_handed_back_names_no_more_tanks_than_a_route_has_fields():
    """The model hands the flight back, so its fuel on board is bounded
    as its stops are: no /api/plan query of any length."""
    from pydantic import ValidationError

    from app.mcp.flight_state import Flight
    from app.router_basics import MAX_STOPS

    Flight(departure="C81", destination="KDLH", fuel_on_board={f"K{n:03}": 1.0 for n in range(MAX_STOPS + 2)})
    with pytest.raises(ValidationError):
        Flight(departure="C81", destination="KDLH", fuel_on_board={f"K{n:03}": 1.0 for n in range(MAX_STOPS + 3)})
    with pytest.raises(ValidationError):
        Flight(departure="C81", destination="KDLH", fuel_on_board={"K" * 17: 1.0})
