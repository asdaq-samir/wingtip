"""The pilot's assistant (app.assistant): the conversation as the API
takes it, the events it streams, and the sources its tools keep -- with
the model stood in for, as test_oral stands in for the examiner, and the
planner's HTTP API answered from each test's own table (conftest)."""
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import assistant, rule_tools
from app.assistant import AssistantAsk, Context, OwnShip, Toolbox, Turn
from app.main import app
from app.generated.planner_client import PlannerError

client = TestClient(app)


def events(lines: str) -> list[dict]:
    return [json.loads(line) for line in lines.splitlines() if line.strip()]


class FakeStream:
    """One turn of the model as the SDK streams it: text events, then the
    final message with its blocks and stop reason."""

    def __init__(self, texts, blocks=(), stop_reason="end_turn"):
        self.texts = texts
        self.message = SimpleNamespace(content=list(blocks), stop_reason=stop_reason)

    def __iter__(self):
        for text in self.texts:
            yield SimpleNamespace(type="text", text=text)

    def get_final_message(self):
        return self.message


def tool_use(name, **input):
    return SimpleNamespace(type="tool_use", name=name, input=input)


def test_the_context_is_written_into_the_last_question_only():
    ask = AssistantAsk(
        messages=[Turn(role="user", content="Hi"), Turn(role="assistant", content="Hello"), Turn(role="user", content="Can I go?")],
        context=Context(dep="C81", dest="KDLH", aircraft="c172", altitude_ft=4500, own_ship=OwnShip(lat=42.3, lon=-88.1),
                        pilot={"personal_minimums": {"ceiling_ft": 3000}}),
    )
    turns = assistant.conversation(ask)
    assert turns[0] == {"role": "user", "content": "Hi"}
    assert turns[1] == {"role": "assistant", "content": "Hello"}
    last = turns[2]["content"]
    assert last.startswith("<context>")
    assert "route: C81 KDLH" in last and "airplane: c172" in last and "cruise altitude: 4500 ft" in last
    assert "own ship: 42.300, -88.100" in last and '"ceiling_ft":3000' in last
    assert last.endswith("<question>\nCan I go?\n</question>")


def test_a_conversation_not_ending_on_the_pilot_is_refused():
    ask = AssistantAsk(messages=[Turn(role="user", content="Hi"), Turn(role="assistant", content="Hello")])
    with pytest.raises(HTTPException) as err:
        assistant.conversation(ask)
    assert err.value.status_code == 422


def test_the_tools_are_the_planners_nine_and_the_engines_rules_by_name():
    box = Toolbox(Context(dep="C81", dest="KDLH", stops=["KJVL"]))
    hand = ["airport", "briefing_for", "divert", "find_place", "go_no_go", "nearest_airports", "plan_flight",
            "propose_change", "weather_at"]
    assert sorted(t.name for t in box.tools[:len(hand)]) == hand
    assert sorted(t.name for t in box.tools[len(hand):]) == sorted(rule_tools.NAMES)
    # No rule's name takes a hand tool's: each name is one tool.
    assert len(box.by_name) == len(box.tools)
    # The plan's route fills what the question left out.
    assert box.route("", "", "") == ("C81", "KDLH", "KJVL")
    assert box.route("kjvl", "", "") == ("KJVL", "KDLH", "KJVL")


def test_the_events_stream_in_order_with_the_tools_sources():
    box = Toolbox(Context(dep="C81", dest="KDLH"))
    # The model asks for the weather (the tool reads a METAR), then answers.
    box.source("metar:KDLH", "METAR KDLH 1753Z", "KDLH 031753Z 27012G18KT 10SM OVC035 04/M02 A2992")
    runner = iter([FakeStream([], blocks=[tool_use("weather_at", ident="KDLH")], stop_reason="tool_use"),
                   FakeStream(["Duluth is ", "VFR now."], stop_reason="end_turn")])
    ask = AssistantAsk(messages=[Turn(role="user", content="How is Duluth?")], context=Context(dep="C81", dest="KDLH"))
    got = events("".join(assistant.answer(ask, runner=runner, box=box)))
    assert got[0] == {"type": "tool", "name": "weather_at", "label": "The weather at KDLH"}
    assert [e["text"] for e in got if e["type"] == "text"] == ["Duluth is ", "VFR now."]
    sources = next(e for e in got if e["type"] == "sources")["sources"]
    assert sources == [{"id": "metar:KDLH", "label": "METAR KDLH 1753Z", "text": "KDLH 031753Z 27012G18KT 10SM OVC035 04/M02 A2992"}]
    assert got[-1] == {"type": "done"}


def test_a_refusal_and_a_cut_off_answer_are_errors_in_words():
    ask = AssistantAsk(messages=[Turn(role="user", content="?")])
    refused = events("".join(assistant.answer(ask, runner=iter([FakeStream([], stop_reason="refusal")]))))
    assert refused[-1]["type"] == "error" and "declined" in refused[-1]["words"]
    cut = events("".join(assistant.answer(ask, runner=iter([FakeStream(["so"], stop_reason="max_tokens")]))))
    assert cut[-1]["type"] == "error" and "room" in cut[-1]["words"]


