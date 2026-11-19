"""No API name removed that a client of it still calls or reads (docs/CI.md,
"API compatibility").

Each server's OpenAPI document is compared with the base branch's by
oasdiff's changelog (the same pinned image as ci.yml's api-compat). Every
operation, path, parameter, field or enum value it says was removed or
renamed (a rename is a removal and an addition) is looked up in the code
that calls that server: the web's lib/api, the planner's MCP connector
(planner_calls.py and app/mcp), the gateway's PlannerClient and its HTTP
interfaces, and the phones' API folders. A name still there fails, with
the file and line, since that code would ask for or read what the server
no longer has.

api-compat fails on any break against the apps already released and lets
a meant one through (.github/api-breaks.txt); this holds the tree to
itself, so a break noted there still fails here while a client in this
branch uses the name. A name is looked up only once the new document has
it nowhere: a field "kind" taken from one schema but kept in others cannot
be told apart by text, and is left to the apps' compilers and api-compat.

The standard library and Docker; seconds, and nothing at all (no Docker)
where neither document differs from the base. Run in ci.yml's guards job
(scripts/ci/guards.sh, on an API change).

  python3 scripts/ci/api_removals.py --base origin/main
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# oasdiff 1.39.0 (Apache-2.0; the newest release, 2026-11-17), by digest,
# as ci.yml's api-compat pins it: docs/versions.md, "Exact pins".
OASDIFF = "tufin/oasdiff:v1.39.0@sha256:004bef22058ace818b61f0eb2f05efb89fc6a3882f68bf4db0b6a86f40723fe0"

WEB = "apps/web/src/lib/api"
IOS = "apps/ios/Wingtip/API"
ANDROID = "apps/android/app/src/main/kotlin/app/wingtipmaps/android/api"
GATEWAY_JAVA = "services/gateway/src/main/java/app/wingtipmaps/gateway"

# Each document and the code that calls its server.
CALLERS = {
    "services/planner/openapi.json": [
        WEB,
        "services/planner/app/generated/planner_calls.py",
        "services/planner/app/mcp",
        f"{GATEWAY_JAVA}/service/PlannerClient.java",
        f"{GATEWAY_JAVA}/upstream",
        IOS,
        ANDROID,
    ],
    "services/gateway/openapi.json": [WEB, IOS, ANDROID],
}
SOURCES = {".ts", ".tsx", ".py", ".java", ".swift", ".kt"}

# oasdiff's check ids (`oasdiff checks changelog`) by what was removed.
KINDS = [
    ("operation", re.compile(r"^api-(path-)?removed")),
    ("operation", re.compile(r"^api-operation-id-removed")),
    ("parameter", re.compile(r"^request-parameter-removed")),
    ("field", re.compile(r"^(request|response)-(required-|optional-)?(write-only-)?property-removed")),
    ("enum value", re.compile(r"(enum-value|const)-removed")),
]


def kind_of(check_id: str) -> str | None:
    return next((kind for kind, pattern in KINDS if pattern.search(check_id)), None)


def names_in(doc: dict) -> tuple[set[str], set[str], set[str], set[str]]:
    """The document's paths, operation ids, property and parameter names, and
    enum and const values, wherever they are."""
    paths = set(doc.get("paths", {}))
    ops = {op.get("operationId") for item in doc.get("paths", {}).values() for op in item.values() if isinstance(op, dict)}
    keys: set[str] = set()
    values: set[str] = set()

    def walk(v: object) -> None:
        if isinstance(v, list):
            for x in v:
                walk(x)
        elif isinstance(v, dict):
            if isinstance(v.get("properties"), dict):
                keys.update(v["properties"])
            if v.get("in") in ("query", "path", "header", "cookie") and "name" in v:
                keys.add(v["name"])
            values.update(str(x) for x in v.get("enum", []) if isinstance(v.get("enum"), list))
            if "const" in v:
                values.add(str(v["const"]))
            for x in v.values():
                walk(x)

    walk(doc)
    return paths, {o for o in ops if o}, keys, values


def camel(name: str) -> str:
    return re.sub(r"[_-]+([a-z0-9])", lambda m: m.group(1).upper(), name)


def function_name(op_id: str, path: str, method: str) -> str | None:
    """FastAPI's operation id is the function's name with the path and the
    method after it ("check_airplane_api_aircraft_problems_post"); the
    planner_calls function, the MCP tool's import and the phones' generated
    calls are named by the function alone. Springdoc's ("get_1") name
    nothing a caller writes, so they are not looked up."""
    tail = re.sub(r"\W", "_", path) + "_" + method.lower()
    if op_id.endswith(tail) and len(op_id) > len(tail):
        return op_id[: -len(tail)]
    return None


def patterns(kind: str, change: dict, name: str) -> list[re.Pattern[str]]:
    if kind == "operation":
        found = []
        path = change.get("path", "")
        if path.startswith("/api/"):
            # As a caller writes it: /api/x, or the gateway's /api/planner/x
            # for the planner's; up to its first parameter.
            tail = re.escape(path[len("/api") :].split("{")[0])
            end = "" if "{" in path else r"(?![\w/-])"
            found.append(re.compile(rf"/api(?:/planner)?{tail}{end}"))
        fn = function_name(change.get("operationId", ""), path, change.get("operation", ""))
        if fn:
            # A one-word name ("course") only where it is called.
            words = {fn, camel(fn)}
            found += [re.compile(rf"\b{w}\b" if "_" in fn else rf"\.{w}\(|\b{w}\(") for w in words]
        return found
    if kind == "enum value":
        return [re.compile(rf"""["'`]{re.escape(name)}["'`]""")]
    return [re.compile(rf"\b{re.escape(w)}\b") for w in {name, camel(name)}]


def backticked(text: str) -> list[str]:
    return re.findall(r"`([^`]+)`", text)


def removed(changes: list[dict], new: dict) -> list[tuple[str, str, dict]]:
    """(kind, name, change) for each removal whose name the new document
    has nowhere."""
    paths, ops, keys, values = names_in(new)
    out = []
    for change in changes:
        kind = kind_of(change.get("id", ""))
        quoted = backticked(change.get("text", ""))
        if kind is None:
            continue
        if kind == "operation":
            if change.get("path") in paths and change.get("operationId") in ops:
                continue
            out.append((kind, f"{change.get('operation')} {change.get('path')}", change))
        elif kind == "parameter" and quoted and quoted[-1] not in keys:
            out.append((kind, quoted[-1], change))
        elif kind == "field" and quoted and (name := quoted[0].split("/")[-1]) not in keys:
            out.append((kind, name, change))
        elif kind == "enum value" and quoted and quoted[0] not in values:
            out.append((kind, quoted[0], change))
    return out


def caller_files(roots: list[str]) -> list[Path]:
    files: list[Path] = []
    for root in roots:
        p = ROOT / root
        files += [p] if p.is_file() else sorted(f for f in p.rglob("*") if f.suffix in SOURCES)
    return files


def changelog(base_text: str, doc: str) -> list[dict]:
    with tempfile.TemporaryDirectory() as tmp:
        Path(tmp, "base.json").write_text(base_text)
        run = subprocess.run(
            ["docker", "run", "--rm", "-v", f"{tmp}:/base:ro", "-v", f"{ROOT / doc}:/head.json:ro", OASDIFF]
            + ["changelog", "/base/base.json", "/head.json", "--format", "json"],
            capture_output=True,
            text=True,
            check=False,
        )
    if run.returncode != 0:
        sys.exit(f"oasdiff failed on {doc}:\n{run.stderr}")
    return json.loads(run.stdout or "[]")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base", default="origin/main", help="the ref each document is compared with")
    args = ap.parse_args()
    hits = 0
    for doc, roots in CALLERS.items():
        shown = subprocess.run(["git", "show", f"{args.base}:{doc}"], cwd=ROOT, capture_output=True, text=True, check=False)
        if shown.returncode != 0:
            print(f"{doc}: not on {args.base}, nothing to remove")
            continue
        head_text = (ROOT / doc).read_text()
        if shown.stdout == head_text:
            print(f"{doc}: as on {args.base}")
            continue
        if not shutil.which("docker"):
            # guards.sh's skip on the Mac (exit 3); in CI, a failure.
            print("no docker here, for oasdiff")
            return 1 if os.environ.get("GITHUB_ACTIONS") else 3
        gone = removed(changelog(shown.stdout, doc), json.loads(head_text))
        files = {f: f.read_text(errors="replace").splitlines() for f in caller_files(roots)}
        # A field of a shared schema is one removal at each operation that
        # returns it, a path one at each method: each line is named once.
        seen: set[tuple[Path, int]] = set()
        for kind, name, change in gone:
            found = patterns(kind, change, name)
            for f, lines in files.items():
                for n, line in enumerate(lines, 1):
                    if (f, n) in seen or not any(p.search(line) for p in found):
                        continue
                    seen.add((f, n))
                    where = f"{change.get('operation', '')} {change.get('path', '')}".strip()
                    said = f"{doc} removes the {kind} `{name}` ({where}: {change.get('text')}), which this still names"
                    print(f"::error file={f.relative_to(ROOT)},line={n}::{said}")
        hits += len(seen)
        print(f"{doc}: {len({(k, n) for k, n, _ in gone})} name(s) removed, looked up in {len(files)} caller file(s)")
    if hits:
        sys.stdout.flush()
        print(
            f"{hits} use(s) of a removed API name: change the caller with the server, "
            "or keep the name on the server until no client uses it (docs/CI.md, \"API compatibility\")",
            file=sys.stderr,
        )
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
