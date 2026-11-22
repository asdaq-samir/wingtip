"""A failed run's failures, each with its first error and the narrow command
that reproduces it on the Mac (the owner, 2026-11-15; decision 0042 and
CLAUDE.md, "Branches": a failure is reproduced with its narrow test before
its fix is pushed). In the wave of 12-15 November a red run was read by
opening each red job's log: one API break was pushed against CI ten times
and one Vitest assertion several, nothing saying which test to run first.

ci.yml's `budget` job runs it, after every job and on a run `halt`
cancelled too; a run with no failed job gets nothing. It reads the run's
jobs and the failed ones' annotations through the GitHub API with the
run's own token (actions: read, checks: read), as ci_budget.py does, and
writes a block for each failed job to the step summary: its first
`failure` annotation that is not the runner's own "Process completed with
exit code N" (the step that failed, where a job left none), then the
command TABLE gives for the job and the file, test or guard its
annotations name. Each job's commands are a ::notice too, since `gh run
view` and the API show a check's annotations and not its summary. A
report: it never fails its job, and what it cannot read is one ::warning.

  python3 scripts/ci/failure_summary.py           in CI (GITHUB_* from the runner)
  GH_TOKEN=$(gh auth token) python3 scripts/ci/failure_summary.py --repo asdaq-samir/wingtip --run 43777395271
"""

from __future__ import annotations

import argparse
import fnmatch
import os
import re
import sys
from typing import NamedTuple

from ci_budget import api, bare

# The jobs about the run itself, which fail or stop because another did.
META = {"CI passed", "CI budget", "Stop on red"}
# The runner's own words for a step that failed or was stopped: no error.
GENERIC = re.compile(r"Process completed with exit code \d+|The operation was cancell?ed")
UNKNOWN = "No narrow command known: add a row to scripts/ci/failure_summary.py."
INTRO = (
    "Each failure's first error, and the narrow command for it on the Mac (from the root; scripts/dev/check.sh builds a missing image). "
    "Before the next push, scripts/dev/preflight.sh runs what tier 1 will run for the change."
)


# One job's command, or one failure's within it: the first row whose `job` and `when` match a failure gives its command.
class Row(NamedTuple):
    job: str  # the job's name in the Actions UI (fnmatch), with and without a leg
    when: str  # a regex the annotation's title or the failed step's name holds; "" is the job's own row
    command: str  # run from the repository's root, {} where the target goes
    target: str = ""  # a regex whose group is the target, in an annotation's path or title
    hint: str = ""  # what stands for the target where nothing names one
    area: str = ""  # scripts/dev/check.sh's area, the whole of it, where nothing narrower is named
    note: str = ""
    sep: str = " "  # between several targets in one command; a newline, a command each
    shape: str = "{0}"  # the target from the regex's groups, where it has more than one


# How scripts/dev/check.sh runs an area on the Mac, which has no node, pytest or Maven: in its Docker images. The web's is
# tagged by the Node version and the lock, hashed (check-images.sh's web_image); a Python one is found by name, its newest tag kept.
def web(inner: str, types: str = "npm run -s types && ") -> str:
    """inner in apps/web, in check.sh's node image with the web's packages."""
    return (
        'docker run --rm -v "$PWD:/repo" --tmpfs /repo/apps/web/node_modules -w /repo/apps/web "wingtip-check-web:$({ echo '
        '"node $(scripts/build/toolchain.sh get nodejs)"; cat apps/web/package.json apps/web/package-lock.json; } | shasum -a 256 '
        f"| cut -c1-16)\" sh -c 'ln -s /node_modules/* /node_modules/.bin node_modules/ && {types}{inner}'"
    )


def py(where: str, image: str, inner: str) -> str:
    """inner in that folder, in check.sh's Python image for a requirements file (check-images.sh's py_image)."""
    return (
        f'docker run --rm -v "$PWD:/repo" -v wingtip-check-raw:/repo/data/raw -w /repo/{where} '
        f'"$(docker image ls -q wingtip-check-py-{image} | head -1)" {inner}'
    )


