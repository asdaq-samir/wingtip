"""services/planner/app/generated/planner_calls.py, from the planner's OpenAPI
document (services/planner/openapi.json): the planner's own HTTP API as
async functions for its MCP connector's tools (app.mcp), one per operation
answering JSON, its path, query, header and body parameters typed from the
document as the assistant's planner_client's are (the same operations and
names, assistant_client.py's helpers). Each asks the planner's ASGI app
in-process through app.mcp.calls.planner, which says a refusal as the
tool's error. Written, and checked, by assistant_client.py's generate().
"""

from __future__ import annotations

import re

from assistant_client import HEADER, _function_name, _ident, _operations, _py_type

HEAD = '''"""The planner's own HTTP API as async functions, for its MCP connector's
tools (app.mcp): one per operation answering JSON, its parameters typed from
services/planner/openapi.json, each asked of the planner's ASGI app
in-process (app.mcp.calls.planner), which says a refusal as the tool's
error. The answers are the planner's JSON as its response models shaped it.
A tool imports the functions it calls by name, so a route renamed or gone
fails where the tool is imported, not on a pilot's call."""
from __future__ import annotations

from typing import Any, Literal  # noqa: F401 -- Literal is used where an operation has an enum
from urllib.parse import quote

from ..mcp.calls import planner as _send


def _seg(value: Any) -> str:
    """A path parameter as one segment, so a stray slash cannot reach
    another path."""
    return quote(str(value), safe="")
'''


def _plain(annotation: str) -> str:
    """An annotation over the assistant's models (m.) as plain JSON: the
    planner's tools read its answers as dicts, and send dicts."""
    parts = [re.sub(r"\bm\.\w+", "dict[str, Any]", p) for p in annotation.split(" | ")]
    return " | ".join(dict.fromkeys(parts))


def planner_calls(spec: dict) -> str:
    lines: list[str] = []
    taken: set[str] = set()
    for path, method, op in _operations(spec):
        fn = _function_name(op["operationId"], path, method, taken)
        taken.add(fn)
        args, query, headers, path_args = [], [], [], {}
        for p in sorted(op.get("parameters", []), key=lambda p: not p.get("required")):
            arg = _ident(p["name"])
            annotation = _plain(_py_type(p.get("schema") or {}, spec))
            if p.get("required"):
                args.append(f"{arg}: {annotation}")
            else:
                args.append(f"{arg}: {annotation} = None" if "None" in annotation.split(" | ") else f"{arg}: {annotation} | None = None")
            target = {"query": query, "header": headers}.get(p["in"])
            if target is not None:
                target.append(f"{p['name']!r}: {arg}")
            elif p["in"] == "path":
                path_args[p["name"]] = arg
        body = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
        if body is not None:
            args.insert(0, "body: dict[str, Any]" if op["requestBody"].get("required", False) else "body: dict[str, Any] | None = None")
        url = re.sub(r"\{([^}]+)\}", lambda m: "{_seg(" + path_args[m.group(1)] + ")}", path)
        url = f'f"{url}"' if path_args else repr(url)
        doc = (op.get("summary") or op["operationId"]).strip()
        lines += [
            "",
            "",
            f"async def {fn}({'*, ' if args else ''}{', '.join(args)}) -> Any:",
            f'    """{method.upper()} {path}: {doc}"""',
            f"    return await _send({method.upper()!r}, {url}, query={{{', '.join(query)}}}, "
            f"body={'body' if body is not None else 'None'}, headers={{{', '.join(headers)}}})",
        ]
    return HEADER.format(source="services/planner/openapi.json") + HEAD + "\n".join(lines) + "\n"
