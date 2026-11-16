"""This CI run against its time budget, and its cache misses (docs/CI.md,
"Rules"; decision 0034). The last job of ci.yml (`budget`) runs it.

It reads the run's jobs through the GitHub API with the run's own token
(actions: read, checks: read), and writes a table of each job's minutes
against its budget to the step summary. A job over its budget, a job with
no budget, and a run over its total are ::warning annotations: the run
never fails for them, since a slow day on GitHub's runners is not the
commit's fault, but a warning on every run is noticed. The cache steps say
"Cache miss" in a notice when their key was not found
(`::notice title=Cache miss::<name>`); those are listed, and on main,
which saves the caches every pull request reads, a miss is a warning.
A key that rotates weekly misses once a week by design; its notice says
"weekly" and stays a notice. And the repository's cache store: past
STORE_WARN_GB of GitHub's 10 GB it warns, as GitHub then evicts the
least recently used -- on 2026-11-14 the iPhone's DerivedData went within
an hour of main saving it, under 5 GB of code scanning's caches.

Seconds: three API calls, and one more per job that left annotations.

  python3 scripts/ci/ci_budget.py                 in CI (GITHUB_* from the runner)
  GH_TOKEN=$(gh auth token) python3 scripts/ci/ci_budget.py --repo asdaq-samir/wingtip --run 42876898472
"""

from __future__ import annotations

import argparse
import datetime
import fnmatch
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

# Each job's budget in minutes, a pull request's (and main's push) and the
# night's, by its name in the Actions UI (fnmatch patterns, first match).
# Set from the runs of November 2026 with a little room; lower one when a
# job gets faster, and raise one only with the reason in the commit. The
# tier-1 jobs, those "CI passed" waits on, fit the three-minute gate (the
# owner, 2026-11-10), but for the phones' builds (TIER1_LONG, below);
# scripts/ci/test_tiers.py holds them to it.
BUDGETS = [
    # Tier 1: a pull request (docs/CI.md, "The tiers").
    ("changes", 1, 1),
    ("Engine wheel", 2, 3),
    ("Guards", 3, 4),
    ("dependency-review", 1, 1),
    ("API compatibility", 1, 1),
    ("infra", 2, 2),
    ("test-engine", 3, 5),
    ("test-web", 3, 5),
    ("test-gateway", 3, 4),
    ("test-planner", 3, 4),
    ("test-wingtip", 3, 4),
    ("test-jobs", 2, 2),
    ("test-ingest", 2, 2),
    ("test-weather", 2, 2),
    ("test-xplane", 1, 1),
    ("test-sim", 3, 4),
    ("Native Android / build", 5, 10),
    ("Native iOS / test", 6, 70),
    ("CI passed", 1, 1),
    # Tier 2: after merge, on main's push.
    ("build (*)", 4, 6),
    ("e2e (*)", 8, 15),
    # Tier 3: the night.
    ("Native Android / device", 15, 15),
    ("docs", 10, 10),
    ("Standards", 10, 10),
    ("Flake hunt (*)", 45, 45),
    ("Flake report", 2, 2),
    ("Sources still answer", 2, 2),
    ("Backup restores", 2, 2),
]
# The tier-1 gate, in minutes: no tier-1 job's budget above it but these,
# the phones' builds, which a pull request waits for only when it touches
# what the app builds from.
TIER1 = 3
TIER1_LONG = {"Native Android / build", "Native iOS / test"}
# The whole run, first job's start to last job's end, by event: a pull
# request is tier 1; main's push adds tier 2; the night is everything.
# A run is given at least its longest job's budget (a phone's build), as
# nothing can make it shorter.
TOTAL = {"pull_request": TIER1, "push": 14, "night": 20}
SELF = "CI budget"
# The cache store's size that warns: GitHub evicts past 10 GB a repository.
STORE_WARN_GB = 9