def suite(leg: str, where: str, image: str, area: str, tests: str = "tests") -> Row:
    """A leg of test-python (scripts/ci/python_suite.sh): pytest over the file an annotation names."""
    command = py(where, image, "pytest {} -q -p no:cacheprovider")
    return Row(f"test-{leg}", "", command, rf"{where}/(\S+\.py)", f"<{tests}/test_name.py>", area, PY_NOTE)


def guard(name: str, command: str, note: str = "") -> Row:
    """A check scripts/ci/guards.sh starts by that name: its failure is titled `Guard failed: <name>`."""
    return Row("Guards*", f"^Guard failed: {re.escape(name)}$", command, note=note)


PY_NOTE = "The image is the newest check.sh built: `scripts/dev/check.sh <area>` once, after a change to its requirements or engine/."
CARGO = "cargo test --profile ci --manifest-path engine/Cargo.toml"
BUILD = web("../../scripts/ci/web_suite.sh build")
BUILD_NOTE = "It writes apps/web/dist, which the live tree serves: run it in a worktree."
GENERATED_NOTE = "All four generators; with `$(git merge-base origin/main HEAD)` after it, only those the branch touched."
# The folders guards.sh's ruff_check names, from services/: the root's .ruff.toml is every file's.
RUFF = "planner/{app,tests,wingtip,tests_wingtip} ingest/{ingest,tests} weather/{app,tests} jobs/{charts,crash} ../tools/xplane-driver"
# check.sh's `java`: Testcontainers reaches Docker through the socket.
MVN = (
    'docker run --rm -v "$PWD:/repo" -v /repo/services/gateway/target -v fp-m2:/root/.m2 '
    "-v /var/run/docker.sock:/var/run/docker.sock -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal -w /repo/services/gateway "
    '"maven:$(scripts/build/toolchain.sh get maven)-eclipse-temurin-$(scripts/build/toolchain.sh get java)" mvn -B -q test -Dtest={}'
)
# docs/CI.md, "API compatibility", with CI's --fail-on and its list of meant breaks.
OASDIFF = (
    'git show origin/main:{} > /tmp/base.json && docker run --rm -v /tmp:/base -v "$PWD:/head" tufin/oasdiff:v1.39.0 '
    "breaking /base/base.json /head/{} --fail-on ERR --format singleline --err-ignore /head/.github/api-breaks.txt"
)
# check.sh's `ios`, on the scheme a pull request tests (WingtipUnit builds no UI test).
XCODE = (
    "scripts/dev/xcodebuild.sh -quiet -project apps/ios/Wingtip.xcodeproj -scheme WingtipUnit -configuration Debug "
    '-destination "platform=iOS Simulator,id=$(xcrun simctl list devices available -j | python3 scripts/dev/newest_simulator.py iPhone)" '
    "CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= test -only-testing:WingtipTests/{}"
)
XCODE_NOTE = "First engine/bindings/ffi/build-xcframework.sh and xcodegen, as scripts/dev/check.sh ios runs them."
GRADLE = "(cd apps/android && ./gradlew --quiet testDebugUnitTest --tests '{}')"
GRADLE_NOTE = "With JAVA_HOME, ANDROID_HOME and the engine as scripts/dev/check.sh android sets them; lint is `./gradlew lintDebug`."
CFN = 'docker run --rm -v "$PWD/infra/cloudformation:/d" -w /d python:3-slim sh -c "pip install -q cfn-lint && cfn-lint template.yaml"'
WEB_LEG = "The web leg's checks start from it: `PART=web scripts/ci/guards.sh` is the leg, where the host has npm."
LEGS = "Its leg, where no guard is named: `PART=web|engine scripts/ci/guards.sh`. Not `repo` whole: its log ends `failed: <names>`."
# On the Mac guards.sh skips a check whose tool is missing: these five fetch theirs with uv, uvx, pipx or npx.
HOST = "Its tool comes by uv, uvx, pipx or npx on the host: a Mac without them is told so, and only CI can tell."
PLAYWRIGHT = "npx playwright test {} --reporter=list"
HOST_NODE = "It runs apps/web/scripts/reached-specs.mjs: on a Mac without node, scripts/dev/preflight.sh runs it in the web's image."
IMAGE_NOTE = "The target the failed step names, in a turn of one-at-a-time.sh; the job's log has the Dockerfile step that failed."
# A red browser test's title, `[mobile] › e2e/x.spec.ts:24:1 › ...`: its project and its line.
RED_TEST = r"\[([\w-]+)\] › (e2e/\S+?\.spec\.ts:\d+)"
E2E_NOTE = "In Playwright's image against the running stack, in a turn of one-at-a-time.sh: the checks skill (section 4) has the line."

