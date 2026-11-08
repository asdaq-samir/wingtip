# Wingtip Maps — for agents

A flight planner for pilots, VFR and IFR: the FAA chart on a map that works like
Maps on an iPhone, and the route, checkpoints and nav log for a flight.
It is headed for an iOS app. README.md has the services and the layout.

## Architecture

Functional core, imperative shell: one core every app shares, and a thin
shell per app round it (the owner, 2026-11-03). Four layers, each with
one job (the owner kept both server languages on this split, 2026-11-06):

- **The Rust engine** (`engine/facade`, wingtip-engine, a facade over
  ten domain crates in `engine/crates`, layered as engine/README.md
  says). Every aviation rule or figure lives there once: altitudes,
  winds, runways, fuel, weather limits, Go / No-Go, holds, procedures,
  the clearance reader, the debrief, a pilot's currency and a student's
  61.109 experience. No network, no screen, no clock of its own. Each rule is a name in `engine/facade/src/call.rs`,
  JSON in and out, typed in `engine/contract/engine.schema.json`.
- **The planner** (FastAPI, `services/planner`: `app` over `wingtip`) works
  out a flight: it fetches the FAA and weather data, runs the chart
  model and the assistant, and asks the engine every rule
  (`wingtip_native.call`).
- **Spring Boot** (`services/gateway`) is who the pilot is and what they
  saved: accounts, sign-in, records, the public API, scheduled mail. It
  holds no aviation logic: for a figure it asks the planner over HTTP
  (`PlannerClient`, as for currency, 14 CFR 61.56 and 61.57, and
  61.109's experience), which asks the engine. What is left in Java
  (the endorsements' validity and 61.93 checks, the inspections'
  calendar months) is in #482. Add no new rule there.
- **Each app is a shell that gets data, keeps state and draws**, and asks
  the engine the rest by name: the web through `callEngine`
  (apps/web/src/lib/engine, the engine built to WebAssembly), the iPhone
  through `wt_call`, Android through its JNI shim over `wt_call`. A rule
  found in a component, a hook, a Swift view, a Java service or a route
  handler is a bug: move it into the engine and delete the copy. What
  has not moved yet, and in what order, is issue #482.
- **Screens are view and view model** (MVVM): the view draws, one hook (web)
  or observable model (iOS, Android) per screen holds its state and makes
  its calls. How a figure is written on the screen stays with each app.
- **Data comes in at the edges**: the planner's endpoints and the cycle
  packs feed the engine; the engine never fetches.
- Adding or changing a rule: the Rust in the lowest crate that can hold
  it, its name in `call.rs`, its entry in the contract
  (`engine.schema.json`), `npm run types` in apps/web (and
  `scripts/build/engine-contract-apps.sh` when a phone decodes it), its test
  against the shared fixtures (apps/web/src/lib/fixtures),
  `scripts/build/build-engine-wasm.sh` (the `.wasm` is committed and CI checks
  it matches), and the planner's image rebuilt.

## Branches

- One flow, for the owner and every session alike: a `claude/<topic>`
  branch from `main`, a pull request to `main`, and it merges by itself
  once the "CI passed" check is green (auto-merge-agents.yml); nothing
  merges red. The branch is deleted on merge (the repository's setting).
- Claude's review is on demand, not a gate (the owner, 2026-11-06): the
  "review" label on a pull request asks for one. So run the checks that
  cover a change, and the aviation-check skill for any figure or rule,
  before pushing.
- A session works only in a worktree of its own (`git worktree add
  ../wingtip-<topic> -b claude/<topic> origin/main`, or the harness's);
  the main checkout stays on `main`, and no session switches it or
  commits on it.
- Never push to `main`. Never force-push. Merge `main` into a branch to
  bring it up to date; never rebase a pushed one.
- On a pull request, an asked-for review is put right on the branch
  ("Address review:" commits) and a CI failure is fixed ("Fix CI:"), each
  at most twice.
- Write to GitHub gently, as the `ship` skill says: one write at a time,
  ten seconds apart, a long list as one issue's checklist. A burst of API
  writes got the owner's account suspended in October 2026.
- Issues: "ready" (nothing left for the owner to decide) or "owner" (the
  owner decides, then labels it "ready"). Only the owner takes "owner"
  off.
- How to check, ship and review: the skills in `.claude/skills`.

## Never

- Commit anything under `data/labels/` or `data/processed/`: the owner's
  ratings and features live there, changed locally on purpose. Stage
  paths by name, never `git add -A` or `git add .`.
- Edit `services/planner/app/detection.py` (a kept read is hashed against it).
- Tag a commit.
- Move a panel or a control to another part of the screen without the
  owner saying so in the issue.

## Checks — run what covers your change

Before pushing, run the quick checks that cover a change (type check,
lint, the unit tests it touches) on the Mac mini. Lengthy runs -- whole
suites, browser tests, iOS and Android builds, image builds -- are left to
CI, which runs on the Mac mini's runners, unless one is needed to debug a
failure; no test holds up a code change (the owner, 2026-11-06).

On the Mac, run them with `scripts/dev/check.sh all-changed` (the areas the
branch and its uncommitted files touch, in parallel) or `scripts/dev/check.sh
<area>` (web, py, planner, engine, java, ios,
android). It runs the table's commands in Docker, or on the host for the
phones, each area in its own turn of `scripts/dev/one-at-a-time.sh`, warm from
any worktree's first run: ready-made images per lockfile and requirements,
and shared Cargo, npm, uv and Maven caches (the script's header lists
them). The table is what it runs:

| Changed | Run, from that directory |
|---|---|
| `apps/web/` | `npm run types && npx tsc --noEmit && npx eslint . && npx vitest run` |
| `services/planner/` (app) | `ruff check app tests && pytest tests/` (in `services/planner`) |
| `services/planner/wingtip`, `tests_wingtip/` | `ruff check wingtip tests_wingtip && pytest tests_wingtip/` (in `services/planner`) |
| `engine/` (Rust, `wingtip_native`) | the engine's `cargo test --profile ci` (`ci.yml`'s line); `maturin build -m engine/bindings/py/Cargo.toml` and install the wheel, then `pytest tests_wingtip/test_native.py` (in `services/planner`); every image that copies `services/planner/wingtip` is built FROM `services/Dockerfile.base`, which builds and installs it once (`services/planner/tests_wingtip/test_dockerfiles.py`), and none of them starts without it |
| `services/gateway/` | `mvn -B test` (needs Docker, for Testcontainers) |
| `apps/ios/` (the native app) | On the Mac mini (Xcode and XcodeGen are there): `xcodegen` in `apps/ios/`, then `xcodebuild -project apps/ios/Wingtip.xcodeproj -scheme Wingtip -destination "platform=iOS Simulator,name=<newest iPhone>" test` through `scripts/dev/one-at-a-time.sh`; `native-ios.yml` runs the same, iPad included (docs/NATIVE.md) |
| `apps/android/` (the native app) | On the Mac mini: `./gradlew testDebugUnitTest lintDebug assembleDebug` in `apps/android/` with JetBrains' JDK 21, after `engine/bindings/ffi/build-android.sh`; `native-android.yml` builds the engine for each ABI, runs the unit tests, lint and a debug APK, then the instrumented tests on an emulator (docs/NATIVE-ANDROID.md) |

Python wants `pip install -r requirements-dev.txt` (the app's suite) or
`requirements-dev-wingtip.txt` (wingtip's) in `services/planner` first.

A pre-push hook runs the quick ones for what a push changes against
origin/main: `tsc` and ESLint for `apps/web/`, ruff for Python, `cargo check`
for `engine/` (each skipped with a note where its tool is missing). Install
it once per clone with `scripts/dev/install-hooks.sh`; skip it with `git push
--no-verify` or `SKIP_HOOKS=1`. It runs outside the lock and is no
substitute for the table above.

An API that changes changes its document, which the web app's types come
from: `python -m app.openapi` in services/planner, or `WRITE_OPENAPI=1 mvn
-B test` in services/gateway; then `npm run types` in apps/web and
`scripts/build/api-models-apps.sh` for the phones' models; commit them all.

The browser tests (Playwright, `apps/web/e2e`) need the whole stack and run in
CI; write or update the spec for a change a pilot sees, and let CI run it.
A pull request runs only the tests tagged `@smoke`, one per journey; the
rest run every night (docs/CI.md). Tag a test `@smoke` only when it is the
one that proves a journey end to end.
On the owner's Mac run only the specs a change touches, and every browser
run, test suite, image build and measurement through
`scripts/dev/one-at-a-time.sh "<label>" <command>`: up to two run at once on
the Mac mini, each waiting while memory is short (three swapped it), and a
speed measurement takes `--alone`, the whole machine (the `checks` skill).
A quick check -- one type check, lint or unit run of a minute or two --
runs outside it, so it isn't stuck behind long builds.

## The app on the phone

Judge every screen at an iPhone's width against Apple's Human Interface
Guidelines first.

- Hit areas are 44 points, but controls never grow to get there: a
  pseudo-element (`after:absolute after:-inset-…`) makes the area, and
  rows sit at `gap-2` so the areas meet.
- Stock components (shadcn/ui, Radix) over hand-rolled ones.
- Tappable things are the blue tint; type sizes come from `lib/text.ts`.
- Panels are Liquid Glass sheets with detents, like Apple Maps.
- Errors show where they happen (`lib/problems`), not in a toast.
- Discrete settings are menus or segmented controls, not sliders.

## Aviation

Every figure and rule the code states or computes — altitudes, clearances,
weather minimums, airspace — must be right and say where it comes from
(14 CFR part and section, the AIM paragraph, the FAA data set) in a
comment. A wrong one is a safety problem, not a style one.

## Writing

- Comments say why, in plain sentences, as the code around them does.
- The app's words say "airplane", the FAA's word, and set the FAA's own
  capitalised text in sentence case with its codes kept
  (`lib/advisories` `faaWords`); raw reports stay as sent.
- A commit message is a paragraph: what changed for the pilot or the
  developer, and why, with the evidence (a test, a measurement).
