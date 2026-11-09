"""The assistant's calls to the planner fit the planner's own document
(services/planner/openapi.json): each path and method exists, every
parameter or body field the call sends is one the planner takes and
every one it requires is sent, and every field read from the answer is
one the planner sends, of its type, and always there where the code
counts on it. The calls are declared in app/planner_calls.py, held here
to the code (each planner.get and planner.post in app/ is there, sending
what it says). The assistant reads the planner's answers with .get(), so
a field renamed in the planner reads as None without a word: here it
fails, naming the caller and the field."""
from __future__ import annotations

import ast
import copy
import json

import pytest

from app.notes import GenerateNotesRequest
from app.planner_calls import CALLS

from planner_contract import SPEC, app_sources, completeness, contract, scan



@pytest.fixture(scope="module")
def spec() -> dict:
    return json.loads(SPEC.read_text())


def _call(caller: str):
    return next(c for c in CALLS if c.caller == caller)


def test_every_call_fits_the_planners_document(spec):
    problems = contract(spec)
    assert not problems, "The assistant's planner calls do not fit services/planner/openapi.json:\n  " + "\n  ".join(problems)


def test_every_planner_call_in_the_code_is_declared_as_it_is_made():
    scanned = scan(app_sources())
    problems = completeness(scanned)
    assert not problems, "app/planner_calls.py and the code disagree:\n  " + "\n  ".join(problems)
    assert len(scanned) >= len(CALLS)


def test_the_bodies_and_kinds_the_scan_cannot_read_match_their_sources():
    # The checkpoint notes' body is the request model, dumped whole.
    assert set(_call("describe_checkpoints").sends or ()) == set(GenerateNotesRequest.model_fields)
    # Each reading's kind, as words.py asks sources_for("...", ask).

    tree = ast.parse(app_sources()["words.py"])
    kinds = {n.args[0].value for n in ast.walk(tree) if isinstance(n, ast.Call) and getattr(n.func, "id", None) == "sources_for"
             and n.args and isinstance(n.args[0], ast.Constant)}
    assert kinds == set(_call("sources_for").kinds)


# The negative cases: a copy of the document with one thing changed, as a
# rename in the planner would change it, is caught and named.

def _schema_holding(spec: dict, method: str, path: str, read: str) -> dict:
    """The schema (a component, resolved) whose properties hold the last
    field of `read` in the answer of method path."""
    schemas = spec["components"]["schemas"]

    def resolve(s):
        while "$ref" in s:
            s = schemas[s["$ref"].rsplit("/", 1)[-1]]
        if "anyOf" in s:
            s = resolve(next(b for b in s["anyOf"] if b.get("type") != "null"))
        return s

    s = resolve(spec["paths"][path][method]["responses"]["200"]["content"]["application/json"]["schema"])
    *parents, _ = read.split(".")
    for part in parents:
        name = part.rstrip("[]{}")
        s = resolve(s["properties"][name])
        for _ in range(part.count("[]")):
            s = resolve(s["items"])
        for _ in range(part.count("{}")):
            s = resolve(s["additionalProperties"])
    return s


def test_an_answer_field_renamed_is_named(spec):
    changed = copy.deepcopy(spec)
    leg = _schema_holding(changed, "get", "/api/plan", "legs[].ete_min")
    leg["properties"]["ete_minutes"] = leg["properties"].pop("ete_min")
    problems = contract(changed)
    assert any(p.startswith("Toolbox.plan_flight (GET /api/plan): reads legs[].ete_min,") and "no 'ete_min'" in p
               for p in problems), problems


def test_a_field_counted_on_made_nullable_is_named(spec):
    changed = copy.deepcopy(spec)
    cp = _schema_holding(changed, "post", "/api/checkpoint-notes/pending", "checkpoints[].lat")
    cp["properties"]["lat"] = {"anyOf": [cp["properties"]["lat"], {"type": "null"}]}
    problems = contract(changed)
    assert any(p.startswith("describe_checkpoints (POST /api/checkpoint-notes/pending): reads checkpoints[].lat as always there")
               for p in problems), problems


def test_a_query_parameter_renamed_is_named(spec):
    changed = copy.deepcopy(spec)
    for param in changed["paths"]["/api/briefing"]["get"]["parameters"]:
        if param["name"] == "ete_min":
            param["name"] = "ete_minutes"
    problems = contract(changed)
    assert any(p.startswith("Toolbox.briefing_for (GET /api/briefing): sends the query parameter 'ete_min'") for p in problems), problems


def test_a_body_field_renamed_is_named(spec):
    changed = copy.deepcopy(spec)
    seed = changed["components"]["schemas"]["SeedNoteRequest"]
    seed["properties"]["note"] = seed["properties"].pop("description")
    seed["required"] = ["note" if r == "description" else r for r in seed["required"]]
    problems = contract(changed)
    head = "describe_checkpoints.lines (POST /api/checkpoint-notes/seed): "
    assert head + "sends the body field 'description', but the planner takes no such body field" in "\n".join(problems)
    assert head + "the planner requires the body field 'note', which is not sent" in problems


def test_an_operation_gone_is_named(spec):
    changed = copy.deepcopy(spec)
    del changed["paths"]["/api/route-check"]
    assert "Toolbox.propose_change: GET /api/route-check is not in services/planner/openapi.json" in contract(changed)


def test_a_call_the_table_does_not_declare_is_named():
    source = "from . import planner\n\nclass Toolbox:\n    def fly(self):\n        return planner.get('/api/new', dep='KDLH')\n"
    problems = completeness(scan({"new.py": source}), CALLS[:1])
    assert "Toolbox.fly: app/new.py:5 calls GET /api/new, which app/planner_calls.py does not declare" in problems
    assert any(p.startswith("Toolbox.plan_flight: app/planner_calls.py declares") for p in problems)


def test_a_call_sending_other_than_declared_is_named():
    source = "class Toolbox:\n    def find_place(self, text):\n        return planner.get('/api/places/search', query=text)\n"
    problems = completeness(scan({"x.py": source}), tuple(c for c in CALLS if c.caller == "Toolbox.find_place"))
    assert problems == ["Toolbox.find_place: app/x.py:3 sends ['query'], but app/planner_calls.py says ['q']"]
