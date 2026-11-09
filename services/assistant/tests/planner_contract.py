"""The assistant's planner calls (app.planner_calls) held to the code that
makes them and to the planner's OpenAPI document. Each function answers a
list of problems, each a sentence that starts with the caller it is in,
so a test fails naming the method and the field."""
from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from pathlib import Path

from app.planner_calls import CALLS, PlannerCall

SPEC = Path(__file__).resolve().parents[2] / "planner" / "openapi.json"
APP = Path(__file__).resolve().parents[1] / "app"

#: The JSON types a read of each kind takes.
TYPES = {"string": {"string"}, "number": {"number", "integer"}, "integer": {"integer"}, "boolean": {"boolean"},
         "object": {"object"}, "array": {"array"}}


def template(path: str) -> str:
    """A path with each {parameter} as "{}", to compare templates."""
    return re.sub(r"\{[^}]*\}", "{}", path)


@dataclass(frozen=True)
class Scanned:
    """A planner.get or planner.post as the code makes it."""

    where: str
    caller: str
    method: str
    path: str
    #: The keyword names (GET) or the literal body's keys (POST); None
    #: where the body is built elsewhere.
    sends: frozenset[str] | None


class _Calls(ast.NodeVisitor):
    def __init__(self, name: str):
        self.name, self.scope, self.found = name, [], []

    def _scoped(self, node):
        self.scope.append(node.name)
        self.generic_visit(node)
        self.scope.pop()

    visit_ClassDef = visit_FunctionDef = visit_AsyncFunctionDef = _scoped

    def visit_Call(self, node: ast.Call):
        f = node.func
        if isinstance(f, ast.Attribute) and f.attr in ("get", "post") and isinstance(f.value, ast.Name) \
                and f.value.id == "planner" and node.args:
            first = node.args[0]
            if isinstance(first, ast.Constant):
                path = str(first.value)
            elif isinstance(first, ast.JoinedStr):
                path = "".join(str(v.value) if isinstance(v, ast.Constant) else "{}" for v in first.values)
            else:
                path = "{}"
            sends: frozenset[str] | None = None
            if f.attr == "get":
                sends = frozenset(k.arg for k in node.keywords if k.arg)
            elif len(node.args) > 1 and isinstance(node.args[1], ast.Dict) \
                    and all(isinstance(k, ast.Constant) for k in node.args[1].keys):
                sends = frozenset(str(k.value) for k in node.args[1].keys)  # type: ignore[union-attr]
            self.found.append(Scanned(f"app/{self.name}:{node.lineno}", ".".join(self.scope), f.attr.upper(),
                                      template(path), sends))
        self.generic_visit(node)


def scan(sources: dict[str, str]) -> list[Scanned]:
    """Every planner call in the sources given, by file name."""
    found: list[Scanned] = []
    for name, source in sources.items():
        visitor = _Calls(name)
        visitor.visit(ast.parse(source))
        found += visitor.found
    return found


def app_sources() -> dict[str, str]:
    return {p.name: p.read_text() for p in sorted(APP.glob("*.py")) if p.name not in ("planner.py", "planner_calls.py")}


def completeness(scanned: list[Scanned], calls: tuple[PlannerCall, ...] = CALLS) -> list[str]:
    """What the table and the code disagree on."""
    problems = []
    declared = {(c.caller, c.method, template(c.path)): c for c in calls}
    for s in scanned:
        call = declared.get((s.caller, s.method, s.path))
        if call is None:
            problems.append(f"{s.caller}: {s.where} calls {s.method} {s.path}, which app/planner_calls.py does not declare")
        elif s.sends is not None and s.sends != set(call.sends or ()):
            problems.append(f"{s.caller}: {s.where} sends {sorted(s.sends)}, but app/planner_calls.py says "
                            f"{sorted(call.sends or ())}")
    made = {(s.caller, s.method, s.path) for s in scanned}
    for key, call in declared.items():
        if key not in made:
            problems.append(f"{call.caller}: app/planner_calls.py declares {call.method} {call.path}, "
                            "which the code no longer calls")
    return problems


