"""A red night, or a red run after merge, opens or updates one issue
(docs/CI.md, "Rules" and "The tiers"; decision 0034).
.github/workflows/nightly-issue.yml runs this when a run of CI, Native iOS
or Native Android completes: a scheduled one (tier 3), or main's push
(tier 2: the browser smoke, the images, the iPhone's UI smoke).

Each kind keeps its own issue, "Nightly CI failed" or "Main CI failed
(after merge)", labelled "ready" (for agents: nothing for the owner to
decide), with one section per workflow: the date, the conclusion, the jobs
that failed and the run. Neither holds a merge; a failure is fixed before
new feature work. The script makes at most one GitHub write a run: the
issue created when there is none and something failed, or its body edited
when this workflow's section changed. A green run on a workflow with no
open issue writes nothing. Agents close the issue once every section is
green.

Env: GH_TOKEN, GH_REPO, WORKFLOW, EVENT (schedule or push; schedule if
unset), CONCLUSION, RUN_ID, RUN_URL.

  python3 scripts/ci/nightly_issue.py [--dry-run]
"""

from __future__ import annotations

import datetime
import json
import os
import re
import subprocess
import sys

TITLES = {"schedule": "Nightly CI failed", "push": "Main CI failed (after merge)"}
WHAT = {
    "schedule": "A scheduled run failed (docs/CI.md, \"Rules\": a red nightly comes first).",
    "push": "A run on main after a merge failed: tier 2, which no pull request waits for (docs/CI.md, \"The tiers\").",
}
LABEL = "ready"


def gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def failed_jobs(repo: str, run_id: str) -> list[str]:
    jobs = json.loads(gh("api", f"repos/{repo}/actions/runs/{run_id}/jobs?per_page=100&filter=latest"))["jobs"]
    return [j["name"] for j in jobs if j.get("conclusion") in ("failure", "cancelled", "timed_out")]


def section(workflow: str, conclusion: str, jobs: list[str], url: str) -> str:
    day = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    if conclusion == "success":
        text = f"**{workflow}**: green on {day} ([run]({url}))."
    else:
        listed = "".join(f"\n  - [ ] {name}" for name in jobs) or "\n  - (no job failed: the run itself did)"
        text = f"**{workflow}**: {conclusion} on {day} ([run]({url})). Fix before new feature work:{listed}"
    return f"<!-- nightly:{workflow} -->\n{text}\n<!-- /nightly:{workflow} -->"


def main() -> int:
    dry = "--dry-run" in sys.argv
    repo, workflow = os.environ["GH_REPO"], os.environ["WORKFLOW"]
    conclusion, url = os.environ["CONCLUSION"], os.environ["RUN_URL"]
    event = os.environ.get("EVENT") or "schedule"
    if conclusion in ("skipped", "neutral") or event not in TITLES:
        return 0
    title = TITLES[event]
    jobs = [] if conclusion == "success" else failed_jobs(repo, os.environ["RUN_ID"])
    new = section(workflow, conclusion, jobs, url)
    found = json.loads(gh("issue", "list", "--state", "open", "--search", f'in:title "{title}"', "--json", "number,title,body"))
    issue = next((i for i in found if i["title"] == title), None)
    if issue is None:
        if conclusion == "success":
            print(f"{workflow} green, no open issue: nothing to write")
            return 0
        body = f"{WHAT[event]}\n\n{new}\n"
        print(body)
        if not dry:
            gh("issue", "create", "--title", title, "--label", LABEL, "--body", body)
        return 0
    old = issue["body"] or ""
    pattern = re.compile(rf"<!-- nightly:{re.escape(workflow)} -->.*?<!-- /nightly:{re.escape(workflow)} -->", re.S)
    body = pattern.sub(lambda _: new, old) if pattern.search(old) else f"{old.rstrip()}\n\n{new}\n"
    if body == old:
        print("no change")
        return 0
    print(body)
    if not dry:
        gh("issue", "edit", str(issue["number"]), "--body", body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
