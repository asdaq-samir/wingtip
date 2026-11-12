"""crash.kit: the facts and the captions written into the draft's folder
-- "Preliminary" said, the FAA's words quoted as they were written, no
cause and no name added, "No ADS-B track" where there is none -- and the
track where there is one."""

import json

import pytest
from wingtip import crash_drafts

from crash import kit

WORDS = "A Kitfox Supersport crashed in Estero, Florida, around 1:15 p.m. local time on Sunday, Nov. 8. Only the pilot was on board."


@pytest.fixture
def lead(tmp_path, monkeypatch):
    monkeypatch.setattr(crash_drafts, "_folder", lambda: tmp_path)
    facts = {"local_date": "2026-11-08", "local_time": "13:15", "city": "Estero", "state": "FL", "aircraft": "Kitfox Supersport"}
    draft_id = crash_drafts.upsert(facts, {"source": "faa_statement", "url": "https://www.faa.gov/x", "text": WORDS})
    return crash_drafts.update(draft_id, status="ready", track="none")


def test_the_captions_are_the_facts_and_the_faas_own_words(lead):
    words = kit.captions(lead)
    assert words["title"] == "Kitfox Supersport · Estero, FL · November 8, 2026"
    assert words["status"] == "Preliminary information, subject to change."
    assert words["quotes"] == [{"source": "FAA statement", "words": WORDS, "url": "https://www.faa.gov/x"}]
    assert words["track"] == "No ADS-B track"


def test_the_kit_is_written_and_the_draft_marked(lead):
    made = kit.make(lead, None, now=1.0)
    assert made["kit_at"] == 1.0
    folder = crash_drafts.kit_dir(lead["id"])
    written = json.loads((folder / "lead.json").read_text())
    assert written["captions"]["track"] == "No ADS-B track"
    # Never a guessed path for a draft without a track.
    assert not (folder / "track.json").exists()


def test_a_tracked_draft_keeps_its_track_and_credits_adsb_lol(lead):
    tracked = crash_drafts.update(lead["id"], track="adsb", hex="a1b2c3")
    track = {"hex": "a1b2c3", "day": "2026-11-08", "points": [], "altitude": "pressure", "source": "adsb.lol", "license": "ODbL 1.0"}
    kit.make(tracked, track, now=1.0)
    assert json.loads((crash_drafts.kit_dir(lead["id"]) / "track.json").read_text())["hex"] == "a1b2c3"
    assert "ADS-B: adsb.lol, ODbL 1.0" in kit.captions(tracked)["credits"]
