"""The nav log stream (/api/navlog) through its messages: the altitude,
then the legs, then the totals, flown in the winds, plan and airplane asked
for. The stubbed world is plan_world's."""

import pytest
from wingtip import altitude as altitude_module

from app.main import app

from .conftest import AirplaneClient, select_cruise_altitude_stub
from .plan_world import _stubbed_world, no_winds, stub_air, stub_wind  # noqa: F401 -- the stubbed world, autouse

client = AirplaneClient(app)


def test_navlog_streams_altitude_then_legs_then_done(messages):
    resp = client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH"})

    assert resp.status_code == 200
    lines = messages(resp)
    types = [m["type"] for m in lines]
    assert types[0] == "stage" and types[-1] == "done"
    assert types.index("altitude") < types.index("leg")
    legs = [m for m in lines if m["type"] == "leg"]
    assert legs[0]["from"] == "C81" and legs[0]["wind"]["wind_speed_kt"] == 15.0
    assert lines[-1]["totals"]["distance_nm"] == pytest.approx(sum(leg["distance_nm"] for leg in legs), abs=0.1)
    altitude = next(m for m in lines if m["type"] == "altitude")
    assert [o["kind"] for o in altitude["options"]] == ["lowest", "highest", "fastest", "economical"]
    assert altitude["flown"] == "fastest" and altitude["altitude_ft"] == 4500.0


def test_a_departure_time_picks_the_winds_forecast_period(monkeypatch, messages):
    from datetime import datetime, timedelta, timezone

    # The forecast period each leg's winds are read for.
    asked = []

    def wind(lat, lon, altitude_ft, fcst_hr="06"):
        asked.append(fcst_hr)
        return stub_wind(lat, lon, altitude_ft, fcst_hr)

    stub_air(monkeypatch, wind)
    # No product's header to hand: the period by hours ahead.
    from wingtip import weather

    monkeypatch.setattr(weather, "winds_period", lambda fcst_hr="06": None)
    soon = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    later = (datetime.now(timezone.utc) + timedelta(hours=14)).isoformat()
    tomorrow = (datetime.now(timezone.utc) + timedelta(hours=30)).isoformat()

    assert client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "depart": later}).status_code == 200
    assert set(asked) == {"12"}
    seen = set()
    for depart, expected in ((None, "06"), (soon, "06"), (later, "12"), (tomorrow, "24")):
        asked.clear()
        params = {"dep": "C81", "dest": "KDLH", **({"depart": depart} if depart else {})}
        messages(client.get("/api/navlog", params=params))
        # A period's legs already worked out come from the cache, with no
        # wind asked for again.
        assert set(asked) <= {expected}, depart
        seen |= set(asked)
    assert {"06", "24"} <= seen


def test_the_winds_product_is_the_one_whose_for_use_window_holds_the_departure(monkeypatch):
    """FAA-H-8083-28B Table 27-2, the 1200Z run: the 6-hour product for use
    1400-2100Z, the 12-hour 2100-0600Z, the 24-hour 0600-1800Z."""
    from datetime import datetime, timezone

    from wingtip import weather, winds_stations

    periods = {
        "06": {"valid_at": "2026-10-20T18:00:00Z", "use_from": "2026-10-20T14:00:00Z", "use_to": "2026-10-20T21:00:00Z"},
        "12": {"valid_at": "2026-10-21T00:00:00Z", "use_from": "2026-10-20T21:00:00Z", "use_to": "2026-10-21T06:00:00Z"},
        "24": {"valid_at": "2026-10-21T12:00:00Z", "use_from": "2026-10-21T06:00:00Z", "use_to": "2026-10-21T18:00:00Z"},
    }
    monkeypatch.setattr(weather, "winds_period", lambda fcst_hr="06": periods[fcst_hr])
    at = lambda h, m=0, day=20: datetime(2026, 10, day, h, m, tzinfo=timezone.utc)  # noqa: E731
    assert winds_stations.station_period_for(at(15)) == "06"
    # Eight and a half hours from 1400Z: the 12-hour product, not the 6-hour.
    assert winds_stations.station_period_for(at(22, 30)) == "12"
    assert winds_stations.station_period_for(at(6, 30, day=21)) == "24"


