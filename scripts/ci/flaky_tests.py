"""The flaky tests' list, in every tier (ci.yml, flake-report, and
nightly-issue.yml after a merge; docs/CI.md, "Flaky tests").

python3 scripts/ci/flaky_tests.py e2e RESULTS.json OUT.txt
    The browser tests Playwright's JSON report calls flaky (failed, then
    passed on the retry), one a line, into OUT.txt; and each spec's
    seconds beside it (scripts/ci/spec_seconds.py), which the same
    artifact carries to the night.

python3 scripts/ci/flaky_tests.py fetch DIR
    The e2e-flaky artifacts of every CI run of the last day but this one
    (THIS_RUN), pull requests' and waves' included, into DIR/<run>: reads only.

python3 scripts/ci/flaky_tests.py report RUNS_DIR [--dry-run]
    RUNS_DIR holds the unit suites' runs in random order -- pytest's
    JUnit XML (<suite>/run-N.xml) and vitest's JSON (apps/web/run-N.json) --
    and the browser runs' flaky lists (e2e/**/*.txt). A unit test that
    failed in at least one run and passed in another is flaky. The list,
    kept for 14 days after a test was last seen, goes into the body of
    one standing issue, "Flaky tests (nightly)": created if there is
    none and there is something to say, edited when the list changed,
    left alone otherwise. At most one GitHub write a night, never a
    comment: a burst of writes got the owner's account suspended once
    (CLAUDE.md, "Write to GitHub gently").

python3 scripts/ci/flaky_tests.py report RUNS_DIR --after-merge
    The same for one run of main's push (tier 2: the browser smoke), from
    nightly-issue.yml once that run completes, so a test that passed only
    on its retry after a merge is listed that hour, not the next night.
    Ten seconds before its one write, which may follow that workflow's own.
    No test is ever skipped or quarantined for being listed: each is fixed.
"""

import datetime
import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

from spec_seconds import collect

TITLE = "Flaky tests (nightly)"
KEEP_DAYS = 14
DATA = re.compile(r"<!-- flaky-tests (\{.*\}) -->", re.S)
SUITES = {
    "wingtip": "Python (services/planner/tests_wingtip)",
    "planner": "Python (services/planner/tests)",
    "web": "Web (vitest)",
    "e2e": "Browser (Playwright)",
}


def clean(name: str) -> str:
    """A test's name made safe to print in the issue. Names come from the
    tests' own code, a pull request's included, and the browser lists of
    other runs are read too: a backtick would end the code span the name is
    shown in (and with it, links, images and @mentions would render), and
    `-->` would end the hidden comment that holds the list. So no backticks,
    angle brackets or control characters, and no more than 300 characters."""
    name = re.sub(r"[`<>\x00-\x1f\x7f]+", " ", name)
    return re.sub(r" {2,}", " ", name).strip()[:300]


def e2e(results: Path, out: Path) -> None:
    flaky = []

    def walk(suite, titles):
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                if test.get("status") == "flaky":
                    flaky.append(f"[{test.get('projectName', '')}] {spec['file']}:{spec['line']} › {' › '.join(titles + [spec['title']])}")
        for child in suite.get("suites", []):
            walk(child, titles + ([child["title"]] if child.get("title") and not child["title"].endswith(".ts") else []))

    try:
        report = json.loads(results.read_text())
    except (OSError, ValueError) as err:
        print(f"no Playwright report to read: {err}")
        return
    for suite in report.get("suites", []):
        walk(suite, [])
    if flaky:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text("\n".join(sorted(set(flaky))) + "\n")
    print(f"{len(flaky)} flaky browser test(s)")
    collect(results, out.parent)


