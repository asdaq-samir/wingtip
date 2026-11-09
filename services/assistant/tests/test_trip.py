"""The trip planner (app.trip), end to end on the owner's example in
fixtures/trip_conversation.json: the model's turns streamed by the real
SDK's tool runner over an HTTP transport (as test_rule_conversation does),
the planner answered from the fixture's tables. It holds that each tool
reaches its planner endpoint, that the proposal's figures are the
planner's and never the model's, that the times the model wrote on the
pilot's clock are read in the pilot's zone, that the constraints are
checked (the fuel price said as not applied), and that the pilot gets the
proposal, its sources and nothing applied."""
import json
from pathlib import Path

import anthropic
import httpx2 as httpx
from fastapi.testclient import TestClient

from app.main import app
from app.trip import agent
from app.trip.schemas import TripAsk
from app.trip.tools import TripToolbox

from tests.test_rule_conversation import _turn

CASE = json.loads((Path(__file__).parent / "fixtures" / "trip_conversation.json").read_text())
P = CASE["planner"]


def _planner(fake) -> None:
    for path in ("/api/route-options", "/api/departure-window", "/api/stops/along"):
        fake.answer(path, P[path])
    fake.answer("/api/route-profile", lambda q: P["profile_clear"] if q.get("stops") else P["profile_class_b"])
    fake.answer("/api/route-check", lambda q: {"stops": [s for s in q.get("stops", "").split(",") if s]})

    def plan(q):
        if q.get("class_b_clearance"):
            return P["plan_cleared"]
        return P["plan_outbound"] if q["dep"] == "C81" else P["plan_return"]

    fake.answer("/api/plan", plan)


def _model(monkeypatch) -> list[dict]:
    sent: list[dict] = []

    def messages_api(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        return httpx.Response(200, headers={"content-type": "text/event-stream"},
                              content=_turn(len(sent), CASE["turns"][len(sent) - 1]))

    client = anthropic.Anthropic(api_key="test", http_client=httpx.Client(transport=httpx.MockTransport(messages_api)))
    monkeypatch.setattr(agent, "_client", lambda: client)
    return sent


def test_the_oshkosh_trip_is_proposed_from_the_planners_figures(monkeypatch, fake_planner):
    _planner(fake_planner)
    sent = _model(monkeypatch)

    got = [json.loads(line) for line in "".join(agent.plan_trip(TripAsk(**CASE["ask"]))).splitlines()]

    assert [e["type"] for e in got] == CASE["expect"]["events"]
    assert [e["label"] for e in got if e["type"] == "tool"] == CASE["expect"]["labels"]
    plan = next(e for e in got if e["type"] == "plan")["proposal"]
    assert plan == CASE["expect"]["proposal"]
    # The model was given the pilot's words, their plan and their clock.
    first = sent[0]["messages"][0]["content"]
    assert "<trip>\nVFR to Oshkosh Saturday morning" in first and "pilot's time zone: America/Chicago" in first
    assert "route: C81 ?" in first and "airplane: c172" in first
    # Its first call reached the planner with 0800 on the pilot's clock read as 1400Z.
    options = next(c for c in fake_planner.calls if c[1] == "/api/route-options")
    assert options[2] == {"dep": "C81", "dest": "KOSH", "aircraft": "c172", "depart": "2026-11-14T14:00:00Z"}
    # Each leg was planned at the planner at the time and altitude chosen.
    legs = [c[2] for c in fake_planner.calls if c[1] == "/api/plan" and not c[2].get("class_b_clearance")]
    assert [(q["dep"], q["stops"], q["altitude_ft"], q["depart"]) for q in legs] == [
        ("C81", "KUES", 4500, "2026-11-14T14:00:00Z"), ("KOSH", "KUES", 5500, "2026-11-14T20:30:00Z")]
    # The proposal's figures went back to the model, for its words.
    result = next(b for b in sent[5]["messages"][-1]["content"] if b["type"] == "tool_result")
    text = result["content"] if isinstance(result["content"], str) else result["content"][0]["text"]
    assert '"arrive_local":"Sat 2026-11-14 15:40 CST"' in text and "no fuel prices" in text
    ids = [s["id"] for s in next(e for e in got if e["type"] == "sources")["sources"]]
    assert ids == ["routes:C81-KOSH", "window:C81-KOSH", "airspace:C81-KOSH", "fuel:C81-KOSH", "plan:C81-KOSH-KUES",
                   "plan:KOSH-C81-KUES"]


def _box(fake) -> TripToolbox:
    _planner(fake)
    return TripToolbox(TripAsk(**CASE["ask"]).context, "America/Chicago")


def test_a_deadline_missed_and_a_class_b_crossed_are_said_and_the_plan_still_proposed(fake_planner):
    box = _box(fake_planner)
    made = json.loads(box.propose_trip(dep="C81", dest="KOSH", depart="2026-11-14T08:00", return_depart="2026-11-14T16:30",
                                       back_by="2026-11-14T17:00", avoid_class_b=True))
    assert [leg["kind"] for leg in made["legs"]] == ["outbound", "return"]
    assert made["unmet"] == [
        "The return leg lands Sat 2026-11-14 17:40 CST, after Sat 2026-11-14 17:00 CST.",
        "The outbound leg still passes through the CHICAGO CLASS B; plan under or round it.",
        "The return leg still passes through the CHICAGO CLASS B; plan under or round it.",
    ]
    assert box.proposal is not None and box.proposal.legs[0].airspace[0].startswith("CHICAGO CLASS B (Class B), 3,600 ft")


def test_a_departure_outside_the_go_window_is_said(fake_planner):
    box = _box(fake_planner)
    box.departure_window(dep="C81", dest="KOSH", start="2026-11-14T06:00")
    made = json.loads(box.propose_trip(dep="C81", dest="KOSH", depart="2026-11-14T13:00", stops="KUES"))
    assert made["legs"][0]["window"] is None
    assert made["unmet"] == ["The outbound leg leaves outside the go hours the forecasts give."]


def test_a_bad_ident_is_the_planners_words_to_the_model_and_no_proposal(fake_planner):
    from app.generated.planner_client import PlannerError

    box = _box(fake_planner)
    fake_planner.answer("/api/route-check", PlannerError(404, "No airport or fix named KXYZ."))
    assert box.propose_trip(dep="C81", dest="KXYZ", depart="2026-11-14T08:00") == "Error: No airport or fix named KXYZ."
    assert box.proposal is None


def test_the_fuel_stops_say_there_are_no_prices(fake_planner):
    found = json.loads(_box(fake_planner).fuel_stops(dep="C81", dest="KOSH"))
    assert found["prices"] is None and "no fuel prices" in found["prices_note"]
    assert found["fields"][0]["ident"] == "KUES"


def test_the_route_is_signed_in_paid_and_a_bad_zone_refused():
    route = app.openapi()["paths"]["/api/trip-plan"]["post"]
    assert route["x-gateway"] == {"access": "signed-in", "paid": "ASSISTANT", "bodyLimit": 32768}
    resp = TestClient(app).post("/api/trip-plan", json={**CASE["ask"], "time_zone": "Mars/Olympus"})
    assert resp.status_code == 422


def test_no_proposal_is_said_in_words(monkeypatch, fake_planner):
    class Runner:
        def __iter__(self):
            return iter([])

    got = [json.loads(line) for line in agent.plan_trip(TripAsk(**CASE["ask"]), runner=Runner())]
    assert got == [{"type": "error", "words": "No trip could be put together from the figures; say it another way."}]