def test_the_weather_tool_keeps_the_metar_as_sent_as_a_source(fake_planner):
    metar = {"raw": "KDLH 031753Z 27012KT 10SM CLR 04/M02 A2992", "observed_at": "2026-11-03T17:53:00Z", "flight_category": "VFR"}
    fake_planner.answer("/api/airport/KDLH", {"ident": "KDLH", "name": "Duluth Intl", "elevation_ft": 1428.0, "metar": metar,
                                              "nearby_metar": None})
    box = Toolbox()
    answer = json.loads(box.by_name["weather_at"].call({"ident": "kdlh"}))
    assert answer["metar"]["flight_category"] == "VFR" and answer["elevation_ft"] == 1428.0
    assert [s.id for s in box.sources] == ["metar:KDLH"] and box.sources[0].label == "METAR KDLH 1753Z"


def test_a_tfr_and_a_runway_are_read_by_the_planners_own_field_names(fake_planner):
    # The briefing's Tfr has notam_id and the fields read from the NOTAM,
    # no text of it; a runway is named by its ends (openapi.json).
    tfr = {"notam_id": "5/1234", "title": "Security", "kind": "SECURITY", "floor_ft": 0, "floor_ref": "AGL",
           "ceiling_ft": 3000, "ceiling_ref": "MSL", "effective": "2026-11-09T12:00:00Z", "expires": None,
           "active_now": True, "crosses": True, "along_track_nm": 12.0}
    fake_planner.answer("/api/briefing", {"tfrs": [tfr], "hazards": [], "metars": {}})
    box = Toolbox(Context(dep="KDLH", dest="KMSP"))
    answer = json.loads(box.by_name["briefing_for"].call({}))
    assert answer["tfrs"][0]["notam_id"] == "5/1234" and answer["tfrs"][0]["crosses"] is True
    assert box.sources[0].label == "TFR 5/1234"
    assert box.sources[0].text == "Security; SECURITY; 0 ft AGL to 3000 ft MSL; 2026-11-09T12:00:00Z"
    fake_planner.answer("/api/airport/KDLH", {"ident": "KDLH", "name": "Duluth Intl", "elevation_ft": 1428.0,
                                              "runways": [{"ends": "09/27", "length_ft": 10162}]})
    box = Toolbox()
    box.by_name["airport"].call({"ident": "KDLH"})
    assert box.sources[0].text.endswith("runways 09/27 10162 ft")


def test_a_tool_that_fails_tells_the_model_in_the_planners_words(fake_planner):
    fake_planner.answer("/api/airport/ZZZZ", PlannerError(404, "No US airport goes by 'ZZZZ'."))
    assert Toolbox().by_name["weather_at"].call({"ident": "ZZZZ"}) == "Error: No US airport goes by 'ZZZZ'."
    # An ident is a path segment and nothing more: a stray slash cannot
    # reach another of the planner's paths.
    fake_planner.answer("/api/airport/APIPLAN", PlannerError(404, "No US airport goes by 'APIPLAN'."))
    Toolbox().by_name["airport"].call({"ident": "../api/plan"})
    assert fake_planner.calls[-1][1] == "/api/airport/APIPLAN"


def test_the_plan_tool_asks_the_planners_plan_with_the_plans_own_fields(fake_planner):
    fake_planner.answer("/api/plan", lambda q: {
        "legs": [{"from": "C81", "to": "KDLH", "distance_nm": 300.0, "ete_min": 150.0, "fuel_gal": 25.0, "candidates": []}],
        "totals": {"distance_nm": 300.0, "ete_min": 150.0, "fuel_gal": 25.0}, "altitude_ft": 5500.0,
        "altitude_choice": "fastest", "altitude_cautions": [], "candidates": [{"big": True}]})
    box = Toolbox(Context(dep="C81", dest="KDLH", aircraft="pa28140", depart="2026-11-03T15:10:00Z"))
    answer = json.loads(box.by_name["plan_flight"].call({}))

    assert fake_planner.calls[0][2] == {"dep": "C81", "dest": "KDLH", "aircraft": "pa28140",
                                        "depart": "2026-11-03T15:10:00Z", "rules": "vfr"}
    assert answer["totals"]["ete_min"] == 150.0 and answer["flown"] == "fastest" and "candidates" not in answer
    assert box.sources[0].text == "The plan C81 to KDLH: 300.0 nm, 150.0 min, 25.0 gal at 5500.0 ft"


