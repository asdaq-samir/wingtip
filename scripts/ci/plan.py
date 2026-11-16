#!/usr/bin/env python3
"""What a CI run builds and runs, from what changed: ci.yml's `changes` job
step "What this run builds and tests", moved here so the workflow stays
within its line budget (scripts/ci/workflow_rules.py).

Reads CHANGED (the paths-filter's matched filters, a JSON list), ALL ("true"
for a run that does everything) and EVENT from the environment, writes the
job's outputs to GITHUB_OUTPUT and prints them.
"""

import json
import math
import os
import re
import shlex

changed = set(json.loads(os.environ.get("CHANGED") or "[]"))
everything = os.environ.get("ALL") == "true" or "global" in changed
# Every image this workflow builds, each a target of
# .github/images.hcl, which has its context and Dockerfile.
IMAGES = ("base", "ml", "retrain", "charts", "planner", "ingest", "weather", "gateway")


def due(name: str) -> bool:
    return everything or name in changed


images = [{"service": s} for s in IMAGES if due(s)]
outputs = {"images": json.dumps(images)}
for name in ("test-web", "test-engine", "test-gateway", "docs", "infra", "api", "arch", "site", "deps", "sim"):
    outputs[name] = "true" if due(name) else "false"
# test-python's legs: the suites whose test-<leg> filter matched.
outputs["python"] = json.dumps([s for s in ("planner", "wingtip", "jobs", "ingest", "weather", "xplane") if due(f"test-{s}")])
# The phones' builds gate a merge (#499): a pull request, or a run
# started by hand on one's branch, that changes an app's own tree (the
# `ios-app` and `android-app` filters; decision 0044). Main's pushes and
# the nights have native-android.yml and native-ios.yml for them, which
# also build on a change to the engine or the shared fixtures, so they
# are not run twice there.
gate = os.environ["EVENT"] in ("pull_request", "workflow_dispatch")
for name in ("android", "ios"):
    outputs[name] = "true" if gate and due(f"{name}-app") else "false"
# The browser specs a pull request adds or changes, which e2e runs before
# it merges (decision 0044), as Playwright takes them, from apps/web. Only
# those: a change to ci.yml runs every job, not every spec. A deleted one
# is not there to run; a name with anything but plain characters is left
# to the night, since the list reaches a shell; and a fork's pull request
# has no access to the stack's images. One shard for every SPECS_A_SHARD
# of them, ten at most, so a wave's thirty specs do not sit on one runner.
SPEC = re.compile(r"^apps/web/(e2e/[A-Za-z0-9._/-]+\.spec\.ts)$")
SPECS_A_SHARD = 3
specs = []
if os.environ["EVENT"] == "pull_request" and os.environ.get("FORK") != "true":
    for path in shlex.split(os.environ.get("SPEC_FILES") or ""):
        found = SPEC.match(path)
        if found and os.path.exists(path):
            specs.append(found.group(1))
outputs["specs"] = " ".join(sorted(specs))
outputs["spec-shards"] = json.dumps(list(range(1, max(1, min(10, math.ceil(len(specs) / SPECS_A_SHARD))) + 1)))
with open(os.environ["GITHUB_OUTPUT"], "a") as out:
    for key, value in outputs.items():
        out.write(f"{key}={value}\n")
print(json.dumps({**outputs, "images": [i["service"] for i in images]}, indent=2))
