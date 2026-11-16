"""Every check in one tier (docs/CI.md, "Rules"; decision 0034).

The policy, which this script holds the repository to:

- **Three tiers** (the owner, 2026-11-10: "3-minute gate: browser smoke,
  images and iPhone UI smoke run after merge"). Tier 1 is what a pull
  request runs, and "CI passed" waits for every tier-1 job and no other;
  tier 2 runs after merge, on main's push (a job whose `if:` says
  `github.event_name != 'pull_request'`): the browser suite's smoke, the
  images, and in native-ios.yml's own run the iPhone's UI smoke; tier 3 is
  the night. No tier-1 job needs a later tier's; the browser suite and the
  image builds are never tier 1 again; each tier-1 job has a budget in
  scripts/ci/ci_budget.py within the three minutes (the phones' builds
  aside); and every app a pull request changes the inputs of is still
  built in tier 1 (#499): the web app's `vite build`, Android's job, and
  iOS's, called with `unit_only: true`.
- **One @smoke per journey.** A browser journey is a spec file in
  apps/web/e2e, or a top-level `test.describe` block within one. Main's
  push runs the `@smoke` and `@flight-critical` tests only (ci.yml's
  e2e), so each journey holds at most one `@smoke` test.
- **Every spec chooses its tier.** A spec file holds a `@smoke` or
  `@flight-critical` test, or is named in scripts/ci/test_tiers_nightly.txt
  (nightly only, the whole suite). A new spec with neither fails here, so
  no test lands without someone deciding when it runs.
- **At most one retry on a pull request** (playwright.config.ts's
  `retries`): a test that needs more is flaky, and goes to the nightly
  issue (scripts/ci/flaky_tests.py) to be fixed, not retried.
- **Every iOS UI test class in a tier.** native-ios.yml names main's
  push's classes with `-only-testing:WingtipUITests/<Class>` (a pull
  request's run, `unit_only`, has none); the night (`full`) runs every
  class the scheme holds, less any `-skip-testing:`. A class in neither
  fails here.
- **No check twice in a pull request.** The same check command (tsc,
  ESLint, ruff, pytest, cargo test, ...) run from the same directory in
  two of ci.yml's pull-request jobs fails here.

The standard library only; seconds. Run in ci.yml's guards job (scripts/ci/guards.sh).

  python3 scripts/ci/test_tiers.py
"""

from __future__ import annotations

import fnmatch
import os
import re
import sys
from collections import defaultdict

import ci_budget
import workflows

ROOT = workflows.ROOT
E2E = ROOT / "apps/web/e2e"
NIGHTLY_LIST = ROOT / "scripts/ci/test_tiers_nightly.txt"
PR_TAGS = ("@smoke", "@flight-critical")
MAX_RETRIES = 1
# The slower proofs, after merge and never on a pull request again.
AFTER_MERGE = {"e2e", "e2e-images", "build-images"}
# ci.yml's jobs about the run rather than in a tier.
META = {"passed", "budget"}
# The apps a pull request must still build when it touches their inputs
# (#499), each by the reusable workflow ci.yml calls.
PHONES = {"native-android.yml": "", "native-ios.yml": "unit_only: true"}

# The commands that are checks, as the first word or two of a command; the
# rest of a run line (installs, builds, echo) may repeat freely.
CHECKS = re.compile(
    r"^(?:npx |npm run )?(tsc|eslint|knip|vitest|prettier|format:check|ruff check|ruff format|pytest|lint-imports"
    r"|cargo (?:test|clippy|fmt|machete)|(?:\./)?mvnw?(?: -B)?(?: -q)? (?:test|verify|spotless:check)"
    r"|python3? (?:\S*/)?scripts/(?:ci|build)/\S+|scripts/(?:dev|ci|build)/\S+ --check\S*|playwright test)\b"
)


def journeys(text: str) -> dict[str, int]:
    """Each journey's @smoke count: top-level describe blocks, else the file."""
    counts: dict[str, int] = defaultdict(int)
    current = ""
    for line in text.splitlines():
        m = re.match(r"^test\.describe(?:\.\w+)?\(\s*([\"'`])(.*?)\1", line)
        if m:
            current = m.group(2)
        elif line.startswith(("test(", "});")):
            current = ""
        counts[current] += len(re.findall(r"[\"']@smoke[\"']", line))
    return {k: v for k, v in counts.items() if v}


