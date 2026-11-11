# Wingtip Maps — for agents

A flight planner for pilots, VFR and IFR: the FAA chart on a map that works like
Maps on an iPhone, and the route, checkpoints and nav log for a flight.
It is headed for an iOS app. README.md has the services and the layout,
docs/README.md every doc, docs/decisions the owner's decisions and why.

## Architecture

Functional core, imperative shell, four layers, each with one job
(decisions 0001-0004; docs/ARCHITECTURE.md):

- **The Rust engine** (`engine/facade` over the domain crates in
  `engine/crates`, layered as engine/README.md says). Every aviation rule
  or figure lives there once. No network, no screen, no clock of its own.
  Each rule is a name asked through `engine/facade/src/call.rs`, JSON in
  and out, declared in one contract file beside its code
  (`engine/crates/<crate>/contract/<name>.json`), from which the dispatch
  table and `engine/contract/engine.schema.json` are generated.
- **The planner** (FastAPI, `services/planner`: `app` over `wingtip`) works
  out a flight: it fetches the FAA's data, reads the weather and the live
  feeds from the shared store, runs the chart model and chart vision, and
  asks the engine every rule (`wingtip_native.call`). It fetches no
  weather, reads no feed, calls no model and builds no tiles.
- **The services beside it** (`services/ingest`, `weather`, `assistant`,
  `jobs`), each its own image on `services/Dockerfile.base`, hold no rule
  of their own. Ingest and weather write the shared store (the data volume
  and Postgres); the planner reads it, so no pilot's request waits on a
  live fetch. The assistant makes every Claude call and asks the planner
  for every figure. The apps talk only to the gateway, which sends the
  Claude paths to the assistant and the rest to the planner.
- **Spring Boot** (`services/gateway`) is who the pilot is and what they
  saved: accounts, sign-in, records, the public API, scheduled mail. It
  holds no aviation logic and asks the planner for a figure (`PlannerClient`).
  AC 61-65K's endorsement texts (`EndorsementKind`) are still Java (#482).
  Add no new rule there.
