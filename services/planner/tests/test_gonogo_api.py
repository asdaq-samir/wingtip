"""POST /api/go-no-go through its models, the planner's plan and briefing
stubbed: what the pilot sends -- minimums, the load, the ticks, the
logbook -- is what the findings are worked out with, as the web's
FlightBriefingView feeds lib/verdict."""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from wingtip.aircraft import load_aircraft_profile

from app.main import app
from app.gonogo import flight
from app.routers import gonogo

client = TestClient(app)
DEPART = datetime(2026, 10, 6, 14, 0, tzinfo=timezone.utc)
PROFILE = {"name": "c172", **load_aircraft_profile("c172")}


def legs() -> list[dict]:
    return [{"from": "C81", "to": "KDLH", "distance_nm": 300.0, "altitude_ft": 5500.0, "ete_min": 150.0}]


def nav(**over) -> dict:
    return {
        "flown": "lowest",
        "altitude_ft": 5500.0,
        "selection": {"special_use": []},
        "aircraft": PROFILE,
        "cautions": [],
        "options": [{"kind": "lowest", "steps": [{"altitude_ft": 5500.0, "to": "KDLH"}]}],
        **over,
    }


def totals(**over) -> dict:
    return {
        "ete_min": 150.0,
        "fuel_gal": 24.0,
        "fuel_required_gal": 30.2,
        "fuel_margin_gal": 22.8,
        "reserve_min": 30.0,
        "night": False,
        "hops": [],
        **over,
    }


def runways(length: int = 5000) -> list[dict]:
    return [
        {
            "ends": "09/27",
            "length_ft": length,
            "surface": "ASP",
            "closed": False,
            "runway_ends": [{"ident": "09", "heading_true_deg": 90}, {"ident": "27", "heading_true_deg": 270}],
            "wind": {"end": "27", "headwind_kt": 5, "crosswind_kt": 2, "gust_crosswind_kt": None},
        }
    ]


def briefing(**over) -> dict:
    return {
        "hazards": [],
        "gairmets": [],
        "pireps": [],
        "tfrs": [],
        "weather_unavailable": [],
        "vfr_not_recommended": [],
        "metars": {
            "C81": {
                "ceiling_ft": None,
                "visibility_sm": 10,
                "wind_speed_kt": 6,
                "wind_gust_kt": None,
                "temp_c": 15,
                "altimeter_in_hg": 29.92,
            },
            "KDLH": None,
        },
        "forecast": {"min_ceiling_ft": 3500, "min_visibility_sm": 6, "stations": []},
        "airports": {"C81": {"runways": runways()}, "KDLH": {"runways": runways(9000)}},
        **over,
    }


@pytest.fixture
def stubbed(monkeypatch):
    """The route, its plan and its briefing, each replaceable by a test."""
    world = {"planned": flight.Planned(nav=nav(), legs=legs(), totals=totals()), "briefing": briefing(), "asked": {}}
    route = SimpleNamespace(idents=["C81", "KDLH"], airports=[{"elevation_ft": 900.0}, {"elevation_ft": 1400.0}])
    monkeypatch.setattr(gonogo, "load_route", lambda dep, dest, stops: route)
    monkeypatch.setattr(flight, "plan_for", lambda q, r: world["planned"])

    def brief(q, ete_min):
        world["asked"]["ete_min"] = ete_min
        if isinstance(world["briefing"], Exception):
            raise world["briefing"]
        return world["briefing"]

    monkeypatch.setattr(flight, "brief_for", brief)
    return world


def ask(**over) -> dict:
    return {"dep": "C81", "dest": "KDLH", "depart": DEPART.isoformat(), "day": "2026-10-06", **over}


def by_key(body: dict) -> dict:
    return {i["key"]: i for i in body["items"]}


