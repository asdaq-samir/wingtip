#!/usr/bin/env python3
"""What a run of validate-wave.yml is, and what it has to run again
(docs/CI.md, "Validating a wave"; decision 0062). The owner, 2026-11-22: "I
think you can make validation smart but you didn't do it. This happens over
and over again." Wave 3's fix rounds each ran the whole wave again, about
32 minutes on GitHub, to check a few specs.

A push picks the kind by its branch (scripts/dev/validate-wave.sh pushes them):

  claude/validate-<wave>                     wave    everything, the last proof (ci.yml as the night runs it)
  claude/validate-failed/<wave>/<run id>     rerun   that run's failed jobs and red tests, and what the commits since reach
  claude/check-<topic>                       check   one branch's own reach, against the wave it builds on

and a dispatch of validate-wave.yml on any other branch is a check (its
`base` input, where given, is the branch to hold it against).

ci.yml's `changes` job runs `validation.py github` (through
scripts/ci/changes_since.sh) with the run's token; it writes to
GITHUB_OUTPUT `mode`, then `sha` (the base the paths filter and the
reached specs diff from: the earlier run's commit, or the check's merge
base) or `all=true`, then `failed`, the paths filter's names for the jobs
that failed (scripts/ci/plan.py adds them to what is due), and `rerun`,
the browser tests to run again (scripts/ci/browser_specs.py):

  {"reds": ["mobile|e2e/x.spec.ts:24", ...], "lost": ["<a shard's Playwright arguments>", ...], "all": false}

`reds` are the hard reds of each red shard's Playwright run summary (not
the tests that passed on their retry); `lost` the shards that left no
such list (their setup failed, they timed out, or a setup test failed and
the rest did not run), each run again as it ran; `all` when the browser
tests never ran at all (the images or the plan failed).

  GH_TOKEN=$(gh auth token) python3 scripts/ci/validation.py show <run id>   what a rerun of that run would take
"""

from __future__ import annotations

import fnmatch
import json
import os
import re
import sys

from ci_budget import api, bare
from failure_summary import hard_reds

RERUN = "claude/validate-failed/"
CHECK = "claude/check-"
# A wave's browser projects (browser_specs.py's WAVE_PROJECTS), and a lost shard's of a run from before shards said their arguments.
WAVE_ARGS = "--project=mobile --project=desktop --project=webkit-phone --project=webkit-ipad"
# The paths filter's names (scripts/areas.yml) a failed job's are due again under; "global" is everything.
# Guards is not here: it runs on every run, being reached by any file. A name not here is everything, to be safe.
AREAS = [
    ("changes", ["global"]),
    ("test-web*", ["test-web"]),
    ("test-engine", ["test-engine"]),
    ("test-gateway", ["test-gateway"]),
    ("test-sim", ["sim"]),
    ("test-flight", []),  # plan.py adds the flight-critical leg to every run with code in it
    ("test-*", None),  # a test-python leg, its own filter's name
    ("Engine wheel", [f"test-{leg}" for leg in ("planner", "wingtip", "jobs", "ingest", "weather", "xplane")]),
    ("infra", ["infra"]),
    ("build (images)", ["base", "ml", "retrain", "charts", "planner", "ingest", "weather", "gateway"]),
    ("Native Android*", ["android-app"]),
    ("Native iOS*", ["ios-app"]),
    ("e2e (*)", ["e2e"]),
    ("build (e2e)", ["e2e"]),
    ("Browser specs reached", ["e2e"]),
    ("Guards*", []),
    ("CI passed", []),
    ("CI budget", []),
    ("Stop on red", []),
]
LOST = re.compile(r"^\s*\d+ (did not run|interrupted)\b", re.M)
# A shard's arguments reach a shell: only these words, as browser_specs.py writes them.
ARG = re.compile(r"^(--project=[\w-]+|--shard=\d+/\d+|--retries=\d|e2e/[A-Za-z0-9._/-]+\.spec\.ts(:\d+)?)$")


def inputs() -> dict:
    """A dispatch's inputs, from the event GitHub wrote (a called workflow sees its caller's)."""
    try:
        with open(os.environ.get("GITHUB_EVENT_PATH", "")) as event:
            return json.load(event).get("inputs") or {}
    except (OSError, ValueError):
        return {}


