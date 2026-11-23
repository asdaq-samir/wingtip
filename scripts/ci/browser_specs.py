#!/usr/bin/env python3
"""What ci.yml's e2e job runs, and on how many shards (decision 0048).

At night or by hand, every spec on every project, over ten shards. In
a wave's validation (EVENT "wave", validate-wave.yml; decision 0054),
every spec on the phone, desktop and WebKit phone projects, and the
smoke set and the ipad-* specs on the iPad's WebKit, over WAVE_SHARDS: minutes, where the
night's ten take half an hour. A rerun of a wave's red run and a check of
one branch (validation.py's modes; decision 0062) deal shards of their own:
a rerun, the earlier run's red tests on their projects with no retry
(each still has its timeout, so a known red cannot hold a shard for its
retry's two minutes), REDS_A_SHARD to a shard, its lost shards as they
ran, and the specs the commits since reach (BASE, the earlier run's
commit) on the wave's projects; a check, the specs its branch reaches
from its base, on the wave's projects. On main's push, the @smoke and
@flight-critical tests on the phone project, the iPhone's WebKit and the
iPad's (webkit-ipad, which runs only that set; the iPad is the primary
device, decision 0058), over SMOKE_SHARDS. On a pull request (tier 1,
which the iPad does not grow; decision 0034), every spec its change reaches (apps/web/scripts/reached-specs.mjs: the specs whose
screens a changed file draws or feeds), on the phone project, one shard
for every SPECS_A_SHARD of them and ten at most; "CI passed" waits for
them, so a wave's change cannot merge with the browser tests it broke.

Reads EVENT and, on a pull request, the changed files from `git diff
HEAD^1` (the checkout is the merge, whose first parent is the base);
writes `args` (Playwright's arguments, with no specs `run` is false),
`shards` and `groups` to GITHUB_OUTPUT. On a pull request `groups` deals
the specs to the shards by their time (SPEC_SECONDS, scripts/ci/spec_seconds.py),
entry N shard N's arguments, and the job runs those instead of --shard;
elsewhere it is empty and Playwright's --shard splits the set.

  EVENT=pull_request python3 scripts/ci/browser_specs.py
  python3 scripts/ci/browser_specs.py --list BASE    the specs a pull request from BASE runs, one a line

scripts/dev/preflight.sh lists them so, before a push; REACHED_SPECS_NODE
is the command that runs node in apps/web where the Mac has none.
"""

import json
import math
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

from spec_seconds import deal, load
from validation import WAVE_ARGS, mode

SPECS_A_SHARD = 3
# A known red with no retry: at worst six of CI's two-minute timeouts over two workers, six minutes.
REDS_A_SHARD = 6
MAX_SHARDS = 10
# Wide, as a wave waits on it; GitHub runs 20 jobs at once for a free
# account, and the rest of the run's jobs need a few of them.
WAVE_SHARDS = 16
WAVE_PROJECTS = WAVE_ARGS
# Two held the smoke set at 5-9 min a shard (2026-11-10); the iPad's WebKit
# adds the set again in a slower engine, so a third shard, not a longer one.
SMOKE_SHARDS = 3
SMOKE = '--project=mobile --project=webkit-phone --project=webkit-ipad --grep "@smoke|@flight-critical"'
# The list reaches a shell: a spec named with anything else is left to the night.
PLAIN = re.compile(r"^e2e/[A-Za-z0-9._/-]+\.spec\.ts$")


def shards(n: int) -> str:
    return json.dumps(list(range(1, n + 1)))


def changed_since(base: str) -> str:
    """The files changed from base, one a line."""
    # A rerun's or a check's base is further back than the checkout: its tree alone is enough to diff (a public repository's).
    if subprocess.run(["git", "cat-file", "-e", f"{base}^{{tree}}"], capture_output=True).returncode:
        subprocess.run(["git", "fetch", "-q", "--no-tags", "--depth=1", "origin", base], check=True)
    return subprocess.run(["git", "diff", "--name-only", base, "HEAD"], check=True, capture_output=True, text=True).stdout


def reached(base: str) -> list[str]:
    """The specs a change from base reaches (apps/web/scripts/reached-specs.mjs), those a shell can take."""
    changed = changed_since(base)
    node = shlex.split(os.environ.get("REACHED_SPECS_NODE", "node"))
    found = subprocess.run([*node, "scripts/reached-specs.mjs"], cwd="apps/web", input=changed, check=True, capture_output=True, text=True)
    print(found.stderr.strip(), file=sys.stderr)
    return [s for s in found.stdout.split() if PLAIN.match(s)]


