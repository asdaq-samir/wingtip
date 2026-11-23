"""The live view of the flight being planned: an MCP App (the MCP Apps
extension, io.modelcontextprotocol/ui, spec 2026-01-26), the web's slim
plan view (apps/web claude-view.html, features/claude-view) that Claude
opens beside the chat from any tool that answers a flight, and that
draws each answer as it comes (decision 0061).

Each answer is the flight (flight_state.Flight) and what the view draws
of its plan, worked out by the planner's own /api/plan: the route's
points and line, the legs and totals the figure strip reads, the
altitude, the approaches and their state, the chart's tiles. The model
reads the text (a line of figures, the flight to hand on and its link);
the view reads the structured content, which hosts keep from the model
(the spec's "Data Passing"), so the route's line costs it nothing."""

from __future__ import annotations

import hashlib
import hmac
import itertools
import json
import secrets
import time
from mcp.server.mcpserver.exceptions import ToolError
from mcp_types import CallToolResult, TextContent
from wingtip.engine import ask as engine

from ..generated.planner_calls import plan
from ..settings import get_settings
from . import airplane, records
from .calls import ENGINE_SOURCE, WINDS_SOURCE, editions
from .flight_state import Flight, link_of, query_of, same
from .procedure_picks import approaches_of

#: The view's address among the connector's resources.
VIEW_URI = "ui://wingtip/flight"

#: How many points of the route's drawn line the view is sent at most: a
#: long route's procedures drew thousands, and the view draws them at a
#: few hundred pixels across.
LINE_POINTS = 400

# Each answer's place among the others, for the newest view to keep the
# say over older ones in the conversation (claude.com/docs ... instance
# supersession: a server-made key, the time and a count).
_SEQ = itertools.count(1)

#: The key the views' channel name is made with where no shared secret
#: is set (a server that reads no records, the tests).
_PROCESS_KEY = secrets.token_bytes(32)

#: The plan's chart fields the view's tiles need (web lib/map/sources tiles' tileTemplate).
CHART_KEYS = ("chart_cycle", "chart_revision", "chart_tiles_base", "max_zoom", "min_zoom")


async def planned(flight: Flight, pilot_id: str) -> tuple[dict, dict | None]:
    """The flight's plan from /api/plan, and the airplane it is flown on (None for none)."""
    flown = await airplane.find(pilot_id, flight.airplane_tail) if flight.airplane_tail else None
    fields = airplane.plan_fields(flown) if flown else {}
    return await plan(**{k: v for k, v in query_of(flight, fields).items() if v not in (None, "")}), flown