def mode(ref: str | None = None) -> str:
    """wave, rerun or check, from the branch (and a dispatch on another branch is a check)."""
    ref = ref if ref is not None else os.environ.get("GITHUB_REF_NAME", "")
    if ref.startswith(RERUN):
        return "rerun"
    if ref.startswith(CHECK) or (os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch" and not ref.startswith("claude/validate-")):
        return "check"
    return "wave"


def rerun_of(ref: str) -> str:
    run = ref.rsplit("/", 1)[-1]
    if not run.isdigit():
        raise SystemExit(f"validation: {ref} names no run (claude/validate-failed/<wave>/<run id>)")
    return run


def areas(names: list[str]) -> list[str]:
    """The paths filter's names the failed jobs are due again under."""
    out: list[str] = []
    for name in names:
        row = next((r for r in AREAS if fnmatch.fnmatchcase(name, r[0])), None)
        due = ["global"] if row is None else row[1] if row[1] is not None else [name.split(" ")[0]]
        out += [a for a in due if a not in out]
    return out


def browser(repo: str, token: str, run: dict, jobs: list[dict]) -> dict:
    """The red tests and the lost shards of a run's red e2e jobs."""
    plan: dict = {"reds": [], "lost": [], "all": False}
    for job in jobs:
        name = bare(job["name"])
        if fnmatch.fnmatchcase(name, "build (e2e)") or name == "Browser specs reached":
            plan["all"] = True
        if not fnmatch.fnmatchcase(name, "e2e (*)"):
            continue
        notes = api(job["check_run_url"].split("api.github.com/", 1)[1] + "/annotations?per_page=100", token)
        red, _flaky = hard_reds(notes)
        summary = next((n.get("message") or "" for n in notes if "Playwright Run Summary" in (n.get("title") or "")), None)
        tests = [re.match(r"\[([\w-]+)\] › (\S+)", t) for t in red]
        if summary is None or LOST.search(summary) or any(t and t[1] == "setup" for t in tests):
            plan["lost"].append(shard_args(name, notes, run))
        for test in (f"{t[1]}|{t[2]}" for t in tests if t and t[1] != "setup"):
            if test not in plan["reds"]:
                plan["reds"].append(test)
    if any(a is None for a in plan["lost"]):
        plan["all"] = True
    plan["lost"] = [a for a in plan["lost"] if a]
    return plan


def shard_args(name: str, notes: list[dict], run: dict) -> str | None:
    """A shard's Playwright arguments, as its annotation says them (e2e_summary.py); a wave's from its number."""
    for note in notes:
        found = re.match(r"args: (.*)", note.get("message") or "") if (note.get("title") or "").startswith("shard ") else None
        if found and found[1].split() and all(ARG.match(word) for word in found[1].split()):
            return " ".join(found[1].split())
    shard = re.search(r"\((\d+)/(\d+)\)", name)
    if shard and mode(run.get("head_branch") or "") == "wave":
        return f"{WAVE_ARGS} --shard={shard[1]}/{shard[2]}"
    return None


def nearest_base(repo: str, token: str, sha: str) -> tuple[str, str]:
    """The branch a check builds on: of main, claude/integration and each claude/wave*, the one fewest commits behind it."""
    picked = inputs().get("base")
    names = [picked] if picked else []
    if not names:
        refs = api(f"repos/{repo}/git/matching-refs/heads/claude/wave", token)
        names = [r["ref"].removeprefix("refs/heads/") for r in refs] + ["claude/integration", "main"]
    best: tuple[int, str, str] | None = None
    for name in names:
        try:
            compared = api(f"repos/{repo}/compare/{name}...{sha}", token)
        except OSError as err:
            print(f"validation: no compare with {name} ({err})", file=sys.stderr)
            continue
        here = (compared["ahead_by"], name, compared["merge_base_commit"]["sha"])
        if best is None or here[0] < best[0]:
            best = here
    if best is None:
        raise SystemExit("validation: no branch to hold this check against")
    return best[1], best[2]


def github(repo: str, token: str, ref: str, sha: str) -> dict[str, str]:
    kind = mode(ref)
    out = {"mode": kind}
    if kind == "wave":
        return {**out, "all": "true"}
    if kind == "check":
        name, base = nearest_base(repo, token, sha)
        print(f"a check of {ref} against {name}, from {base[:9]}")
        return {**out, "sha": base, "failed": "[]", "rerun": json.dumps({"reds": [], "lost": [], "all": False})}
    run_id = rerun_of(ref)
    run = api(f"repos/{repo}/actions/runs/{run_id}", token)
    listed = api(f"repos/{repo}/actions/runs/{run_id}/jobs?per_page=100&filter=latest", token)["jobs"]
    red = [j for j in listed if j.get("conclusion") in ("failure", "cancelled", "timed_out")]
    names = sorted({bare(j["name"]) for j in red})
    plan = browser(repo, token, run, red)
    print(f"run {run_id} at {run['head_sha'][:9]}: {len(red)} job(s) to run again: {', '.join(names) or 'none'}")
    print(f"  {len(plan['reds'])} red test(s), {len(plan['lost'])} lost shard(s){', every browser test' if plan['all'] else ''}")
    return {**out, "sha": run["head_sha"], "failed": json.dumps(areas(names)), "rerun": json.dumps(plan)}


def main() -> int:
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN", "")
    if sys.argv[1:2] == ["show"] and len(sys.argv) == 3:
        repo = os.environ.get("REPO", "asdaq-samir/wingtip")
        run = api(f"repos/{repo}/actions/runs/{sys.argv[2]}", token)
        print(json.dumps(github(repo, token, f"{RERUN}x/{sys.argv[2]}", run["head_sha"]), indent=2))
        return 0
    if sys.argv[1:] != ["github"]:
        sys.exit(__doc__)
    outputs = github(os.environ["REPO"], token, os.environ["GITHUB_REF_NAME"], os.environ["GITHUB_SHA"])
    with open(os.environ["GITHUB_OUTPUT"], "a") as out:
        for key, value in outputs.items():
            out.write(f"{key}={value}\n")
    print(json.dumps(outputs, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