def wide(specs: list[str], extra: str = "") -> list[str]:
    """Specs on the wave's projects, dealt by their phone and desktop seconds, three a shard on each."""
    if not specs:
        return []
    figures = [load(os.environ.get("SPEC_SECONDS"), p) for p in ("mobile", "desktop")]
    timed = {s: v for s in specs if (v := sum(f.get(s, 0.0) for f in figures))}
    n = min(WAVE_SHARDS, math.ceil(2 * len(specs) / SPECS_A_SHARD))
    return [f"{WAVE_PROJECTS}{extra} " + " ".join(g) for g in deal(specs, n, timed) if g]


def most(specs: list[str]) -> bool:
    """Half the suite or more, which the wave's own sixteen shards run sooner than a list dealt over ten."""
    return 2 * len(specs) >= len(list(Path("apps/web/e2e").rglob("*.spec.ts")))


def again(specs: list[str], rerun: dict) -> list[str]:
    """A rerun's shards: the known reds without a retry, the lost shards, and the specs the commits since reach."""
    red_files = {r.split("|", 1)[1].rsplit(":", 1)[0] for r in rerun["reds"]}
    # A known red's spec the commits reach runs whole, as its lines may have moved; still with no retry.
    groups = wide([s for s in specs if s in red_files], " --retries=0") + wide([s for s in specs if s not in red_files])
    by_project: dict[str, list[str]] = {}
    for red in rerun["reds"]:
        project, test = red.split("|", 1)
        if test.rsplit(":", 1)[0] not in specs and PLAIN.match(test.rsplit(":", 1)[0]):
            by_project.setdefault(project, []).append(test)
    for project, tests in sorted(by_project.items()):
        for i in range(0, len(tests), REDS_A_SHARD):
            groups.append(f"--project={project} --retries=0 " + " ".join(tests[i : i + REDS_A_SHARD]))
    return groups + rerun["lost"]


def plan(event: str) -> dict[str, str]:
    if event == "wave":
        event = mode()
    if event in ("rerun", "check"):
        rerun = json.loads(os.environ.get("RERUN") or "{}")
        specs = [] if rerun.get("all") else reached(os.environ["BASE"])
        # A rerun's commits that reach most of the suite (a shared hook reaches 190 of 191): the known reds and the specs
        # the commits edit, the rest left to the wave's full run, its last proof. A check that does runs the wave's set.
        if event == "rerun" and most(specs):
            edited = {f.removeprefix("apps/web/") for f in changed_since(os.environ["BASE"]).split()}
            print(f"rerun: the commits reach {len(specs)} specs; those they edit run, the rest are the full run's", file=sys.stderr)
            specs = [s for s in specs if s in edited]
        if rerun.get("all") or most(specs):
            event = "wave"
        else:
            groups = again(specs, rerun) if event == "rerun" else wide(specs)
            if not groups:
                return {"run": "false", "args": "", "shards": shards(1), "groups": ""}
            print(f"{event}: {len(groups)} shard(s)", file=sys.stderr)
            return {"run": "true", "args": "", "shards": shards(len(groups)), "groups": json.dumps(["", *groups])}
    if event in ("schedule", "workflow_dispatch"):
        return {"run": "true", "args": "", "shards": shards(MAX_SHARDS), "groups": ""}
    if event == "wave":
        return {"run": "true", "args": WAVE_PROJECTS, "shards": shards(WAVE_SHARDS), "groups": ""}
    if event != "pull_request":
        return {"run": "true", "args": SMOKE, "shards": shards(SMOKE_SHARDS), "groups": ""}
    specs = reached("HEAD^1")
    if not specs:
        return {"run": "false", "args": "", "shards": shards(1), "groups": ""}
    n = min(MAX_SHARDS, math.ceil(len(specs) / SPECS_A_SHARD))
    # Index 0 unused, so the job's matrix.shard (from 1) is the index.
    groups = [""] + ["--project=mobile " + " ".join(g) for g in deal(specs, n, load(os.environ.get("SPEC_SECONDS"), "mobile"))]
    return {"run": "true", "args": "--project=mobile " + " ".join(specs), "shards": shards(n), "groups": json.dumps(groups)}


def main() -> int:
    if sys.argv[1:2] == ["--list"] and len(sys.argv) == 3:
        print("\n".join(reached(sys.argv[2])))
        return 0
    outputs = plan(os.environ["EVENT"])
    with open(os.environ["GITHUB_OUTPUT"], "a") as out:
        for key, value in outputs.items():
            out.write(f"{key}={value}\n")
    print(json.dumps(outputs, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
