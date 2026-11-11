"""Every check in one tier (docs/CI.md, "Rules"; decision 0034).

The policy, which this script holds the repository to:

- **Three tiers.** A check runs on a pull request (and main's push), or
  after merge on main, or at night; never in two of them for the same
  code, and never twice in one pull request's run.
- **One @smoke per journey.** A browser journey is a spec file in
  apps/web/e2e, or a top-level `test.describe` block within one. A pull
  request runs the `@smoke` and `@flight-critical` tests only (ci.yml's
  e2e), so each journey holds at most one `@smoke` test.
- **Every spec chooses its tier.** A spec file holds a `@smoke` or
  `@flight-critical` test, or is named in scripts/ci/test_tiers_nightly.txt
  (nightly only, the whole suite). A new spec with neither fails here, so
  no test lands without someone deciding when it runs.
- **At most one retry on a pull request** (playwright.config.ts's
  `retries`): a test that needs more is flaky, and goes to the nightly
  issue (scripts/ci/flaky_tests.py) to be fixed, not retried.
- **Every iOS UI test class in a tier.** native-ios.yml names the pull
  request's classes with `-only-testing:WingtipUITests/<Class>`; the
  night (`full`) runs every class the scheme holds, less any
  `-skip-testing:`. A class in neither fails here.
- **No check twice in a pull request.** The same check command (tsc,
  ESLint, ruff, pytest, cargo test, ...) run from the same directory in
  two of ci.yml's pull-request jobs fails here.

The standard library only; seconds. Run in ci.yml's rules-boundary job.

  python3 scripts/ci/test_tiers.py
"""

from __future__ import annotations

import os
import re
import sys
from collections import defaultdict

import workflows

ROOT = workflows.ROOT
E2E = ROOT / "apps/web/e2e"
NIGHTLY_LIST = ROOT / "scripts/ci/test_tiers_nightly.txt"
PR_TAGS = ("@smoke", "@flight-critical")
MAX_RETRIES = 1

# The commands that are checks, as the first word or two of a command; the
# rest of a run line (installs, builds, echo) may repeat freely.
CHECKS = re.compile(
    r"^(?:npx |npm run )?(tsc|eslint|knip|vitest|prettier|format:check|ruff check|ruff format|pytest|lint-imports"
    r"|cargo (?:test|clippy|fmt|machete)|mvn(?: -B)?(?: -q)? (?:test|verify|spotless:check)"
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
    full_runs_all = re.search(r'if \[ "\$FULL" = true \]; then\s+only=\(\)', workflow) is not None
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
    return errors


def duplicates() -> list[str]:
    seen: dict[tuple[str, str], list[str]] = defaultdict(list)
    for job in workflows.read(workflows.WORKFLOWS / "ci.yml").jobs:
        if job.nightly_only:
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
    errors = playwright() + ios() + duplicates()
    for error in errors:
        print(f"::error title=Test tiers::{error}" if "GITHUB_ACTIONS" in os.environ else error)
    if not errors:
        print("test tiers: every spec and UI test class in one tier, one @smoke a journey, no check twice")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
