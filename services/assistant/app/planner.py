"""The planner's HTTP API, as the assistant asks it for every figure.

The assistant computes nothing a pilot reads as a figure: the plan, the
briefing, the Go / No-Go, a field's card, a hold's entry, a diversion,
the sources a reading in words rests on and the checkpoints a note is
written for all come from the planner (which asks the engine every
rule), over plain HTTP on the stack's own network. A refusal there -- an
ident that is not one, a route with no legal altitude -- comes back as
PlannerError with the planner's own status and words, for the caller to
pass on as they are."""
from __future__ import annotations

import requests

from .settings import get_settings


class PlannerError(Exception):
    """The planner said no, or could not be reached: its status (502
    where it never answered) and its words."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _detail(resp: requests.Response) -> str:
    try:
        detail = resp.json().get("detail")
    except (ValueError, AttributeError):
        detail = None
    if isinstance(detail, list):
        # FastAPI's 422: each field and what is wrong with it.
        return "; ".join(f"{'.'.join(str(p) for p in d.get('loc', [])[1:])}: {d.get('msg')}" for d in detail if isinstance(d, dict))
    return str(detail) if detail else f"the planner answered {resp.status_code}"


def _call(method: str, path: str, *, params: dict | None = None, json: dict | None = None,
          headers: dict | None = None):
    settings = get_settings()
    # None is left out of a query, as the planner reads an absent field.
    query = {k: v for k, v in (params or {}).items() if v is not None and v != ""}
    try:
        resp = requests.request(method, settings.planner_url + path, params=query, json=json, headers=headers,
                                timeout=settings.planner_timeout_s)
    except requests.RequestException as err:
        raise PlannerError(502, f"The planner could not be reached: {type(err).__name__}") from err
    if resp.status_code >= 400:
        raise PlannerError(resp.status_code, _detail(resp))
    return resp.json()


def get(path: str, **params):
    """GET a planner path; its JSON."""
    return _call("GET", path, params=params)


def post(path: str, body: dict, headers: dict | None = None):
    """POST a JSON body to a planner path; its JSON."""
    return _call("POST", path, json=body, headers=headers)
