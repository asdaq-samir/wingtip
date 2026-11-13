"""/api/studio/drafts: the Studio's crash drafts as the crash-leads job
left them in the store (a store of the test's own), judged by the
developer; the gateway's two of its own never forwarded."""

import json

import pytest
from fastapi.testclient import TestClient
from wingtip import crash_drafts

from app.main import app

client = TestClient(app)

WORDS = (
    "A Kitfox Supersport crashed in Estero, Florida, around 1:15 p.m. local time on Sunday, Nov. 8. "
    "Only the pilot was on board. The FAA will investigate."
)
STATEMENT = {
    "source": "faa_statement",
    "url": "https://www.faa.gov/newsroom/statements/accident_incidents",
    "heading": "General Aviation / Estero, Florida",
    "text": WORDS,
}


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(crash_drafts, "_folder", lambda: tmp_path)
    facts = {
        "local_date": "2026-11-08",
        "local_time": "13:15",
        "city": "Estero",
        "state": "FL",
        "aircraft": "Kitfox Supersport",
        "n_number": "N123AB",
    }
    return crash_drafts.upsert(facts, STATEMENT, now=1.0)


def test_the_drafts_with_their_status_and_sources(store):
    drafts = client.get("/api/studio/drafts").json()
    assert [d["id"] for d in drafts] == [store]
    assert drafts[0]["status"] == "needs_identity"
    assert drafts[0]["sources"][0]["text"].startswith("A Kitfox Supersport crashed")


def test_confirming_makes_a_draft_ready_and_rejecting_forgets_the_match(store):
    crash_drafts.update(store, hex="a1b2c3", track="adsb")
    ready = client.post(f"/api/studio/drafts/{store}/identity", json={"confirm": True}).json()
    assert (ready["status"], ready["identity_by"], ready["track"]) == ("ready", "developer", "adsb")
    back = client.post(f"/api/studio/drafts/{store}/identity", json={"confirm": False}).json()
    assert (back["status"], back["hex"], back["identity_by"]) == ("needs_identity", None, "rejected")


def test_a_new_n_number_is_checked_again_before_it_is_ready(store):
    asked = client.post(f"/api/studio/drafts/{store}/identity", json={"confirm": True, "n_number": "n456cd"}).json()
    assert (asked["status"], asked["n_number"], asked["identity"]) == ("needs_identity", "N456CD", None)


def test_dismissed_drafts_and_a_missing_one(store):
    assert client.post(f"/api/studio/drafts/{store}/dismiss").json()["status"] == "dismissed"
    assert client.get("/api/studio/drafts/nope").status_code == 404


def test_only_a_ready_draft_is_rendered(store):
    assert client.post(f"/api/studio/drafts/{store}/rendered").status_code == 409
    crash_drafts.update(store, status="ready", kit_at=2.0)
    assert client.post(f"/api/studio/drafts/{store}/rendered").json()["status"] == "rendered"


def test_a_draft_without_a_track_is_a_404_never_a_guess_and_its_kit_track_is_served(store, tmp_path):
    assert client.get(f"/api/studio/drafts/{store}/track").status_code == 404
    folder = crash_drafts.kit_dir(store)
    folder.mkdir(parents=True)
    track = {
        "hex": "a1b2c3",
        "day": "2026-11-08",
        "points": [{"t": 1.0, "lat": 26.4, "lon": -81.8}],
        "altitude": "pressure",
        "source": "adsb.lol",
        "license": "ODbL 1.0",
    }
    (folder / "track.json").write_text(json.dumps(track))
    assert client.get(f"/api/studio/drafts/{store}/track").json()["hex"] == "a1b2c3"


def test_the_gateway_is_told_each_ready_draft_once(store):
    crash_drafts.update(store, status="ready", kit_at=2.0)
    assert [d["id"] for d in client.get("/api/studio/drafts-to-notice").json()] == [store]
    client.post(f"/api/studio/drafts/{store}/noticed")
    assert client.get("/api/studio/drafts-to-notice").json() == []


def test_the_drafts_are_the_developers_and_the_notice_the_gateways_alone():
    paths = app.openapi()["paths"]
    assert paths["/api/studio/drafts"]["get"]["x-gateway"] == {"access": "developer"}
    notice = paths["/api/studio/drafts-to-notice"]["get"]
    assert "x-gateway" not in notice and notice["x-internal"] == "gateway"
