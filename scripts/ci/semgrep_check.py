#!/usr/bin/env python3
"""One home per constant or helper: the repo's Semgrep rules
(scripts/ci/semgrep/*.yml) over the files a change touches.

Each rule names a thing written once and imported everywhere else (a unit
factor, the Mercator formula, hex-to-RGB, the planner's clients, the
engine's great-circle maths, the map's HTML markers); its message says
where the one home is and why. What is there today is held in
scripts/ci/semgrep/baseline.json as a count per rule and file: a file may
not have more than its count, and a file not listed may have none. A count
that falls is said, and `--write` lowers it (never raises it, and drops a
file at zero), so the list only shrinks.

Semgrep is the free command line (LGPL-2.1) at .tool-versions' version,
run with `uvx` when the PATH's is another, with no login, no rules from the
registry, metrics off and no version check: nothing leaves the machine.

  python3 scripts/ci/semgrep_check.py --base FETCH_HEAD   the files a change touches (guards)
  python3 scripts/ci/semgrep_check.py path/to/file.ts     those files (the edit-time hook)
  python3 scripts/ci/semgrep_check.py --all               every file
  python3 scripts/ci/semgrep_check.py --all --write       lower the baseline to today's counts
"""

from __future__ import annotations

import json
import os
import resource
import subprocess
import sys
from collections import Counter

import changed

ROOT = changed.ROOT
RULES = ROOT / "scripts/ci/semgrep"
BASELINE = RULES / "baseline.json"
MESSAGES: dict[str, str] = {}
SUFFIXES = (".ts", ".tsx", ".js", ".mjs", ".py", ".swift", ".kt", ".java", ".cs")


def command() -> list[str] | None:
    """Semgrep at .tool-versions' version, installed by mise (scripts/build/tool.sh)."""
    tool = str(ROOT / "scripts/build/tool.sh")
    if subprocess.run([tool, "--have", "semgrep"], capture_output=True).returncode == 0:
        return [tool, "semgrep"]
    return None


# Semgrep's wrapper raises its engine's stack to a fraction of the hard
# limit (core_runner.py's set_stack_limit); with no hard limit, as on
# GitHub's Ubuntu runners and in Docker, the engine it starts crashes at
# once (semgrep-core exits with -11, which Semgrep reports as "the engine
# was killed ... used too much memory", the guards' failure since run
# 43339068488). A finite hard limit, 1 GiB, gives it a third of that
# (measured in a Linux container: unlimited crashes every time, 64 MiB,
# 1 GiB and 4 GiB scan every file). The Mac's hard limit is already finite.
STACK_HARD = 1 << 30


def finite_stack() -> None:
    soft, hard = resource.getrlimit(resource.RLIMIT_STACK)
    if hard == resource.RLIM_INFINITY or hard > STACK_HARD:
        resource.setrlimit(resource.RLIMIT_STACK, (min(soft, STACK_HARD) if soft != resource.RLIM_INFINITY else STACK_HARD, STACK_HARD))


def scan(files: list[str]) -> Counter:
    cmd = command()
    if cmd is None:
        print("semgrep: no semgrep at .tool-versions' version, and mise cannot install it here")
        sys.exit(1 if os.environ.get("GITHUB_ACTIONS") else 3)  # skipped on a Mac, a failure in CI
    found: Counter = Counter()  # (rule, path, line) -> findings
    # A few hundred paths a call keeps the command line within its limit.
    for i in range(0, len(files), 400):
        out = subprocess.run(
            [
                *cmd,
                "scan",
                "--metrics=off",
                "--disable-version-check",
                "--oss-only",
                "--quiet",
                "--json",
                "--config",
                str(RULES),
                "--",
                *files[i : i + 400],
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            preexec_fn=finite_stack,
        )
        try:
            report = json.loads(out.stdout)
        except ValueError:
            print(out.stderr[-3000:])
            sys.exit(2)
        for err in report.get("errors", []):
            # A file Semgrep cannot parse is reported, not failed on: the
            # language's own compiler is the judge of that.
            if err.get("level") == "error" and "Syntax" not in err.get("type", [""])[0]:
                print(f"semgrep: {err.get('message', err)}"[:500])
                sys.exit(2)
        for r in report["results"]:
            rule = r["check_id"].rsplit(".", 1)[-1]
            MESSAGES[rule] = " ".join(r["extra"]["message"].split())
            found[(rule, r["path"], r["start"]["line"])] += 1
    return found


def per_file(found: Counter) -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    for (rule, path, _line), n in found.items():
        out.setdefault(rule, {}).setdefault(path, 0)
        out[rule][path] += n
    return out


def main(argv: list[str]) -> int:
    files, base = changed.pick(argv, SUFFIXES)
    baseline: dict[str, dict[str, int]] = json.loads(BASELINE.read_text()) if BASELINE.exists() else {}
    if not files:
        print("semgrep: no source file to check")
        return 0
    found = scan(files)
    counts = per_file(found)

    if "--write" in argv:
        if "--all" not in argv:
            print("--write reads every file: run it with --all")
            return 2
        kept = {}
        for rule, paths in sorted(counts.items()):
            for path, n in sorted(paths.items()):
                was = baseline.get(rule, {}).get(path)
                if was is not None or "--seed" in argv:
                    kept.setdefault(rule, {})[path] = n if was is None else min(n, was)
        BASELINE.write_text(json.dumps(kept, indent=1, sort_keys=True) + "\n")
        print(f"semgrep: baseline holds {sum(sum(p.values()) for p in kept.values())} finding(s)")
        return 0

    failed = False
    broken: set[str] = set()
    for line in changed.raised(base, "scripts/ci/semgrep/baseline.json", baseline):
        failed = True
        print(f"::error file=scripts/ci/semgrep/baseline.json::raised against the base ({line}): the baseline only shrinks")
    for rule, paths in sorted(counts.items()):
        for path, n in sorted(paths.items()):
            allowed = baseline.get(rule, {}).get(path, 0)
            if n > allowed:
                failed = True
                broken.add(rule)
                lines = sorted(line for (r, p, line) in found if r == rule and p == path)
                print(
                    f"::error file={path},line={lines[0]}::{rule}: {n} here, {allowed} in "
                    f"scripts/ci/semgrep/baseline.json (lines {', '.join(map(str, lines))})"
                )
    for rule, paths in sorted(baseline.items()):
        for path, allowed in sorted(paths.items()):
            if path in files and counts.get(rule, {}).get(path, 0) < allowed:
                print(
                    f"{path}: {rule} {counts.get(rule, {}).get(path, 0)} now, {allowed} in the baseline: "
                    "`python3 scripts/ci/semgrep_check.py --all --write` lowers it"
                )
    if failed:
        print("Each rule's message (scripts/ci/semgrep/*.yml) names the one home to import from. Never raise the baseline to pass.")
        for rule in sorted(broken):
            print(f"  {rule}: {MESSAGES.get(rule, '')}")
        return 1
    print(f"semgrep: {len(files)} file(s), no new copy ({sum(found.values())} known)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