def playwright() -> list[str]:
    errors = []
    nightly = {line.split("#")[0].strip() for line in NIGHTLY_LIST.read_text().splitlines()} - {""}
    specs = sorted(p.relative_to(E2E).as_posix() for p in E2E.rglob("*.spec.ts"))
    for spec in specs:
        text = (E2E / spec).read_text()
        for journey, n in journeys(text).items():
            if n > 1:
                where = f"describe '{journey}'" if journey else "the file"
                errors.append(
                    f"apps/web/e2e/{spec}: {n} @smoke tests in {where}; a journey has one (keep the one that proves it end to end)"
                )
        tagged = any(re.search(rf"[\"']{t}[\"']", text) for t in PR_TAGS)
        if tagged and spec in nightly:
            errors.append(f"apps/web/e2e/{spec}: tagged for the pull request and listed nightly in {NIGHTLY_LIST.name}; one tier")
        if not tagged and spec not in nightly:
            errors.append(
                f"apps/web/e2e/{spec}: no tier: tag its one end-to-end test @smoke, or add the file to scripts/ci/{NIGHTLY_LIST.name}"
            )
    for gone in sorted(nightly - set(specs)):
        errors.append(f"scripts/ci/{NIGHTLY_LIST.name}: {gone} is not a spec any more; drop the line")
    config = (ROOT / "apps/web/playwright.config.ts").read_text()
    m = re.search(r"^\s*retries:\s*(.+?),?\s*$", config, re.M)
    retries = [int(n) for n in re.findall(r"\d+", m.group(1))] if m else []
    if not retries or max(retries) > MAX_RETRIES:
        errors.append(f"apps/web/playwright.config.ts: retries must be at most {MAX_RETRIES} (found {m.group(1) if m else 'none'})")
    return errors


def ios() -> list[str]:
    errors = []
    workflow = (ROOT / ".github/workflows/native-ios.yml").read_text()
    pr = set(re.findall(r"-only-testing:WingtipUITests/(\w+)", workflow))
    skipped = set(re.findall(r"-skip-testing:WingtipUITests/(\w+)", workflow))
    # The night's run drops -only-testing (`only=()` when FULL), so it runs
    # every class the scheme's test targets hold.
    full_runs_all = re.search(r'(if \[ "\$FULL" = true \]; then\s+|\[ "\$FULL" = true \] && )only=\(\)', workflow) is not None
    project = (ROOT / "apps/ios/project.yml").read_text()
    in_scheme = re.search(r"targets: \[[^\]]*WingtipUITests", project) is not None
    for path in sorted((ROOT / "apps/ios/WingtipUITests").glob("*.swift")):
        for cls in re.findall(r"^(?:final )?class (\w+)\s*:\s*XCTestCase", path.read_text(), re.M):
            nightly = full_runs_all and in_scheme and cls not in skipped
            if cls not in pr and not nightly:
                errors.append(f"apps/ios/WingtipUITests/{path.name}: {cls} runs in no tier (native-ios.yml)")
    for cls in sorted(pr):
        if not (ROOT / f"apps/ios/WingtipUITests/{cls}.swift").exists():
            errors.append(f".github/workflows/native-ios.yml: -only-testing names {cls}, which no file holds")
    # A pull request's run (unit_only) adds no UI test class.
    if not re.search(r'\[ "\$UNIT_ONLY" = true \] \|\| only\+=\(-only-testing:WingtipUITests/', workflow):
        errors.append(
            ".github/workflows/native-ios.yml: unit_only must leave out every UI test (`[ \"$UNIT_ONLY\" = true ] || only+=(...)`)"
        )
    # And builds none: -only-testing still compiles every test target the
    # scheme holds, so unit_only takes a scheme without WingtipUITests.
    unit = re.search(r"^  WingtipUnit:\n((?:    .*\n)+)", project, re.M)
    if not re.search(r"only=\(-only-testing:WingtipTests\) scheme=WingtipUnit\n.*\|\| only\+=\(.*\) scheme=Wingtip\n", workflow):
        errors.append(".github/workflows/native-ios.yml: unit_only must build the WingtipUnit scheme")
    elif not unit or "WingtipUITests" in unit.group(1):
        errors.append("apps/ios/project.yml: the WingtipUnit scheme must hold no WingtipUITests")
    return errors


def needs(job: workflows.Job) -> set[str]:
    return set(re.findall(r"[\w-]+", job.keys.get("needs", "")))


def budget_names(job: workflows.Job) -> list[str]:
    """The job's names in the Actions UI: a called workflow's jobs as
    `<name> / <job>`, those a call runs (not its own runs' alone)."""
    name = job.keys.get("name", job.id)
    called = job.keys.get("uses", "")
    if not called.startswith("./.github/workflows/"):
        return [name]
    inner = workflows.read(ROOT / called[2:]).jobs
    return [f"{name} / {j.id}" for j in inner if "github.workflow ==" not in j.keys.get("if", "")]