# Every job a run can fail in, by its name: a new job is one row. Of a job's several, the first that matches a failure is its row.
TABLE = [
    # One job until 2026-11-15, three legs since (scripts/ci/web_suite.sh).
    Row("test-web*", "First load over budget", BUILD, note=BUILD_NOTE),
    Row("test-web (build)", "", BUILD, note=BUILD_NOTE),
    Row("test-web (generated)", "", "scripts/ci/web_generated.sh", note=GENERATED_NOTE),
    Row("test-web*", "", web("npx vitest run {}"), r"apps/web/(\S+\.test\.tsx?)$", "<src/.../name.test.ts>", "web"),
    suite("planner", "services/planner", "requirements-dev", "planner"),
    # Flight-critical alone, where the planner's suite did not run (plan.py).
    suite("flight", "services/planner", "requirements-dev", "planner"),
    suite("wingtip", "services/planner", "requirements-dev-wingtip", "py", "tests_wingtip"),
    suite("jobs", "services/jobs", "jobs-requirements-dev-jobs", "jobs", "charts/tests"),
    suite("ingest", "services/ingest", "ingest-requirements-dev", "ingest"),
    suite("weather", "services/weather", "weather-requirements-dev", "weather"),
    # The X-Plane driver's tests run in wingtip's image (check.sh's `xplane`).
    suite("xplane", "tools/xplane-driver", "requirements-dev-wingtip", "xplane"),
    Row("test-engine", "wasm|WebAssembly", "scripts/build/build-engine-wasm.sh && git diff --exit-code --stat apps/web/src/lib/engine"),
    Row("test-engine", "--test contract", f"{CARGO} -p wingtip-engine --test contract"),
    Row("test-engine", "", f"{CARGO} -p {{}}", hint="<crate>", area="engine"),
    Row("test-gateway", "The Java's layout", "scripts/dev/format.sh --check java"),
    # The job titles each failing test `Class.method`; Surefire takes classes with commas.
    Row("test-gateway", "", MVN, r"^(\w+)[.$]\w", "<Class>", "java", sep=","),
    Row("test-sim", "", "scripts/ci/sim_suite.sh"),
    Row("Engine wheel", "", "", area="py", note="check.sh builds the engine's wheel first, for any Python area."),
    # What the run decided to do, and the images it builds: each a script or a bake target.
    Row("changes", "", "git diff --name-only origin/main HEAD | python3 scripts/areas.py filters", note="Then scripts/dev/preflight.sh."),
    Row("Browser specs reached", "", "python3 scripts/ci/browser_specs.py --list origin/main", note=HOST_NODE),
    Row("build (e2e)", "", "docker buildx bake -f .github/ci-images.hcl <gateway|planner|weather|playwright>", note=IMAGE_NOTE),
    Row("build (images)", "", "docker buildx bake -f .github/images.hcl <service>", note=IMAGE_NOTE),
    # oasdiff's annotations are at the document, as its container saw it.
    Row("API compatibility", "", OASDIFF, r"/head/(services/\w+/openapi\.json)", "<services/.../openapi.json>", sep="\n"),
    Row("infra", "cfn-lint", CFN),
    Row("infra", "", "", note="Run the failed step's own lines from ci.yml's infra job: each is one docker command."),
    Row("dependency-review", "", "", note="Nothing to run locally: the job's own summary names the package and its advisory."),
    Row("Native iOS / test*", "tring catalog", "scripts/build/ios-strings.sh --check", note="After a build; without --check it writes it."),
    Row("Native iOS / test*", "The Swift's layout", "scripts/dev/format.sh --check swift"),
    Row("Native iOS / test*", "", XCODE, hint="<Class>", area="ios", note=XCODE_NOTE),
    Row("Native Android / build", "The Kotlin's layout", "scripts/dev/format.sh --check kotlin"),
    Row("Native Android / build", "", GRADLE, hint="<package.Class>", area="android", note=GRADLE_NOTE),
    # Main's push and the night: the specs its failures' titles name.
    # Each red test by its project and line (`[mobile] › e2e/x.spec.ts:24:1 › ...`), so the command runs it alone; else its file.
    Row("e2e (*)", "", PLAYWRIGHT, RED_TEST, "<e2e/name.spec.ts>", note=E2E_NOTE, shape="--project={0} {1}"),
    Row("e2e (*)", "", PLAYWRIGHT, r"(e2e/\S+?\.spec\.ts)", "<e2e/name.spec.ts>", note=E2E_NOTE),
    # guards.sh's checks, in its order: the `repo` leg's, the `web` leg's, the `engine` leg's.
    guard("One home (Semgrep)", "python3 scripts/ci/semgrep_check.py --base origin/main", HOST),
    guard("Areas filter", "python3 scripts/areas.py check"),
    guard("Rules boundary", "python3 scripts/ci/rules_boundary.py"),
    guard("Legal pages", "scripts/build/legal_pages.py --check", HOST),
    guard("Test tiers", "python3 scripts/ci/test_tiers.py"),
    guard("Warnings fatal", "python3 scripts/ci/warnings_fatal.py"),
    guard("Workflow rules", "python3 scripts/ci/workflow_rules.py"),
    guard("Doc links", "scripts/ci/check_links.sh"),
    guard("Shell scripts", "scripts/ci/shellcheck.sh"),
    guard("Web engine rules", "python3 scripts/build/web_rules.py --check"),
    guard("Python lint", py("services", "requirements-dev", f"ruff check {RUFF}"), PY_NOTE),
    guard("Python layout", "scripts/dev/format.sh --check python", HOST),
    guard("File sizes", "python3 scripts/ci/file_sizes.py --base origin/main"),
    guard("Toolchain", "scripts/build/toolchain.sh --check"),
    guard("Brand", "python3 scripts/ci/brand_guard.py"),
    guard("Shared parts", "python3 scripts/ci/shared_parts_guard.py"),
    guard("Unused Python", "scripts/ci/dead_python.sh", HOST),
    guard("Copy-paste (jscpd)", "python3 scripts/ci/jscpd_check.py --base origin/main", HOST),
    guard("Simplicity ratchet", "python3 scripts/ci/simplicity_ratchet.py --base origin/main"),
    guard("iPhone: SwiftLint", "scripts/ci/phone_lint.sh ios --base origin/main"),
    guard("Android: detekt", "scripts/ci/phone_lint.sh android --base origin/main"),
    guard("Website", "python3 apps/site/build.py && python3 apps/site/check.py"),
    guard("Web: API types", web("npm run types", ""), WEB_LEG),
    guard("Web: tsc", web("npx tsc --noEmit")),
    guard("Web: ESLint", web("npx eslint . --max-warnings 0")),
    guard("Web: Prettier", "scripts/dev/format.sh --check web", "Without --check it writes the files to commit."),
    guard("Web: knip", web("npx knip --no-progress")),
    guard("Web: layers", web("npm run -s layers")),
    guard("Engine layers", "python3 scripts/ci/engine_layers.py"),
    guard("Engine: WebAssembly size", "python3 scripts/ci/wasm_size.py"),
    guard("Engine: machete", "cargo machete engine"),
    guard("Engine: rustfmt", "scripts/dev/format.sh --check rust"),
    guard("Engine: clippy", "cargo clippy --manifest-path engine/Cargo.toml --workspace --all-targets -- -D warnings"),
    guard("Flight-critical: engine", f"{CARGO} -p wingtip-engine --test flight_critical"),
    # A leg is run whole but for `repo`, whose shallow fetch of the base breaks every worktree of a clone they share.
    Row("Guards*", "", "", note=LEGS),
]


