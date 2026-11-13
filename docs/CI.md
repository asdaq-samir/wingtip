# CI

What runs, when, and how to move it onto the owner's Mac mini.

## Rules

The owner, 2026-11-10: "how can we make it permanent rule to keep CI
efficient, using cache, non-redundant testing and latest versions and
warnings as errors etc." These are those rules (decision
[0034](decisions/0034-ci-stays-lean.md)); a guard enforces each one a
script can check, and the rest are for whoever writes a test or a job.

1. **A pull request is green or red in about 3 minutes** (tier 1, below;
   the owner, 2026-11-10: "3-minute gate: browser smoke, images and
   iPhone UI smoke run after merge"). The budget is the run from its
   first job's start to its last job's end, and never less than its
   longest job's: a pull request that touches a phone app waits for that
   app's build too. Each job's budget, in minutes (`BUDGETS` in
   `scripts/ci/ci_budget.py`): `changes`, `api-compat`,
   `dependency-review` 1; `engine-wheel`, `infra`, `test-jobs`,
   `test-ingest`, `test-weather` 2; `test-xplane` 1;
   `guards`, `test-web`, `test-engine`, `test-gateway`, `test-planner`,
   `test-wingtip`, `test-sim` 3; Android 5, iOS 6. After merge: the image builds 4,
   each `e2e` shard 8, main's push 14 in all. The `budget` job writes
   every run's table to its summary, and a job over its budget, a job
   with none, or a run over its total is a warning on the run.
   *Guards:* `ci_budget.py` (warns, never fails); `test_tiers.py` fails
   a tier-1 job given more than 3 minutes, the phones' builds aside.
2. **Every check in exactly one tier**: the pull request (tier 1, which
   main's push runs again, every test rather than the affected ones),
   after merge on main (tier 2), or the night (tier 3). "CI passed" waits
   for every tier-1 job and no other; the browser suite and the image
   builds are tier 2 and stay there; no tier-1 job needs a later one. A
   browser journey (a spec file, or a top-level `describe` in one) has one
   `@smoke` test; every spec has a `@smoke` or `@flight-critical` test or
   is listed in `scripts/ci/test_tiers_nightly.txt`; every iOS UI test
   class is in main's push's `-only-testing` or the night's full run, and
   a pull request's iOS run has none; and no check command runs in two
   pull-request jobs. *Guard:* `test_tiers.py`.
3. **Only what a change touches.** Each job runs behind `changes`' path
   filter (`scripts/areas.yml`), and a skipped job counts as passed.
   Within a job, a pull request runs the tests its change reaches: Vitest's
   `--changed` against the main it lands on, the engine's touched crates
   and those that use them (`scripts/ci/engine_affected.py`), each Python
   suite's own leg. A pull request of words only (docs, Markdown, skills,
   notebooks) runs `changes` and `guards`' seconds-long checks, nothing
   else; a web change never builds the phones (only the fixtures and
   generated code they read do). Yet every app whose inputs a pull
   request changes is built in tier 1 (#499): the web app's `vite build`,
   Android's compile and iOS's build. *Guards:* `scripts/areas.py check`
   keeps the filter the table's; `test_tiers.py` the apps' builds.
4. **Cache everything; main and the night save, pull requests read.**
   Each cache step has an id and, on a miss, says so
   (`::notice title=Cache miss::<name>`); `budget` lists the misses, and
   on main, whose saves every pull request reads, a miss is a warning (a
   key that rotates weekly is expected to miss once a week). *Guard:*
   `ci_budget.py`.
5. **Newest versions, warnings fatal.** docs/versions.md's rules: every
   toolchain and library on its newest stable release, majors too; a
   held one is listed there with why. Renovate (`renovate.json`) keeps
   one issue, its Dependency Dashboard, "Newer versions (Renovate
   dashboard)", listing whatever is behind, the pinned Actions' newest
   commits too. It runs in dashboard-only mode: no pull request opens and
   nothing merges until the owner ticks an update in that issue (one at a
   time), and the repository's GitHub writes stay the one issue's edits
   (decision 0024: no bot pull requests; CLAUDE.md, "Write to GitHub
   gently"). Warnings are errors in tsc (strict), ESLint (`--max-warnings
   0`), Swift, Clang, Kotlin, Android lint, Rust, clippy, javac, pytest
   and ruff. *Guard:* `warnings_fatal.py`.
6. **Batch pushes.** Every push to a pull request runs CI again and
   cancels the run before it: commit as you go, push when the change is
   whole.
7. **Never raise a timeout to get green.** A job that runs long is made
   faster (a cache, a smaller set, a split) or moved to the night; its
   budget moves only with the reason in the commit.
8. **No flaky tests.** A pull request retries a browser test once at
   most (`playwright.config.ts`); a test that passes only on its retry is
   moved to the night within a day, and the nightly flake hunt keeps it in
   the one issue "Flaky tests (nightly)" until it is fixed. *Guards:*
   `test_tiers.py` (retries); `flaky_tests.py` (the issue).
9. **No live internet in pull-request tests.** Tests read recorded
   copies, not NOAA, AWC, FAA or adsb.lol; the night's `sources` job asks
   each live source once whether it still answers
   (`scripts/ci/sources_answer.py`). Not yet true of the browser suite:
   its stack's planner and weather service fetch live (below, "Live
   sources"). *Guard:* `sources` at night.
10. **A red night comes first, and a red main.** A scheduled run of CI,
    Native iOS or Native Android that fails writes its section of one
    issue, "Nightly CI failed"; main's push that fails after a merge (tier
    2) writes its section of another, "Main CI failed (after merge)". Each
    is labelled `ready`, written at once (`nightly-issue.yml`,
    `scripts/ci/nightly_issue.py`, one write a run), holds no merge, and
    is fixed before new feature work.
11. **CI runs what the Mac runs.** A step calls `scripts/dev/check.sh`,
    `scripts/ci/*` or `scripts/build/*`; no logic lives only in YAML
    (`scripts/ci/guards.sh` runs on the Mac as in the guards job). A
    `run:` over 15 lines is a script waiting to be written: the ones
    there were when the rule came in are listed in
    `scripts/ci/workflow_rules_allow.txt`, which only shrinks. *Guard:*
    `workflow_rules.py`.
    The stock linters do the rest of the looking: actionlint 1.7.12
    (syntax, expressions, and the shell of every `run:` through
    shellcheck) and zizmor 1.32.0 (script injection, credentials left in
    a checkout, permissions, triggers), run by `workflow_rules.py` at the
    versions in `.tool-versions` (settings in `.github/actionlint.yaml`
    and `.github/zizmor.yml`, each exception with its reason); shellcheck
    0.11.0 over every script in `scripts/` and the pre-push hook
    (`scripts/ci/shellcheck.sh`, `.shellcheckrc`); lychee 0.24.2 over the
    Markdown's links and heading anchors, offline (`scripts/ci/check_links.sh`,
    `lychee.toml`). All are installed by mise through
    `scripts/build/tool.sh`, the Mac and CI alike, so a finding is the same
    in both. Where a step's text must be shell and not a template, an
    untrusted or even a static `${{ }}` goes through `env:`.
12. **Every failure names what failed.** A job puts the failing test and
    its first error on the run as an `::error` annotation and uploads its
    log on failure; no `|| true` hides a check (the few read afterwards
    are listed, each with why). *Guard:* `workflow_rules.py`
    (`|| true`).
13. **A rule is tested once, at the lowest level that can hold it.** An
    aviation rule is tested in the engine against the shared fixtures
    (`apps/web/src/lib/fixtures`), which every app's tests read rather
    than keeping their own copy of a rule's expectations; a screen has
    unit tests; browser and UI tests prove journeys only. Written policy.
14. **Least privilege.** Every workflow has a top-level `permissions:`,
    read-only but for the few that write (listed with why); every action
    outside the repository is pinned to a commit; no
    `pull_request_target`; a fork's pull request gets no secrets, and
    the self-hosted runners serve no fork (the runner variables stay unset
    while the repository is public, "Where it runs"). *Guard:*
    `workflow_rules.py`.
15. **macOS minutes are scarce.** The iOS tests (and TestFlight on main)
    are the only macOS jobs; anything that can run on Linux does.
    *Guard:* `workflow_rules.py`.
16. **Small configuration.** The workflows' lines in all stay within the
    budget in `workflow_rules_allow.txt`, set at the total on
    2026-11-10 and lowered with the tiers. *Guard:* `workflow_rules.py`.

The guards run in the `guards` job, seconds on every change; run them on
the Mac with `python3 scripts/ci/<name>.py`, or all of them with
`scripts/ci/guards.sh` (`WEB=false ENGINE=false FLIGHT=false` for the
seconds-long ones).

### Live sources

The browser suite's stack (`infra/docker-compose.ci.yml`) turns the
FAA's downloads off but still reaches, while a test runs: the weather
service's AWC cache files, NOMADS' GFS winds (the fetch that once timed
out), SPC, IEM's radar and nowCOAST; the TFRs (tfr.faa.gov); USGS
elevations (seeded from `apps/web/e2e/fixtures/elevation_cache.csv` for
the corridor only); adsb.lol traffic. The unit suites have no network
guard either. Recording these (a fixture mode in the weather service and
the planner's fetchers, and a socket guard in `pytest_guards.py`) is the
follow-up that makes rule 9 true.

## The tiers

The owner, 2026-11-10: "3-minute gate: browser smoke, images and iPhone
UI smoke run after merge." Before, "CI passed" waited for the browser
suite's shards' neighbours, every unit suite in full and the iPhone's UI
smoke: about 8 to 14 minutes a pull request (15.4 in run 42876898472, of
which 7 waited on a rerun of Android). Now a pull request waits for tier 1
alone, and the slower proofs run on main's push once it has merged, where
a failure is one issue, not a held merge. `scripts/ci/test_tiers.py` holds
`ci.yml` to this shape.

**Tier 1, the pull request's gate** (what "CI passed" waits for; main's
push runs it again, every test rather than the affected ones). Each job
only where the change touched what it reads (`changes`; a skipped job
counts as passing). Expected times are each job's own, from its start;
they are what the budgets allow, to be lowered once runs show them:

| Job | What | Expected |
|---|---|---|
| `changes` | The path filter, and whether a pull request is words only | under 30 s |
| `engine-wheel` | The engine's Python wheel, once a run, for every job that imports it (cached: seconds; an engine change compiles only what it changed, from main's last build) | 20 s warm, 1-2 min on an engine change |
| `guards` | Every quick check on one runner, all started at once (`scripts/ci/guards.sh`): the paths filter, the rules boundary, the legal pages, the tiers, warnings fatal, the workflows' rules, the links; file sizes, toolchain versions, the brand tokens, unused Python, the simplicity rules (Semgrep, jscpd, the ratchet); ruff and the Python's layout; where the change touched them, the website, the web app's tsc, ESLint, Prettier, knip and layers, SwiftLint and detekt, the web's engine rules, and the engine's layering, WebAssembly size, cargo-machete, rustfmt and clippy; and flight-critical | 1-3 min (its slowest check: ESLint on a web change, clippy on an engine change) |
| `test-web` | The generated files are the committed ones; Vitest over the tests the change reaches (`--changed`); `vite build` and the first-load budget | 1.5-2.5 min |
| `test-engine` | `cargo test` over the touched crates, those that use them and the contract test (`scripts/ci/engine_affected.py`); the committed WebAssembly, where its inputs changed | 1-3 min |
| `test-python` | One leg per suite the change touches: `test-planner`, `test-wingtip`, `test-jobs`, `test-ingest`, `test-weather`, `test-xplane` (`scripts/ci/python_suite.sh`), and `test-sim`, the replay agent's dotnet build, format check and tests (`scripts/ci/sim_suite.sh`) | 1-3 min each |
| `test-gateway` | The Java's layout and `mvn test`, when the gateway changed | 2-3 min |
| `api-compat`, `dependency-review`, `infra` | An API document's breaking changes; a manifest's or lock's new advisories; the production files | under 1 min |
| `android` | `native-android.yml`: the engine (cached), compiled, `testDebugUnitTest lintDebug` with Gradle's caches | 4-5 min |
| `ios` | `native-ios.yml` with `unit_only`: XcodeGen, the build and the unit tests (`WingtipTests`) on the newest iPhone simulator, DerivedData restored from main | 4-6 min |

A pull request is about 3 minutes in all: `changes`, then the wheel from
its cache, then `guards` beside the tests. One that changes the engine
takes about 4 (the wheel and the crates compile what changed); one that
touches a phone app waits for that app's build. A pull request of docs,
Markdown, skills or notebooks runs `changes` and the seconds-long guards:
under a minute.

**Tier 2, after merge** (main's push; nothing waits for it):

| What | Expected |
|---|---|
| `e2e-images`: the browser suite's images and page, each built once per key | 1-3 min |
| `e2e` (2 shards): the `@smoke` and `@flight-critical` browser tests on the phone project, against the whole stack | 5-8 min |
| `build-images`: every service image whose inputs changed, pushed as `:sha-<commit>` for Promote | 1-4 min |
| Native iOS's own run: the unit tests and the `CardSmokeTests` UI smoke on the iPhone, then TestFlight | 6-8 min |
| Native Android's own run: the build, unit tests, lint and a debug APK | 4-6 min |
| CodeQL: GitHub's default setup (the repository's settings, weekly and on main), not a workflow here | |

About 10 minutes after a merge, in all. A red run writes its section of
one issue, "Main CI failed (after merge)", labelled `ready`
(`nightly-issue.yml`, one write; rule 10), for the next agent to fix.
Promote publishes only a commit whose whole run on main passed.

**Tier 3, every night** (CI at 09:17 UTC, Native iOS at 09:37, Native
Android at 09:47), or by hand (Run workflow), unchanged:

| What | Expected |
|---|---|
| CI: every unit suite in full, every browser test on the phone, desktop, the iPhones and the iPad, the whole iOS audit (WebKit), WCAG 2.2 and Lighthouse, over ten shards; the API reference, Javadoc and wingtip's pdoc; the flake hunt | ~15 min |
| Native iOS, `full`: the whole suite (launch, flow and accessibility tests, the store shots, `CardRuleTests`, `CardScrollTests`) on the iPhone, the iPad and iPhone Duo, and each device's first screen | ~60 min |
| Native Android: the build, a debug APK, then the instrumented tests on an API 35 emulator | ~15 min |

## What gates a merge

main's ruleset requires one check, **CI passed** (the `passed` job in
`ci.yml`), and `auto-merge-agents.yml` merges a pull request on it. It
fails if any job it waits on failed or was cancelled; a skipped one
counts as passing. It waits on every tier-1 job above and nothing after
merge: the browser suite and the image builds report on main's push, and
a failure there is fixed forward (the owner, 2026-11-07, then 2026-11-10).

The phone builds are among the jobs it waits on. They used to be
workflows beside CI, which the ruleset could not require (a
path-filtered workflow stays pending on every pull request it skips), so
#499 merged with the Android app not compiling (fixed in #501). Now
`native-android.yml` and `native-ios.yml` are reusable workflows as well
as their own, and `ci.yml` calls them as the `android` and `ios` jobs
when `changes` finds the pull request touches what the app builds from
(scripts/areas.yml); the iPhone's UI smoke is the one part left to
main's push. `test_tiers.py` fails a `ci.yml` in which a pull request
would no longer build the web app, Android or iOS:

- **Android:** `apps/android/**`, `.editorconfig`, `engine/**`,
  `apps/web/src/lib/fixtures/**`, `scripts/build/api-models-apps.*`,
  `scripts/build/engine-contract-apps.*`, `design/**`,
  `native-android.yml`.
- **iOS:** `apps/ios/**`, `engine/**`, `apps/web/src/lib/fixtures/**`,
  `apps/web/src/lib/acs.json`,
  `services/planner/tests_wingtip/fixtures/native/**`,
  `scripts/build/api-models-apps.*`, `scripts/build/engine-contract-apps.*`,
  `design/**`, `scripts/ci/content-mtimes.py`, `native-ios.yml`.
- **Both:** a change to `ci.yml` itself, or anything in its `global`
  filter, as for every other job.

They are called on pull requests (claude/integration's included) and on
CI started by hand; main's pushes and the nights run them in their own
workflows, so they are not built twice there.

### Caches

- **iOS:** the engine's framework, keyed by the engine's files; and
  DerivedData, keyed by `.tool-versions` and `project.yml` and written
  only by main's push and the night (a pull request's would crowd the
  repository's 10 GB). xcodebuild compares file times, which a checkout
  sets anew, so the job stamps each input from its content first
  (`scripts/ci/content-mtimes.py`) and tells XCBuild to ignore the new
  inodes (`IgnoreFileSystemDeviceInodeChanges`). Measured on the Mac mini
  (Xcode 27.2, `build-for-testing`, 2026-11-10), each restore a tar round
  trip as actions/cache makes it: from nothing, 563 Swift compiles in 44 s;
  a cached DerivedData after a fresh checkout without the stamping, all 563
  again (67 s, slower than none); with it, nothing to do (1 s), and a
  one-file change 3 compiles (9 s). On run 42867578624 the hosted runner
  spent about nine minutes building and running the unit tests before the
  first UI test, which is what the cache cuts.
- **Android:** the engine's libraries, keyed by the engine's files, and
  Gradle's home and build cache through `gradle/actions/setup-gradle`
  (`cache-provider: basic`, the Actions cache; written from main only).
  Its configuration cache is not on: setup-gradle saves it only with a
  `GRADLE_ENCRYPTION_KEY` secret, and it would save seconds of
  configuration, not the minutes of dependencies and compilation.
- **e2e:** the images are built once per content key and pulled from
  GHCR (`.github/e2e-keys.sh`), the layer cache is the registry's
  (`:buildcache`, from main), and the planner's data, the corridor's
  charts and the suite's packages are Actions caches. A key no earlier
  commit built costs `e2e-images` 1-3 minutes, which the shards overlap
  with their own setup.

The iOS job runs on `MAC_RUNNER` (the Mac mini, free) or else GitHub's
`xcode-27` runner, the one hosted image with the Xcode `.tool-versions`
names (27.2; `macos-26` has no 27 release, so `scripts/ci/select-xcode.sh`
finds none there, run 42763113825; actions/runner-images'
`images/macos/xcode-27-arm64-Readme.md` lists what it has). It is a
preview image (actions/runner-images#14404), so it may queue longer. It is
free while the repository is public, ten times a Linux
minute's price on a private one, about 6 to 13 macOS minutes for each
pull request that touches the iPhone app, the engine or the shared
fixtures.

The Python suites keep the FAA's reference files (`data/raw`) between
runs, a week at a time, rather than fetching them each run: the planner's
suite was 131 s with them fetched (#452) and 159 s in one run (#474),
against 11 s warm. The planner's cache holds the charts and their tiles
(`charts.nosync`, `chart_tiles.nosync`) too, since its first plans of
C81 -> KDLH read the corridor's sectional tiles: 185 s of a 215 s run
with the charts left out. The other jobs keep the charts in a cache of
their own, so this one is separate (`tests-raw-planner-v2-`).

The browser suite's planner builds no cycle pack (`CYCLE_PACK=0` in
`infra/docker-compose.ci.yml`, 400 MB a run), so no overlay tiles of its
own, and the map's airspace, airports, navaids and fixes are drawn from
the tiles alone. The e2e job copies the suite's own archive
(`apps/web/e2e/fixtures/overlay-tiles`, 2.2 MB, the box 91.5 W to 87.2 W,
41.4 N to 43.4 N: Chicago, C81 and the fields west of them) into
`data/raw/packs/tiles` before the planner starts. It is built from a
local stack's cycle pack by `scripts/build/e2e-overlay-tiles.sh`, again
whenever `wingtip.vector_tiles.VERSION` changes (services/jobs/charts/tests/test_overlays.py checks
it). Specs about the chart's fields use the real ones in that box; a
mocked `/api/airports/in-view` only gives them their weather.

A pull request merges once "CI passed" is green; Claude's review no
longer gates it and runs only when the "review" label is put on the pull
request (the owner, 2026-11-06), so agents run the checks that cover their
change, and the aviation-check skill, before pushing.

Promote tags the images after main's push is green, tier 2 included. A
nightly failure is said in its run and does not hold Promote.

Each push to main also brings the open, non-draft `claude/` pull requests
that are behind it up to date (`update-branches.yml`): GitHub's "update
branch", a merge of main, one at a time ten seconds apart, at most ten a
run, leaving alone any pushed to in the last five minutes. It updates with
`MERGE_TOKEN`, since a push made with the workflow's own `GITHUB_TOKEN`
starts no workflow and the pull request would sit with no checks; the
owner's token's merge commit starts CI like the owner's push. One that
main does not merge into cleanly gets the label `needs-merge`, taken off
once its branch is current again: merge main into it by hand.

A browser test tagged `@flight-critical` runs on main's push too, with
the smoke set: the journey a pilot cannot be without in the air (plan, nav
log, emergency, offline), and the same with the connection gone before
anything is asked (the page loaded again offline where a worker holds it;
the nav log, Emergency, Nearest and Direct To each answer or say "No
connection"), kept to those two. Its engine and planner twins run in
every pull request's `guards`.

A test belongs in the smoke set (`{ tag: "@smoke" }` on the `test(...)`)
when it is the one that proves a journey works end to end -- planning a
route, the nav log, the map, the brief, sign-in -- and is fast. It runs
after merge, on main's push; everything else runs at night. A change a
pilot sees still writes or updates its spec; no pull request runs it, but
a wave's validation does (`scripts/dev/validate-wave.sh`, its `e2e` step)
before the wave's pull requests open.

Run the smoke set locally against the running stack:

```sh
npx playwright test --project=mobile --grep @smoke
```

(34 passed in 52 s on the Mac mini, 2026-11-06.)

On the Mac, a run like that goes through `scripts/dev/one-at-a-time.sh
"<label>" <command>`, which gives out two turns at once (three swapped the
24 GB Mac, 2026-11-08) and waits while macOS says memory is short; the
quick checks before a push are `scripts/dev/check.sh <area>`.

## The jobs

`.github/workflows/ci.yml`, on a pull request, a push to main, every
night and by hand (Run workflow). `changes` decides which of the rest a
change needs; a job it skips counts as passing.

| Job | What it runs |
|---|---|
| `changes` | The path filter: which suites, images and phone builds a change touches, and whether it is docs only. Tier 1 |
| `guards` | Every quick check, all at once on one runner (`scripts/ci/guards.sh`): the paths filter is `scripts/areas.yml`'s; no aviation rule outside the engine (below); the legal pages; CI's own rules (`test_tiers.py`, `warnings_fatal.py`, `workflow_rules.py` with actionlint and zizmor, "Rules" above); every Markdown link (lychee); shellcheck over the scripts; no source file new or grown past 400 lines, nor new past 300 (below, "The layers"), one version of each toolchain, no raw style value outside the tokens, no unused Python, the simplicity rules (below); a phone's SwiftLint or detekt where the change touched it; ruff over every Python suite and the Python's layout; where the change touched them, the website, the web app's types, tsc, ESLint, Prettier and knip, and the engine's layering, WebAssembly size, cargo-machete, rustfmt and clippy; the web's engine rules (`scripts/build/web_rules.py --check`). And **flight-critical**, on every change but words alone: what must never break in the air. The engine against worked examples from the FAA's own texts (`apps/web/src/lib/fixtures/flightCritical.json`: the nav log's wind triangle, groundspeed, heading and fuel from FAA-H-8083-25C ch. 16; 14 CFR 91.159 and 91.179 cruising altitudes; 91.151 and 91.167 reserves; 91.155 minimums; AIM 5-3-8 hold entries; glide at a ratio), and the planner's KMSN to KOSH nav log and nearest fields (`tests/test_flight_critical.py`). The browser's journey is tagged `@flight-critical` and runs in `e2e`; the phones' twins run in their native jobs. Tier 1 |
| `test-engine` | The engine's `cargo test`: on a pull request the crates it touched, those that use them and the contract test (`scripts/ci/engine_affected.py`), elsewhere every crate; that the committed WebAssembly matches the engine, where its inputs changed. Tier 1 |
| `test-web` | `npm run types`, the generated files (the phones' API models and engine calls, the tokens, the screens, the icons) are the committed ones, Vitest (`--changed` on a pull request), `vite build` and the first-load budget. Tier 1 |
| `test-gateway` | The Java's layout and `mvn test`: the gateway's JUnit suite, with a real Postgres in Testcontainers. Tier 1 |
| `test-python` | One matrix leg per Python suite a change touches (`test-planner`, `test-wingtip`, `test-jobs`, `test-ingest`, `test-weather`, `test-xplane`, the X-Plane driver's): pytest over the suite on its own requirements (`scripts/ci/python_suite.sh`); the planner's, ingest's, jobs' and weather's legs also run `lint-imports`, and the planner's checks its MCP connector's generated calls (`scripts/build/planner_calls.py --check`). `changes` lists the legs (its `python` output, from each suite's filter in `scripts/areas.yml`); none skips the job, which counts as passing. Tier 1 |
| `engine-wheel` | wingtip's Rust extension (`engine/bindings/py`), built once a run by `.github/actions/engine-wheel` (`mode: build`) and uploaded as the `engine-wheel` artifact, which `guards`, `test-python`, `docs` and the flake hunt install (`mode: install`). The wheel's cache is keyed on everything under `engine/` and the toolchains, so a run that leaves the engine alone restores it in seconds; an engine change builds from main's last Cargo build. Main and the night save both. It was built in six jobs before (2026-11-10). Tier 1 |
| `android`, `ios` | The phone builds (`native-android.yml`, `native-ios.yml` with `unit_only`), when a pull request touches them (above). Tier 1 |
| `e2e`, `e2e-images` | The browser suite (Playwright, `apps/web/e2e`) against the stack built from the commit (`infra/docker-compose.ci.yml`): the `@smoke` and `@flight-critical` sets over two shards on main's push, everything over ten at night. Tier 2 |
| `build-images` | Every service image whose inputs changed; each Python image imports its own code as its last step, so a missing dependency fails the build. Tier 2 |
| `api-compat` | No breaking change to an OpenAPI document (below). Tier 1 |
| `infra` | cfn-lint, shellcheck, `docker compose config` and `caddy validate` over the production files. Tier 1 |
| `dependency-review` | New dependencies' advisories, on a public repository's pull requests that change a manifest or lock (`deps` in `scripts/areas.yml`). Tier 1 |
| `docs` | The gateway's Javadoc, the API reference and wingtip's pdoc, at night |
| `standards` | Lighthouse and the speed lab against their thresholds, at night |
| `flake-hunt-python`, `flake-hunt-web`, `flake-report` | The nightly flake hunt (below) |
| `passed` | "CI passed", the one check a merge waits on |
| `sources` | At night: the live sources the stack reads still answer (`scripts/ci/sources_answer.py`) |
| `budget` | Last, never failing: this run's minutes against the budget and its cache misses, in the run's summary (`scripts/ci/ci_budget.py`) |

Images go to GHCR from main; `promote.yml` copies the ones that passed to
ECR and deploys them ([README-AWS.md](README-AWS.md#deploys)).

### The test suites

| Suite | Proves |
|---|---|
| `engine/` (`cargo test`) | Every engine rule against the shared fixtures in `apps/web/src/lib/fixtures`, and the contract |
| `services/planner/tests_wingtip/` | wingtip's data work: geo, features, the model registry, the remote-URI guards, parsing with the network mocked |
| `services/planner/tests/` | The planner's HTTP contract: status codes and shapes, a failing source reaching the caller as a clean 502, the committed `openapi.json` matching the app, the chart model's scores and reload |
| `services/{ingest,weather}/tests/` | Each service's readers and stores |
| `services/gateway/src/test/` | The HTTP contract (`@WebMvcTest`: 400, 405, 409), the pilot-scoping guards, the committed `openapi.json`, and Flyway's migrations against a real Postgres with `ddl-auto: validate` |
| `apps/web` (Vitest) | The pages' decisions as pure functions: filters, ordering, the nav log's rows |
| `apps/web/e2e` (Playwright) | Pages in a real browser at phone and desktop sizes, against the whole stack |

Left to the developer by design: what needs the live network or a trained
model (`collect`, a retrain); mocking those would test the mock, not the
upstream data that actually breaks.

On the Mac, `scripts/dev/check.sh <area>` runs the quick ones for a part
of the repository in Docker ([LOCAL-DEV.md](LOCAL-DEV.md#the-developer-scripts)).

## Rules boundary

Every aviation rule or figure is the engine's (CLAUDE.md, issue #482).
The `guards` job, on every run and one of the jobs "CI passed" waits on,
runs `scripts/ci/rules_boundary.py`: in the web app, the
phones (and their widgets and watch), every service (the gateway, the
planner's app and wingtip, weather, ingest, jobs) and
`tools/` it finds a constant set to a number, or to a list of numbers,
with a regulatory source cited beside it or in the comment above
(14 CFR, a part 61/91/71/73/95/97 section, the AIM, an AC, the ACS, an
FAA Order), and an engine rule's name defined again. What is there and is
not a rule -- the owner's FL-045 formatting, a display span -- is listed
in `scripts/ci/rules_boundary_allow.txt` as a count per file with why. A
file past its count fails: move the rule into the engine and ask it by
name, or list the file with its reason. `--list` prints every hit.

## The layers

The architecture holds itself (the owner, 2026-11-09: "follow modular
architecture"), each layer by a check that fails the run:

- **The web app:** dependency-cruiser (`apps/web/.dependency-cruiser.cjs`,
  `npm run layers`, in `guards`' "Web: layers"): `lib/` and `hooks/`
  import neither `components/` nor `features/`; a component or another
  feature reaches a feature only through its `index.ts`
  ([apps/web/README.md](../apps/web/README.md#project-layout)).
- **The Python services:** `lint-imports` (each service's `.importlinter`,
  in `test-python`'s planner, ingest, jobs and weather legs): `wingtip` never
  imports `app`, no router imports another, only `app.main` imports the
  routers; the crash pipeline is the jobs' alone (the planner and ingest
  import none of it but today's listed exceptions, an `ignore_imports`
  line that no longer matches failing); and no job imports another.
- **The gateway:** ArchUnit (`ArchitectureTest`, in `test-gateway`): no
  aviation maths (`Math`'s trigonometry), and the planner reached through
  `PlannerClient` only; today's breaks are frozen in
  `src/test/resources/archunit_store` and may only leave it.
- **The engine:** `scripts/ci/engine_layers.py` (in `guards`): each crate's
  wingtip-* dependencies are exactly engine/README.md's crate table's.
- **The web's engine:** its WebAssembly is built with only the rules the
  web asks. `scripts/build/web_rules.py` lists them from the web's
  `callEngine` calls into `engine/facade/web-rules.txt` (the build's list)
  and `apps/web/src/lib/engine/webRules.ts` (the names `callEngine` takes);
  `guards` ("Web engine rules") runs it with `--check`, so a list that
  differs from the code fails, and `test` rebuilds the module and fails
  where it differs from the committed one. `scripts/ci/wasm_size.py` (in
  `guards`, "Engine: WebAssembly size") fails the module over its budget,
  raw and gzipped, about 10% above its size.
- **Every language:** `guards` ("File sizes") runs
  `scripts/ci/file_sizes.py`: no tracked TypeScript, Python, Rust, Swift,
  Kotlin, Java, shell, build JavaScript, C# or Gradle file over 400 lines,
  and no file new against the base branch over 300 (the owner's target),
  generated files aside, past `scripts/ci/file_sizes_allow.txt` (the files
  over 400 when the budget came in, at the lines they had) and
  `scripts/ci/file_sizes_new_allow.txt` (the wave's new files of 301-400
  lines on 2026-11-12). A listed file may not grow, and neither list may
  gain or raise an entry against the base branch's; a split lowers its
  count (`--write`).

## Simplicity rules

The simplicity audits' findings, held as checks so they cannot come back
(the owner, 2026-11-12: "make simplicity rules as hard rules"; CLAUDE.md,
"Simplicity rules"). Each looks only at the files a change touches, each
holds today's exceptions in a baseline that only shrinks (`--write` lowers
it, never raises it; a baseline raised against the base branch fails), and
each runs in `guards`, the pre-push hook and, for one file at a time, the
agents' edit-time hook (`scripts/dev/simplicity_hook.py`, a Claude Code
`PostToolUse` hook in `.claude/settings.json`):

| Check | Tool | Baseline |
|---|---|---|
| One home per constant or helper: unit factors, Mercator, hex-to-RGB, hand HTTP to the planner, HTML markers, great-circle maths (`scripts/ci/semgrep_check.py`, rules in `scripts/ci/semgrep/`) | Semgrep, the free CLI, metrics off | `scripts/ci/semgrep/baseline.json` |
| No new copy-paste over 100 tokens (`scripts/ci/jscpd_check.py`) | jscpd | `scripts/ci/jscpd_baseline.json` |
| Stock components on the web: no raw `<button>`, `<details>` or `role="alert"` outside `components/ui` | ESLint's `no-restricted-syntax` | `apps/web/eslint-suppressions.json` |
| The web's feature layers | dependency-cruiser | none |
| The phones' dead code; no HTTP library outside Android's `api/` (`scripts/ci/phone_lint.sh`, on a phone change) | SwiftLint, detekt | `scripts/ci/phones/` |
| The simplicity ratchet: the audit's counts (`scripts/ci/simplicity_ratchet.py`; `--report` adds the median files a change touches, not gated) | the standard library | `scripts/ci/simplicity_baseline.json` |

## API compatibility

The iPhone app in the App Store keeps calling the servers for months
after each release, from every phone that has not updated. So a pull
request that changes `services/planner/openapi.json` or
`services/gateway/openapi.json` runs `api-compat` ("API compatibility"):
[oasdiff](https://github.com/oasdiff/oasdiff)'s `breaking` check, its
Docker image pinned by digest, compares each document with main's and
fails on an ERR-level break -- an endpoint, a response field or an enum
value removed or renamed, a request parameter or field made required, a
type narrowed. Adding a field or an endpoint passes. It takes seconds,
runs only when a document changed, and is one of the jobs "CI passed"
waits on.

Prefer the additive change: a new field or endpoint beside the old one,
and the old one removed only once no released app calls it. When a
break is meant, the pull request adds a line for each change to
`.github/api-breaks.txt` (oasdiff's `--err-ignore` file): the date, the
method and path, and oasdiff's words for the change as the failure
printed them -- with backticks round the names, as oasdiff writes them in
its ignore matching (single quotes do not match) -- for example

```
2026-11-06 GET /api/briefing removed the required property `hazards` from the response with the `200` status -- no released app reads it
```

The lines stay after the merge, as the record of what was broken when.
To see the breaks before pushing:

```sh
git show origin/main:services/planner/openapi.json > /tmp/base.json
docker run --rm -v /tmp:/base -v "$PWD:/head" tufin/oasdiff:v1.34.1 \
  breaking /base/base.json /head/services/planner/openapi.json --format singleline
```

## Where it runs

Most jobs' machine comes from a repository variable, so moving them is a
setting, not a change to the workflows:

- `LINUX_RUNNER`: the Linux jobs (default `ubuntu-26.04`, GitHub's)
- `MAC_RUNNER`: Native iOS (default GitHub's `xcode-27`)

Some jobs always run on GitHub's `ubuntu-26.04`, whatever the variable
says, because the Mac mini is Apple silicon and they need x86: `e2e`,
`e2e-images` and `build-images` (the images go to AWS's t3 machines, and
e2e tests those same images), Native Android (the SDK's Linux tools and
emulator are x86 only), and Promote (it builds and pushes for AWS).

A private repository pays for GitHub's runners by the minute (3,000 a
month on Pro, macOS at ten times the rate), and `dependency-review` skips
itself there, since it needs Advanced Security. The rest run on the Mac
mini for free:

- **Linux jobs (`mini-linux`):** a Lima VM, `wingtip-ci`, running Ubuntu
  with its own Docker and the runners. Its setup (`~/.config/wingtip-ci/wingtip-ci.yaml`,
  copied into Lima's instance and re-run at every boot) gives it what the
  jobs take from GitHub's image: Docker CE with Compose and Buildx, gh,
  jq, shellcheck, Temurin 25 and Maven, rustup's tools on the PATH,
  Docker Hub through mirror.gcr.io, and amd64 through Rosetta for
  `scripts/build/build-engine-wasm.sh`. A job-started hook gives each runner
  back a clean Python before every job, as a fresh GitHub machine would;
  the jobs write to `$RUNNER_TEMP`, not `/tmp`, since three runners share
  the VM, and `hub-mirror` leaves its Docker alone when the mirror is
  already set. It must be a VM, not a container:
  the jobs use `sudo`, `localhost` and `--network host` as on GitHub's
  machines, and their ports would otherwise meet the live stack's.
- **iOS (`mini`):** a runner on the Mac itself, which has Xcode, rustup
  and xcodegen (in `~/.local/bin`; no Homebrew, no sudo).
- Then **Settings → Secrets and variables → Actions → Variables:** set
  `LINUX_RUNNER` to `mini-linux` and `MAC_RUNNER` to `mini`.

Unset the variables to go back to GitHub's runners. Only once the
repository is private: on a public one any fork's pull request could run
its code on the Mac. Since 2026-11-07 the repository is public again, the
variables are unset and every job runs on GitHub's runners; the VM is
kept for when it goes private.

## Flaky tests

A flaky test passes and fails on the same code. Each one costs a rerun and
an hour of someone deciding whether it was their change, so the suites are
set up to make them show early and in the test that causes them
(2026-11-06, after a debounce timer in `useAirportSearch.test.tsx` fired
after its test, and test doubles in `services/planner/tests_wingtip/test_traffic.py` leaked into
the tests after them, #494).

**Random order, every run.** pytest runs with pytest-randomly
(both of `services/planner`'s `requirements-dev*.txt`) and vitest with
`sequence.shuffle` (`apps/web/vite.config.ts`), so a test that passes only after
another one fails here, not one day in CI. The order comes from a seed
printed at the top of the run: `pytest --randomly-seed=N` and
`npx vitest run --sequence.seed=N` repeat it, and `pytest -p no:randomly` runs
in file order. A test that cannot yet run in any order is marked
`@pytest.mark.order_dependent` (it runs after the rest, in file order;
`services/planner/conftest.py`) or `describe(name, { shuffle: false }, ...)`, and listed to
be fixed.

**Guards for the usual causes.**
- Python (`services/planner/pyproject.toml`, the one rootdir of both
  suites, and its `conftest.py`, which imports `pytest_guards.py`): no cache of the last run (`-p no:cacheprovider`), unknown
  marks are errors (`--strict-markers`), and a test that leaves one of
  wingtip's or an app's functions replaced -- a test double put on a module
  by assignment rather than `monkeypatch.setattr` -- fails at its own
  teardown, naming it.
- Web (`apps/web/src/test/guards.ts`, before every test file): what Testing
  Library rendered is unmounted after each test (vitest's globals are off,
  so it was not), the real timers a jsdom file leaves still to fire are
  cleared as it ends (one firing after its jsdom is gone was an unhandled
  error), a test that leaves fake timers on fails, and an unhandled error
  or rejection fails the run (`dangerouslyIgnoreUnhandledErrors: false`).
- ESLint (`apps/web/eslint.config.js`): `@vitest/eslint-plugin`'s recommended
  rules and no `.only` in the unit tests, eslint-plugin-testing-library's
  for the `*.test.tsx` files (async queries awaited, no side effects in
  `waitFor`), and no
  `.only` in the browser specs; Playwright's `forbidOnly` in CI as well.

**Browser tests retry once, in CI only** (`apps/web/playwright.config.ts`). A
test that passes on its retry is flaky: the run passes, the `github`
reporter marks it on the commit's checks, and it goes to the nightly issue
below. A real regression fails both goes.

**The nightly flake hunt** (`ci.yml`: `flake-hunt-python`,
`flake-hunt-web`, `flake-report`). Every night the root and planner Python
suites and the web unit suite run five times each in random order; a test
that failed at least once and passed at least once is flaky. With the
browser tests that passed only on their retry (that night's run and the
last day's pull requests), the list goes into one standing issue, "Flaky
tests (nightly)", kept 14 days after a test was last seen
(`scripts/ci/flaky_tests.py`). The script makes one GitHub write a night at
most -- the issue created, or its body edited, never a comment -- and none
when the list has not changed.

To fix one: take the seed from the run that failed, repeat the order, and
look at what the test before it left behind (a module global, a mock, fake
timers, a component still mounted, a file). Fix the test, not the code,
unless the code is wrong.