def test_a_quiet_flight_with_the_sample_load_and_a_pilot_is_nothing_found_against_it(stubbed):
    resp = client.post("/api/go-no-go", json=ask())
    assert resp.status_code == 200
    body = resp.json()
    items = by_key(body)
    assert [i["finding"] for i in body["items"]] == ["ok"] * 7
    assert body["line"] == {"finding": "ok", "words": "Nothing found against this flight"}
    assert items["weather"]["detail"] == "No hazards; at worst 3,500 ft · 6 sm"
    assert items["altitude"]["detail"] == "5,500 ft · Lowest plan"
    assert items["fuel"]["detail"] == "Needs 30.2 gal with taxi and a 30 min reserve; 22.8 gal spare"
    assert (items["fuel"]["tab"], items["fuel"]["section"]) == ("preflight", "Fuel")
    # The POH's sample airplane, a pilot of 170 lb and the usable fuel.
    assert body["balance"]["load"]["stations_lb"] == [170, 0, 0, 0]
    assert body["loading"]["stations"][0]["name"]
    assert items["balance"]["detail"].endswith(", within limits")
    assert body["risk"]["line"] == "Low · 0 points"
    assert [c["key"] for c in body["self_checks"]][:2] == ["illness", "medication"]
    # As the web's RiskAssessment lists them: in their groups, unmarked.
    marks = {c["key"]: (c["finding"], c["stop"], c["group"]) for c in body["self_checks"]}
    assert marks["alcohol"] == (None, True, "You") and marks["pressure"] == (None, False, "The day")
    # The briefing for the flight's own hours.
    assert stubbed["asked"]["ete_min"] == 150.0


def test_what_the_pilot_sends_decides_the_minimums_the_loading_and_the_risk(stubbed):
    resp = client.post(
        "/api/go-no-go",
        json=ask(
            minimums={"ceiling_ft": 5000},
            load={"empty_weight_lb": 1642, "empty_arm_in": 38.1, "stations_lb": [170, 400, 120, 50], "fuel_gal": 53},
            ticked=["alcohol"],
        ),
    )
    body = resp.json()
    items = by_key(body)
    assert items["weather"]["finding"] == "stop"
    assert items["weather"]["detail"] == "Under your minimums: Along the route, forecast ceiling 3,500 ft, under your 5,000 ft"
    assert items["balance"]["finding"] == "stop"
    assert "The baggage, 170 lb in all, is over its 120 lb" in body["balance"]["problems"]
    assert body["risk"]["level"] == "high"
    assert body["line"]["words"] == "No-go as planned: Weather, Weight & balance, Risk"


def test_a_tfr_crossed_while_in_force_and_one_passed_before_it_starts(stubbed):
    stubbed["briefing"] = briefing(
        tfrs=[
            {"notam_id": "6/1111", "crosses": True, "along_track_nm": 150.0, "effective": "2026-10-06T15:00:00Z", "expires": None},
            {"notam_id": "6/2222", "crosses": True, "along_track_nm": 10.0, "effective": "2026-10-06T18:00:00Z", "expires": None},
        ]
    )
    items = by_key(client.post("/api/go-no-go", json=ask()).json())
    # At 150 nm the flight is there at 15:15Z, in the first one's window.
    assert items["airspace"]["finding"] == "stop"
    assert items["airspace"]["detail"] == "TFR 6/1111 in force when you get there"


def test_a_route_with_no_legal_altitude_is_no_go_and_the_rest_waits_as_on_the_web(stubbed):
    stubbed["planned"] = flight.Planned(nav=None, legs=[], totals=None, problem="No legal altitude past KDLH")
    body = client.post("/api/go-no-go", json=ask()).json()
    items = by_key(body)
    assert (items["altitude"]["finding"], items["altitude"]["detail"]) == ("stop", "No legal altitude past KDLH")
    assert items["fuel"]["finding"] == "pending"
    assert body["line"]["finding"] == "stop"


