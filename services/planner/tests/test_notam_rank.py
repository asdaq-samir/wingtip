"""POST /api/notams/ranked (routers/notam_rank.py, wingtip.notam_rank): the
route's NOTAMs and TFRs handed to the engine's notams_ranked with each
field's time and runway in use, and every one back, best first, with its
text as sent. The feed, the TFRs and the airspace are stood in for; the
ranking is the engine's own."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from wingtip import notam_rank, notams, tfr

client = TestClient(app)


def _feed(monkeypatch, found, tfrs=()):
    asked = {}

    def at_fields(fields, now=None):
        asked["fields"] = fields
        return found

    monkeypatch.setattr(notams, "at_fields", at_fields)
    monkeypatch.setattr(notams, "since", lambda: 1_762_000_000.0)
    monkeypatch.setattr(tfr, "along_route", lambda path, start, end: list(tfrs))
    monkeypatch.setattr(notam_rank, "airspaces_on", lambda path: ["CHICAGO CLASS B"])
    return asked


def test_the_runway_in_use_closed_comes_first_and_tomorrows_closure_last(monkeypatch):
    asked = _feed(
        monkeypatch,
        [
            {
                "id": "MSN 11/030",
                "location": "MSN",
                "starts": "2026-11-15T12:00:00Z",
                "ends": "2026-11-15T20:00:00Z",
                "schedule": None,
                "text": "RWY 09/27 CLSD",
                "raw": "!MSN 11/030 MSN RWY 09/27 CLSD 2611151200-2611152000",
            },
            {
                "id": "MSN 11/012",
                "location": "MSN",
                "starts": "2026-11-14T14:00:00Z",
                "ends": "2026-11-14T18:00:00Z",
                "schedule": None,
                "text": "RWY 18/36 CLSD",
                "raw": "!MSN 11/012 MSN RWY 18/36 CLSD 2611141400-2611141800",
            },
        ],
        tfrs=[
            {
                "notam_id": "6/1234",
                "title": "VIP movement",
                "effective": "2026-11-14T13:00:00Z",
                "expires": "2026-11-14T19:00:00Z",
                "floor_ft": 0,
                "floor_ref": "SFC",
                "ceiling_ft": 3000,
                "ceiling_ref": "MSL",
                "crosses": True,
            }
        ],
    )

    resp = client.post(
        "/api/notams/ranked",
        json={
            "dep": "C81",
            "dest": "KMSN",
            "depart": "2026-11-14T14:00:00Z",
            "ete_min": 70,
            "altitude_ft": 4500,
            "runways": {"kmsn": "RWY 36"},
        },
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert asked["fields"] == ["C81", "KMSN"]
    assert [n["id"] for n in body["notams"]] == ["MSN 11/012", "6/1234", "MSN 11/030"]
    first = body["notams"][0]
    assert first["top"] and first["field"] == "KMSN" and first["role"] == "dest" and first["kind"] == "notam"
    assert first["raw"].startswith("!MSN 11/012")
    assert {"key": "runway", "words": "Names runway 18/36, the one in use at KMSN"} in first["reasons"]
    # The TFR's 3,000 ft top is clear of 4,500 ft, but the route goes through it.
    tfr_item = body["notams"][1]
    assert tfr_item["kind"] == "tfr" and tfr_item["high_ft"] == 3000
    assert [r["key"] for r in tfr_item["reasons"]] == ["time", "altitude", "airspace"]
    # Not in force while the flight is at KMSN: never in the top.
    assert body["notams"][2]["in_force"] is False and not body["notams"][2]["top"]
    assert body["top"] == 2 and body["coverage_since"] == "2025-11-01" and body["unchecked"] == []


def test_the_tfrs_unread_are_said_and_nothing_heard_is_nothing_ranked(monkeypatch):
    _feed(monkeypatch, [])

    def unavailable(path, start, end):
        raise tfr.TfrUnavailable("not read yet")

    monkeypatch.setattr(tfr, "along_route", unavailable)
    body = client.post("/api/notams/ranked", json={"dep": "C81", "dest": "KMSN"}).json()
    assert body == {"notams": [], "top": 0, "coverage_since": "2025-11-01", "unchecked": ["tfrs"]}


def test_each_field_is_timed_round_when_the_flight_is_there():
    from datetime import datetime, timezone

    fields, flight = notam_rank.windows(
        [("C81", "dep"), ("KJVL", "stop"), ("KMSN", "dest")], datetime(2026, 11, 14, 14, tzinfo=timezone.utc), 70
    )
    assert [(f["from"], f["until"]) for f in fields] == [
        ("2026-11-14T13:00:00Z", "2026-11-14T15:00:00Z"),
        ("2026-11-14T13:00:00Z", "2026-11-14T16:10:00Z"),
        ("2026-11-14T14:10:00Z", "2026-11-14T16:10:00Z"),
    ]
    assert flight == {"from": "2026-11-14T13:00:00Z", "until": "2026-11-14T16:10:00Z"}


def test_a_fields_card_gets_its_own_notams_and_the_tfrs_near_it(monkeypatch):
    asked = _feed(
        monkeypatch,
        [
            {
                "id": "MSN 11/040",
                "location": "MSN",
                "starts": "2020-01-01T00:00:00Z",
                "ends": None,
                "schedule": None,
                "text": "RWY 18/36 CLSD",
                "raw": "!MSN 11/040 MSN RWY 18/36 CLSD 2001010000-PERM",
            }
        ],
    )
    near = {}

    def near_point(lat, lon, start, end):
        near["at"] = (round(lat, 1), round(lon, 1))
        return []

    monkeypatch.setattr(tfr, "near_point", near_point)
    resp = client.get("/api/airport/kmsn/notams")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert asked["fields"] == ["KMSN"]
    assert near["at"] == (43.1, -89.3)
    only = body["notams"][0]
    assert only["id"] == "MSN 11/040" and only["field"] == "KMSN" and only["role"] == "stop"
    assert only["in_force"] is True and only["closed"] and only["raw"].startswith("!MSN 11/040")
    assert body["unchecked"] == []


def test_a_tfr_near_the_field_carries_what_the_card_reads_it_by(monkeypatch):
    """KSJT's security TFR as the weather service keeps it (FDC 6/2478,
    2026-11-12): its kind, rule, title, levels, instructions, NOTAM text and
    facility passed through for the card's engine (tfr_read), and the field
    and its nearest edge beside them; its NOTAM's text is what was sent."""
    _feed(monkeypatch, [])
    sjt = {
        "notam_id": "6/2478",
        "title": "SAN ANGELO, TX, Sunday, November 1, 2026 through Sunday, March 14, 2027 Local",
        "kind": "Security",
        "effective": "2026-11-01T07:00:00Z",
        "expires": "2027-03-14T08:00:00Z",
        "rule": "special security instructions (99.7)",
        "floor_ft": 3500.0,
        "floor_ref": "MSL",
        "ceiling_ft": 18000.0,
        "ceiling_ref": "MSL",
        "instructions": ["4. FORT WORTH ARTCC, TELEPHONE 817-858-7503, IS THE FAA COORDINATION FACILITY."],
        "text": "!FDC 6/2478 ZFW TX..AIRSPACE SAN ANGELO, TX..TEMPORARY FLIGHT RESTRICTIONS.",
        "facility": {"name": "Fort Worth ARTCC", "phone": "817-858-7503", "frequency": None},
        "contact": None,
        "crosses": False,
        "edge": {"lat": 43.0, "lon": -89.3},
    }
    monkeypatch.setattr(tfr, "near_point", lambda lat, lon, start, end: [sjt])
    resp = client.get("/api/airport/kmsn/notams")
    assert resp.status_code == 200, resp.text
    only = resp.json()["notams"][0]
    assert only["kind"] == "tfr" and only["raw"] == sjt["text"]
    facts = only["tfr"]
    assert (facts["kind"], facts["rule"], facts["floor_ft"], facts["ceiling_ref"]) == ("Security", sjt["rule"], 3500.0, "MSL")
    assert facts["facility"] == sjt["facility"] and facts["instructions"] == sjt["instructions"]
    assert facts["over_field"] is False and facts["edge"] == {"lat": 43.0, "lon": -89.3}
    assert facts["field"]["lat"] == pytest.approx(43.14, abs=0.05)


def test_a_field_no_one_knows_is_a_404(monkeypatch):
    _feed(monkeypatch, [])
    resp = client.get("/api/airport/ZZZZ9/notams")
    assert resp.status_code == 404
