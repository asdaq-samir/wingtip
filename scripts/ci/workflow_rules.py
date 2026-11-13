"""The workflows stay small, scripted, honest and least-privileged
(docs/CI.md, "Rules"; decision 0034). Each rule below fails the run with
the file and line, and how to put it right:

- **Logic lives in scripts.** A step's `run:` of more than LONG_RUN lines
  (comments and blank lines aside) belongs in scripts/ci or scripts/build,
  where it can be run on the Mac as CI runs it. The blocks longer than that
  today are listed in scripts/ci/workflow_rules_allow.txt with their
  length; one may shrink, none may grow, and no new one may join.
- **No hidden failure.** `|| true` on a line that runs a check (a test
  suite, a linter, a build) hides its failure. The few that are read
  afterwards (the flake hunt's five runs, xcodebuild's log grepped for its
  verdict) are listed in the allow file, each with why.
- **Least privilege.** Every workflow has a top-level `permissions:`,
  read-only but for the workflows the allow file names with why; every
  `uses:` outside this repository is pinned to a full commit; no
  `pull_request_target` (it runs a fork's pull request with this
  repository's secrets).
- **Mac minutes are scarce.** A job on macOS (`macos-*`, `xcode-*` or the
  MAC_RUNNER variable) is one of MAC_JOBS: the iOS tests, and TestFlight
  on main. Everything else runs on Linux.
- **The stock linters.** actionlint 1.7.12 and zizmor 1.32.0 (.tool-versions;
  their settings in .github/actionlint.yaml and .github/zizmor.yml) run over
  the workflows beside these rules, which are only what they cannot say.
- **Small configuration.** The workflows' lines in all stay within the
  allow file's `budget`, set at the total when this guard came in; a new
  workflow or step makes room by moving logic into a script.

The standard library only; seconds. Run in ci.yml's guards job (scripts/ci/guards.sh).

  python3 scripts/ci/workflow_rules.py
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

import workflows

ALLOW = workflows.ROOT / "scripts/ci/workflow_rules_allow.txt"
LONG_RUN = 15
MAC_JOBS = {("native-ios.yml", "test"), ("native-ios.yml", "testflight")}
MAC = re.compile(r"macos|xcode-|MAC_RUNNER", re.I)
PINNED = re.compile(r"^[\w.-]+/[\w./-]+@[0-9a-f]{40}$")
# A command that is a check, as the command before `|| true` starts.
CHECK = re.compile(
    r"^(?:timeout \d+ )?(?:npx |\./)?(pytest|vitest|tsc|eslint|ruff|cargo (?:test|clippy|build)|mvn|gradlew|xcodebuild"
    r"|playwright test|knip|lint-imports|test\b|\S+ --check)"
)


def hides_check(line: str) -> bool:
    """A check's own failure swallowed: the command just before `|| true`."""
    for before in re.split(r"\|\|\s*true\b", line)[:-1]:
        command = re.split(r"&&|;|\(|\$\(", before)[-1].strip()
        if CHECK.match(command):
            return True
    return False


def allowances() -> tuple[dict[tuple[str, str, str], int], list[tuple[str, str]], set[str], int]:
    """The allow file: `long | file | job | step | lines`, `or-true | file | text`,
    `write | file`, `budget | lines`; `#` starts a comment."""
    long_runs: dict[tuple[str, str, str], int] = {}
    or_true: list[tuple[str, str]] = []
    writers: set[str] = set()
    budget = 0
    for raw in ALLOW.read_text().splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        parts = [p.strip() for p in raw.split(" | ")]
        if parts[0] == "long":
            long_runs[(parts[1], parts[2], parts[3])] = int(parts[4])
        elif parts[0] == "or-true":
            or_true.append((parts[1], parts[2]))
        elif parts[0] == "write":
            writers.add(parts[1])
        elif parts[0] == "budget":
            budget = int(parts[1])
    return long_runs, or_true, writers, budget


def top_permissions(lines: list[str]) -> list[str] | None:
    for i, line in enumerate(lines):
        if line.startswith("permissions:"):
            rest = line.split(":", 1)[1].strip()
            if rest:
                return [rest]
            scopes = []
            for later in lines[i + 1 :]:
                if later.strip().startswith("#"):
                    continue
                if not later.startswith("  "):
                    break
                scopes.append(later.strip())
            return scopes
    return None


