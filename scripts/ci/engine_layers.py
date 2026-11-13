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
- a dependency from outside the workspace in a crate or the facade that
  the README does not name (its "Outside the workspace": what the phones
  and the WebAssembly carry is plain Rust the README has weighed), here
  OUTSIDE; a build-dependency runs on the host and is in no build, so it
  is free;
- a binding (engine/bindings) that uses a crate rather than the facade.

The crates and their dependencies are Cargo's own word for them, `cargo
metadata --no-deps` (no network, no build), rather than a reading of the
Cargo.toml files' text. The standard library only besides, for the Mac's
python3 (3.9) and CI's.

  python3 scripts/ci/engine_layers.py
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "engine"
README = ENGINE / "README.md"
FACADE = "facade/"
# The dependencies from outside the workspace the README's "Outside the
# workspace" names, by the package that has them: each plain Rust with no
# system library, so the phones and the WebAssembly carry it as it is.
OUTSIDE = {"wingtip-airspace": {"crc32fast"}, "wingtip-core": {"geographiclib-rs"}}


def cargo() -> str:
    """Cargo: on the PATH, or rustup's own place on a Mac whose shell has
    not put it there."""
    found = shutil.which("cargo") or str(Path.home() / ".cargo" / "bin" / "cargo")
    if not os.access(found, os.X_OK):
        sys.exit("::error::cargo not found: install Rust with rustup (docs/LOCAL-DEV.md)")
    return found


def metadata() -> list[dict]:
    """The workspace's packages as `cargo metadata --no-deps` gives them,
    each with "dir" (its folder under engine/, "facade/", "crates/core/")
    added."""
    out = subprocess.run(
        [cargo(), "metadata", "--no-deps", "--format-version", "1", "--manifest-path", str(ENGINE / "Cargo.toml")],
        check=True,
        capture_output=True,
        text=True,
    )
    packages = json.loads(out.stdout)["packages"]
    for p in packages:
        p["dir"] = Path(p["manifest_path"]).parent.resolve().relative_to(ENGINE.resolve()).as_posix() + "/"
    return packages


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


def dependencies(package: dict) -> dict:
    """{name: uses its default features?} of a package's own dependencies,
    for its build (Cargo's kind null), not its tests' or its build
    script's; a renamed one by the package's name."""
    return {d["name"]: d["uses_default_features"] for d in package["dependencies"] if d["kind"] is None}


def main():
    rows = table()
    problems = []
    packages = metadata()
    by_dir = {p["dir"]: p for p in packages}
    crates = sorted(d[len("crates/") : -1] for d in by_dir if d.startswith("crates/"))
    if not rows:
        problems.append("engine/README.md: no crate table under \"The engine's crates\"")
    for crate in crates:
        if crate not in rows:
            problems.append(f"engine/crates/{crate}: not in engine/README.md's crate table")
    for name in rows:
        if name != FACADE and name not in crates:
            problems.append(f"engine/README.md: `{name}` is in the crate table but there is no engine/crates/{name}")
    for name, uses in rows.items():
        package = by_dir.get(FACADE if name == FACADE else f"crates/{name}/")
        if package is None:
            continue
        where = f"engine/{package['dir']}Cargo.toml"
        wanted = {c: False for c in crates} if uses is None else uses
        built = {}
        for dep, default in dependencies(package).items():
            if not dep.startswith("wingtip-"):
                if dep not in OUTSIDE.get(package["name"], set()):
                    problems.append(
                        f"{where}: {dep} is from outside the workspace and engine/README.md's "
                        f"\"Outside the workspace\" does not name it (a build-dependency is free)"
                    )
                continue
            built[dep[len("wingtip-") :]] = not default
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
    for package in sorted((p for p in packages if p["dir"].startswith("bindings/")), key=lambda p: p["dir"]):
        for dep in dependencies(package):
            if dep.startswith("wingtip-") and dep != "wingtip-engine":
                problems.append(
                    f"engine/{package['dir']}Cargo.toml: uses {dep}; a binding reaches the engine through the facade (wingtip-engine) alone"
                )
    for p in problems:
        print(f"::error::{p}")
    if problems:
        return 1
    print(f"engine layers: {len(crates)} crates and the facade as engine/README.md's table says")
    return 0


if __name__ == "__main__":
    sys.exit(main())
