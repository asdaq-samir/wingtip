#!/usr/bin/env python3
"""What a CI run builds and runs, from what changed: ci.yml's `changes` job
step "What this run builds and tests", moved here so the workflow stays
within its line budget (scripts/ci/workflow_rules.py).

Reads CHANGED (the paths-filter's matched filters, a JSON list), ALL ("true"
for a run that does everything) and EVENT from the environment, writes the
job's outputs to GITHUB_OUTPUT and prints them.
"""

import json
import os

changed = set(json.loads(os.environ.get("CHANGED") or "[]"))
everything = os.environ.get("ALL") == "true" or "global" in changed
# Every image this workflow builds, each a target of
# .github/images.hcl, which has its context and Dockerfile.
IMAGES = ("base", "ml", "retrain", "charts", "planner", "ingest", "assistant", "weather", "gateway")


def due(name: str) -> bool:
    return everything or name in changed


images = [{"service": s} for s in IMAGES if due(s)]
outputs = {"images": json.dumps(images)}
for name in ("test-web", "test-engine", "test-gateway", "docs", "infra", "api", "arch", "site", "deps", "sim"):
    outputs[name] = "true" if due(name) else "false"
# test-python's legs: the suites whose test-<leg> filter matched.
outputs["python"] = json.dumps([s for s in ("planner", "wingtip", "jobs", "ingest", "assistant", "weather", "xplane") if due(f"test-{s}")])
# The phones' builds gate a merge (#499): a pull request, or a run
# started by hand on one's branch. Main's pushes and the nights
# have native-android.yml and native-ios.yml for them, so they
# are not run twice there.
gate = os.environ["EVENT"] in ("pull_request", "workflow_dispatch")
for name in ("android", "ios"):
    outputs[name] = "true" if gate and due(name) else "false"
with open(os.environ["GITHUB_OUTPUT"], "a") as out:
    for key, value in outputs.items():
        out.write(f"{key}={value}\n")
print(json.dumps({**outputs, "images": [i["service"] for i in images]}, indent=2))
