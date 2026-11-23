"""The connector's route and field tools (app.mcp.route_tools, day_tools)
through the MCP SDK's client: the winds aloft from the store the nav log
reads, the hazards and airspace of a route from its plan and briefing
with the engine's rules over them, the sun's times from the engine, and
the pilot's own airplane's loading and runway distances. The plan is
test_plan's stubbed world; the briefing and the winds store are stubbed
at the names the planner reads them by."""

from datetime import date, datetime, timezone

import pytest
from wingtip import winds_aloft

from app import route_briefing
from app.mcp import calls, day_tools, records, route_tools

from .airport_world import stub_place
from .mcp_harness import call
from .plan_world import _stubbed_world  # noqa: F401 -- the stubbed chart, altitude and air, autouse
from .test_gonogo_api import runways
from .test_mcp_tools import AIRPLANE, answer, refusal


@pytest.fixture
def altitude(altitude) -> dict:
    """The plan's altitude, the route through a Class C and a MOA."""
    transit = {"name": "DULUTH CLASS C", "class": "C", "floor_ft_msl": 2900.0, "requires": "two-way radio", "along_track_nm": 140.0}
    moa = {"name": "SNOOPY MOA", "type": "MOA", "kind": "Military operations area", "floor_ft": 500.0, "floor_ref": "AGL"}
    return {**altitude, "airspace_transits": [transit], "special_use": [{**moa, "along_track_nm": 90.0, "legs": [0]}]}


@pytest.fixture(autouse=True)
def _theirs(monkeypatch):
    calls._WINDOW.storage.reset()

    async def airplanes(pilot_id):
        return [AIRPLANE]

    monkeypatch.setattr(records, "airplanes", airplanes)


def told(monkeypatch, **over) -> dict:
    """/api/briefing's answer for the route, a quiet one but for `over`."""
    asked = {}
    body = {
        "hazards": [],
        "forecast": {"min_ceiling_ft": None, "min_visibility_sm": None, "stations": []},
        "metars": {},
        "airports": {},
        "weather_unavailable": [],
        **over,
    }

    def brief(dep, dest, stops, depart, ete_min, *rest):
        asked.update(dep=dep, dest=dest, ete_min=ete_min)
        return body

    monkeypatch.setattr(route_briefing, "briefing", brief)
    return asked


def test_winds_aloft_at_a_field_are_the_stores_with_its_valid_time(monkeypatch):
    stub_place(monkeypatch)
    period = {"valid_at": "2026-11-22T15:00:00Z", "label": "AWC winds, 12Z", "source": "awc", "modelled": False}
    monkeypatch.setattr(winds_aloft, "winds_key_for", lambda depart: "2026-11-22T15:00Z")
    monkeypatch.setattr(winds_aloft, "winds_period", lambda key: period)
    asked = []

    def air_at(lat, lon, altitudes, key=None):
        asked.append((lat, lon, altitudes, key))
        return [{"wind": {"wind_dir_true_deg": 270.0, "wind_speed_kt": 32.0}, "temp_c": -4.5}]

    monkeypatch.setattr(winds_aloft, "air_at", air_at)
    air = answer(call("winds_aloft", {"airport": "KDLH", "altitude_ft": 6000}))
    assert asked == [(46.8421, -92.1936, [6000.0], "2026-11-22T15:00Z")]
    assert air["wind"] == {"wind_dir_true_deg": 270.0, "wind_speed_kt": 32.0} and air["temp_c"] == -4.5
    assert air["forecast"]["label"] == "AWC winds, 12Z" and air["no_wind_known"] is False
    assert "altitude_ft" in refusal(call("winds_aloft", {"airport": "KDLH"}))