def budget_sees_all() -> list[str]:
    """ci.yml's budget job waits on every other job, or misses its minutes."""
    jobs = workflows.read(workflows.WORKFLOWS / "ci.yml").jobs
    budget = next((j for j in jobs if j.id == "budget"), None)
    if budget is None:
        return ["ci.yml: no `budget` job (scripts/ci/ci_budget.py)"]
    needs = set(re.findall(r"[\w-]+", budget.keys.get("needs", "")))
    missing = sorted({j.id for j in jobs} - needs - {"budget"})
    return [f"ci.yml: the budget job's needs leave out {', '.join(missing)}"] if missing else []


def stock_linters() -> list[str]:
    """actionlint (syntax, expressions, the runs' shell through shellcheck) and
    zizmor (injection, credentials, permissions, triggers), each at .tool-versions'
    version through scripts/build/tool.sh; settings in .github/actionlint.yaml and
    .github/zizmor.yml. Offline for zizmor: its online audits need a token. On a
    Mac without them it is a note, in CI a failure."""
    tool = str(workflows.ROOT / "scripts/build/tool.sh")

    def run(*args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run([tool, *args], cwd=workflows.ROOT, capture_output=True, text=True)

    shellcheck = run("--path", "shellcheck")
    problems = []
    for name, args in (
        ("actionlint", ["-shellcheck", shellcheck.stdout.strip()] if shellcheck.returncode == 0 else []),
        ("zizmor", ["--offline", "--no-progress", "--format", "plain", ".github/workflows"]),
    ):
        done = run(name, *args)
        if done.returncode == 3 and "GITHUB_ACTIONS" not in os.environ:
            print(f"workflow rules: no {name} here, so not run (CI runs it)")
        elif done.returncode:
            problems.append(f"{name} found problems:\n{(done.stdout + done.stderr).strip()}")
    return problems


def main() -> int:
    long_runs, or_true, writers, budget = allowances()
    errors: list[str] = []
    seen_long: set[tuple[str, str, str]] = set()
    total = 0
    for wf in workflows.all_workflows():
        total += len(wf.lines)
        scopes = top_permissions(wf.lines)
        if scopes is None:
            errors.append(f"{wf.name}: no top-level `permissions:`; start from `contents: read`")
        elif any(re.search(r"\bwrite\b|write-all", s) for s in scopes) and wf.name not in writers:
            errors.append(
                f"{wf.name}: top-level permissions write; grant write on the job that needs it, or list the file in the allow file"
            )
        for n, line in enumerate(wf.lines, 1):
            if re.match(r"^\s*pull_request_target\s*:", line):
                errors.append(f"{wf.name}:{n}: pull_request_target runs a fork's code with this repository's secrets")
            m = re.match(r"^\s*(?:- )?uses:\s*(\S+)", line)
            if m and not m.group(1).startswith("./") and not PINNED.match(m.group(1)):
                errors.append(f"{wf.name}:{n}: {m.group(1)} is not pinned to a full commit (pin it, its release in a comment)")
        for job in wf.jobs:
            if MAC.search(job.keys.get("runs-on", "")) and (wf.name, job.id) not in MAC_JOBS:
                errors.append(f"{wf.name}: job {job.id} runs on macOS; only the iOS test runs there, the rest on Linux")
            for run in job.runs:
                body = [line for line in run.lines if line and not line.startswith("#")]
                key = (wf.name, job.id, run.name or body[0][:60] if body else "")
                if len(body) > LONG_RUN:
                    seen_long.add(key)
                    allowed = long_runs.get(key)
                    if allowed is None:
                        errors.append(f"{wf.name}:{run.line}: a {len(body)}-line run in {job.id}; move it into scripts/ci or scripts/build")
                    elif len(body) > allowed:
                        errors.append(
                            f"{wf.name}:{run.line}: {job.id}'s '{key[2]}' grew to {len(body)} lines (allowed {allowed}); shrink it"
                        )
                for line in body:
                    if hides_check(line):
                        if not any(f == wf.name and text in line for f, text in or_true):
                            errors.append(f"{wf.name}:{run.line}: `|| true` hides a check's failure: {line[:100]}")
    errors += budget_sees_all()
    errors += stock_linters()
    for key in sorted(set(long_runs) - seen_long):
        errors.append(f"{ALLOW.name}: {' | '.join(key)} is no longer a long run; drop its line")
    if total > budget:
        errors.append(f".github/workflows: {total} lines against a budget of {budget}; move logic into scripts")
    for error in errors:
        print(f"::error title=Workflow rules::{error}" if "GITHUB_ACTIONS" in os.environ else error)
    if not errors:
        print(f"workflow rules: {total} of {budget} lines, every action pinned, permissions least, no hidden failure")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
