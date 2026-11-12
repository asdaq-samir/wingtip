#!/usr/bin/env python3
"""Reads scripts/areas.yml, the one table of which checks a changed path needs.

  areas.py names            the area names, in order, one per line
  areas.py areas            reads paths on stdin, prints the areas they touch
  areas.py check-line AREA  the area's check, as the file words it
  areas.py write            regenerates ci.yml's paths-filter block
  areas.py check            fails when ci.yml's block is not what `write` makes

Standard library only (the Mac's python3 and CI's both run it), so the file
is read by a small parser for its own layout: two-space indents, `key: value`,
`key:` then a nested block or `- item` lines, full-line comments.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AREAS_FILE = ROOT / "scripts" / "areas.yml"
CI_FILE = ROOT / ".github" / "workflows" / "ci.yml"
BEGIN = "# BEGIN generated from scripts/areas.yml by scripts/areas.py: edit that file, then `python3 scripts/areas.py write`"
END = "# END generated"
INDENT = " " * 14  # the filter lines' depth under `filters: |`


def scalar(text):
    text = text.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "'\"":
        return text[1:-1]
    return text


def parse(text):
    lines = []
    for raw in text.splitlines():
        if raw.strip() and not raw.lstrip().startswith("#"):
            lines.append((len(raw) - len(raw.lstrip()), raw.strip()))

    def block(i, indent):
        if lines[i][1].startswith("- "):
            items = []
            while i < len(lines) and lines[i][0] == indent and lines[i][1].startswith("- "):
                items.append(scalar(lines[i][1][2:]))
                i += 1
            return items, i
        mapping = {}
        while i < len(lines) and lines[i][0] == indent:
            key, sep, value = lines[i][1].partition(":")
            if not sep:
                raise ValueError(f"areas.yml: no key in {lines[i][1]!r}")
            i += 1
            if value.strip():
                mapping[key.strip()] = scalar(value)
            elif i < len(lines) and lines[i][0] > indent:
                mapping[key.strip()], i = block(i, lines[i][0])
            else:
                mapping[key.strip()] = {}
        return mapping, i

    result, _ = block(0, 0)
    return result


def load():
    return parse(AREAS_FILE.read_text())


def glob_regex(pattern):
    out, i = "", 0
    while i < len(pattern):
        c = pattern[i]
        # `**/` is zero or more folders, so `**/x` also matches a root `x`;
        # a bare `**` is anything.
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
            continue
        if pattern.startswith("**", i):
            out += ".*"
            i += 2
            continue
        out += "[^/]*" if c == "*" else "[^/]" if c == "?" else re.escape(c)
        i += 1
    return re.compile(out + r"\Z")


def areas_for(paths, areas):
    found = []
    for name, spec in areas.items():
        regexes = [glob_regex(p) for p in spec["paths"]]
        if any(r.match(p) for p in paths for r in regexes):
            found.append(name)
    return found


def filters(data):
    """CI filter name -> paths; areas that share a `ci` name are joined."""
    out = {}
    for name, paths in data["ci_only"].items():
        out[name] = list(paths)
    for spec in data["areas"].values():
        joined = out.setdefault(spec["ci"], [])
        joined.extend(p for p in spec["paths"] if p not in joined)
    return out


def block_text(data):
    lines = [INDENT + BEGIN]
    for name, paths in filters(data).items():
        lines.append(f"{INDENT}{name}:")
        # Quoted where YAML would read it otherwise: a leading * is an alias.
        lines.extend(f"{INDENT}  - '{p}'" if p.startswith("*") else f"{INDENT}  - {p}" for p in paths)
    lines.append(INDENT + END)
    return "\n".join(lines) + "\n"


def replace_block(ci_text, block):
    pattern = re.compile(rf"^{INDENT}{re.escape(BEGIN)}\n.*?^{INDENT}{re.escape(END)}\n", re.S | re.M)
    if pattern.search(ci_text):
        return pattern.sub(lambda _: block, ci_text)
    # First time: the hand-written filters, from `filters: |` to the next step.
    first = re.compile(r"(^ +filters: \|\n).*?(?=^      - name: What this run builds and tests)", re.S | re.M)
    if not first.search(ci_text):
        raise SystemExit("areas.py: ci.yml's paths-filter block was not found")
    return first.sub(lambda m: m.group(1) + block, ci_text)


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    data = load()
    if cmd == "names":
        print("\n".join(data["areas"]))
    elif cmd == "areas":
        paths = [p for p in (line.strip() for line in sys.stdin) if p]
        found = areas_for(paths, data["areas"])
        if found:
            print("\n".join(found))
    elif cmd == "check-line":
        print(data["areas"][argv[2]]["check"])
    elif cmd in ("write", "check"):
        current = CI_FILE.read_text()
        wanted = replace_block(current, block_text(data))
        if cmd == "write":
            CI_FILE.write_text(wanted)
        elif wanted != current:
            print("ci.yml's paths-filter block is not what scripts/areas.yml makes: run `python3 scripts/areas.py write`", file=sys.stderr)
            return 1
    else:
        print(__doc__, file=sys.stderr)
        return 64
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
