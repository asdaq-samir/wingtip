"""Every call the assistant makes to the planner (app.planner), declared:
who makes it, the operation, what it sends and what of the answer it
reads. tests/test_planner_contract.py holds the table to the code (each
planner.get and planner.post in app/ is here, sending what it says) and
to the planner's own document, services/planner/openapi.json (the path
and method exist, every required parameter is sent, and every field read
is one the planner answers, of its type).

A read is a path into the answer -- "legs[].from" for each leg's, and
"metars{}.raw" for each value of a map's -- and the type the code reads
it as: string, number, integer, boolean, object, array or any. A "?"
after the type says the code reads it with .get() and copes with it
null or missing; without one the code indexes it (cp["lat"]) or does
sums with it, and the planner must always send it, never null."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class PlannerCall:
    #: The function that makes the call, as "Class.method" or "outer.inner".
    caller: str
    method: str
    #: The planner's path template ("/api/airport/{ident}").
    path: str
    #: The query parameters (GET) or the body's fields (POST) sent; None
    #: where the body is the app's own, passed on whole.
    sends: tuple[str, ...] | None
    reads: dict[str, str] = field(default_factory=dict)
    #: The values a path's parameter takes where the code builds it
    #: ("/api/words/{kind}/sources" for each kind of reading).
    kinds: tuple[str, ...] = ()
    headers: tuple[str, ...] = ()


_ROUTE = ("dep", "dest", "stops")

CALLS: tuple[PlannerCall, ...] = (
    PlannerCall(
        "Toolbox.plan_flight", "GET", "/api/plan", (*_ROUTE, "aircraft", "altitude_ft", "depart", "rules"),
        {**{f"legs[].{k}": "number?" for k in ("distance_nm", "magnetic_heading_deg", "groundspeed_kt", "ete_min",
                                                 "fuel_gal", "altitude_ft")},
         "legs[].from": "string?", "legs[].to": "string?", "legs[].wind": "object?",
         "totals": "object?", "totals.distance_nm": "number?", "totals.ete_min": "number?", "totals.fuel_gal": "number?",
         "altitude_ft": "number?", "altitude_choice": "string?", "altitude_cautions": "array?"},
    ),
    PlannerCall(
        "Toolbox.weather_at", "GET", "/api/airport/{ident}", (),
        {"ident": "string", "name": "string?", "elevation_ft": "number?", "taf": "string?",
         "weather_unavailable": "boolean?", "metar": "object?", "metar.raw": "string?", "metar.observed_at": "string?",
         "nearby_metar": "object?", "nearby_metar.ident": "string?", "nearby_metar.metar.raw": "string?",
         "nearby_metar.metar.observed_at": "string?"},
    ),
    PlannerCall(
        "Toolbox.briefing_for", "GET", "/api/briefing", (*_ROUTE, "depart", "ete_min"),
        {"metars": "object?", "metars{}.raw": "string?", "metars{}.observed_at": "string?",
         **{f"hazards[].{k}": "string?" for k in ("raw", "hazard", "type")},
         "hazards[].altitude_low_ft": "number?", "hazards[].altitude_high_ft": "number?", "hazards[].on_route": "object?",
         **{f"tfrs[].{k}": "string?" for k in ("notam_id", "title", "kind", "purpose", "floor_ref", "ceiling_ref",
                                                "effective", "expires")},
         "tfrs[].floor_ft": "number?", "tfrs[].ceiling_ft": "number?", "tfrs[].active_now": "boolean?",
         "tfrs[].crosses": "boolean?", "tfrs[].on_route": "object?",
         "fields_below_vfr": "array?", "vfr_not_recommended": "array?", "forecast": "object?",
         "weather_unavailable": "array?"},
    ),
    PlannerCall(
        "Toolbox.go_no_go", "POST", "/api/go-no-go",
        (*_ROUTE, "aircraft", "altitude_ft", "depart", "rules", "minimums", "load", "currency", "own_airplane", "ticked"),
        {"line": "object?", "line.finding": "string?", "line.words": "string?",
         **{f"items[].{k}": "string?" for k in ("key", "label", "finding", "detail")},
         "risk": "object?", "risk.score": "integer?", "risk.level": "string?", "risk.line": "string?",
         "risk.words": "string?", "risk.factors": "array?", "balance.problems": "array?"},
    ),
    PlannerCall(
        "Toolbox.airport", "GET", "/api/airport/{ident}", (),
        {**{k: "string?" for k in ("ident", "name", "municipality", "region", "kind", "airspace_class", "military")},
         "elevation_ft": "number?", "towered": "boolean?", "private": "boolean?", "pattern": "object?",
         **{k: "array?" for k in ("lighting", "radio_notes", "runways", "frequencies")},
         "runways[].ends": "string?", "runways[].length_ft": "integer?"},
    ),
    # Passed to the model whole: what it reads is the planner's to say.
    PlannerCall("Toolbox.nearest_airports", "GET", "/api/airports/nearest", ("lat", "lon", "limit")),
    PlannerCall("Toolbox.find_place", "GET", "/api/places/search", ("q",)),
    PlannerCall("Toolbox.hold_entry", "GET", "/api/holding",
                ("inbound", "heading", "turns", "tas_kt", "wind_from", "wind_kt", "altitude_ft")),
    PlannerCall("Toolbox.divert", "GET", "/api/diversion", ("lat", "lon", "to", "altitude_ft", "aircraft")),
    PlannerCall("Toolbox.propose_change", "GET", "/api/route-check", _ROUTE, {"stops": "array"}),
    PlannerCall(
        "describe_checkpoints", "POST", "/api/checkpoint-notes/pending",
        ("departure_ident", "destination_ident", "stops"),
        {"checkpoints": "array", "departure_ident": "string",
         **{f"checkpoints[].{k}": "number" for k in ("lat", "lon", "along_track_nm")},
         **{f"checkpoints[].{k}": "string" for k in ("id", "hop_key", "category")},
         "checkpoints[].saved": "string?", "checkpoints[].name": "string?"},
        headers=("X-Pilot-Id",),
    ),
    PlannerCall(
        "describe_checkpoints.lines", "POST", "/api/checkpoint-notes/seed", ("hop_key", "lat", "lon", "description"),
        {"written": "boolean", "description": "string"},
    ),
    PlannerCall(
        "sources_for", "POST", "/api/words/{kind}/sources", None,
        {"sources": "array?", "sources[].id": "string", "sources[].label": "string", "sources[].text": "string",
         "coverage_since": "string?", "unchecked": "array?"},
        kinds=("notams", "weather", "risk", "debrief", "changes"),
    ),
)
