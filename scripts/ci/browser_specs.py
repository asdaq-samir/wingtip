#!/usr/bin/env python3
"""What ci.yml's e2e job runs, and on how many shards (decision 0048).

At night or by hand, every spec on every project, over ten shards. In
a wave's validation (EVENT "wave", validate-wave.yml; decision 0054),
every spec on the phone, desktop and WebKit phone projects, over
WAVE_SHARDS: minutes, where the night's ten take half an hour. On
main's push, the @smoke and @flight-critical tests on the phone project
and the iPhone's WebKit, over two. On a pull request, every spec its
change reaches (apps/web/scripts/reached-specs.mjs: the specs whose
screens a changed file draws or feeds), on the phone project, one shard
for every SPECS_A_SHARD of them and ten at most; "CI passed" waits for
them, so a wave's change cannot merge with the browser tests it broke.

Reads EVENT and, on a pull request, the changed files from `git diff
HEAD^1` (the checkout is the merge, whose first parent is the base);
writes `args` (Playwright's arguments, with no specs `run` is false) and
`shards` to GITHUB_OUTPUT.

  EVENT=pull_request python3 scripts/ci/browser_specs.py
"""

import json
import math
import os
import re
import subprocess
import sys

SPECS_A_SHARD = 3
MAX_SHARDS = 10
# Wide, as a wave waits on it; GitHub runs 20 jobs at once for a free
# account, and the rest of the run's jobs need a few of them.
WAVE_SHARDS = 16
WAVE_PROJECTS = "--project=mobile --project=desktop --project=webkit-phone"
# The list reaches a shell: a spec named with anything else is left to the night.
PLAIN = re.compile(r"^e2e/[A-Za-z0-9._/-]+\.spec\.ts$")


def shards(n: int) -> str:
    return json.dumps(list(range(1, n + 1)))


def plan(event: str) -> dict[str, str]:
    if event in ("schedule", "workflow_dispatch"):
        return {"run": "true", "args": "", "shards": shards(MAX_SHARDS)}
    if event == "wave":
        return {"run": "true", "args": WAVE_PROJECTS, "shards": shards(WAVE_SHARDS)}
    if event != "pull_request":
        return {"run": "true", "args": '--project=mobile --project=webkit-phone --grep "@smoke|@flight-critical"', "shards": shards(2)}
    changed = subprocess.run(["git", "diff", "--name-only", "HEAD^1", "HEAD"], check=True, capture_output=True, text=True).stdout
    found = subprocess.run(["node", "scripts/reached-specs.mjs"], cwd="apps/web", input=changed, check=True, capture_output=True, text=True)
    print(found.stderr.strip(), file=sys.stderr)
    specs = [s for s in found.stdout.split() if PLAIN.match(s)]
    if not specs:
        return {"run": "false", "args": "", "shards": shards(1)}
    n = min(MAX_SHARDS, math.ceil(len(specs) / SPECS_A_SHARD))
    return {"run": "true", "args": "--project=mobile " + " ".join(specs), "shards": shards(n)}


def main() -> int:
    outputs = plan(os.environ["EVENT"])
    with open(os.environ["GITHUB_OUTPUT"], "a") as out:
        for key, value in outputs.items():
            out.write(f"{key}={value}\n")
    print(json.dumps(outputs, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
