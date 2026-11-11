"""The Brief's NOTAMs that matter (app.notam_rank), from the fixture in
fixtures/notam_rank_conversation.json: the planner's ranking answered from
conftest's table, Claude stubbed. The engine's order holds but for a tie
the model may reorder; a line with a figure its NOTAM does not have is
the engine's reasons instead; the model out of reach is every line the
engine's, and the ranking still whole."""

import json
from pathlib import Path

import anthropic
import pytest
from fastapi.testclient import TestClient

from app import notam_rank
from app.generated.planner_models import NotamsRanked
from app.main import app

client = TestClient(app)
REAL_LINES = notam_rank._lines
CASE = json.loads((Path(__file__).parent / "fixtures" / "notam_rank_conversation.json").read_text())


@pytest.fixture(autouse=True)
def no_real_model(monkeypatch):
    def unexpected(ranked, coverage_since):
        raise AssertionError("the model was asked without a canned answer")

    monkeypatch.setattr(notam_rank, "_lines", unexpected)


def test_the_ranking_is_the_engines_with_the_models_lines_and_its_tie(monkeypatch, fake_planner):
    asked = []
    fake_planner.answer("/api/notams/ranked", lambda body: asked.append(body) or CASE["planner"])
    material = []
    monkeypatch.setattr(
        notam_rank,
        "_lines",
        lambda ranked, since: material.append([n.id for n in ranked]) or notam_rank.NotamLines.model_validate(CASE["model"]),
    )

    resp = client.post("/api/words/notams/ranked", json=CASE["ask"])

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert asked == [CASE["ask"]]
    assert material == [[n["id"] for n in CASE["planner"]["notams"]]]
    assert [n["id"] for n in body["notams"]] == CASE["expect"]["order"]
    assert [n["id"] for n in body["notams"] if n["top"]] == CASE["expect"]["top"]
    assert [n["rank"] for n in body["notams"]] == [1, 2, 3, 4, 5, 6]
    first = body["notams"][0]
    assert first["worded"] and first["why"] == "Your landing runway 18/36 at KOSH is closed 1400Z to 1800Z."
    assert first["label"] == "NOTAM OSH 11/012" and first["raw"].startswith("!OSH 11/012")
    # 2100Z is in neither the TFR nor its reasons: the engine's line stands.
    tfr = next(n for n in body["notams"] if n["id"] == "6/1234")
    assert not tfr["worded"] and tfr["why"] == CASE["expect"]["engine_line"]["6/1234"] and tfr["label"] == "TFR 6/1234"
    assert body["coverage_since"] == "2026-10-19" and body["unavailable"] is None


def test_an_order_that_moves_a_notam_out_of_its_tie_is_ignored():
    ranked = NotamsRanked.model_validate(CASE["planner"]).notams
    assert [n.id for n in notam_rank.reordered(ranked, ["OSH 11/015", "OSH 11/012"])] == [n.id for n in ranked]
    assert [n.id for n in notam_rank.reordered(ranked, ["ZAU 11/301"])] == [n.id for n in ranked]


def test_the_model_out_of_reach_is_every_line_the_engines(monkeypatch, fake_planner):
    fake_planner.answer("/api/notams/ranked", CASE["planner"])

    def out(ranked, since):
        raise LookupError("The briefer cannot be reached.")

    monkeypatch.setattr(notam_rank, "_lines", out)
    body = client.post("/api/words/notams/ranked", json=CASE["ask"]).json()
    assert [n["id"] for n in body["notams"]] == [n["id"] for n in CASE["planner"]["notams"]]
    assert not any(n["worded"] for n in body["notams"])
    assert body["notams"][0]["why"] == (
        "In force while you are at KOSH; At KOSH, your destination; Names runway 18/36, the one in use at KOSH; Closes what it names."
    )
    assert body["unavailable"] == "The briefer cannot be reached."


def test_an_api_error_is_said_as_unavailable(monkeypatch):
    class Broken:
        def __init__(self, *a, **k):
            raise anthropic.AnthropicError("no key")

    monkeypatch.setattr(notam_rank, "_lines", REAL_LINES)
    monkeypatch.setattr(notam_rank.anthropic, "Anthropic", Broken)
    ranked = NotamsRanked.model_validate(CASE["planner"])
    with pytest.raises(LookupError):
        notam_rank._lines(ranked.notams, None)


def test_nothing_heard_is_no_call(fake_planner):
    fake_planner.answer("/api/notams/ranked", {"notams": [], "top": 0, "coverage_since": "2026-10-19", "unchecked": ["tfrs"]})
    body = client.post("/api/words/notams/ranked", json=CASE["ask"]).json()
    assert body["notams"] == [] and body["unchecked"] == ["tfrs"] and body["unavailable"] is None
