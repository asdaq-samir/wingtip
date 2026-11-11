#!/usr/bin/env python3
"""The engine's crates use only the crates engine/README.md says they use.

engine/README.md's table ("The engine's crates") is the engine's layering:
each crate in engine/crates and the facade, with the crates it uses. Cargo
already refuses a cycle, but not a crate reaching up a layer (core taking
the Go / No-Go), nor the table drifting from what is built. This reads each
crate's Cargo.toml and fails where its wingtip-* dependencies are not
exactly the table's "Uses":

- a dependency the table does not give it: a crate reaching for one above
  or beside it. Move the code down, or, where the layering itself changes,
  change the table (and its "Why these lines") in the same commit;
- a use the table gives that Cargo.toml does not have: the table is stale;
- "route (without its options)" where route's default `options` feature is
  on, or the other way round;
- a dependency from outside the workspace in a crate or the facade (the
  README: "none has a dependency outside the workspace", for the phones and
  the WebAssembly);
- a binding (engine/bindings) that uses a crate rather than the facade.

The standard library only, for the Mac's python3 (3.9) and CI's: the
Cargo.toml files are read by a small parser for the sections they have.

  python3 scripts/ci/engine_layers.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "engine"
README = ENGINE / "README.md"
FACADE = "facade/"


def table():
    """{crate: {used crate: without options?}} from the README's table; the
    facade's "all of them" as None."""
    text = README.read_text()
    start = text.index("## The engine's crates")
    rows = {}
    for line in text[start:].splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")] if line.startswith("|") else []
        if len(cells) != 3:
            if rows and not line.startswith("|"):
                break
            continue
        name = re.fullmatch(r"`([a-z]+/?)`", cells[0])
        if not name:
            continue
        uses = cells[2]
        if uses == "nothing":
            rows[name.group(1)] = {}
        elif uses == "all of them":
            rows[name.group(1)] = None
        else:
            rows[name.group(1)] = {re.sub(r"\s*\(.*\)$", "", u.strip()): "without its options" in u for u in uses.split(",")}
    return rows


def dependencies(cargo: Path):
    """{name: spec text} of the [dependencies] section."""
    deps, section = {}, None
    for raw in cargo.read_text().splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        header = re.fullmatch(r"\[([^\]]+)\]", line)
        if header:
            section = header.group(1)
            continue
        if section == "dependencies" and "=" in line:
            key, _, value = line.partition("=")
            deps[key.strip()] = value.strip()
    return deps


def main():
    rows = table()
    problems = []
    crates = sorted(p.name for p in (ENGINE / "crates").iterdir() if (p / "Cargo.toml").is_file())
    if not rows:
        problems.append("engine/README.md: no crate table under \"The engine's crates\"")
    for crate in crates:
        if crate not in rows:
            problems.append(f"engine/crates/{crate}: not in engine/README.md's crate table")
    for name in rows:
        if name != FACADE and name not in crates:
            problems.append(f"engine/README.md: `{name}` is in the crate table but there is no engine/crates/{name}")
    for name, uses in rows.items():
        cargo = ENGINE / (FACADE if name == FACADE else f"crates/{name}") / "Cargo.toml"
        if not cargo.is_file():
            continue
        where = cargo.relative_to(ROOT).as_posix()
        deps = dependencies(cargo)
        wanted = {c: False for c in crates} if uses is None else uses
        built = {}
        for dep, spec in deps.items():
            if not dep.startswith("wingtip-"):
                problems.append(f"{where}: {dep} is from outside the workspace (README: none has a dependency outside it)")
                continue
            built[dep[len("wingtip-") :]] = "default-features = false" in spec
        for dep in sorted(set(built) - set(wanted)):
            problems.append(
                f"{where}: uses wingtip-{dep}, which engine/README.md's table does not give {name}: "
                f"a crate uses only the ones under it (move the code down, or change the table and why)"
            )
        for dep in sorted(set(wanted) - set(built)):
            problems.append(f"{where}: the README's table says {name} uses {dep}, and Cargo.toml has no wingtip-{dep}")
        for dep in sorted(set(wanted) & set(built)):
            if uses is not None and dep == "route" and wanted[dep] != built[dep]:
                said = "without its options" if wanted[dep] else "with its options"
                problems.append(f"{where}: the README's table has route {said}; set default-features accordingly")
    for binding in sorted((ENGINE / "bindings").glob("*/Cargo.toml")):
        for dep in dependencies(binding):
            if dep.startswith("wingtip-") and dep != "wingtip-engine":
                problems.append(
                    f"{binding.relative_to(ROOT).as_posix()}: uses {dep}; a binding reaches the engine "
                    f"through the facade (wingtip-engine) alone"
                )
    for p in problems:
        print(f"::error::{p}")
    if problems:
        return 1
    print(f"engine layers: {len(crates)} crates and the facade as engine/README.md's table says")
    return 0


if __name__ == "__main__":
    sys.exit(main())
