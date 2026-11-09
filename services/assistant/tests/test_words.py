"""The readings in words (app.words), Claude stubbed and the planner's
sources answered from the test's table: a sentence is kept only where
every id it cites is a source given; the briefer out of reach is an
answer with no sentences and why; no sources is no call; the planner's
refusal is the answer's."""
from types import SimpleNamespace

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from app import words
from app.main import app
from app.planner import PlannerError

client = TestClient(app)
REAL_SAID = words._said
METAR_C81 = "KC81 061353Z AUTO 27008KT 10SM CLR 15/07 A2992"
FLIGHT = {"id": "flight:route", "label": "The flight", "text": "From C81 to KDLH."}
C81 = {"id": "metar:C81", "label": "C81 METAR", "text": METAR_C81}


def canned(monkeypatch, *outputs):
    """The model's answers, one a call, and each call's material."""
    calls = []

    def said(material, output):
        calls.append(material)
        return output.model_validate(outputs[len(calls) - 1])

    monkeypatch.setattr(words, "_said", said)
    return calls


@pytest.fixture(autouse=True)
def no_real_model(monkeypatch):
    """No test here may reach the model: a call not canned fails."""
    def unexpected(material, output):
        raise AssertionError("the model was asked without a canned answer")

    monkeypatch.setattr(words, "_said", unexpected)


def _response(status: int):
    return httpx.Response(status, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))


def test_a_sentence_citing_a_given_id_is_kept_with_its_source_and_one_citing_an_unknown_id_is_dropped(monkeypatch):
    calls = canned(monkeypatch, {"sentences": [
        {"text": "C81 is VFR with 10 sm.", "sources": ["metar:C81"]},
        {"text": "KDLH is IFR.", "sources": ["metar:C81", "metar:KDLH"]},  # not a source it was given
        {"text": "The sky is clear.", "sources": []},  # rests on nothing
    ]})
    given = [words.Source(**C81), words.Source(id="taf:KDLH", label="KDLH TAF", text="TAF text")]

    answer = words.say("Say it.", given)

    assert [s.text for s in answer.sentences] == ["C81 is VFR with 10 sm."]
    assert [s.id for s in answer.sources] == ["metar:C81"]  # the one cited, not every one given
    assert answer.unavailable is None and answer.model == words.WORDS_MODEL
    # The sources are set apart as data, and the ask follows them.
    assert '<source id="metar:C81" label="C81 METAR">\n' + METAR_C81 in calls[0] and calls[0].endswith("Say it.")


def test_the_sentences_are_capped_at_most_and_no_sources_is_no_call(monkeypatch):
    calls = canned(monkeypatch, {"sentences": [{"text": f"Sentence {i}.", "sources": ["a"]} for i in range(5)]})
    answer = words.say("Say it.", [words.Source(id="a", label="A", text="a")], most=2)
    assert len(answer.sentences) == 2 and len(calls) == 1
    assert words.say("Say it.", []).sentences == [] and len(calls) == 1


def test_the_briefer_out_of_reach_or_out_of_room_is_no_sentences_and_why(monkeypatch):
    # The real call, to a client whose key is refused, then to one that cut its answer off.
    monkeypatch.setattr(words, "_said", REAL_SAID)

    def refused(**kwargs):
        raise anthropic.AuthenticationError("invalid x-api-key", response=_response(401), body=None)

    monkeypatch.setattr(words.anthropic, "Anthropic", lambda: SimpleNamespace(messages=SimpleNamespace(parse=refused)))
    answer = words.say("Say it.", [words.Source(id="a", label="A", text="a")])
    assert answer.sentences == [] and "invalid x-api-key" in answer.unavailable

    cut = lambda **kwargs: SimpleNamespace(stop_reason="max_tokens", parsed_output=None)  # noqa: E731
    monkeypatch.setattr(words.anthropic, "Anthropic", lambda: SimpleNamespace(messages=SimpleNamespace(parse=cut)))
    answer = words.say("Say it.", [words.Source(id="a", label="A", text="a")])
    assert answer.sentences == [] and "ran out of room" in answer.unavailable


