"""crash.identity: the engine's occurrence_identity asked with the town's
point, the state's clocks, the registry's answer and the ADS-B track, its
verdict kept on the lead -- the shared fixture's agreeing case made ready,
a track of another airplane sent to a person, a day with no report in the
window a draft of the place alone, and a refusal from adsb.lol no verdict
at all. The registry, the gazetteer and adsb.lol are stubbed; the engine
is the real one (wingtip_native)."""

import json
from pathlib import Path

import pytest
from wingtip import crash_drafts, registry
from wingtip.traffic import TrafficUnavailable, day_tracks

from crash import identity, places

FIXTURE = json.loads((Path(__file__).resolve().parents[4] / "apps/web/src/lib/fixtures/occurrenceIdentity.json").read_text())
AGREE = FIXTURE["cases"][0]["input"]
MAYFIELD = (AGREE["report"]["lat"], AGREE["report"]["lon"])


@pytest.fixture
def lead(tmp_path, monkeypatch):
    monkeypatch.setattr(crash_drafts, "_folder", lambda: tmp_path)
    monkeypatch.setattr(places, "town_point", lambda city, state: MAYFIELD)
    monkeypatch.setattr(registry, "refresh", lambda: False)
    monkeypatch.setattr(registry, "lookup", lambda n_number=None, hex_id=None: {"n_number": "N123AB", "mode_s_hex": "a1b2c3"})
    facts = {"local_date": "2026-11-08", "local_time": "14:25", "city": "Mayfield", "state": "KY", "n_number": "N123AB"}
    draft_id = crash_drafts.upsert(facts, {"source": "faa_notice", "text": "AIRCRAFT CRASHED IN A FIELD."})
    return crash_drafts.draft(draft_id)


def _day(points, hex_id="a1b2c3"):
    return lambda q, day, today=None: {
        "hex": hex_id,
        "registration": "N123AB",
        "type": None,
        "day": day.isoformat(),
        "points": [
            {"t": p["t"], "lat": p["lat"], "lon": p["lon"], "alt_ft": 900.0, "gs_kt": 90.0, "track_deg": 180.0, "ground": False}
            for p in points
        ],
        "altitude": "pressure",
        "source": "adsb.lol",
        "license": "ODbL 1.0",
    }


def test_kentucky_in_november_is_read_at_central_and_eastern_time():
    assert places.offsets_min("KY", "2026-11-08") == [-300.0, -360.0]
    assert places.offsets_min("AZ", "2026-07-01") == [-420.0, -360.0]
    assert places.offsets_min(None, "2026-11-08") == []


def test_three_sources_agreeing_make_the_draft_ready_with_its_track(lead, monkeypatch):
    monkeypatch.setattr(day_tracks, "day_track", _day(AGREE["track"]["points"]))
    checked = identity.check(lead)
    assert (checked["status"], checked["track"], checked["hex"]) == ("ready", "adsb", "a1b2c3")
    assert checked["identity"]["verdict"] == "confirmed"
    assert checked["_track"]["points"]


def test_another_airplanes_track_waits_for_a_person(lead, monkeypatch):
    monkeypatch.setattr(day_tracks, "day_track", _day(AGREE["track"]["points"], hex_id="a1b2c4"))
    checked = identity.check(lead)
    assert checked["status"] == "needs_identity"
    assert checked["identity"]["verdict"] == "needs_human"


def test_no_report_in_the_window_is_a_draft_of_the_place_alone(lead, monkeypatch):
    monkeypatch.setattr(day_tracks, "day_track", _day([]))
    checked = identity.check(lead)
    assert (checked["status"], checked["track"]) == ("ready", "none")


def test_a_refusal_from_adsb_lol_makes_no_verdict(lead, monkeypatch):
    def down(q, day, today=None):
        raise TrafficUnavailable("refused")

    monkeypatch.setattr(day_tracks, "day_track", down)
    checked = identity.check(lead)
    assert (checked["status"], checked["identity"]) == ("needs_identity", None)


def test_no_n_number_waits_for_a_person(lead, monkeypatch):
    crash_drafts.update(lead["id"], n_number=None)
    checked = identity.check(crash_drafts.draft(lead["id"]))
    assert checked["status"] == "needs_identity"
    assert checked["identity"]["checks"][0]["check"] == "registry"
