"""The engine's rules a pilot asks about, by name, for the assistant's
tools (issue #569): POST /api/engine/{name} with the rule's input as the
body answers what wingtip_native.call answers. The names are the ones the
engine's contract (engine/contract/engine.schema.json) tags "x-tool":
true, generated into app/generated/engine_tools.py, so a rule tagged
there is asked here with no code added, and no other rule is.

Internal: only the assistant service asks it, on the stack's own network.
It carries no x-gateway, so the gateway does not forward it and no
browser or phone reaches it."""
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from wingtip.engine import ask as engine

from ..gateway import INTERNAL_ASSISTANT
from ..generated.engine_tools import EngineToolName

router = APIRouter()


@router.post("/api/engine/{name}", openapi_extra=INTERNAL_ASSISTANT)
def engine_rule(name: EngineToolName, given: dict[str, Any] = Body(default_factory=dict)) -> Any:
    """The engine's rule `name` on the input given, its answer as the
    engine gives it (the contract's `answer` for the name). An input not
    of the rule's shape is a 422 with the engine's words."""
    try:
        return engine(name, **given)
    except ValueError as err:
        raise HTTPException(422, str(err)) from err