def test_a_briefing_that_failed_is_said_as_not_fetched(stubbed):
    from fastapi import HTTPException

    stubbed["briefing"] = HTTPException(502, "aviationweather.gov did not answer")
    body = client.post("/api/go-no-go", json=ask()).json()
    items = by_key(body)
    assert (items["weather"]["finding"], items["weather"]["detail"]) == ("unknown", "Not fetched: aviationweather.gov did not answer")
    assert items["airspace"]["detail"] == "Not checked: see tfr.faa.gov"
    assert body["risk"] is None


def test_under_ifr_the_alternate_speaks_for_the_weather(stubbed, monkeypatch):
    asked = {}

    def alternate(dest, eta, tas, filed):
        asked.update(dest=dest, eta=eta, tas=tas, filed=filed)
        return {"destination": {"required": True}, "alternate": None}

    monkeypatch.setattr(flight, "alternate_for", alternate)
    body = client.post("/api/go-no-go", json=ask(rules="ifr")).json()
    weather = by_key(body)["weather"]
    assert weather["detail"] == "An alternate is required (14 CFR 91.169): file one in Weather"
    assert (weather["tab"], weather["section"]) == ("arrive", "Alternate")
    assert asked["dest"] == "KDLH" and asked["eta"] == datetime(2026, 10, 6, 16, 30, tzinfo=timezone.utc)


def test_a_tfr_the_briefing_placed_on_the_legs_is_in_force_by_its_word_the_whole_time_inside_it(stubbed):
    # The web's tfrInForce: on_route.when where the briefing gives it, the
    # pass time only where it does not.
    stubbed["briefing"] = briefing(
        tfrs=[
            {
                "notam_id": "6/3333",
                "crosses": True,
                "along_track_nm": 10.0,
                "effective": "2026-10-06T18:00:00Z",
                "expires": None,
                "on_route": {"when": "during"},
            },
            {
                "notam_id": "6/4444",
                "crosses": True,
                "along_track_nm": 150.0,
                "effective": "2026-10-06T15:00:00Z",
                "expires": None,
                "on_route": {"when": "after"},
            },
        ]
    )
    items = by_key(client.post("/api/go-no-go", json=ask()).json())
    assert items["airspace"]["detail"] == "TFR 6/3333 in force when you get there"
    stubbed["briefing"] = briefing(tfrs=[stubbed["briefing"]["tfrs"][1]])
    items = by_key(client.post("/api/go-no-go", json=ask()).json())
    assert (items["airspace"]["finding"], items["airspace"]["detail"]) == ("ok", "1 TFR near, none in force on the route")


def test_a_briefing_that_failed_with_nothing_to_say_is_said_as_the_web_says_it(stubbed):
    stubbed["briefing"] = RuntimeError("boom")
    items = by_key(client.post("/api/go-no-go", json=ask()).json())
    assert items["weather"]["detail"] == "Not fetched: could not load the briefing"


def test_a_pilots_own_altitude_is_written_as_the_owner_asked_and_a_ticked_check_keeps_its_group(stubbed):
    stubbed["planned"] = flight.Planned(nav=nav(flown="custom", altitude_ft=4500.0), legs=legs(), totals=totals())
    body = client.post("/api/go-no-go", json=ask(ticked=["pressure"])).json()
    assert by_key(body)["altitude"]["detail"] == "FL-045, your own"
    pressure = next(f for f in body["risk"]["factors"] if f["key"] == "pressure")
    assert (pressure["group"], pressure["finding"]) == ("The day", None)


def test_a_ceiling_of_unknown_height_is_not_checked(stubbed):
    """C81 reporting OVC/// with ten miles: no ceiling known (14 CFR 1.1),
    so the weather is not "ok" but says what it could not check."""
    metar = {**briefing()["metars"]["C81"], "ceiling_unknown": True}
    stubbed["briefing"] = briefing(metars={"C81": metar, "KDLH": None})
    items = by_key(client.post("/api/go-no-go", json=ask()).json())
    assert items["weather"]["finding"] == "caution"
    assert items["weather"]["detail"] == "Not checked: the ceiling at C81"


