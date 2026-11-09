"""The engine's rules as the assistant's tools (issue #569): every rule the
engine's contract tags "x-tool": true -- an altitude, a wind, a reserve,
a density altitude, weather minimums, currency, an alternate, a hold, a
glide -- is a tool by its own name, its description (with the CFR or AIM
paragraph it rests on) and its input schema from the contract
(app/generated/engine_tools.py), answered by the planner's POST
/api/engine/{name}, which asks the engine. A rule tagged in the contract
is a tool here with no code added, and the figure the model states is the
app's own rule's, never the model's arithmetic."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Protocol
from collections.abc import Callable

from anthropic import beta_tool

from .generated import planner_client as planner
from .generated.engine_tools import TOOLS
from .tool_answers import as_json, failed

#: The names of the rule tools, for the screen's label while one runs.
NAMES = frozenset(tool["name"] for tool in TOOLS)


class Sourced(Protocol):
    def source(self, id: str, label: str, text: str) -> None: ...


def label(name: str) -> str:
    """What the screen says while a rule runs: "Working out the lowest vfr
    cruising altitude"."""
    return "Working out the " + name.replace("_", " ")


def _runner(box: Sourced, name: str) -> Callable[..., str]:
    def run(**given: Any) -> str:
        try:
            answer = planner.engine_rule(name=name, body=given)  # type: ignore[arg-type] -- name is one of the contract's
        except Exception as err:  # noqa: BLE001 -- the model is told, in the planner's words
            return failed(err)
        # The source is what was asked and what the rule answered, so the
        # pilot sees the figures the sentence rests on.
        asked = json.dumps(given, sort_keys=True, default=str)
        key = hashlib.sha256(asked.encode()).hexdigest()[:8]
        box.source(
            f"rule:{name}:{key}", label(name)[len("Working out the ") :].capitalize(), as_json({"asked": given, "answered": answer})[:1500]
        )
        return as_json(answer)

    return run


def rule_tools(box: Sourced) -> list:
    """Each rule tool of one answer, its sources kept on `box`."""
    return [
        beta_tool(_runner(box, tool["name"]), name=tool["name"], description=tool["description"], input_schema=tool["input_schema"])
        for tool in TOOLS
    ]
