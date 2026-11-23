#!/usr/bin/env python3
"""How long each browser spec takes, so a pull request's reached specs are
dealt to its e2e shards by time and not by count (scripts/ci/browser_specs.py).

Playwright's own --shard deals out an equal number of tests, and with
fullyParallel a 3D spec of two minutes counts the same as a check of two
seconds: on PR #589's run 44951296175 the ten shards' browser tests took
240 to 730 s (mean 522), and the run waited on the slowest. Dealt by time
(the longest first, each to the shard with least so far), the shards end
together.

  spec_seconds.py collect RESULTS.json OUTDIR   a shard's seconds a spec, OUTDIR/seconds.json
  spec_seconds.py merge DIR OUT.json            every seconds.json under DIR, the median of each
  spec_seconds.py latest OUT.json               the last whole validation of a wave's, where OUT is not there

Each e2e shard collects (beside its flaky list, in the e2e-flaky-N
artifact); the night's flake-report job, which already downloads the last
day's e2e-flaky artifacts, merges them into the Actions cache
e2e-spec-seconds-<run>, which a pull request's specs job restores. With
no figures at all every spec weighs the same, which is the count.

A wave's validation (validate-wave.yml) deals its shards so too
(browser_specs.py): where the night's figures are not there, `latest`
takes the last whole validation's (claude/validate-<wave>, kept three days)
and sums each spec's seconds over its shards, as Playwright's --shard,
which split that run, may put a spec's tests on one project in two. Run
45127491141's sixteen shards so split took 4.5 to 20 minutes, the run
waiting on the slowest.
"""

from __future__ import annotations

import json
import os
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

# A spec never timed yet: the median of those that were, or this.
UNKNOWN = 60.0
# A validation's shards that timed their specs, of the wave's sixteen, for its figures to count as the whole suite's.
WHOLE = 12


def collect(results: Path, outdir: Path) -> None:
    """Seconds a spec file on each project, summed over its tests' last attempts."""
    try:
        report = json.loads(results.read_text())
    except (OSError, ValueError) as err:
        print(f"no Playwright report to time: {err}")
        return
    seconds: dict[str, float] = {}

    def walk(suite: dict) -> None:
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                runs = test.get("results") or []
                if runs:
                    key = f"{test.get('projectName', '')}|e2e/{spec['file']}"
                    seconds[key] = seconds.get(key, 0.0) + runs[-1].get("duration", 0) / 1000
        for child in suite.get("suites", []):
            walk(child)

    for suite in report.get("suites", []):
        walk(suite)
    if seconds:
        outdir.mkdir(parents=True, exist_ok=True)
        (outdir / "seconds.json").write_text(json.dumps({k: round(v, 1) for k, v in seconds.items()}, sort_keys=True) + "\n")
    print(f"{len(seconds)} spec(s) timed")


def merge(runs: Path, out: Path) -> None:
    seen: dict[str, list[float]] = {}
    for path in sorted(runs.glob("**/seconds.json")):
        try:
            for key, value in json.loads(path.read_text()).items():
                seen.setdefault(key, []).append(float(value))
        except (OSError, ValueError, AttributeError):
            continue
    if not seen:
        print("no spec timed in these runs: the cache keeps its last figures")
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({k: round(statistics.median(v), 1) for k, v in seen.items()}, sort_keys=True) + "\n")
    print(f"{len(seen)} spec(s) timed, from {sum(map(len, seen.values()))} run(s) of them")
    # For the step that keeps them (ci.yml, flake-report).
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write("timed=true\n")


def latest(out: Path) -> None:
    """The last whole validation's seconds, each spec's summed over the shards (gh, with GH_TOKEN and GH_REPO)."""
    if out.exists():
        return
    runs = ["gh", "run", "list", "--workflow", "validate-wave.yml", "--status", "completed", "--limit", "20"]
    listed = subprocess.run([*runs, "--json", "databaseId,headBranch"], capture_output=True, text=True)
    for run in json.loads(listed.stdout) if listed.returncode == 0 else []:
        branch = run["headBranch"]
        if not branch.startswith("claude/validate-") or branch.startswith("claude/validate-failed/"):
            continue
        with tempfile.TemporaryDirectory() as tmp:
            got = ["gh", "run", "download", str(run["databaseId"]), "--pattern", "e2e-flaky-*", "--dir", tmp]
            subprocess.run(got, capture_output=True)
            shards = sorted(Path(tmp).glob("**/seconds.json"))
            if len(shards) < WHOLE:
                continue
            total: dict[str, float] = {}
            for path in shards:
                for key, value in json.loads(path.read_text()).items():
                    total[key] = total.get(key, 0.0) + float(value)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({k: round(v, 1) for k, v in total.items()}, sort_keys=True) + "\n")
        print(f"spec seconds: {len(total)} from run {run['databaseId']} ({branch}, {len(shards)} shards)", file=sys.stderr)
        return
    print("spec seconds: no whole validation timed its specs (or no gh here); Playwright's --shard splits", file=sys.stderr)


def load(path: str | None, project: str) -> dict[str, float]:
    """The figures for one project, by spec path (e2e/name.spec.ts); none where there is no file."""
    try:
        data = json.loads(Path(path).read_text()) if path else {}
    except (OSError, ValueError):
        return {}
    return {key.split("|", 1)[1]: float(v) for key, v in data.items() if key.startswith(f"{project}|")}


def deal(specs: list[str], shards: int, seconds: dict[str, float]) -> list[list[str]]:
    """The specs over that many shards, longest first, each to the shard with the least time so far."""
    default = statistics.median(seconds.values()) if seconds else UNKNOWN
    weight = {s: seconds.get(s, default) for s in specs}
    loads = [0.0] * shards
    out: list[list[str]] = [[] for _ in range(shards)]
    for spec in sorted(specs, key=lambda s: (-weight[s], s)):
        i = loads.index(min(loads))
        out[i].append(spec)
        loads[i] += weight[spec]
    return [sorted(group) for group in out]


if __name__ == "__main__":
    if sys.argv[1:2] == ["collect"] and len(sys.argv) == 4:
        collect(Path(sys.argv[2]), Path(sys.argv[3]))
    elif sys.argv[1:2] == ["merge"] and len(sys.argv) == 4:
        merge(Path(sys.argv[2]), Path(sys.argv[3]))
    elif sys.argv[1:2] == ["latest"] and len(sys.argv) == 3:
        latest(Path(sys.argv[2]))
    else:
        sys.exit(__doc__)
