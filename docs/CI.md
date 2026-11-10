# CI

What runs, when, and how to move it onto the owner's Mac mini.

## What runs

| When | What | About |
|---|---|---|
| A pull request, and main's push after a merge | The unit tests of whatever the change touched (web, Python, Rust, Java), the dependency review, and the browser suite's smoke tests: the ~33 tests tagged `@smoke`, one per journey a pilot takes, on the phone, in one job against the whole stack | 4-5 min |
| A pull request that changes only docs, Markdown, the skills or notebooks | The unit tests it touched; no browser suite | 1-2 min |
| Every night, or Run workflow on CI | Everything: every browser test on the phone, desktop, the iPhones and the iPad, the iOS audit, WCAG and Lighthouse, over ten shards; and the API reference docs built | ~15 min |
| A pull request that touches a phone app (below) | Inside CI's run, so "CI passed" waits for it: Native Android (the engine per ABI, unit tests, lint, a debug APK) and/or Native iOS (XcodeGen, `xcodebuild test` on the simulators) | 5-10 min |
| main's push that touches a phone app, a `claude/native-*` push | Native Android / Native iOS on their own (`native-android.yml`, `native-ios.yml`); TestFlight after iOS on main once its key is set | 5-10 min |
| Every night | Native Android again, then its instrumented tests on an emulator | ~15 min |

## What gates a merge

main's ruleset requires one check, **CI passed** (the `passed` job in
`ci.yml`), and `auto-merge-agents.yml` merges a pull request on it. It
waits for every job in CI's run and fails if any failed or was
cancelled; a job its paths did not need is skipped, which counts as
passing.

The phone builds are among those jobs. They used to be workflows of
their own beside CI, which the ruleset could not require (a
path-filtered workflow stays pending on every pull request it skips), so
#499 merged with the Android app not compiling (fixed in #501). Now
their build is a reusable workflow -- `native-android-build.yml`,
`native-ios-test.yml` -- that `ci.yml` calls as the `android` and `ios`
jobs when its `changes` job finds the pull request touches what the app
builds from:

- **Android:** `apps/android/**` (its generated API models included),
  `engine/**`, `apps/web/src/lib/fixtures/**`, `scripts/build/api-models-apps.*`,
  `native-android-build.yml`.
- **iOS:** `apps/ios/**` (its API models included), `engine/**`,
  `apps/web/src/lib/fixtures/**`, `apps/web/src/lib/acs.json`,
  `services/planner/tests_wingtip/fixtures/native/**`, `scripts/build/api-models-apps.*`,
  `native-ios-test.yml`.
- **Both:** a change to `ci.yml` itself, or anything in its `global`
  filter, as for every other job.

Any other pull request skips them and keeps its 4-5 minutes. They are
called on pull requests and on a run of CI started by hand; main's pushes
and the nights run them in `native-android.yml` and `native-ios.yml`
instead, so they are not built twice there. Each of those two keeps its
own concurrency group; a pull request's builds run in CI's.