def test_route_hazards_are_the_briefings_with_the_engines_adverse_rows(monkeypatch):
    sigmet = {"hazard": "TURB", "type": "SIGMET", "altitude_low_ft": 18000.0, "altitude_high_ft": 34000.0, "raw": "SIGMET NOVEMBER 3"}
    pirep = {"raw": "UUA /OV DLH/TM 1500/FL060/TP C172/TB SEV", "urgent": True, "turbulence": "SEV", "altitude_ft": 6000.0}
    asked = told(monkeypatch, hazards=[sigmet], pireps=[{**pirep, "along_track_nm": 120.0}])
    found = answer(call("route_hazards", {"departure": "C81", "destination": "KDLH", "limit": 1}))
    assert asked["dep"] == "C81" and asked["dest"] == "KDLH" and asked["ete_min"] is None
    assert found["total"] == 2 and found["count"] == 1 and found["has_more"] is True and found["next_offset"] == 1
    assert {h["kind"] for h in found["hazards"]} <= {"SIGMET", "UUA PIREP"}
    # The engine's rows: a SIGMET a stop, the urgent PIREP a caution.
    rows = {r["source"]: r for r in found["adverse_conditions"]["rows"]}
    assert rows["SIGMET"]["finding"] == "stop" and rows["PIREP"]["finding"] == "caution"
    assert "No airplane" in found["times"] and any("Center Weather" in u for u in found["unavailable"])


def test_route_airspace_is_the_plans_crossings_the_tfrs_and_the_engines_field_rules(monkeypatch):
    tfr = {"notam_id": "6/4321", "title": "VIP", "along_track_nm": 60.0, "crosses": True, "active_now": True, "ceiling_ft": 17999.0}
    told(monkeypatch, tfrs=[tfr])
    monkeypatch.setattr(
        route_tools,
        "fields_of",
        lambda idents: [
            {"ident": i, "role": r, "private": False, "military": None, "status": s}
            for i, r, s in zip(idents, ("departure", "destination"), ("CI", "O"))
        ],
    )
    space = answer(call("route_airspace", {"departure": "C81", "destination": "KDLH"}))
    assert space["controlled"][0]["class"] == "C" and space["special_use"][0]["name"] == "SNOOPY MOA"
    assert any("91.13" in r["cite"] for r in space["entry_rules"]["C"]["rules"])
    assert space["tfrs"][0]["notam_id"] == "6/4321" and space["tfrs"][0]["crosses"] is True and space["total"] == 1
    assert space["adiz"]["legs"] == [] or all(z is None for z in space["adiz"]["points"])
    fields = {f["ident"]: f for f in space["fields"]}
    assert fields["C81"]["open"] is False and fields["C81"]["closed"] == "Closed indefinitely"
    assert fields["KDLH"]["open"] is True and fields["KDLH"]["closed"] is None


def test_sun_times_say_when_each_rules_night_begins(monkeypatch):
    stub_place(monkeypatch)
    sun = answer(call("sun_times", {"airport": "KDLH", "on": "2026-03-20"}))
    at = {k: datetime.fromisoformat(sun[k]["utc"].replace("Z", "+00:00")) for k in ("sunrise", "sunset", "civil_dusk")}
    assert sun["sun"] == "both" and at["sunrise"] < at["sunset"] < at["civil_dusk"]
    assert sun["lights"]["from"] == sun["sunset"] and sun["night"]["from"] == sun["civil_dusk"]
    # Each time in the field's own clock too, its zone named (CDT in March).
    assert sun["time_zone"] == "America/Chicago" and sun["sunset"]["local"].endswith(" CDT")
    later = datetime.fromisoformat(sun["passenger_night"]["from"]["utc"].replace("Z", "+00:00")) - at["sunset"]
    assert later.total_seconds() == 3600 and "61.57(b)" in sun["passenger_night"]["rule"]
    assert "91.209(a)" in sun["lights"]["rule"] and "1.1" in sun["night"]["rule"]
    assert "Give an airport" in refusal(call("sun_times", {}))


