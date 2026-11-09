"""What every assistant tool hands the model: the planner's answer as
compact JSON, or its refusal in its own words, never a traceback."""
from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel

from .generated.planner_client import PlannerError

log = logging.getLogger(__name__)


def plain(value: Any) -> Any:
    """A planner model as the JSON it came as (fields it did not send left
    out, "from" by its own name); lists and dicts of them alike."""
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json", by_alias=True, exclude_unset=True)
    if isinstance(value, list):
        return [plain(v) for v in value]
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    return value


def pick(model: BaseModel | None, *names: str) -> dict:
    """Some of a model's fields by their Python names ("from_" read as
    "from"): a name the planner's models no longer have is an
    AttributeError, never a quiet None."""
    if model is None:
        return {}
    return {name.rstrip("_"): plain(getattr(model, name)) for name in names}


def as_json(value: Any) -> str:
    """A tool's answer as JSON for the model: compact, dates as text."""
    return json.dumps(plain(value), default=str, separators=(",", ":"))


def failed(err: Exception) -> str:
    """A tool's failure as the model reads it: the planner's own words."""
    if isinstance(err, PlannerError):
        return f"Error: {err.detail}"
    log.exception("assistant tool")
    return f"Error: {type(err).__name__}: {err}"