def api(path: str, token: str) -> dict:
    request = urllib.request.Request(
        f"https://api.github.com/{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def when(stamp: str | None) -> datetime.datetime | None:
    return datetime.datetime.fromisoformat(stamp.replace("Z", "+00:00")) if stamp else None


def budget(name: str, nightly: bool) -> int | None:
    for pattern, pr, night in BUDGETS:
        if fnmatch.fnmatchcase(name, pattern):
            return night if nightly else pr
    return None


def misses(repo: str, suite: int, token: str) -> list[tuple[str, str]]:
    """(job, cache) for each Cache miss notice this run's jobs left."""
    runs = api(f"repos/{repo}/check-suites/{suite}/check-runs?per_page=100", token)["check_runs"]
    noted = [r for r in runs if r.get("output", {}).get("annotations_count") and r["name"] != SELF]

    def notes(run: dict) -> list[tuple[str, str]]:
        found = api(f"repos/{repo}/check-runs/{run['id']}/annotations?per_page=50", token)
        return [(run["name"], a["message"]) for a in found if a.get("title") == "Cache miss"]

    with ThreadPoolExecutor(8) as pool:
        return [m for found in pool.map(notes, noted) for m in found]


def report(repo: str, run_id: str, token: str) -> list[str]:
    run = api(f"repos/{repo}/actions/runs/{run_id}", token)
    nightly = run["event"] in ("schedule", "workflow_dispatch")
    on_main = run["head_branch"] == "main" and run["event"] != "pull_request"
    jobs = api(f"repos/{repo}/actions/runs/{run_id}/jobs?per_page=100&filter=latest", token)["jobs"]
    rows, warnings, starts, ends = [], [], [], []
    for job in jobs:
        start, end = when(job.get("started_at")), when(job.get("completed_at"))
        if job["name"] == SELF or job.get("conclusion") == "skipped" or not start or not end:
            continue
        starts.append(start)
        ends.append(end)
        minutes = (end - start).total_seconds() / 60
        limit = budget(job["name"], nightly)
        over = limit is not None and minutes > limit
        rows.append((minutes, job["name"], limit, job.get("conclusion")))
        if limit is None:
            warnings.append(f"{job['name']} has no budget: add it to scripts/ci/ci_budget.py's BUDGETS")
        elif over:
            warnings.append(f"{job['name']} took {minutes:.1f} min against a budget of {limit}")
    total = (max(ends) - min(starts)).total_seconds() / 60 if starts else 0
    limits = [limit for _, _, limit, _ in rows if limit is not None]
    event = "night" if nightly else ("push" if run["event"] == "push" else "pull_request")
    total_limit = max([TOTAL[event], *limits])
    if total > total_limit:
        warnings.append(f"the run took {total:.1f} min, first job to last, against a budget of {total_limit}")
    lines = [
        f"### CI time: {total:.1f} of {total_limit} min ({'night' if nightly else run['event']})",
        "",
        "| Job | Minutes | Budget | |",
        "|---|---|---|---|",
    ]
    for minutes, name, limit, conclusion in sorted(rows, reverse=True):
        mark = "no budget" if limit is None else ("over" if minutes > limit else "")
        lines.append(f"| {name} | {minutes:.1f} | {limit if limit is not None else '-'} | {mark or conclusion} |")
    missed = misses(repo, run["check_suite_id"], token)
    lines += ["", f"### Cache misses: {len(missed)}", ""]
    lines += [f"- {job}: {cache}" for job, cache in missed] or ["Every cache step found its key."]
    for job, cache in missed:
        if on_main and "weekly" not in cache:
            warnings.append(f"cache miss on main, in {job}: {cache} (main saves what pull requests read)")
    stored = api(f"repos/{repo}/actions/cache/usage", token)["active_caches_size_in_bytes"] / 1e9
    lines += ["", f"### Cache store: {stored:.2f} of 10 GB", ""]
    if stored > STORE_WARN_GB:
        warnings.append(
            f"the cache store holds {stored:.2f} GB, past {STORE_WARN_GB} of GitHub's 10: main's caches will be evicted "
            "(gh cache list --sort size_in_bytes shows the largest)"
        )
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as out:
            out.write("\n".join(lines) + "\n")
    else:
        print("\n".join(lines))
    return warnings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--run", default=os.environ.get("GITHUB_RUN_ID", ""))
    args = parser.parse_args()
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN", "")
    try:
        for warning in report(args.repo, args.run, token):
            print(f"::warning title=CI budget::{warning}")
    except Exception as err:  # noqa: BLE001 -- a report, never a failure
        print(f"::warning title=CI budget::could not read the run: {err!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
