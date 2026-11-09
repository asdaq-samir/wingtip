# ruff: noqa: E501 -- the planner's lines are kept whole, as it writes them.
"""The proficiency plan in words (app.coach), the model stubbed and the
planner's lines answered from the test's table, as the planner gives them
for the shared fixture pilot Avery (apps/web/src/lib/fixtures/coach.json):
the words cite the plan's own ids, a sentence citing an id not given or
quoting a number its sources do not hold is dropped, a session line must
cite its session, and the model out of reach leaves the plan without
words."""
import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from app import words
from app.main import app

client = TestClient(app)

PLAN = {"today": "2026-11-09", "due": [], "reminders": [], "evidence": [], "weak_areas": [], "sessions": []}
LINES = [
    {"id": "due:night_passengers", "label": "Passengers at night",
     "text": "Passengers at night: lapses soon, until 2026-11-18 (14 CFR 61.57(b)). 90 days from the third most recent night full-stop landing (61.57(b))."},
    {"id": "ev:1", "label": "KMSN 2026-10-25",
     "text": "2026-10-25 at KMSN: Off the course or glidepath 413 ft above the field, under the 500 ft gate (AC 61-98D 2.1.4)."},
    {"id": "ev:4", "label": "KMSN 2026-09-30",
     "text": "2026-09-30 at KMSN: Off the course or glidepath 363 ft above the field, under the 500 ft gate (AC 61-98D 2.1.4)."},
    {"id": "session:2", "label": "Session 2",
     "text": "Session 2: Three takeoffs and three landings to a full stop, from 1 hour after sunset (61.57(b)). At C29 (Middleton Muni - Morey Fld, your home field). About 60 min. Answers due:night_passengers."},
    {"id": "session:3", "label": "Session 3",
     "text": "Session 3: Stabilized approaches (AC 61-98D 2.1.4). At KMSN (Dane County Rgnl/Truax Fld, 7.6 nm from home), the ILS OR LOC RWY 36. About 60 min. With an instructor. May count toward a WINGS flight activity when flown with an authorized instructor to the ACS standard (AC 61-91K 7.3): Takeoffs and landings, ACS PA.IV.B. Answers ev:1, ev:4."},
]


@pytest.fixture
def planner_lines(fake_planner):
    fake_planner.answer("/api/words/coach/sources", {"sources": LINES})
    return fake_planner


def canned(monkeypatch, output: dict):
    calls = []

    def said(material, out):
        calls.append(material)
        return out.model_validate(output)

    monkeypatch.setattr(words, "_said", said)
    return calls


def test_the_words_cite_the_plan_and_what_strays_is_dropped(monkeypatch, planner_lines):
    calls = canned(monkeypatch, {
        "sentences": [
            {"text": "Your night passenger currency runs out on 2026-11-18.", "sources": ["due:night_passengers"]},
            {"text": "Twice into KMSN you were off the glidepath under 500 ft.", "sources": ["ev:1", "ev:4"]},
            {"text": "You are current for night until 2026-12-01.", "sources": ["due:night_passengers"]},  # a day not in it
            {"text": "Your medical is fine.", "sources": ["due:medical"]},  # not a source given
        ],
        "session_lines": [
            {"session": "session:2", "text": "Three night full-stop landings at home keep passengers at night.", "sources": ["session:2", "due:night_passengers"]},
            {"session": "session:3", "text": "Fly the ILS at KMSN with an instructor; it may count toward WINGS.", "sources": ["session:3", "ev:1"]},
            {"session": "session:3", "text": "A second line for the same session.", "sources": ["session:3"]},
            {"session": "session:9", "text": "A session the plan does not have.", "sources": ["session:9"]},
            {"session": "session:2", "text": "No id of its own.", "sources": ["due:night_passengers"]},
        ],
    })
    answer = client.post("/api/words/coach", json=PLAN)
    assert answer.status_code == 200, answer.text
    a = answer.json()
    # The plan went to the planner whole, for its lines.
    assert planner_lines.calls[0][1:3] == ("/api/words/coach/sources", PLAN)
    assert [s["text"] for s in a["sentences"]] == [
        "Your night passenger currency runs out on 2026-11-18.",
        "Twice into KMSN you were off the glidepath under 500 ft.",
    ]
    assert [(line["session"], line["text"]) for line in a["session_lines"]] == [
        ("session:2", "Three night full-stop landings at home keep passengers at night."),
        ("session:3", "Fly the ILS at KMSN with an instructor; it may count toward WINGS."),
    ]
    assert {s["id"] for s in a["sources"]} == {"due:night_passengers", "ev:1", "ev:4", "session:2", "session:3"}
    # The model was given the lines as sources and told the decision is the pilot's.
    assert 'id="session:3"' in calls[0] and "91.3" in calls[0] and "may count" in calls[0]


def test_the_model_out_of_reach_leaves_the_plan_without_words(monkeypatch, planner_lines):
    def unreachable(material, output):
        raise words.WordsUnavailable(str(anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com"))))

    monkeypatch.setattr(words, "_said", unreachable)
    a = client.post("/api/words/coach", json=PLAN).json()
    assert a["sentences"] == [] and a["session_lines"] == []
    assert a["unavailable"]


def test_a_plan_with_nothing_to_say_asks_no_model(monkeypatch, fake_planner):
    fake_planner.answer("/api/words/coach/sources", {"sources": []})

    def unexpected(material, output):
        raise AssertionError("the model was asked")

    monkeypatch.setattr(words, "_said", unexpected)
    a = client.post("/api/words/coach", json=PLAN).json()
    assert a["sentences"] == [] and a["unavailable"] is None