- **Each app is a shell that gets data, keeps state and draws**, and asks
  the engine the rest by name: the web through `callEngine`
  (apps/web/src/lib/engine, the engine built to WebAssembly), the iPhone
  through `wt_call`, Android through its JNI shim over `wt_call`. A rule
  found in a component, a hook, a Swift view, a Java service or a route
  handler is a bug: move it into the engine and delete the copy (#482).
- **Screens are view and view model** (MVVM): the view draws, one hook (web)
  or observable model (iOS, Android) per screen holds its state and makes
  its calls. How a figure is written on the screen stays with each app.
- **Data comes in at the edges**: the planner's endpoints, the shared
  store and the cycle packs feed the engine; the engine never fetches.
- **Adding or changing a rule** is engine/README.md's "The contract, and
  adding a rule": the Rust in the lowest crate that can hold it, its
  contract file, then `cargo run -p wingtip-contract-gen` in engine/,
  `npm run types` in apps/web, `scripts/build/engine-contract-apps.sh`,
  `scripts/build/assistant-client.sh` for an `"x-tool"`, its test against
  the shared fixtures (apps/web/src/lib/fixtures),
  `scripts/build/build-engine-wasm.sh` (the `.wasm` is committed), and
  the images that link it rebuilt. CI checks every generated file matches.

## Branches

Code first, validation at the end (decisions 0005 and 0006: "all code
changes should be fast and all should be tested at the end with the
integration branch"):

- A session works only in a worktree of its own (`git worktree add
  ../wingtip-<topic> -b claude/<topic> origin/main`, or from
  `origin/claude/integration` when the wave's brief says so); the main
  checkout stays on `main`, and no session switches it or commits on it.
- Each piece of work is a `claude/<topic>` branch, pushed once when the
  code is done, with no pull request yet. Pushing a `claude/` branch
  starts no CI (`claude/native-*` does: don't use that name). Before that
  push, only a compile or type check of what changed and the generated
  files it needs; tests are written with the code, not run.
- Work that builds on an unmerged branch merges that branch in; nothing
  waits for a merge. Branches merge into `claude/integration` as they
  finish.
- **Live for the owner first:** once a wave is merged into
  `claude/integration`, `scripts/dev/go-live.sh` (in
  `~/Developer/wingtip-live`) tidies the Mac, rebuilds and puts it on the
  owner's stack for the phone, before any lengthy test or CI. The owner
  is told what to try.
- **Web first (decision 0038):** a change a pilot sees is made on the web
  as the proof of concept; the iPhone and Android follow only on the
  owner's word for that piece (the hook refuses phone edits and merges
  until its topic is in `~/.config/wingtip/phones-approved`).
- **Enforced (decision 0037):** `.claude/hooks/guard.py` refuses every
  long test until the live stack runs the current `claude/integration`;
  a brief never asks an agent to verify before pushing.
- **Then one validation pass**, `scripts/dev/validate-wave.sh` on
  `claude/integration`, its fixes one commit set; then a few grouped pull
  requests to `main`, which merge by themselves once "CI passed" is green
  (auto-merge-agents.yml). Nothing merges red. CI failures are fixed in
  that pass, at most once more after it; an asked-for review is put right
  in "Address review:" commits.
- **Parallel work merges cleanly:**
  - Split work by area so two agents never own the same files; each brief
    names what the agent owns and leaves alone, and a change another
    area needs goes in the report, not the code.
  - Generated files are never merged by hand: take either side and
    regenerate (contract-gen, `npm run types`, the wasm,
    `engine-contract-apps.sh`, `api-models-apps.sh`).
  - Shared lists (`docker-compose.yml`, `ci.yml`, `check.sh`,
    `scripts/areas.yml`, the CloudFormation template, the docs' tables):
    add an entry in its own block, in order, changing no neighbour.
  - Branches don't merge `main` in during a wave; the integration branch
    does, once, and keeps a log of each conflict and how it was resolved.
  - Moves and renames across the tree run alone, at a wave's start or end.
- **Fast turnover:** start every independent piece at once, and a
  dependent one on the branch it needs, with `TODO(<branch>)` seams.
  Mechanical work goes to a faster model; aviation rules and architecture
  stay on the strongest. Owner decisions are gathered onto one page with a
  recommendation each, not asked mid-wave. Briefs are short and point at
  files.
- Never push to `main`. Never force-push. Merge to bring a branch up to
  date; never rebase a pushed one.
- Claude's review is on demand (the "review" label), not a gate. The
  aviation-check skill is applied to every figure or rule while writing it.
- Write to GitHub gently, as the `ship` skill says: one write at a time,
  ten seconds apart, a long list as one issue's checklist (a burst got the
  owner's account suspended in October 2026).
- Issues: "ready" (nothing left for the owner to decide) or "owner" (the
  owner decides, then labels it "ready"). Only the owner takes "owner" off.
- How to check, ship and review: the skills in `.claude/skills`.

## Never

- Commit anything under `data/labels/` or `data/processed/`: the owner's
  ratings and features live there, changed locally on purpose. Stage
  paths by name, never `git add -A` or `git add .`.
- Edit `services/planner/app/detection.py` (a kept read is hashed against it).
- Tag a commit.
- Move a panel or a control to another part of the screen without the
  owner saying so in the issue.

## Checks

While writing code, only a compile or type check of what changed; the
table is the end-of-wave validation, and no test holds up a code change.
`scripts/dev/check.sh <area>` runs an area, `scripts/dev/check.sh
all-changed` every area the branch and its uncommitted files touch. It
runs in Docker (the phones on the host), each area in its own turn of
`scripts/dev/one-at-a-time.sh`, warm from shared images and caches.
Every worktree's builds share what is the same: the engine built once per
engine hash, sccache, Xcode's compilation cache and Gradle's build cache
(docs/LOCAL-DEV.md, "Shared build caches"; `WINGTIP_SHARED_CACHE=0` is off).
`scripts/areas.yml` is the one table of areas, their paths and their
checks, read by check.sh, the pre-push hook and CI. A change to
`services/planner/wingtip` or `engine/` also checks ingest, weather and
jobs, whose images build on `services/Dockerfile.base` (none starts
without it).

| Area | What it runs | On a pull request / after merge / at night (docs/CI.md) |
|---|---|---|
| `web` (`apps/web/`) | `npm run types && npx tsc --noEmit && npx eslint . --max-warnings 0 && npx knip && npx vitest run` | lint in `guards`, the tests the change reaches (`--changed`) and the build / every test, and the `@smoke` browser tests / every browser test |
| `py` (`services/planner/wingtip`, `tests_wingtip/`) | `ruff check wingtip tests_wingtip && lint-imports && pytest tests_wingtip/`, with the engine's wheel | all |
| `planner` (`services/planner/` app) | `ruff check app tests && lint-imports && pytest tests/` | all |
| `ingest`, `weather`, `assistant`, `jobs` | each service's ruff and pytest; the assistant's `python -m app.openapi` after a route change | all |
| `engine` | `scripts/ci/engine_layers.py`, `cargo machete`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --profile ci` over `scripts/ci/engine_affected.py --all` | lint in `guards`, the touched crates, those that use them and the contract test / every crate |
| `java` (`services/gateway/`) | `mvn -B test` (Docker, for Testcontainers) | all |
| `ios` (`apps/ios/`) | `xcodegen`, then `scripts/dev/xcodebuild.sh test` (xcodebuild with the shared caches) on the newest iPhone simulator (docs/NATIVE.md) | the build and unit tests on the iPhone / and `CardSmokeTests` / the full suites on the iPhone, iPad and iPhone Duo |
| `android` (`apps/android/`) | `engine/bindings/ffi/build-android.sh`, then `./gradlew testDebugUnitTest lintDebug assembleDebug` (docs/NATIVE-ANDROID.md) | unit tests and lint / plus the instrumented tests on an emulator |
| `site` (`apps/site/`) | `python3 apps/site/build.py && python3 apps/site/check.py` | all |
| `arch` (any source file) | `scripts/ci/file_sizes.py --base origin/main` (no new or grown file over 400 lines), `scripts/build/toolchain.sh --check`, `scripts/ci/brand_guard.py` (no raw style value outside `design/tokens.json`), `scripts/ci/dead_python.sh`; CI adds `scripts/ci/rules_boundary.py` (no aviation figure outside the engine) | all |

- **Python outside check.sh** wants `pip install -r requirements-dev.txt`
  (the app) or `requirements-dev-wingtip.txt` (wingtip) in `services/planner`.
- **Toolchains:** one version each, in `.tool-versions`; bump it there and
  run `scripts/build/toolchain.sh` (docs/versions.md).
- **Formatting:** `scripts/dev/format.sh`, one pinned formatter a language;
  `--check` to check.
- **Pre-push hook** (`scripts/dev/install-hooks.sh` once per clone): `tsc`,
  ESLint, ruff, `cargo check` and `format.sh --check` for what a push
  changes. Skip it with `--no-verify` or `SKIP_HOOKS=1`; it is no
  substitute for the table.
- **An API that changes changes its document:** `python -m app.openapi`
  (the planner, the assistant) or `WRITE_OPENAPI=1 mvn -B test` (the
  gateway), then `npm run types` and `scripts/build/api-models-apps.sh`;
  commit them all.
- **Browser tests** (Playwright, `apps/web/e2e`) need the whole stack:
  write or update the spec for a change a pilot sees, with the code.
  Main's push runs only `@smoke` (and `@flight-critical`) after the merge,
  one test per journey that proves it end to end; the rest run at night. A new spec tags its one `@smoke` or is
  listed in `scripts/ci/test_tiers_nightly.txt`.
- **CI stays lean** (docs/CI.md, "Rules" and "The tiers"; decision 0034):
  a pull request in about 3 minutes (tier 1: one `guards` job, the unit
  tests a change reaches, the phones' builds when touched); the browser
  smoke, the images and the iPhone's UI smoke after merge on main's push
  (tier 2, a failure one `ready` issue, no merge held); everything at
  night (tier 3). Each check in one tier and run once, only what a
  change touches, everything cached, newest versions, warnings fatal,
  pushes batched, and never a timeout raised to get green. Also: no flaky
  test kept on the PR, no live internet in PR tests, a red night fixed
  first, CI calling the same scripts as the Mac, every failure named,
  a rule tested once at the lowest level, least privilege, macOS for iOS
  only, and small workflows. `guards` (`scripts/ci/guards.sh`) and `CI
  budget` enforce what a script can check.
- **On the owner's Mac**, every browser run, suite, image build and
  measurement goes through `scripts/dev/one-at-a-time.sh "<label>"
  <command>` (three at once with the live stack down, two with it up;
  `~/.config/wingtip/one-at-a-time` overrides it; `--alone` for a speed
  measurement). Never wrap `check.sh` in it. A
  quick check of a minute or two runs outside it.

## The app on the phone

Judge every screen at an iPhone's width against Apple's Human Interface
Guidelines first. How cards open, close and scroll, the one search and
the airport weather marks: docs/design/rules.md, on all three apps.

- Hit areas are 44 points, but controls never grow to get there: a
  pseudo-element (`after:absolute after:-inset-…`) makes the area, and
  rows sit at `gap-2` so the areas meet.
- Stock components over hand-rolled ones, on every platform (shadcn on
  Base UI and React Aria on the web, SwiftUI, Material 3): the platform's
  own component even in a release candidate, never a copy of our own;
  used as they come, with their own states, motion, gestures and haptics
  (decision 0016). The Native look is each platform out of the box; the
  brand looks change only the tokens.
- Tappable things are the look's tint; type sizes come from `lib/text.ts`.
- Every colour, type role, spacing, corner, material, motion and tap
  target is a token in `design/tokens.json`, generated into each app by
  `scripts/build/design-tokens.sh`: change a value there, never in a
  generated copy.
- Panels are the platform's stock sheet with detents, like Apple Maps
  (decision 0018). On the web the sheet is solid at every size, the look's
  `--sheet`, not Liquid Glass; glass only on what floats over the map, its
  buttons (owner decision 2026-11-10 (decisions page)).
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