def test_totals_say_when_the_plan_was_made_and_the_winds_it_flies(messages, monkeypatch):
    from wingtip import planning
    from wingtip import weather

    period = {"valid_at": "2026-09-22T18:00:00Z", "use_from": "2026-09-22T14:00:00Z", "use_to": "2026-09-22T21:00:00Z"}
    asked = []
    monkeypatch.setattr(weather, "winds_period", lambda fcst_hr="06": asked.append(fcst_hr) or period)
    t = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH"}))[-1]["totals"]
    # "Now" is noon in Chicago (conftest): the 6-hour product's period.
    # A period with no model run behind it is not marked as modelled.
    assert (t["planned_at"], t["winds"], asked) == (
        "2026-09-22T17:00:00Z",
        {**period, "modelled": False, "run": None, "forecast_hour": None, "label": None, "source": None, "fallback": False, "stale": False},
        ["06"],
    )
    assert planning.now().isoformat().startswith("2026-09-22T17:00")


def test_totals_carry_the_fuel_check(messages, monkeypatch):
    from datetime import datetime, timezone

    from wingtip import planning

    # No departure time is now: here noon in Chicago (17:00 UTC), by day.
    monkeypatch.setattr(planning, "now", lambda: datetime(2026, 9, 22, 17, 0, tzinfo=timezone.utc))
    lines = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH"}))
    t = lines[-1]["totals"]
    # The day reserve at the C172's 8.5 gph is 4.25 gal on top of the
    # legs' own fuel (the first leg's climb from the field included);
    # the profile holds 40 usable.
    assert t["reserve_min"] == 30 and t["reserve_gal"] == 4.25 and t["night"] is False
    assert t["taxi_gal"] == 1.4  # the C172S handbook's start, taxi and takeoff allowance
    assert t["fuel_required_gal"] == round(t["fuel_gal"] + 1.4 + 4.25, 1)
    assert t["usable_fuel_gal"] == 40 and t["fuel_margin_gal"] == round(40 - t["fuel_required_gal"], 1)
    # The climb from the 900 ft field to 4,500 ft is flown on its legs: the
    # first, 2 nm to the lake the stub puts beside the field, is climb all
    # the way, and the climb tops out on the second; no leg after it climbs.
    legs = [m for m in lines if m["type"] == "leg"]
    assert legs[0]["climb_min"] == pytest.approx(legs[0]["ete_min"], abs=0.1)
    assert 0 < legs[1]["climb_min"] < legs[1]["ete_min"]
    assert all(leg["climb_min"] == 0 for leg in legs[2:])

    # A pilot's own tanks, too small: the margin goes negative.
    short = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "usable_fuel_gal": 5}))[-1]
    assert short["totals"]["fuel_margin_gal"] == round(5 - short["totals"]["fuel_required_gal"], 1) < 0

    # Departing Chicago at 03:00 local (08:00 UTC) is night: 45 minutes.
    at_night = datetime(2026, 9, 22, 8, 0, tzinfo=timezone.utc).isoformat()
    night = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "depart": at_night}))[-1]
    assert night["totals"]["night"] is True and night["totals"]["reserve_min"] == 45
    by_day = datetime(2026, 9, 22, 17, 0, tzinfo=timezone.utc).isoformat()
    day = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "depart": by_day}))[-1]
    assert day["totals"]["night"] is False and day["totals"]["reserve_min"] == 30

    # And "now" at 03:00 in Chicago, with no time picked, is night too: it
    # was the day's 30 minutes for want of a time (14 CFR 91.151(a)(2)).
    monkeypatch.setattr(planning, "now", lambda: datetime(2026, 9, 22, 8, 0, tzinfo=timezone.utc))
    now_at_night = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH"}))[-1]
    assert now_at_night["totals"]["night"] is True and now_at_night["totals"]["reserve_min"] == 45