class _Spec:
    def __init__(self, spec: dict):
        self.spec = spec

    def resolve(self, s: dict) -> dict:
        while "$ref" in s:
            s = self.spec["components"]["schemas"][s["$ref"].rsplit("/", 1)[-1]]
        return s

    def unwrap(self, s: dict) -> tuple[list[dict], bool]:
        """A schema's non-null branches, and whether it may be null."""
        s = self.resolve(s)
        if "anyOf" not in s:
            return [s], s.get("type") == "null"
        branches = [self.resolve(b) for b in s["anyOf"]]
        return [b for b in branches if b.get("type") != "null"], any(b.get("type") == "null" for b in branches)

    def operation(self, method: str, path: str) -> dict | None:
        for spec_path, ops in self.spec["paths"].items():
            pattern = re.sub(r"\\\{[^}]*\\\}", "[^/]+", re.escape(spec_path))
            if (template(spec_path) == template(path) or re.fullmatch(pattern, path)) and method.lower() in ops:
                return ops[method.lower()]
        return None


def _segments(read: str) -> list[str]:
    out = []
    for part in read.split("."):
        name = part.rstrip("[]{}")
        out.append(name)
        out += re.findall(r"\[\]|\{\}", part[len(name):])
    return out


def _check_read(spec: _Spec, answer: dict, read: str, kind: str) -> str | None:
    """What is wrong with reading `read` from the answer as `kind`."""
    optional = kind.endswith("?")
    kind = kind.rstrip("?")
    schema, always = answer, True
    for seg in _segments(read):
        branches, nullable = spec.unwrap(schema)
        always &= not nullable
        if seg == "[]":
            found = [b["items"] for b in branches if b.get("type") == "array" and "items" in b]
        elif seg == "{}":
            found = [b["additionalProperties"] for b in branches if isinstance(b.get("additionalProperties"), dict)]
        else:
            holding = [b for b in branches if seg in (b.get("properties") or {})]
            if not holding:
                fields = sorted({k for b in branches for k in (b.get("properties") or {})})
                return f"reads {read}, but the planner's answer has no {seg!r} there (it has {fields})"
            always &= seg in holding[0].get("required", [])
            found = [holding[0]["properties"][seg]]
        if not found:
            return f"reads {read}, but the planner's answer is not a {'list' if seg == '[]' else 'map'} there"
        schema = found[0]
    branches, nullable = spec.unwrap(schema)
    types = {b.get("type") or ("object" if "properties" in b else "any") for b in branches}
    if kind != "any" and not types <= TYPES[kind] and "any" not in types:
        return f"reads {read} as {kind}, but the planner's answer has it as {' or '.join(sorted(types))}"
    if not optional and (nullable or not always):
        return f"reads {read} as always there, but the planner's answer may leave it out or send null (mark it {kind}?)"
    return None


def contract(spec_json: dict, calls: tuple[PlannerCall, ...] = CALLS) -> list[str]:
    """What is wrong with each call against the planner's document."""
    spec = _Spec(spec_json)
    problems = []
    for call in calls:
        for path in [call.path.replace("{kind}", k) for k in call.kinds] or [call.path]:
            head = f"{call.caller} ({call.method} {path})"
            op = spec.operation(call.method, path)
            if op is None:
                problems.append(f"{call.caller}: {call.method} {path} is not in services/planner/openapi.json")
                continue
            params = {p["name"]: p for p in op.get("parameters", [])}
            query = {n for n, p in params.items() if p["in"] == "query"}
            if call.method == "GET":
                taken, required = query, {n for n in query if params[n].get("required")}
            else:
                body = spec.resolve(op.get("requestBody", {}).get("content", {}).get("application/json", {})
                                    .get("schema", {}))
                taken, required = set(body.get("properties") or {}), set(body.get("required") or [])
            what = "query parameter" if call.method == "GET" else "body field"
            if call.sends is not None:
                problems += [f"{head}: sends the {what} {s!r}, but the planner takes no such {what} {sorted(taken)}"
                             for s in call.sends if s not in taken]
                problems += [f"{head}: the planner requires the {what} {r!r}, which is not sent"
                             for r in sorted(required - set(call.sends))]
            headers = {n.lower() for n, p in params.items() if p["in"] == "header"}
            problems += [f"{head}: sends the header {h}, which the planner does not take" for h in call.headers
                         if h.lower() not in headers]
            answer = op.get("responses", {}).get("200", {}).get("content", {}).get("application/json", {}).get("schema")
            for read, kind in call.reads.items():
                wrong = _check_read(spec, answer or {}, read, kind)
                if wrong:
                    problems.append(f"{head}: {wrong}")
    return problems