def test_each_reading_passes_its_ask_to_the_planners_sources_and_says_them(monkeypatch, fake_planner):
    fake_planner.answer("/api/words/weather/sources", {"sources": [FLIGHT, C81]})
    calls = canned(monkeypatch, {"sentences": [{"text": "C81 is VFR, wind 270 at 8.", "sources": ["metar:C81"]}]})
    ask = {"dep": "c81", "dest": "kdlh", "stops": ["KMSN"], "ete_min": 150, "fixes": "42,-88;46,-92"}

    resp = client.post("/api/words/weather", json=ask)

    assert resp.status_code == 200, resp.text
    assert fake_planner.calls == [("POST", "/api/words/weather/sources", ask, None)]
    assert [s["text"] for s in resp.json()["sentences"]] == ["C81 is VFR, wind 270 at 8."]
    assert resp.json()["sources"] == [C81]
    assert '<source id="flight:route"' in calls[0] and calls[0].endswith(words.WEATHER_ASK)


def test_the_notam_words_carry_the_feeds_since_and_what_was_unchecked(monkeypatch, fake_planner):
    fake_planner.answer("/api/words/notams/sources", {"sources": [], "coverage_since": "2025-10-09", "unchecked": ["tfrs"]})
    body = client.post("/api/words/notams", json={"dep": "C81", "dest": "KDLH"}).json()
    # No NOTAM and no TFR: nothing to say, and no call.
    assert body["sentences"] == [] and body["unavailable"] is None
    assert body["coverage_since"] == "2025-10-09" and body["unchecked"] == ["tfrs"]


def test_the_notam_prompt_carries_the_coverage_day_and_never_claims_completeness(monkeypatch, fake_planner):
    calls = canned(monkeypatch, {"sentences": [{"text": "Runway 09/27 is closed.", "sources": ["notam:DLH 10/012"]}]})
    fake_planner.answer("/api/words/notams/sources", {
        "sources": [{"id": "notam:DLH 10/012", "label": "NOTAM DLH 10/012", "text": "RWY 09/27 CLSD"}],
        "coverage_since": "2026-10-19", "unchecked": []})
    body = client.post("/api/words/notams", json={"dep": "C81", "dest": "KDLH"}).json()
    assert "<coverage>NOTAMs heard from the FAA feed since 2026-10-19.</coverage>" in calls[0]
    assert "Never say there are no NOTAMs" in words.SYSTEM and "none heard since" in words.SYSTEM
    assert body["coverage_since"] == "2026-10-19"


def test_the_changes_make_no_call_when_nothing_changed(monkeypatch, fake_planner):
    calls = canned(monkeypatch, {"sentences": [{"text": "C81 went IFR.", "sources": ["metar:C81"]}]})
    fake_planner.answer("/api/words/changes/sources", {"sources": []})

    resp = client.post("/api/words/changes", json={"dep": "C81", "dest": "KDLH", "then": {}, "now": {}})

    assert resp.json() == {"changed": False, "sentences": [], "sources": [], "model": words.WORDS_MODEL, "unavailable": None}
    assert calls == []

    fake_planner.answer("/api/words/changes/sources", {"sources": [FLIGHT, C81]})
    answer = client.post("/api/words/changes", json={"dep": "C81", "dest": "KDLH", "then": {}, "now": {}}).json()
    assert answer["changed"] is True and [s["text"] for s in answer["sentences"]] == ["C81 went IFR."]


def test_the_debrief_words_carry_the_instructor_note_and_the_planners_422_is_the_answers(monkeypatch, fake_planner):
    fake_planner.answer("/api/words/debrief/sources", {"sources": [{"id": "leg:1", "label": "Leg Lake to B", "text": "300 ft high."}]})
    canned(monkeypatch, {"sentences": [{"text": "The second leg ran 300 ft high.", "sources": ["leg:1"]}],
                         "instructor_note": "Altitude on the second leg wants work."})

    body = client.post("/api/words/debrief", json={"debrief": {"takeoff": 1}}).json()
    assert body["instructor_note"] == "Altitude on the second leg wants work."

    fake_planner.answer("/api/words/debrief/sources", PlannerError(422, "There is no debrief to put into words."))
    resp = client.post("/api/words/debrief", json={"debrief": {"debrief": None}})
    assert resp.status_code == 422 and resp.json()["detail"] == "There is no debrief to put into words."


def test_the_material_is_capped_in_sources_and_in_characters():
    many = [words.Source(id=f"s{i}", label="S", text="x") for i in range(500)]
    assert words._material("Say it.", many).count("<source ") == words.MOST_SOURCES
    long = [words.Source(id=f"s{i}", label="S", text="y" * words.SOURCE_CHARS) for i in range(40)]
    material = words._material("Say it.", long)
    assert material.count("<source ") == words.MOST_MATERIAL_CHARS // words.SOURCE_CHARS
    assert len(material) < words.MOST_MATERIAL_CHARS + 2_000