def test_the_go_no_go_tool_sends_the_pilots_own_minimums_in_the_asks_shape(fake_planner):
    fake_planner.answer("/api/go-no-go", lambda body: {"line": {"finding": "ok", "words": "Go"}, "items": [], "risk": None})
    box = Toolbox(Context(dep="C81", dest="KDLH", pilot={"personal_minimums": {"ceiling_ft": 3000}, "currency": ["Night not current"]}))
    box.by_name["go_no_go"].call({})
    body = fake_planner.calls[0][2]
    # Currency as lines of words is the model's to read, not the verdict's.
    assert body["minimums"] == {"ceiling_ft": 3000} and "currency" not in body and "aircraft" not in body
    assert [s.id for s in box.sources] == ["verdict"]


def test_a_proposed_change_is_checked_as_a_route_and_follows_the_text_as_an_action(fake_planner):
    fake_planner.answer("/api/route-check", lambda q: {"stops": q.get("stops", "").split(",") if q.get("stops") else []})
    box = Toolbox(Context(dep="C81", dest="KDLH", altitude_ft=4500))
    said = json.loads(box.by_name["propose_change"].call({"stops": "krhi", "why": "A fuel stop halfway, with the headwind."}))
    # The route as it would then be, through the planner's own check;
    # the idents upper-cased, the stops a list, nothing computed.
    assert fake_planner.calls[0][:3] == ("GET", "/api/route-check", {"dep": "C81", "dest": "KDLH", "stops": "KRHI"})
    assert said == {"proposed": {"stops": ["KRHI"]}, "words": "A fuel stop halfway, with the headwind."}
    runner = iter([FakeStream([], blocks=[tool_use("propose_change", stops="krhi")], stop_reason="tool_use"),
                   FakeStream(["Rhinelander ", "as a stop."], stop_reason="end_turn")])
    ask = AssistantAsk(messages=[Turn(role="user", content="Add a fuel stop at Rhinelander")], context=box.context)
    got = events("".join(assistant.answer(ask, runner=runner, box=box)))
    # The proposal after the words and before the sources, so the chip reads under the answer.
    assert [e["type"] for e in got] == ["tool", "text", "text", "action", "sources", "done"]
    assert got[0]["label"] == "A change to the plan"
    assert got[3] == {"type": "action", "change": {"stops": ["KRHI"]}, "words": "A fuel stop halfway, with the headwind."}


def test_a_bad_ident_is_an_error_to_the_model_and_never_an_action(fake_planner):
    fake_planner.answer("/api/route-check", PlannerError(404, "No US airport goes by 'ZZZZ'."))
    box = Toolbox(Context(dep="C81", dest="KDLH"))
    assert box.by_name["propose_change"].call({"dest": "zzzz"}) == "Error: No US airport goes by 'ZZZZ'."
    assert box.by_name["propose_change"].call({}) == "Error: nothing to change: give the field that would change."
    assert box.actions == []
    ask = AssistantAsk(messages=[Turn(role="user", content="Go to ZZZZ instead")], context=box.context)
    got = events("".join(assistant.answer(ask, runner=iter([FakeStream(["No field goes by ZZZZ."])]), box=box)))
    assert [e["type"] for e in got] == ["text", "sources", "done"]


def test_a_change_with_no_route_yet_asks_the_check_with_the_one_ident(fake_planner):
    fake_planner.answer("/api/route-check", {"stops": []})
    box = Toolbox()
    said = json.loads(box.by_name["propose_change"].call({"dest": "kmsn", "altitude_ft": 6500.0, "depart": "2026-11-03T15:10:00Z"}))
    assert fake_planner.calls[0][2] == {"dest": "KMSN"}
    assert said["proposed"] == {"dest": "KMSN", "altitude_ft": 6500, "depart": "2026-11-03T15:10:00Z"}


def test_the_last_proposal_of_a_kind_wins_and_three_at_most():
    def change(**fields):
        return {"change": fields, "words": ""}

    stops_first, stops_last = change(stops=["KRHI"]), change(stops=["KRHI", "KJVL"])
    altitude, time, both = change(altitude_ft=6500), change(depart="2026-11-03T15:10:00Z"), change(stops=["KRHI"], altitude_ft=6500)
    assert assistant.proposals([stops_first, altitude, stops_last]) == [altitude, stops_last]
    assert assistant.proposals([stops_first, both, altitude, time]) == [both, altitude, time]


def test_the_endpoint_streams_ndjson(monkeypatch):
    monkeypatch.setattr(assistant, "runner_for", lambda turns, box: iter([FakeStream(["Yes."], stop_reason="end_turn")]))
    response = client.post("/api/assistant", json={"messages": [{"role": "user", "content": "Can I go?"}],
                                                   "context": {"dep": "C81", "dest": "KDLH", "stops": []}})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    got = events(response.text)
    assert got[0] == {"type": "text", "text": "Yes."} and got[-1] == {"type": "done"}


def test_the_endpoint_refuses_a_conversation_that_is_not_the_pilots_turn():
    response = client.post("/api/assistant", json={"messages": [{"role": "assistant", "content": "Hello"}]})
    assert response.status_code == 422