def test_navlog_flies_the_chosen_plan_and_says_so(messages):
    resp = client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "altitude_choice": "highest"})

    altitude = next(m for m in messages(resp) if m["type"] == "altitude")
    assert altitude["flown"] == "highest"


def test_navlog_flies_a_pilots_own_aeroplane_over_a_stock_profile(messages):
    resp = client.get(
        "/api/navlog",
        params={
            "dep": "C81",
            "dest": "KDLH",
            "aircraft": "pa28",
            "cruise_tas_kt": 118,
            "fuel_burn_gph": 9.9,
            "climb_tas_kt": 79,
            "climb_fuel_burn_gph": 13.2,
            "cruise_power_pct": 65,
        },
    )

    assert resp.status_code == 200
    aircraft = next(m for m in messages(resp) if m["type"] == "altitude")["aircraft"]
    assert aircraft["name"] == "pa28"
    assert aircraft["cruise_tas_kt"] == 118 and aircraft["fuel_burn_gph"] == 9.9
    assert aircraft["climb_tas_kt"] == 79 and aircraft["climb_fuel_burn_gph"] == 13.2
    assert aircraft["cruise_power_pct"] == 65
    assert aircraft["service_ceiling_ft"] == 14100  # the profile's own, untouched


def test_a_stock_profile_says_the_power_its_cruise_is_at(messages):
    resp = client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "aircraft": "pa28"})
    aircraft = next(m for m in messages(resp) if m["type"] == "altitude")["aircraft"]
    assert aircraft["cruise_power_pct"] == 75


@pytest.mark.parametrize("power", [30, 101])
def test_a_cruise_power_outside_a_cruise_table_is_refused(power):
    resp = client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "cruise_power_pct": power})
    assert resp.status_code == 422


def test_navlog_flies_the_economical_plan_when_asked(messages):
    resp = client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "altitude_choice": "economical"})

    altitude = next(m for m in messages(resp) if m["type"] == "altitude")
    assert altitude["flown"] == "economical"


def test_navlog_flies_a_route_with_no_legal_altitude_anyway(monkeypatch, altitude, messages):
    monkeypatch.setattr(altitude_module, "select_cruise_altitude", select_cruise_altitude_stub({**altitude, "recommended_ft": None}))

    lines = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH"}))

    assert lines[-1]["type"] == "done"
    assert next(m for m in lines if m["type"] == "altitude")["altitude_ft"] == 2500.0


def test_navlog_at_a_pilots_own_altitude_streams_it_then_its_legs(messages):
    """No stream test passed an altitude before."""
    lines = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "altitude_ft": 3500}))

    altitude = next(m for m in lines if m["type"] == "altitude")
    assert altitude["altitude_ft"] == 3500.0 and altitude["flown"] == "custom"
    assert [o["kind"] for o in altitude["options"]] == ["lowest", "highest", "fastest", "economical"]
    assert all(m["altitude_ft"] == 3500.0 for m in lines if m["type"] == "leg")
    assert lines[-1]["type"] == "done"


def test_navlog_at_a_pilots_own_altitude_without_winds_says_the_altitude_then_the_failure(monkeypatch, messages):
    no_winds(monkeypatch)
    lines = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "altitude_ft": 3500}))

    assert [m["type"] for m in lines if m["type"] != "stage"] == ["altitude", "error"]
    # Nothing is flown: no altitude, and no "custom" either -- the page
    # showed "· yours" with Custom pressed for this.
    assert lines[-2]["flown"] is None and lines[-2]["altitude_ft"] is None
    assert lines[-2]["altitude_selection"]["floor_ft"] == 2200.0
    assert "winds-06 unavailable" in lines[-1]["detail"]