The iOS job runs on `MAC_RUNNER` (the Mac mini, free) or else GitHub's
`xcode-27` runner, the one hosted image with the Xcode `.tool-versions`
names (27.2; `macos-26` has no 27 release, so `scripts/ci/select-xcode.sh`
finds none there, run 42763113825; actions/runner-images'
`images/macos/xcode-27-arm64-Readme.md` lists what it has). It is a
preview image (actions/runner-images#14404), so it may queue longer. It is
free while the repository is public, ten times a Linux
minute's price on a private one, about 5 to 10 macOS minutes for each
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

Promote tags the images after main's push is green. A nightly failure is
said in its run and does not hold Promote.

Each push to main also brings the open, non-draft `claude/` pull requests
that are behind it up to date (`update-branches.yml`): GitHub's "update
branch", a merge of main, one at a time ten seconds apart, at most ten a
run, leaving alone any pushed to in the last five minutes. It updates with
`MERGE_TOKEN`, since a push made with the workflow's own `GITHUB_TOKEN`
starts no workflow and the pull request would sit with no checks; the
owner's token's merge commit starts CI like the owner's push. One that
main does not merge into cleanly gets the label `needs-merge`, taken off
once its branch is current again: merge main into it by hand.

A test tagged `@flight-critical` runs on every pull request too: the
journey a pilot cannot be without in the air (plan, nav log, emergency,
offline), kept to one.

A test belongs in the smoke set (`{ tag: "@smoke" }` on the `test(...)`)
when it is the one that proves a journey works end to end -- planning a
route, the nav log, the map, the brief, sign-in -- and is fast. Everything
else runs at night.

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
| `changes` | The path filter: which suites, images and phone builds a change touches, and whether it is docs only |
| `test` | The engine's `cargo test`, that the committed WebAssembly matches the engine; ruff and pytest over `services/planner/wingtip` and the charts job; wingtip's pdoc |
| `test-web` | `npm run types`, `tsc`, ESLint and Vitest over `apps/web`, and that the phones' API models are the committed ones |
| `test-gateway` | `mvn test`: the gateway's JUnit suite, with a real Postgres in Testcontainers |
| `test-planner`, `test-ingest`, `test-assistant`, `test-weather` | ruff and pytest over each service's own suite |
| `e2e`, `e2e-images` | The browser suite (Playwright, `apps/web/e2e`) against the stack built from the commit (`infra/docker-compose.ci.yml`): the `@smoke` and `@flight-critical` sets on a pull request, everything at night |
| `build-images` | Every service image whose inputs changed; each Python image imports its own code as its last step, so a missing dependency fails the build |
| `android`, `ios` | The phone builds, when a pull request touches them (above) |
| `rules-boundary` | No aviation rule outside the engine (below) |
| `flight-critical` | **Flight-critical**, on every change whatever it touched: what must never break in the air. The engine against worked examples from the FAA's own texts (`apps/web/src/lib/fixtures/flightCritical.json`: the nav log's wind triangle, groundspeed, heading and fuel from FAA-H-8083-25C ch. 16; 14 CFR 91.159 and 91.179 cruising altitudes; 91.151 and 91.167 reserves; 91.155 minimums; AIM 5-3-8 hold entries; glide at a ratio), and the planner's KMSN to KOSH nav log and nearest fields (`tests/test_flight_critical.py`). The browser's journey is tagged `@flight-critical` and runs in `e2e`; the phones' twins run in their native jobs |
| `architecture` | No source file new or grown past 400 lines (below, "The layers") |
| `links` | Every relative link and `#anchor` in the Markdown resolves (`scripts/ci/check_links.py`) |
| `api-compat` | No breaking change to an OpenAPI document (below) |
| `infra` | cfn-lint, shellcheck, `docker compose config` and `caddy validate` over the production files |
| `dependency-review` | New dependencies' advisories, on a public repository's pull requests |
| `docs` | The gateway's Javadoc, at night |
| `standards` | Lighthouse and the speed lab against their thresholds, at night |
| `flake-hunt-python`, `flake-hunt-web`, `flake-report` | The nightly flake hunt (below) |
| `passed` | "CI passed", the one check a merge waits on |

Images go to GHCR from main; `promote.yml` copies the ones that passed to
ECR and deploys them ([README-AWS.md](README-AWS.md#deploys)).

### The test suites

| Suite | Proves |
|---|---|
| `engine/` (`cargo test`) | Every engine rule against the shared fixtures in `apps/web/src/lib/fixtures`, and the contract |
| `services/planner/tests_wingtip/` | wingtip's data work: geo, features, the model registry, the remote-URI guards, parsing with the network mocked |
| `services/planner/tests/` | The planner's HTTP contract: status codes and shapes, a failing source reaching the caller as a clean 502, the committed `openapi.json` matching the app, the chart model's scores and reload |
| `services/{ingest,assistant,weather}/tests/` | Each service's readers and stores; the assistant with the model and the planner stood in |
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
`rules-boundary` ("Rules boundary"), on every run and one of the jobs "CI
passed" waits on, runs `scripts/ci/rules_boundary.py`: in the web app, the
phones, the gateway and the planner's app it finds a constant set to a
number with a regulatory source cited beside it or in the comment above
(14 CFR, a part 61/91/71/73/95/97 section, the AIM, an AC, the ACS, an
FAA Order), and an engine rule's name defined again. What is there and is
not a rule -- the owner's FL-045 formatting, a display span -- is listed
in `scripts/ci/rules_boundary_allow.txt` as a count per file with why. A
file past its count fails: move the rule into the engine and ask it by
name, or list the file with its reason. `--list` prints every hit.

## The layers

The architecture holds itself (the owner, 2026-11-09: "follow modular
architecture"), each layer by a check that fails the run:

- **The web app:** ESLint's `boundaries/layers` (`apps/web/eslint/boundaries.js`,
  in `test-web`'s ESLint): `lib/` and `hooks/` import neither `components/`
  nor `features/`; a component or another feature reaches a feature only
  through its `index.ts` ([apps/web/README.md](../apps/web/README.md#project-layout)).
- **The planner:** `lint-imports` (`services/planner/.importlinter`, in
  `test` and `test-planner`): `wingtip` never imports `app`, no router
  imports another, and only `app.main` imports the routers.
- **The engine:** `scripts/ci/engine_layers.py` (in `test`): each crate's
  wingtip-* dependencies are exactly engine/README.md's crate table's.
- **Every language:** `architecture` ("File sizes") runs
  `scripts/ci/file_sizes.py`: no tracked TypeScript, Python, Rust, Swift,
  Kotlin or Java file over 400 lines, generated files aside, past
  `scripts/ci/file_sizes_allow.txt`, which lists the files over it when the
  budget came in at the lines they had. A listed file may not grow, and
  the list may not gain or raise an entry against the base branch's; a
  split lowers its count (`--write`).

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