def test_freezing_rain_on_the_route_is_a_caution_on_a_vfr_flight_too(stubbed):
    """A METAR of -FZRA at the departure: it ices an airplane clear of cloud
    (AIM 7-1-20), so the weather says so though the flight is VFR."""
    metar = {**briefing()["metars"]["C81"], "raw": "KC81 061350Z 03008KT 3SM -FZRA OVC030 M01/M02 A3001"}
    stubbed["briefing"] = briefing(metars={"C81": metar, "KDLH": None})
    items = by_key(client.post("/api/go-no-go", json=ask()).json())
    assert items["weather"]["finding"] == "caution"
    assert items["weather"]["detail"] == "Freezing rain reported at C81 (METAR -FZRA); it ices an airplane out of cloud"


def test_under_ifr_icing_with_no_freezing_level_is_said_not_checked(stubbed, monkeypatch):
    # No alternate needed, so the weather's own finding stands.
    monkeypatch.setattr(flight, "alternate_for", lambda dest, eta, tas, filed: {"destination": {"required": False}, "alternate": None})
    stubbed["planned"] = flight.Planned(
        nav=nav(selection={"special_use": [], "icing_possible": True, "freezing_level_ft": None}), legs=legs(), totals=totals()
    )
    items = by_key(client.post("/api/go-no-go", json=ask(rules="ifr")).json())
    assert items["weather"]["finding"] == "caution"
    assert items["weather"]["detail"] == "Icing not checked: freezing level not known"


def test_what_swim_says_now_at_the_routes_airports_is_said_as_on_the_web(stubbed, tmp_path, monkeypatch):
    """An ITWS alert at KDLH is a caution with its source; a ground stop
    there is one under IFR only; an area SFDPS says is active now is said
    so (app.gonogo.live, the web's lib/liveReports)."""
    import time

    from wingtip import live_reports

    monkeypatch.setattr(live_reports, "STORE", tmp_path / "reports.sqlite")
    live_reports.reset()
    now = time.time()
    try:
        live_reports.put(
            "flow", "DLH:ground stop", {"airport": "DLH", "program": "ground stop", "ends": None}, place="DLH", ends=now + 3600
        )
        items = by_key(client.post("/api/go-no-go", json=ask()).json())
        assert items["weather"]["finding"] == "ok"
        # No alternate needed, so the weather's own finding stands.
        monkeypatch.setattr(flight, "alternate_for", lambda dest, eta, tas, filed: {"destination": {"required": False}, "alternate": None})
        items = by_key(client.post("/api/go-no-go", json=ask(rules="ifr")).json())
        assert (items["weather"]["finding"], items["weather"]["detail"]) == ("caution", "Ground stop at DLH (FAA Command Center)")
        alert = {"alert": "wind shear", "words": "Runway 27 arrival wind shear alert 25 kt, runway"}
        live_reports.put(
            "itws",
            "DLH:9840",
            {"airport": "DLH", "product": "9840", "name": "Configured Alerts Product", "alerts": [alert]},
            place="DLH",
            ends=now + 120,
        )
        items = by_key(client.post("/api/go-no-go", json=ask()).json())
        assert items["weather"] == {
            **items["weather"],
            "finding": "caution",
            "detail": "DLH: Runway 27 arrival wind shear alert 25 kt, runway (FAA ITWS, now)",
        }
        stubbed["planned"] = flight.Planned(
            nav=nav(selection={"special_use": [{"name": "R-4401A", "along_track_nm": 100.0, "times_of_use": None, "time_zone": None}]}),
            legs=legs(),
            totals=totals(),
        )
        live_reports.put(
            "saa",
            "R4401A",
            {"designator": "R4401A", "activations": [{"status": "ACTIVE", "active": True, "starts": None, "ends": None}]},
            place="R4401A",
            ends=now + 3600,
        )
        items = by_key(client.post("/api/go-no-go", json=ask(depart=datetime.now(timezone.utc).isoformat())).json())
        assert items["airspace"]["detail"] == "R-4401A active now (FAA SFDPS)"
    finally:
        live_reports.reset()
