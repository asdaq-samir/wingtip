#!/usr/bin/env python3
"""No new copy-paste: jscpd (MIT, .tool-versions' version) over the code in
apps/, services/, engine/ and tools/, in TypeScript, Python, Swift, Kotlin,
Java, Rust and C# (CLAUDE.md, "Simplicity rules").

jscpd reads the whole tree in a few seconds, so it always does; what fails
is a clone touching a file the change touches (`--base REF`, or files given)
beyond what scripts/ci/jscpd_baseline.json holds for that pair of files.
The baseline is today's clones, a count per pair; `--write` lowers it as
clones go (never raises it, and drops a pair at zero), so it only shrinks.

The threshold is scripts/ci/jscpd.json's 100 tokens over 5 lines: below it,
the 2026-11-12 tree's hits were Compose and Spring boilerplate (365 Kotlin
pairs at 50 tokens); at it, 44 pairs, each a real copy (FlightDto beside
FlightSummaryDto, the two photo models, the two weather bars). Tests,
fixtures and generated files are left out; their generators are checked.

  python3 scripts/ci/jscpd_check.py --base FETCH_HEAD   clones touching the change (guards)
  python3 scripts/ci/jscpd_check.py --all               every clone against the baseline
  python3 scripts/ci/jscpd_check.py --all --write       lower the baseline
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

import changed

ROOT = changed.ROOT
CONFIG = ROOT / "scripts/ci/jscpd.json"
BASELINE = ROOT / "scripts/ci/jscpd_baseline.json"
AREAS = ["apps", "services", "engine", "tools"]
SUFFIXES = (".ts", ".tsx", ".js", ".mjs", ".py", ".swift", ".kt", ".java", ".rs", ".cs")


def version() -> str:
    for line in (ROOT / ".tool-versions").read_text().splitlines():
        if line.startswith("jscpd "):
            return line.split()[1]
    raise SystemExit(".tool-versions has no jscpd line")


def full(name: str) -> str:
    """jscpd names a file from the folder it was given (web/src/...): the repository's path."""
    for area in AREAS:
        if (ROOT / area / name).is_file():
            return f"{area}/{name}"
    return name


def clones() -> list[dict]:
    if not shutil.which("npx"):
        print("jscpd: no npx here (CI runs it)")
        sys.exit(1 if os.environ.get("GITHUB_ACTIONS") else 3)  # skipped on a Mac, a failure in CI
    with tempfile.TemporaryDirectory() as out:
        run = subprocess.run(
            ["npx", "-y", f"jscpd@{version()}", "--config", str(CONFIG), "--output", out, *AREAS], cwd=ROOT, capture_output=True, text=True
        )
        report = Path(out) / "jscpd-report.json"
        if not report.exists():
            print(run.stdout[-2000:], run.stderr[-2000:])
            sys.exit(2)
        found = []
        for d in json.loads(report.read_text())["duplicates"]:
            a, b = full(d["firstFile"]["name"]), full(d["secondFile"]["name"])
            found.append(
                {
                    "a": a,
                    "b": b,
                    "a_line": d["firstFile"]["start"],
                    "b_line": d["secondFile"]["start"],
                    "lines": d["lines"],
                    "tokens": d.get("tokens", 0),
                }
            )
        return found


def pair(c: dict) -> str:
    return " | ".join(sorted((c["a"], c["b"])))


def main(argv: list[str]) -> int:
    baseline: dict[str, int] = json.loads(BASELINE.read_text()) if BASELINE.exists() else {}
    found = clones()
    counts = Counter(pair(c) for c in found)

    if "--write" in argv:
        kept = {p: min(n, baseline[p]) if p in baseline else n for p, n in counts.items() if p in baseline or "--seed" in argv}
        BASELINE.write_text(json.dumps(dict(sorted(kept.items())), indent=1) + "\n")
        print(f"jscpd: baseline holds {sum(kept.values())} clone(s) in {len(kept)} pair(s)")
        return 0

    files, base = changed.pick(argv, SUFFIXES)
    touched = set(files)
    failed = False
    for line in changed.raised(base, "scripts/ci/jscpd_baseline.json", baseline):
        failed = True
        print(f"::error file=scripts/ci/jscpd_baseline.json::raised against the base ({line}): the baseline only shrinks")
    for p, n in sorted(counts.items()):
        a, b = p.split(" | ")
        if (a in touched or b in touched) and n > baseline.get(p, 0):
            failed = True
            for c in found:
                if pair(c) == p:
                    print(
                        f"::error file={c['a']},line={c['a_line']}::copied code: {c['lines']} lines ({c['tokens']} tokens) "
                        f"here are the same as {c['b']}:{c['b_line']}. Move them into one function both call "
                        f"({n} clone(s) between these files, {baseline.get(p, 0)} in scripts/ci/jscpd_baseline.json)."
                    )
    for p, allowed in sorted(baseline.items()):
        if counts.get(p, 0) < allowed and any(f in touched for f in p.split(" | ")):
            print(
                f"{p}: {counts.get(p, 0)} clone(s) now, {allowed} in the baseline: "
                "`python3 scripts/ci/jscpd_check.py --all --write` lowers it"
            )
    if failed:
        print("Never raise the baseline to pass: one home per helper (CLAUDE.md, 'Simplicity rules').")
        return 1
    print(f"jscpd: {len(touched)} changed file(s), no new clone ({len(found)} known)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