def reproduce(name: str, clues: list[tuple[str, str]]) -> tuple[list[str], list[str]]:
    """A failed job's commands and the words beside them, from its clues: each failure's (title, path), then the failed step's name."""
    rows = [row for row in TABLE if fnmatch.fnmatchcase(name, row.job)]
    found: dict[Row, list[str]] = {}
    for title, path in clues:
        for row in rows:
            named = (re.search(row.target, path) or re.search(row.target, title)) if row.target else None
            if named or (row.when and re.search(row.when, title)):
                targets = found.setdefault(row, [])
                target = row.shape.format(*named.groups()) if named else ""
                if named and target not in targets:
                    targets.append(target)
                break
    commands = []
    for row, targets in found.items():
        each = targets if row.sep == "\n" else [row.sep.join(targets)]
        commands += [row.command.replace("{}", target) for target in each]
    if found:
        return commands, [row.note for row in found if row.note]
    # Nothing names a failure the table knows: the job's own row, and the whole area where its command wants a target.
    own = next((row for row in rows if not row.when), Row(name, "", "", note=UNKNOWN))
    notes = [own.note] if own.note else []
    whole = [f"scripts/dev/check.sh {own.area}"] if own.area else []
    said = ["That is the whole area: nothing names a narrower target."] if own.area else []
    if "{}" in own.command:
        return whole, [*said, f"Once the log names the target: `{own.command.replace('{}', own.hint)}`", *notes]
    return ([own.command], notes) if own.command else (whole, said + notes)


