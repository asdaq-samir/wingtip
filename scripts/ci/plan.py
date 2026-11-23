#!/usr/bin/env python3
"""What a CI run builds and runs, from what changed: ci.yml's `changes` job
step "What this run builds and tests", moved here so the workflow stays
within its line budget (scripts/ci/workflow_rules.py).

Reads CHANGED (the paths-filter's matched filters, a JSON list), ALL ("true"
for a run that does everything), EVENT (GitHub's event, or "wave" for a
wave's validation, which validation.py tells apart: the wave, a rerun or a
check) and FAILED (a rerun's failed jobs, as filter names) from the
environment, writes the job's outputs to GITHUB_OUTPUT and prints them.
"""

import json
import os

from validation import mode

event = os.environ["EVENT"]
if event == "wave":
    event = mode()
# A rerun (decision 0062): what the commits since reach, and the jobs that failed.
failed = set(json.loads(os.environ.get("FAILED") or "[]"))
changed = set(json.loads(os.environ.get("CHANGED") or "[]")) | failed
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
# test-python's legs: the suites whose test-<leg> filter matched. And
# flight-critical (the owner, 2026-11-09), on every change but words alone
# (CODE is "false" for those): the planner's KMSN-KOSH nav log is among the
# planner's own tests when that leg runs, and a leg of its own, `flight`,
# when it does not. It was a guard, and every guard's leg waited about a
# minute for the engine's wheel on its account (run 43783303925).
legs = [s for s in ("planner", "wingtip", "jobs", "ingest", "weather", "xplane") if due(f"test-{s}")]
if os.environ.get("CODE") != "false" and "planner" not in legs:
    legs.append("flight")
outputs["python"] = json.dumps(legs)
# The phones' builds gate a merge (#499): a pull request, or a run
# started by hand on one's branch, that changes an app's own tree (the
# `ios-app` and `android-app` filters; decision 0044). Main's pushes and
# the nights have native-android.yml and native-ios.yml for them, which
# also build on a change to the engine or the shared fixtures, so they
# are not run twice there. A wave's validation (EVENT "wave", from
# validate-wave.yml; decision 0054) builds both, every area being due; a
# rerun, those that failed or the commits since reach; a check, those the
# branch reaches. The iPad's legs and the iPhone's UI smoke are the wave's,
# and a rerun's whose iOS failed (`ios-full`); else the unit tests alone.
gate = event in ("pull_request", "workflow_dispatch", "wave", "rerun", "check")
for name in ("android", "ios"):
    outputs[name] = "true" if gate and due(f"{name}-app") else "false"
outputs["ios-full"] = "true" if event == "wave" or "ios-app" in failed else "false"
# The browser suite (decision 0048): main's push and the night run their
# sets; a pull request runs it when it changes the web app or an API
# document, which is what scripts/ci/browser_specs.py follows to the specs
# it reaches, and "CI passed" waits for them. Not for words alone, and not
# from a fork, which has no access to the stack's images. A check runs them
# as a pull request does, and a rerun when they failed too.
pr = event in ("pull_request", "rerun", "check")
reaches = (due("test-web") or due("api")) and os.environ.get("CODE") != "false" and os.environ.get("FORK") != "true"
outputs["e2e"] = "true" if not pr or reaches or "e2e" in failed else "false"
with open(os.environ["GITHUB_OUTPUT"], "a") as out:
    for key, value in outputs.items():
        out.write(f"{key}={value}\n")
print(json.dumps({**outputs, "images": [i["service"] for i in images]}, indent=2))