def budgets(tier1: list[workflows.Job]) -> list[str]:
    errors = []
    for job in tier1:
        for name in budget_names(job):
            if "${{" in name:
                # A matrix's legs: every budget its name could be.
                pattern = ".+".join(re.escape(part) for part in re.split(r"\$\{\{.*?\}\}", name))
                rows = [row for row in ci_budget.BUDGETS if re.fullmatch(pattern, row[0])]
            else:
                rows = [row for row in ci_budget.BUDGETS if fnmatch.fnmatchcase(name, row[0])][:1]
            if not rows:
                errors.append(f"ci.yml: {job.id} ('{name}') has no budget in scripts/ci/ci_budget.py's BUDGETS")
            for pattern, minutes, _ in rows:
                if minutes > ci_budget.TIER1 and pattern not in ci_budget.TIER1_LONG:
                    errors.append(
                        f"scripts/ci/ci_budget.py: {pattern} is given {minutes} min on a pull request; the gate is "
                        f"{ci_budget.TIER1} (make it faster, or run it after merge)"
                    )
    if ci_budget.TOTAL["pull_request"] > ci_budget.TIER1:
        errors.append(f"scripts/ci/ci_budget.py: a pull request's TOTAL is above the {ci_budget.TIER1}-minute gate")
    return errors


def tiers() -> list[str]:
    """ci.yml in the three tiers' shape (the docstring's first rule)."""
    jobs = {j.id: j for j in workflows.read(workflows.WORKFLOWS / "ci.yml").jobs}
    if "passed" not in jobs:
        return ["ci.yml: no `passed` job (\"CI passed\", the one check a merge waits on)"]
    gate = needs(jobs["passed"])
    tier1 = {i for i, j in jobs.items() if i not in META and j.tier == 1}
    errors = [
        f"ci.yml: {i} runs on a pull request but \"CI passed\" does not wait for it: add it to passed's needs, "
        "or run it after merge (`if: github.event_name != 'pull_request'`)"
        for i in sorted(tier1 - gate)
    ]
    errors += [f"ci.yml: \"CI passed\" waits for {i}, which is not a tier-1 job" for i in sorted(gate - tier1)]
    errors += [
        f"ci.yml: {i} runs after merge (the owner, 2026-11-10): `if: github.event_name != 'pull_request'`"
        for i in sorted(AFTER_MERGE)
        if i not in jobs or jobs[i].tier != 2
    ]
    for i in sorted(tier1):
        for need in sorted(needs(jobs[i]) & set(jobs)):
            if jobs[need].tier != 1:
                errors.append(f"ci.yml: {i} is tier 1 and needs {need}, which a pull request does not run")
    for workflow, word in PHONES.items():
        callers = [jobs[i] for i in sorted(tier1) if jobs[i].keys.get("uses", "").endswith(workflow)]
        if not callers:
            errors.append(f"ci.yml: no tier-1 job calls {workflow}; a pull request that touches the app must build it (#499)")
        elif word and not any(word in "\n".join(j.body) for j in callers):
            errors.append(f"ci.yml: the job that calls {workflow} passes `{word}` (the UI smoke is after merge)")
    if not any("vite build" in r.text for i in tier1 for r in jobs[i].runs):
        errors.append("ci.yml: no tier-1 job builds the web app (`npx vite build`); a pull request must build it (#499)")
    return errors + budgets([jobs[i] for i in sorted(tier1)])


def duplicates() -> list[str]:
    seen: dict[tuple[str, str], list[str]] = defaultdict(list)
    for job in workflows.read(workflows.WORKFLOWS / "ci.yml").jobs:
        if job.tier != 1:
            continue
        for run in job.runs:
            for command in re.split(r"&&|;|\|\||\n", run.text):
                command = " ".join(command.split())
                if CHECKS.match(command) and "--help" not in command:
                    key = (run.working_directory or ".", command)
                    if job.id not in seen[key]:
                        seen[key].append(job.id)
    return [
        f".github/workflows/ci.yml: `{cmd}` (in {wd}) runs in {', '.join(jobs)}; a check runs in one pull-request job"
        for (wd, cmd), jobs in sorted(seen.items())
        if len(jobs) > 1
    ]


def main() -> int:
    errors = playwright() + ios() + duplicates() + tiers()
    for error in errors:
        print(f"::error title=Test tiers::{error}" if "GITHUB_ACTIONS" in os.environ else error)
    if not errors:
        print("test tiers: every spec and UI test class in one tier, one @smoke a journey, no check twice, CI in its three tiers")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
