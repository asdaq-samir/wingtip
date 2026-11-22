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
IMAGES = ("base", "ml", "retrain", "charts", "planner", "ingest", "weather", "gateway")


def due(name: str) -> bool:
    return everything or name in changed


images = [{"service": s} for s in IMAGES if due(s)]
outputs = {"images": json.dumps(images)}
for name in ("test-web", "test-engine", "test-gateway", "docs", "infra", "api", "arch", "site", "deps"):
    outputs[name] = "true" if due(name) else "false"
# test-python's legs: the suites whose test-<leg> filter matched. And
# flight-critical (the owner, 2026-11-09), on every change but words alone
# (CODE is "false" for those): the planner's KMSN-KOSH nav log is among the
# planner's own tests when that leg runs, and a leg of its own, `flight`,
# when it does not. It was a guard, and every guard's leg waited about a
# minute for the engine's wheel on its account (run 43783303925).
legs = [s for s in ("planner", "wingtip", "jobs", "ingest", "weather") if due(f"test-{s}")]
if os.environ.get("CODE") != "false" and "planner" not in legs:
    legs.append("flight")
outputs["python"] = json.dumps(legs)
# The phones' builds gate a merge (#499): a pull request, or a run
# started by hand on one's branch, that changes an app's own tree (the
# `ios-app` and `android-app` filters; decision 0044). Main's pushes and
# the nights have native-android.yml and native-ios.yml for them, which
# also build on a change to the engine or the shared fixtures, so they
# are not run twice there.
gate = os.environ["EVENT"] in ("pull_request", "workflow_dispatch")
for name in ("android", "ios"):
    outputs[name] = "true" if gate and due(f"{name}-app") else "false"
# The browser suite (decision 0048): main's push and the night run their
# sets; a pull request runs it when it changes the web app or an API
# document, which is what scripts/ci/browser_specs.py follows to the specs
# it reaches, and "CI passed" waits for them. Not for words alone, and not
# from a fork, which has no access to the stack's images.
pr = os.environ["EVENT"] == "pull_request"
reaches = (due("test-web") or due("api")) and os.environ.get("CODE") != "false" and os.environ.get("FORK") != "true"
outputs["e2e"] = "true" if not pr or reaches else "false"
with open(os.environ["GITHUB_OUTPUT"], "a") as out:
    for key, value in outputs.items():
        out.write(f"{key}={value}\n")
print(json.dumps({**outputs, "images": [i["service"] for i in images]}, indent=2))
