"""/api/copilot/around: the in-flight copilot's inputs gathered from the
planner's sources (wingtip.copilot), each source replaced here by what
it answers, and the engine's copilot_watch asked with them as the app
asks it."""

import time

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from wingtip import copilot, engine, live_reports

from app.main import app

client = TestClient(app)


def _field(ident: str, name: str, lat: float, lon: float, raw: str, category: str) -> dict:
    """A candidate as wingtip.emergency.fields_near gives one."""
    return {
        "ident": ident,
        "name": name,
        "lat": lat,
        "lon": lon,
        "elevation_ft": 808.0,
        "distance_nm": 0.0,
        "bearing_deg": 0.0,
        "runways": [
            {
                "surface": "ASPH",
                "length_ft": 5941.0,
                "closed": False,
                "runway_ends": [{"ident": "18", "heading_true_deg": 179.0}, {"ident": "36", "heading_true_deg": 359.0}],
            }
        ],
        "metar": {"raw": raw, "flight_category": category},
        "towered": False,
        "private": False,
        "military": None,
        "frequencies": [],
        "phone": None,
    }


OSH = _field("KOSH", "Oshkosh", 43.9844, -88.557, "SPECI KOSH 091712Z 34012KT 2SM BR OVC008 08/07 A2992", "IFR")
FLD = _field("KFLD", "Fond du Lac", 43.7712, -88.4884, "KFLD 091655Z 33010KT 10SM SCT050 09/02 A3002", "VFR")


@pytest.fixture
def sources(tmp_path, monkeypatch):
    monkeypatch.setattr(live_reports, "STORE", tmp_path / "reports.sqlite")
    live_reports.reset()
    places = {"KOSH": OSH, "KFLD": FLD}
    monkeypatch.setattr(copilot.airports, "find_place", lambda ident: places.get(ident))
    monkeypatch.setattr(copilot.emergency, "fields_near", lambda lat, lon, limit=12: [FLD, OSH])
    monkeypatch.setattr(copilot.fuelstops, "fields_with_fuel", lambda: pd.DataFrame({"ident": ["KFLD"], "faa_ident": ["FLD"]}))
    monkeypatch.setattr(
        copilot.tfr,
        "along_route",
        lambda path, start, end: [
            {
                "notam_id": "6/4321",
                "title": "Stadium",
                "active_now": True,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[-88.46, 43.79], [-88.44, 43.79], [-88.44, 43.81], [-88.46, 43.81], [-88.46, 43.79]]],
                },
                "detail": {"effective": None, "expires": "2026-11-09T23:00:00Z"},
            }
        ],
    )
    monkeypatch.setattr(
        copilot.sua,
        "along_route",
        lambda a, b, fixes=None: [{"name": "R-6903", "lat": 43.8, "lon": -88.45}, {"name": "VOLK EAST MOA", "lat": 43.9, "lon": -88.5}],
    )
    monkeypatch.setattr(copilot.weather, "hazards_along_route", lambda a, b: [])
    now = time.time()
    area = {"designator": "R6903", "activations": [{"status": "ACTIVE", "active": True, "starts": now - 60, "ends": now + 3600}]}
    live_reports.put("saa", "R6903", area, place="R6903", ends=now + 3600)
    yield
    live_reports.reset()


def test_the_copilot_reads_round_the_airplane(sources):
    body = client.get(
        "/api/copilot/around", params={"lat": 43.6, "lon": -88.4, "dest": "kosh", "path": "43.6,-88.4;43.9844,-88.557"}
    ).json()
    fields = {f["ident"]: f for f in body["fields"]}
    assert fields["KOSH"]["name"] == "Oshkosh" and fields["KOSH"]["fuel"] is False
    assert fields["KFLD"]["fuel"] is True and fields["KFLD"]["runways"][0]["length_ft"] == 5941
    kinds = {(a["kind"], a["id"], a["active"]) for a in body["areas"]}
    # The MOA SFDPS has said nothing of is left to the Brief's chart times.
    assert kinds == {("tfr", "6/4321", True), ("sua", "R-6903", True)}
    assert body["unavailable"] == []

    # The app asks the engine with it and its GPS: Oshkosh is IFR, and
    # Fond du Lac, VFR with fuel, is the alternative named.
    answer = engine.ask(
        "copilot_watch",
        now_s=time.time(),
        own={"lat": 43.6, "lon": -88.4, "track_deg": 340, "gs_kt": 105},
        rules="VFR",
        dest="KOSH",
        fields=body["fields"],
        areas=body["areas"],
        itws=body["itws"],
    )
    first = answer["messages"][0]
    assert first["kind"] == "weather" and first["alternative"]["ident"] == "KFLD"
    assert "Fond du Lac is VFR" in first["say"]


def test_a_path_that_is_not_points_is_refused():
    response = client.get("/api/copilot/around", params={"lat": 43.6, "lon": -88.4, "dest": "KOSH", "path": "43.6;x"})
    assert response.status_code == 422


def test_a_closed_destination_is_sent_with_its_status_and_said(sources, monkeypatch):
    # NASR lists the destination as closed (ARPT_STATUS CI, decision 0043):
    # the field lists leave it out, so /around sends it with its status
    # and no runway, and the engine warns, naming Fond du Lac instead of
    # failing on a destination not among the fields.
    closed = {**OSH, "status": "CI", "closed": "Closed indefinitely"}
    places = {"KOSH": closed, "KFLD": FLD}
    monkeypatch.setattr(copilot.airports, "find_place", lambda ident: places.get(ident))
    monkeypatch.setattr(copilot.emergency, "fields_near", lambda lat, lon, limit=12: [FLD])
    body = client.get(
        "/api/copilot/around", params={"lat": 43.6, "lon": -88.4, "dest": "KOSH", "path": "43.6,-88.4;43.9844,-88.557"}
    ).json()
    sent = {f["ident"]: f for f in body["fields"]}
    assert sent["KOSH"]["status"] == "CI" and sent["KOSH"]["runways"] == []
    answer = engine.ask(
        "copilot_watch",
        now_s=time.time(),
        own={"lat": 43.6, "lon": -88.4, "track_deg": 340, "gs_kt": 105},
        rules="VFR",
        dest="KOSH",
        fields=body["fields"],
    )
    first = answer["messages"][0]
    assert first["kind"] == "closed" and first["level"] == "warning"
    assert first["title"].startswith("KOSH is closed indefinitely (NASR)")
    assert first["alternative"]["ident"] == "KFLD"