def _thinned(line: list) -> list:
    step = max(1, -(-len(line) // LINE_POINTS))
    kept = line[::step]
    return kept if not line or kept[-1] == line[-1] else [*kept, line[-1]]


def points_of(flight: Flight, p: dict) -> list[dict]:
    """The route's points as the view's timeline and map draw them."""
    ends = [("departure", p["departure"]), *(("stop", s) for s in p.get("stops", [])), ("destination", p["destination"])]
    return [
        {
            "ident": point["ident"],
            "name": point.get("name"),
            "lat": point["lat"],
            "lon": point["lon"],
            "role": role,
            "field": point.get("kind", "airport") == "airport",
            "fuel_stop": role == "stop" and any(same(point["ident"], f) for f in flight.fuel_stops),
        }
        for role, point in ends
    ]


def strip_fuel(totals: dict) -> dict:
    """The fuel figure of the view's strip, the engine's (strip_fuel), as
    the web's tripFigures asks it: the view runs no engine of its own (the
    host's sandbox runs no WebAssembly), so it is asked here."""
    hops = [
        {
            "departure": h["departure"],
            "destination": h["destination"],
            "fuel_required_gal": h["totals"].get("fuel_required_gal"),
            "fuel_margin_gal": h["totals"].get("fuel_margin_gal"),
        }
        for h in totals.get("hops", [])
    ]
    return engine(
        "strip_fuel",
        fuel_required_gal=totals.get("fuel_required_gal"),
        fuel_margin_gal=totals.get("fuel_margin_gal"),
        hops=hops,
        hop=0,
        burnt_gal=None,
    )


def chart_of(p: dict) -> dict:
    """The chart the view's tiles come from: the sectional's layer, its sheets left out."""
    layers = [{**layer, "sheets": []} for layer in p.get("chart_layers", []) if layer.get("kind") == "sec"]
    return {**{k: p.get(k) for k in CHART_KEYS}, "chart_layers": layers}


def channel_of(pilot_id: str) -> str:
    """The name the pilot's views of this connector say their keys on
    (web features/claude-view/supersede): made from the view's resource
    URI and the pilot with a key only the server holds, so a view of
    another connector sharing the host's sandbox origin can neither guess
    it nor stand Wingtip's views down (the security review of
    2026-11-22)."""
    key = (get_settings().mcp_internal_token or "").encode() or _PROCESS_KEY
    return hmac.new(key, f"{VIEW_URI}|{pilot_id}".encode(), hashlib.sha256).hexdigest()[:32]


async def saved_of(flight: Flight, pilot_id: str) -> dict | None:
    """The saved flight the flight came from, as the view's Update button
    names it ("Update KMSN-KDLH"): its id and its two ends, from the
    pilot's own records, never from the flight handed back (the model's,
    which a text it read can steer). None where there is none, or it is
    not among theirs."""
    if flight.saved_flight_id is None:
        return None
    try:
        theirs = await records.flights(pilot_id)
    except ToolError:
        return None
    for f in theirs:
        if f.get("id") == flight.saved_flight_id:
            ends = (f["departureIdent"], f["destinationIdent"])
            # As the gateway compares them (FlightService.replan): the view
            # offers Update only where the gateway would take it.
            same_route = [e.upper() for e in ends] == [flight.departure.upper(), flight.destination.upper()]
            return {"id": f["id"], "departure": ends[0], "destination": ends[1], "same_route": same_route}
    return None


async def view_of(flight: Flight, p: dict, flown: dict | None, saved: dict | None = None, pilot_id: str = "") -> dict:
    """What the live view draws of the planned flight."""
    return {
        "channel": channel_of(pilot_id),
        "saved": saved,
        "seq": next(_SEQ),
        "created_at": int(time.time() * 1000),
        "origin": get_settings().mcp_issuer,
        "points": points_of(flight, p),
        "line": _thinned(p.get("course_line", [])),
        "legs": p["legs"],
        "totals": p["totals"],
        "strip_fuel": strip_fuel(p["totals"]),
        "altitude_ft": p["altitude_ft"],
        "altitude_choice": p.get("altitude_choice"),
        "altitude_cautions": p.get("altitude_cautions", []),
        "approaches": await approaches_of(flight.procedures),
        "airplane": airplane.label(flown) if flown else None,
        "chart": chart_of(p),
        "open_in_wingtip": link_of(flight),
    }


def summary(flight: Flight, view: dict, said: str = "") -> str:
    """The model's line: what changed, the route's figures, the flight to
    hand to the next tool, and its link."""
    t = view["totals"]
    figures = [f"{t['distance_nm']:.1f} nm"]
    if t.get("ete_min") is not None:
        figures.append(f"{t['ete_min']:.0f} min")
    if t.get("fuel_gal") is not None:
        figures.append(f"{t['fuel_gal']:.1f} gal")
    route = " ".join(p["ident"] for p in view["points"])
    head = f"{said} " if said else ""
    approaches = "; ".join(f"{a['name']} at {a['airport']} {a['state']}" for a in view["approaches"])
    lines = [
        f"{head}{route} at {view['altitude_ft']:.0f} ft: {', '.join(figures)}.",
        f"Approaches: {approaches}." if approaches else "",
        f"Airplane: {view['airplane']}." if view["airplane"] else "No airplane picked: no times or fuel.",
        "Altitude cautions: "
        + "; ".join(f"{c['from_ident']}-{c['to_ident']}: {', '.join(c['reasons'])}" for c in view["altitude_cautions"])
        if view["altitude_cautions"]
        else "",
        f"Open in Wingtip: {view['open_in_wingtip']}" if view["open_in_wingtip"] else "",
        "flight (pass to the next change): " + json.dumps(flight.model_dump(mode="json", exclude_defaults=True)),
    ]
    return "\n".join(line for line in lines if line)


async def answer(flight: Flight, pilot_id: str, said: str = "") -> CallToolResult:
    """A flight tool's answer: the line for the model, the flight and its
    view for the live view."""
    p, flown = await planned(flight, pilot_id)
    view = await view_of(flight, p, flown, await saved_of(flight, pilot_id), pilot_id)
    content = {
        "flight": flight.model_dump(mode="json"),
        "view": view,
        "sources": [ENGINE_SOURCE, WINDS_SOURCE, *editions("nasr", "dof", "charts", "cifp")],
    }
    return CallToolResult(content=[TextContent(type="text", text=summary(flight, view, said))], structured_content=content)


def keep_fuel_stops(flight: Flight) -> Flight:
    """The fuel stops still among the stops, after the route changed."""
    kept = [f for f in flight.fuel_stops if any(same(f, s) for s in flight.stops)]
    return flight.model_copy(update={"fuel_stops": kept})
