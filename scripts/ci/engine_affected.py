#!/usr/bin/env python3
"""The engine's crates a change needs tested: the ones it touched, every
crate that depends on them, and the contract test (docs/CI.md, "The
tiers"). ci.yml's test-engine job runs `cargo test` over what this prints
on a pull request; main's push, the night and the Mac test every crate.

The crates are engine/Cargo.toml's members less the bindings (py, ffi,
wasm), which have no tests of their own and are built by the jobs that
use them. A changed file is the crate's whose directory holds it; one
under engine/ that is in no crate (Cargo.lock, the toolchain, the
workspace's Cargo.toml, the contract's definitions), or a shared fixture
the crates are tested against, needs them all. The engine's tests against
its contract (wingtip-engine's `--test contract`) and the contract's
generator run on every engine change: each crate's rules answer to it.

  engine_affected.py --all            every crate, as `-p` arguments
  engine_affected.py --base REF       the crates REF..HEAD touches
  engine_affected.py --base REF --github     (or --all --github)
      the same, and `packages`, `contract` (whether the contract test
      needs a run of its own) and `wasm` (whether the WebAssembly's
      inputs changed) written to $GITHUB_OUTPUT

The crates and what they use are Cargo's own word (`cargo metadata
--no-deps`, engine_layers.metadata); the standard library besides, for
the Mac's python3 (3.9) and CI's.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

from engine_layers import metadata

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "engine"
# Read by the crates' tests from outside engine/: a change to one is a
# change to every crate's expectations.
SHARED = ("apps/web/src/lib/fixtures/", "services/planner/tests_wingtip/fixtures/native/")
# What scripts/build/build-engine-wasm.sh builds from, and what it writes.
WASM = re.compile(
    r"^(engine/(facade|crates|bindings/wasm)/|engine/Cargo\.(toml|lock)$|engine/rust-toolchain\.toml$"
    r"|rust-toolchain\.toml$|scripts/build/build-engine-wasm\.sh$|apps/web/src/lib/engine/wingtip-engine\.wasm$)"
)
# Run on every engine change: the contract's generator, and the engine's
# answers held to the contract (wingtip-engine's tests/contract.rs, its
# own `cargo test` when the rest of wingtip-engine is not due, as a
# `--test` filter applies to every package named with it).
GENERATOR = "wingtip-contract-gen"


def crates() -> dict[str, tuple[str, set[str]]]:
    """{name: (directory under engine/, the wingtip-* crates it uses)}:
    every workspace member but the bindings, and what each uses to build,
    test or build its build script, as a change to any of them is one
    to it."""
    out = {}
    for p in metadata():
        if not p["dir"].startswith("bindings/"):
            out[p["name"]] = (p["dir"], {d["name"] for d in p["dependencies"] if d["name"].startswith("wingtip-")})
    return out


def affected(paths: list[str], table: dict[str, tuple[str, set[str]]]) -> list[str]:
    touched: set[str] = set()
    for path in paths:
        if path.startswith(SHARED):
            return sorted(table)
        if not path.startswith("engine/"):
            continue
        rel = path[len("engine/") :]
        owner = next((name for name, (folder, _) in table.items() if rel.startswith(folder)), None)
        if owner is None:
            return sorted(table)
        touched.add(owner)
    # And every crate that uses one of them, however far up.
    grew = True
    while grew:
        grew = False
        for name, (_, uses) in table.items():
            if name not in touched and uses & touched:
                touched.add(name)
                grew = True
    return sorted(touched)


def changed(base: str) -> list[str]:
    out = subprocess.run(["git", "diff", "--name-only", base, "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True)
    return [line for line in out.stdout.splitlines() if line]


def args(names: list[str]) -> str:
    return " ".join(f"-p {name}" for name in names)


def main(argv: list[str]) -> int:
    table = crates()
    if "--all" in argv:
        names, wasm = sorted(table), True
    elif "--base" in argv:
        paths = changed(argv[argv.index("--base") + 1])
        names, wasm = affected(paths, table), any(WASM.match(p) for p in paths)
    else:
        print(__doc__, file=sys.stderr)
        return 64
    packages = args(sorted({*names, GENERATOR}))
    # The contract test is wingtip-engine's: in its run when the crate is due.
    contract = "wingtip-engine" not in names
    print(f"crates: {', '.join(names) or 'none'}; the contract test alone: {contract}; WebAssembly inputs changed: {wasm}", file=sys.stderr)
    if "--github" in argv:
        with open(os.environ["GITHUB_OUTPUT"], "a") as out:
            flag = {True: "true", False: "false"}
            out.write(f"packages={packages}\ncontract={flag[contract]}\nwasm={flag[wasm]}\n")
    else:
        print(packages)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