def words(message: str, count: int = 6, width: int = 400) -> list[str]:
    """An error's first lines, without colour codes, blank lines or the `> script` lines npm prints before a script's own."""
    lines = [re.sub(r"\x1b\[[0-9;]*m", "", line).rstrip() for line in message.splitlines()]
    while lines and (not lines[0].strip() or lines[0].startswith("> ")):
        lines.pop(0)
    return [line[:width] for line in lines if line.strip()][:count]


def hard_reds(annotations: list[dict]) -> tuple[list[str], list[str]]:
    """The tests Playwright's run summary calls failed, and those it calls flaky (passed on the retry): `[project] › file:line`."""
    found: dict[str, list[str]] = {"failed": [], "flaky": []}
    for note in annotations:
        if "Playwright Run Summary" not in (note.get("title") or ""):
            continue
        section = ""
        for line in (note.get("message") or "").splitlines():
            count = re.match(r"\s*\d+ (failed|flaky|skipped|passed|did not run|interrupted)", line)
            if count:
                section = count.group(1)
            elif section in found and (test := re.search(r"\[[\w-]+\] › \S+?\.spec\.ts:\d+", line)):
                found[section].append(test.group(0))
    return found["failed"], found["flaky"]


def block(job: dict, annotations: list[dict], base: str) -> tuple[list[str], list[str]]:
    """One failed job's Markdown, and what to say of it on the check: its commands and the words beside them."""
    # The API lists a check's annotations newest first (four jobs of runs 43777395271 and 43726455655,
    # where one step's log lines fall down the list), so the first error is the last failure listed.
    failures = [a for a in reversed(annotations) if a["annotation_level"] == "failure" and not GENERIC.match(a.get("message") or "")]
    # A browser test that passed on its retry did not fail the job: the command is the hard reds', the flaky ones named apart.
    red, flaky = hard_reds(annotations)
    if red:
        failures = [a for a in failures if any(t in (a.get("title") or "") for t in red)] or failures
    step = next((s["name"] for s in job.get("steps") or [] if s.get("conclusion") == "failure"), "")
    lines = [f"#### {job['name']}", ""]
    if failures:
        first = failures[0]
        path, line = first.get("path") or "", first.get("start_line")
        # An annotation with no file is at `.github`, its line the log's.
        where = "" if path.startswith(".github") else path + (f":{line}" if line else "")
        title = first.get("title") or where
        more = f", the first of {len(failures)}" if len(failures) > 1 else ""
        lines += [f"First error{more}: {title}".rstrip() + (f" ({where})" if where and where != title else ""), ""]
        lines += ["```", *words(first.get("message") or ""), "```"]
    else:
        lines.append(f"No annotation says what failed. The step `{step or '?'}` failed; its log has the error: {job.get('html_url')}")
    commands, notes = reproduce(bare(job["name"]), [(a.get("title") or "", a.get("path") or "") for a in failures] + [(step, "")])
    # The branch the guards hold a change against is the pull request's base.
    commands = [command.replace("origin/main", f"origin/{base}") for command in commands]
    if commands:
        lines += ["", "To reproduce it:", "", "```sh", *commands, "```"]
    if flaky:
        notes = [*notes, "Passed on its retry, so not what failed (the flaky-tests issue lists it): " + ", ".join(flaky)]
    return [*lines, "", *[line for note in notes for line in (note, "")]], commands + notes


