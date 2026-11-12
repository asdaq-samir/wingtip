"""wingtip.crash_drafts: one lead an event, its sources added as they
come, a fact it lacks taken from a later source (and checked afresh), and
the statuses it may have."""

import pytest
from wingtip import crash_drafts


@pytest.fixture(autouse=True)
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(crash_drafts, "_folder", lambda: tmp_path)


STATEMENT = {"source": "faa_statement", "text": "A Cirrus SR22 crashed in the Lake of the Ozarks State Park in Missouri around 2:15 p.m."}
NOTICE = {"source": "faa_notice", "text": "AIRCRAFT CRASHED INTO TREES."}
FACTS = {"local_date": "2026-11-03", "local_time": "14:15", "city": "Lake Ozark", "state": "MO", "aircraft": "Cirrus SR22"}


def test_the_statement_and_the_notice_of_one_event_are_one_lead():
    first = crash_drafts.upsert(FACTS, STATEMENT, now=1.0)
    crash_drafts.update(first, identity={"verdict": "needs_human", "checks": []}, identity_by="engine")
    again = crash_drafts.upsert({**FACTS, "city": "lake ozark ", "n_number": "N123AB", "fatal": True}, NOTICE, now=2.0)
    assert again == first
    lead = crash_drafts.draft(first)
    assert [s["source"] for s in lead["sources"]] == ["faa_statement", "faa_notice"]
    assert (lead["n_number"], lead["fatal"]) == ("N123AB", True)
    # Its first N-number is checked afresh.
    assert (lead["identity"], lead["identity_by"]) == (None, None)


def test_the_same_words_twice_are_one_source():
    first = crash_drafts.upsert(FACTS, STATEMENT, now=1.0)
    crash_drafts.upsert(FACTS, STATEMENT, now=2.0)
    assert len(crash_drafts.draft(first)["sources"]) == 1


def test_a_status_not_known_is_refused_and_a_missing_draft_said():
    first = crash_drafts.upsert(FACTS, STATEMENT)
    with pytest.raises(ValueError):
        crash_drafts.update(first, status="published")
    with pytest.raises(crash_drafts.NoSuchDraft):
        crash_drafts.draft("nope")