def fetch(into: Path) -> None:
    """The last day's other CI runs' e2e-flaky artifacts, each into its own folder; reads only."""
    since = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    listed = subprocess.run(
        ["gh", "run", "list", "--workflow", "ci.yml", "--created", f">={since}", "--json", "databaseId", "--limit", "200"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    for run in json.loads(listed):
        run_id = str(run["databaseId"])
        if run_id != os.environ.get("THIS_RUN"):
            subprocess.run(["gh", "run", "download", run_id, "--pattern", "e2e-flaky-*", "--dir", str(into / run_id)], capture_output=True)


def outcomes(runs: Path) -> dict:
    """{(suite, test): {"passed": n, "failed": n}} over every run found."""
    seen = defaultdict(lambda: {"passed": 0, "failed": 0})
    for path in sorted(runs.glob("*/run-*.xml")):
        try:
            root = ET.parse(path).getroot()
        except (OSError, ET.ParseError):
            continue
        for case in root.iter("testcase"):
            if case.find("skipped") is not None:
                continue
            failed = case.find("failure") is not None or case.find("error") is not None
            seen[(path.parent.name, clean(f"{case.get('classname')}::{case.get('name')}"))]["failed" if failed else "passed"] += 1
    for path in sorted(runs.glob("apps/web/run-*.json")):
        try:
            report = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        for result in report.get("testResults", []):
            # An absolute path on the runner; from apps/web/ on, as the repo has it.
            file = result.get("name", "").rsplit("/web/", 1)[-1]
            for test in result.get("assertionResults", []):
                if test.get("status") in ("passed", "failed"):
                    seen[("web", clean(f"{file} › {test.get('fullName')}"))][test["status"]] += 1
    return seen


def report(runs: Path, dry_run: bool, after_merge: bool = False) -> None:
    today = datetime.date.today().isoformat()
    tonight = {}
    for (suite, test), counts in outcomes(runs).items():
        if counts["passed"] and counts["failed"]:
            tonight[f"{suite}|{test}"] = f"failed {counts['failed']} of {counts['passed'] + counts['failed']}"
    for path in sorted(runs.glob("e2e/**/*.txt")):
        for line in path.read_text().splitlines():
            if clean(line):
                tonight[f"e2e|{clean(line)}"] = "passed on its retry"

    issue = find_issue()
    old = {}
    if issue:
        match = DATA.search(issue.get("body") or "")
        old = json.loads(match[1]) if match else {}
    kept = {}
    cutoff = (datetime.date.today() - datetime.timedelta(days=KEEP_DAYS)).isoformat()
    for key, entry in old.items():
        if key not in tonight and entry["last"] >= cutoff:
            kept[key] = {**entry, "tonight": ""}
    for key, what in tonight.items():
        entry = old.get(key, {"first": today, "nights": 0})
        kept[key] = {"first": entry["first"], "last": today, "nights": entry["nights"] + (entry.get("last") != today), "tonight": what}

    print(f"{len(tonight)} flaky tonight, {len(kept)} listed")
    if kept == old or (not issue and not kept):
        print("nothing to change on GitHub")
        return
    body = render(kept, today, ticked(issue.get("body", "") if issue else ""))
    if dry_run:
        print(body)
        return
    # The one write of the run; after a merge, ten seconds after the run's own issue's.
    if after_merge:
        time.sleep(10)
    if issue:
        subprocess.run(["gh", "issue", "edit", str(issue["number"]), "--body", body], check=True)
    else:
        subprocess.run(["gh", "issue", "create", "--title", TITLE, "--body", body], check=True)


def find_issue():
    answer = subprocess.run(
        ["gh", "issue", "list", "--state", "open", "--search", f'in:title "{TITLE}"', "--json", "number,title,body", "--limit", "20"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return next((issue for issue in json.loads(answer) if issue["title"] == TITLE), None)


def ticked(body: str) -> set[str]:
    """The tests a reader ticked as fixed in the issue's checklist."""
    return set(re.findall(r"^- \[x\] `([^`]*)`", body or "", re.M | re.I))


def render(entries: dict, today: str, fixed: set[str] = frozenset()) -> str:
    env = os.environ.get
    run = f"{env('GITHUB_SERVER_URL', 'https://github.com')}/{env('GITHUB_REPOSITORY', '')}/actions/runs/{env('GITHUB_RUN_ID', '')}"
    rows = []
    for key, entry in sorted(entries.items(), key=lambda kv: (kv[1]["last"], kv[0]), reverse=True):
        suite, test = key.split("|", 1)
        name = test.replace("|", "/")
        # A tick stays until the test flakes again (seen in this run).
        box = "x" if name in fixed and not entry["tonight"] else " "
        what = entry["tonight"] or "not this run"
        rows.append(f"- [{box}] `{name}` · {SUITES.get(suite, suite)} · {what} · seen {entry['nights']} day(s), last {entry['last']}")
    lines = [
        "Tests that both failed and passed in one run, in any tier: the Python and web unit suites at night, five runs each "
        "in random order, and the browser tests that passed only on their retry, on a pull request, on main after a merge "
        "or at night. Kept here 14 days after a test was last seen; none is skipped or quarantined for being here. "
        "Tick one once its cause is fixed: it is unticked if it flakes again. "
        "This body is rewritten by CI (ci.yml's flake-report, nightly-issue.yml after a merge); a comment here is not read.",
        "",
        f"Last changed {today}, by {run}.",
        "",
        *(rows or ["- none"]),
        "",
        "How to find the cause and fix one: docs/CI.md, \"Flaky tests\". A unit run's order comes back with its seed "
        "(`pytest -p randomly --randomly-seed=N`, `npx vitest run --sequence.seed=N`), printed at the top of that run's log.",
        "",
        f"<!-- flaky-tests {json.dumps(entries, sort_keys=True)} -->",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    if sys.argv[1:2] == ["e2e"] and len(sys.argv) == 4:
        e2e(Path(sys.argv[2]), Path(sys.argv[3]))
    elif sys.argv[1:2] == ["fetch"] and len(sys.argv) == 3:
        fetch(Path(sys.argv[2]))
    elif sys.argv[1:2] == ["report"] and len(sys.argv) in (3, 4):
        report(Path(sys.argv[2]), "--dry-run" in sys.argv, "--after-merge" in sys.argv)
    else:
        sys.exit(__doc__)