def report(repo: str, run_id: str, token: str) -> list[str]:
    """Writes the summary; returns the workflow commands to print in CI."""
    run = api(f"repos/{repo}/actions/runs/{run_id}", token)
    listed = api(f"repos/{repo}/actions/runs/{run_id}/jobs?per_page=100&filter=latest", token)["jobs"]
    jobs = [j for j in listed if bare(j["name"]) not in META]
    failed = [j for j in jobs if j.get("conclusion") == "failure"]
    cancelled = sum(j.get("conclusion") == "cancelled" for j in jobs)
    base = next((pr["base"]["ref"] for pr in run.get("pull_requests") or []), "main")
    also = f", {cancelled} cancelled and not listed" if cancelled else ""
    lines = [f"### CI run {run_id}: {len(failed) or 'no'} job{'' if len(failed) == 1 else 's'} failed{also}", ""]
    lines += [INTRO, ""] if failed else []
    notices = []
    for job in failed:
        found = api(job["check_run_url"].split("api.github.com/", 1)[1] + "/annotations?per_page=100", token)
        text, said = block(job, found, base)
        lines += text
        level = "warning" if said == [UNKNOWN] else "notice"
        said = "\n".join(said).replace("%", "%25").replace("\r", "").replace("\n", "%0A")
        notices.append(f"::{level} title=Reproduce {job['name'].replace(':', '%3A').replace(',', '%2C')}::{said}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary:
        print("\n".join(lines))
    elif failed:
        with open(summary, "a") as out:
            out.write("\n".join(lines) + "\n")
    # By hand the summary is on the screen, the commands in it.
    return notices if "GITHUB_ACTIONS" in os.environ else []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--run", default=os.environ.get("GITHUB_RUN_ID", ""))
    args = parser.parse_args()
    try:
        for notice in report(args.repo, args.run, os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN", "")):
            print(notice)
    except Exception as err:  # noqa: BLE001 -- a report, never a failure
        print(f"::warning title=Failure summary::could not read the run: {err!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
