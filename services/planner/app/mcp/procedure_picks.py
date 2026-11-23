"""An approach at one of the route's fields, loaded, activated, flown on
into its missed approach or taken out, as a GPS navigator does and the
web's FPL does (claude/approach-activate): loaded it is drawn apart, not
flown; activated it is on the route the plan flies; its missed approach
is suspended at the MAP until unsuspended (AIM 5-4-21). The pick's text
is the engine's (procedures_read and procedures_write, a fifth piece "L"
loaded, "M" flown into the missed approach), which /api/plan, the web's
address and a saved flight all read; nothing here writes it by hand."""

from __future__ import annotations

from typing import Literal

from mcp.server.mcpserver.exceptions import ToolError
from wingtip.engine import ask as engine

from ..generated.planner_calls import airport_procedures
from .flight_state import Flight, same

Action = Literal["load", "activate", "deactivate", "remove", "unsuspend_missed", "suspend_missed"]


def picks_of(text: str) -> list[dict]:
    """The procedures picked, each as the engine reads it."""
    return [part["pick"] for part in engine("procedures_read", text=text) if part["pick"]] if text else []


def text_of(picks: list[dict]) -> str:
    return engine("procedures_write", picks=picks) if picks else ""


async def _approaches_at(ident: str) -> dict[str, dict]:
    """A field's approaches by id, from the FAA's CIFP (GET /api/airport/{ident}/procedures)."""
    found = await airport_procedures(ident=ident)
    return {p["id"]: p for p in found["procedures"] if p["kind"] == "approach"}


def state_of(pick: dict) -> str:
    """The words for where an approach is: loaded, active, or flown on into its missed approach."""
    if pick.get("loaded"):
        return "loaded"
    return "active, missed approach unsuspended" if pick.get("missed") else "active, missed approach suspended"


async def approaches_of(text: str) -> list[dict]:
    """The approaches picked, with their chart names and where each is."""
    out = []
    for pick in picks_of(text):
        approaches = await _approaches_at(pick["ident"])
        if pick["id"] not in approaches:
            continue
        out.append(
            {
                "airport": pick["ident"],
                "id": pick["id"],
                "name": approaches[pick["id"]]["name"],
                "transition": pick.get("transition"),
                "state": state_of(pick),
                "loaded": bool(pick.get("loaded")),
                "missed": bool(pick.get("missed")),
            }
        )
    return out


def _in_route(flight: Flight, airport: str) -> str:
    for point in (flight.departure, *flight.stops, flight.destination):
        if same(point, airport):
            return point
    raise ToolError(f"{airport} is not on this route ({flight.departure} to {flight.destination}): add it as a stop first.")


async def changed(flight: Flight, airport: str, action: Action, approach: str | None, transition: str | None) -> tuple[Flight, str]:
    """The flight with the approach at `airport` changed, and what was done in words."""
    field = _in_route(flight, airport.strip().upper())
    approaches = await _approaches_at(field)
    picks = picks_of(flight.procedures)
    here = [p for p in picks if same(p["ident"], field) and p["id"] in approaches]
    others = [p for p in picks if p not in here]
    if action == "load":
        wanted = (approach or "").strip().upper()
        if wanted not in approaches:
            names = ", ".join(f"{k} ({v['name']})" for k, v in approaches.items()) or "none in the FAA's CIFP"
            raise ToolError(f"{field} has no approach {wanted or '(none named)'}. Its approaches: {names}.")
        offered = approaches[wanted]["transitions"]
        if transition and transition.strip().upper() not in offered:
            raise ToolError(
                f"{approaches[wanted]['name']} has no transition {transition}. Its transitions: {', '.join(offered) or 'none'}."
            )
        pick = {"ident": field, "id": wanted, "transition": transition.strip().upper() if transition else None, "loaded": True}
        said = f"Loaded the {approaches[wanted]['name']} at {field}, not yet activated."
        return flight.model_copy(update={"procedures": text_of([*others, pick])}), said
    if not here:
        raise ToolError(f"No approach is loaded at {field}: load one first (change_approach with action load).")
    pick, name = dict(here[0]), approaches[here[0]["id"]]["name"]
    if action == "remove":
        return flight.model_copy(update={"procedures": text_of(others)}), f"Removed the {name} at {field}."
    if action in ("unsuspend_missed", "suspend_missed") and pick.get("loaded"):
        raise ToolError(f"The {name} at {field} is loaded, not active: activate it before its missed approach.")
    update, said = {
        "activate": ({"loaded": False}, f"Activated the {name} at {field}: it is on the route, its missed approach suspended at the MAP."),
        "deactivate": ({"loaded": True, "missed": False}, f"Deactivated the {name} at {field}: loaded, off the route."),
        "unsuspend_missed": ({"missed": True}, f"Unsuspended the {name}'s missed approach: flown on from the MAP to its hold."),
        "suspend_missed": ({"missed": False}, f"Suspended the {name}'s missed approach at the MAP."),
    }[action]
    pick.update(update)
    return flight.model_copy(update={"procedures": text_of([*others, pick])}), said