def test_tonight_is_the_fields_own_date_not_utcs():
    """The mcp audit of 2026-11-23, M1: at 19:00 CST (01Z) "tonight" at
    KDLH is the 23rd, where the UTC date is already the 24th."""
    evening = datetime(2026, 11, 24, 1, 0, tzinfo=timezone.utc)
    assert day_tools.today(day_tools.zone_of("America/Chicago"), evening) == date(2026, 11, 23)
    # No zone known (tzfpy names one everywhere): UTC's date.
    assert day_tools.today(None, evening) == date(2026, 11, 24)


def test_airplane_performance_is_the_pilots_airplane_or_none(monkeypatch):
    said = refusal(call("airplane_performance", {"airport": "KDLH"}))
    assert "airplane_tail" in said
    # As /api/briefing writes a runway: its width and lights beside the Go / No-Go test's.
    paved = [{**r, "width_ft": 150, "lighted": True} for r in runways(10162)]
    field = {"name": "Duluth", "elevation_ft": 1428.0, "runways": paved, "frequencies": []}
    metar = {"temp_c": 15.0, "altimeter_in_hg": 29.92, "wind_speed_kt": 6.0, "visibility_sm": 10.0}
    told(monkeypatch, airports={"KDLH": field}, metars={"KDLH": metar})
    # The record has no empty weight: the loading cannot be worked out, and says so.
    short = answer(call("airplane_performance", {"airport": "KDLH", "airplane_tail": "N123AB"}))
    assert short["balance"] is None and any("empty_weight_lb" in m for m in short["missing"])
    assert any(m.startswith("stations_lb") for m in short["missing"])
    assert short["distance_weight"] == "the POH table's heaviest weight"
    roles = {r["role"]: r for r in short["runways"]}
    assert set(roles) == {"Departure", "Destination"}
    assert {d["kind"] for d in roles["Departure"]["distances"]} == {"takeoff"} and roles["Departure"]["length_ft"] == 10162
    full = {"airport": "KDLH", "airplane_tail": "N123AB", "stations_lb": [170, 0, 0, 0], "fuel_gal": 40}
    loaded = answer(call("airplane_performance", {**full, "empty_weight_lb": 1642, "empty_moment_lb_in": 62600}))
    assert loaded["missing"] == [] and loaded["balance"]["takeoff"]["weight_lb"] > 1642 + 170
    assert loaded["distance_weight"] == "the loading's" and loaded["closed"] is None


def test_airplane_performance_at_a_closed_field_says_closed_first(monkeypatch):
    """Decision 0043: wherever a closed field appears it is labelled
    Closed, by the engine's field_status of NASR's ARPT_STATUS."""
    paved = [{**r, "width_ft": 150, "lighted": True} for r in runways(10162)]
    field = {"name": "Duluth", "elevation_ft": 1428.0, "runways": paved, "frequencies": []}
    metar = {"temp_c": 15.0, "altimeter_in_hg": 29.92, "wind_speed_kt": 6.0, "visibility_sm": 10.0}
    told(monkeypatch, airports={"KDLH": field}, metars={"KDLH": metar})
    monkeypatch.setattr(day_tools.field_use, "record_of", lambda ident: {"status": "CI"})
    got = answer(call("airplane_performance", {"airport": "KDLH", "airplane_tail": "N123AB"}))
    assert got["closed"].startswith("Closed indefinitely: NASR lists KDLH as closed") and next(iter(got)) == "closed"


def test_winds_along_a_route_follow_its_rules(monkeypatch):
    """The mcp audit of 2026-11-23, M6: an IFR pilot's route winds are at
    an IFR cruise, not VFR's."""
    asked = []

    async def route(departure, destination, stops, altitude, tail, depart, rules):
        asked.append(rules)
        return {}, {"departure": {"ident": "C81"}, "destination": {"ident": "KDLH"}, "legs": [], "totals": {}}, None

    monkeypatch.setattr(route_tools, "_route", route)
    winds = answer(call("winds_aloft", {"departure": "C81", "destination": "KDLH", "rules": "ifr"}))
    assert asked == ["ifr"] and winds["sources"][0]["source"].startswith("Aviation Weather Center GFA winds aloft")
