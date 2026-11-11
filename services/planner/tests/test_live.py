"""/api/live/*: what SWIM says now, read from a reports store of the
test's own (wingtip.live_reports), written as ingest writes it."""

import time

import pytest
from fastapi.testclient import TestClient
from wingtip import live_reports

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def reports(tmp_path, monkeypatch):
    monkeypatch.setattr(live_reports, "STORE", tmp_path / "reports.sqlite")
    live_reports.reset()
    yield
    live_reports.reset()


def test_the_itws_alerts_at_a_routes_airports():
    now = time.time()
    alert = {
        "alert": "microburst",
        "words": "Runway 27L arrival microburst alert 40 kt, 3 mile final to runway",
        "runway": "27L",
        "direction": "arrival",
        "code": "MBA",
        "value_kt": 40.0,
    }
    live_reports.put(
        "itws",
        "ATL:9840",
        {"airport": "ATL", "product": "9840", "name": "Configured Alerts Product", "alerts": [alert], "expires": now + 120},
        place="ATL",
        ends=now + 120,
    )
    body = client.get("/api/live/itws", params={"airports": "KATL, KORD"}).json()
    [product] = body["alerts"]
    assert product["airport"] == "ATL" and product["alerts"][0]["words"].startswith("Runway 27L arrival")
    assert client.get("/api/live/itws", params={"airports": "KORD"}).json() == {"alerts": []}


def test_an_areas_status_by_the_designator_the_chart_gives():
    now = time.time()
    area = {"designator": "R4401A", "activations": [{"status": "ACTIVE", "active": True, "starts": now - 60, "ends": now + 3600}]}
    live_reports.put("saa", "R4401A", area, place="R4401A", ends=now + 3600)
    body = client.get("/api/live/saa", params={"designators": "R-4401A,R-4401B"}).json()
    assert list(body["areas"]) == ["R-4401A"]
    assert body["areas"]["R-4401A"]["active"] is True and body["areas"]["R-4401A"]["until"] == pytest.approx(now + 3600)


def test_an_airports_rvr_datis_flow_and_a_flights_departure():
    now = time.time()
    live_reports.put(
        "rvr",
        "DFW:13R",
        {"airport": "KDFW", "runway": "13R", "touchdown_ft": 6000, "touchdown_more": True, "midpoint_ft": None, "rollout_ft": 2400},
        place="KDFW",
        ends=now + 600,
    )
    [end] = client.get("/api/live/rvr", params={"airport": "kdfw"}).json()["runways"]
    assert (end["runway"], end["touchdown_more"], end["midpoint_ft"], end["rollout_ft"]) == ("13R", True, None, 2400)

    text = "MSP ARR INFO I 0353Z. VRB03KT 10SM SCT250 07/03 A3006. VISUAL RWY 30L APCH IN USE."
    live_reports.put(
        "datis",
        "MSP:arrival",
        {"airport": "KMSP", "which": "arrival", "letter": "I", "issued": "090357", "text": text},
        place="KMSP",
        ends=now + 600,
    )
    [broadcast] = client.get("/api/live/atis", params={"airport": "KMSP"}).json()["broadcasts"]
    assert broadcast["reading"]["altimeter_inhg"] == 30.06 and broadcast["letter"] == "I"

    live_reports.put(
        "flow",
        "EWR:ground stop",
        {"airport": "EWR", "program": "ground stop", "cancelled": False, "ends": now + 1800},
        place="EWR",
        ends=now + 1800,
    )
    [program] = client.get("/api/live/flow", params={"airports": "KEWR,KLGA"}).json()["programs"]
    assert program["program"] == "ground stop" and program["restriction"] is False

    live_reports.put(
        "departure",
        "N719AL:X1",
        {"ident": "N719AL", "flight_id": "X1", "departure": "KSEA", "times": {"clearance_delivery": now - 60}, "event_at": now - 60},
        place="N719AL",
        ends=now + 3600,
    )
    [event] = client.get("/api/live/departures", params={"ident": "n719al"}).json()["events"]
    assert event["departure"] == "KSEA" and event["times"]["clearance_delivery"] == pytest.approx(now - 60)
