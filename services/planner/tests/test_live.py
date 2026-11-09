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
    alert = {"alert": "microburst", "words": "Runway 27L arrival microburst alert 40 kt, 3 mile final to runway",
             "runway": "27L", "direction": "arrival", "code": "MBA", "value_kt": 40.0}
    live_reports.put("itws", "ATL:9840", {"airport": "ATL", "product": "9840", "name": "Configured Alerts Product",
                                          "alerts": [alert], "expires": now + 120}, place="ATL", ends=now + 120)
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
