"""One of the engine's rules asked as a tool, end to end (issue #569): the
conversation in fixtures/rule_conversation.json through the real SDK's
tool runner -- the Messages API stood in for by an HTTP transport that
streams the fixture's turns, the planner by conftest's table. It holds
that the rule goes to Claude with its contract's schema, that the
model's call reaches the planner's POST /api/engine/{name} with the
model's input as the body, that the engine's answer goes back to the
model as the tool's result, and that the pilot sees the tool, the words
and the rule's source."""

import json
from pathlib import Path

import anthropic
import httpx2 as httpx

from app import assistant
from app.assistant import AssistantAsk, Context, Turn
from app.generated.engine_tools import TOOLS

CASE = json.loads((Path(__file__).parent / "fixtures" / "rule_conversation.json").read_text())


def _sse(events: list[dict]) -> bytes:
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


def _turn(n: int, turn: dict) -> bytes:
    """One of the model's turns as the Messages API streams it."""
    start = {
        "type": "message_start",
        "message": {
            "id": f"msg_{n}",
            "type": "message",
            "role": "assistant",
            "model": "claude-opus-5-5",
            "content": [],
            "stop_reason": None,
            "stop_sequence": None,
            "usage": {"input_tokens": 10, "output_tokens": 1},
        },
    }
    if "tool_use" in turn:
        use = turn["tool_use"]
        blocks = [
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "tool_use", "id": use["id"], "name": use["name"], "input": {}},
            },
            {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": json.dumps(use["input"])}},
            {"type": "content_block_stop", "index": 0},
        ]
        stop = "tool_use"
    else:
        blocks = [
            {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
            *({"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": t}} for t in turn["text"]),
            {"type": "content_block_stop", "index": 0},
        ]
        stop = "end_turn"
    end = [
        {"type": "message_delta", "delta": {"stop_reason": stop, "stop_sequence": None}, "usage": {"output_tokens": 20}},
        {"type": "message_stop"},
    ]
    return _sse([start, *blocks, *end])


def test_a_rule_tool_is_asked_through_the_planner_and_its_answer_said(monkeypatch, fake_planner):
    sent: list[dict] = []

    def messages_api(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=_turn(len(sent), CASE["turns"][len(sent) - 1]))

    client = anthropic.Anthropic(api_key="test", http_client=httpx.Client(transport=httpx.MockTransport(messages_api)))
    monkeypatch.setattr(assistant, "_client", lambda: client)
    fake_planner.answer(CASE["planner"]["path"], CASE["planner"]["answer"])

    ask = AssistantAsk(messages=[Turn(role="user", content=CASE["question"])], context=Context(**CASE["context"]))
    got = [json.loads(line) for line in "".join(assistant.answer(ask)).splitlines()]

    # Claude was given the rule with the contract's own description and schema.
    use = CASE["turns"][0]["tool_use"]
    rule = next(t for t in TOOLS if t["name"] == use["name"])
    offered = next(t for t in sent[0]["tools"] if t["name"] == use["name"])
    assert offered["description"] == rule["description"] and offered["input_schema"] == rule["input_schema"]
    # The model's call went to the planner's engine endpoint, its input the body.
    assert fake_planner.calls == [("POST", CASE["planner"]["path"], use["input"], None)]
    # The engine's answer went back to the model as the tool's result.
    result = next(b for b in sent[1]["messages"][-1]["content"] if b["type"] == "tool_result")
    assert result["tool_use_id"] == use["id"]
    content = result["content"] if isinstance(result["content"], str) else result["content"][0]["text"]
    assert content == CASE["expect"]["tool_result"]
    # The pilot sees the tool, the words and the rule's source.
    assert [e["type"] for e in got] == CASE["expect"]["events"]
    assert got[0] == {"type": "tool", "name": use["name"], "label": CASE["expect"]["label"]}
    assert "".join(e["text"] for e in got if e["type"] == "text") == "".join(CASE["turns"][1]["text"])
    (source,) = next(e for e in got if e["type"] == "sources")["sources"]
    assert source["id"].startswith(f"rule:{use['name']}:") and '"answered":3500' in source["text"]
