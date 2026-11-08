# Wingtip Maps — for agents

A flight planner for pilots, VFR and IFR: the FAA chart on a map that works like
Maps on an iPhone, and the route, checkpoints and nav log for a flight.
It is headed for an iOS app. README.md has the services and the layout.

## Architecture

Functional core, imperative shell: one core every app shares, and a thin
shell per app round it (the owner, 2026-11-03). Four layers, each with
one job (the owner kept both server languages on this split, 2026-11-06):

- **The Rust engine** (`engine/facade`, wingtip-engine, a facade over
  eleven domain crates in `engine/crates`, layered as engine/README.md
  says). Every aviation rule or figure lives there once: altitudes,
  winds, runways, fuel, weather limits, Go / No-Go, altitude selection, holds, procedures,
  the clearance reader, the debrief, a pilot's currency and a student's
  61.109 experience, endorsements and inspections, the altitude limits,
  91.155's minimums, the filing form's items. No network, no screen, no clock of its own. Each rule is a name in `engine/facade/src/call.rs`,
  JSON in and out, typed in `engine/contract/engine.schema.json`.
- **The planner** (FastAPI, `services/planner`: `app` over `wingtip`) works
  out a flight: it fetches the FAA's data, reads the weather and the live
  feeds from the shared store, runs the chart model and chart vision,
  and asks the engine every rule (`wingtip_native.call`). It fetches no
  weather, reads no feed, calls no model and builds no tiles: those are
  the services beside it (#535, the owner's split of 2026-11-08).
- **The services beside the planner**, each its own image on wingtip's
  base (`services/Dockerfile.base`) and each with no rule of its own:
  `services/ingest` reads the live feeds always (the FAA's SWIM feeds:
  STDDS radar, FNS NOTAMs, TFMS filed routes; the followed airplanes'
  adsb.fi rounds); `services/weather` fetches the weather on a schedule
  (METARs, TAFs, advisories, PIREPs, the GFS's winds aloft, GLMP, TFRs,
  the radar's time); `services/assistant` makes every Claude call (the
  assistant, the narrative, the words, the checkpoint notes, the mock
  oral), holds the Anthropic key and asks the planner over HTTP for
  every figure; `services/jobs` holds the one-off runs, `retrain` (the
  chart model's training) and `charts` (the chart cycle's raster tiles,
  packed as PMTiles, and the overlay vector tiles), behind compose's
  `jobs` profile. **The shared store** is how they meet without a
  message bus: ingest and weather write, the planner reads, on the data
  volume they all mount (the live store `data/raw/live/live.sqlite`,
  `wingtip.traffic.store`; the NOTAM and filed-route SQLite stores; the
  weather store `data/raw/weather`, `wingtip.weather_store`; the chart
  tiles) and in Postgres (the gateway's records), so no pilot's request
  waits on a live fetch. The apps talk only to the gateway, which sends
  the Claude paths to the assistant and the rest to the planner.
- **Spring Boot** (`services/gateway`) is who the pilot is and what they
  saved: accounts, sign-in, records, the public API, scheduled mail. It
  holds no aviation logic: for a figure it asks the planner over HTTP
  (`PlannerClient`: currency, 14 CFR 61.56 and 61.57, 61.109's
  experience, the endorsements' days and 61.93(d)'s checks, the
  inspections' due dates and 91.171's VOR check), which asks the engine.
  AC 61-65K's endorsement texts (`EndorsementKind`) are still Java, in
  #482. Add no new rule there.
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
- **Data comes in at the edges**: the planner's endpoints, the shared
  store that ingest and weather fill, and the cycle packs feed the
  engine; the engine never fetches.
- Adding or changing a rule: the Rust in the lowest crate that can hold
  it, its name in `call.rs`, its entry in the contract
  (`engine.schema.json`), `npm run types` in apps/web (and
  `scripts/build/engine-contract-apps.sh` when a phone decodes it), its test
  against the shared fixtures (apps/web/src/lib/fixtures),
  `scripts/build/build-engine-wasm.sh` (the `.wasm` is committed and CI checks
  it matches), and the images that link it rebuilt (the planner, ingest,
  weather and the jobs).

## Branches

- **Code first, validation at the end** (the owner, 2026-11-08, a
  standing rule: "all code changes should be fast and all should be
  tested at the end with the integration branch"). Waiting on CI is the
  thing to avoid:
  - Each piece of work is a `claude/<topic>` branch from `main`, pushed
    once when the code is done. Pushing a `claude/` branch starts no CI
    (ci.yml runs on pull requests and on `main`; native-*.yml also on
    `claude/native-*`, so don't use that name). No pull request yet.
  - Before that push, only a compile or type check of what changed
    (`tsc --noEmit`, `cargo check`, ruff, a Kotlin or Swift compile) and
    the generated files it needs. Tests are written with the code, not
    run.
  - Work that builds on an unmerged branch merges that branch in
    (`git merge origin/<branch>`); nothing waits for a merge.
  - The branches are merged into `claude/integration` as they finish,
    conflicts resolved once there.
  - **Live for the owner first** (the owner, 2026-11-08, standing): as
    soon as a wave's code is merged into `claude/integration`, before any
    lengthy test or CI, it goes live on the owner's local stack so they
    can try it on the phone (https://10.0.0.87:8443). The stack runs from
    a worktree of its own, `~/Developer/wingtip-live` on
    `claude/integration`, with `data/`, `.env` and
    `infra/local-https/certs/` linked from the main checkout and the same
    compose project (`wingtip`), so the main checkout stays on `main`:
    `scripts/dev/go-live.sh` pulls the branch, rebuilds and restarts
    the changed services and the web build, then says what is running.
    It first runs `scripts/dev/tidy-local.sh`: worktrees and branches
    already landed, stopped containers and dangling images go, and a
    running agent's (locked) worktree or one with changes stays.
    The owner is told what to try; the validation runs while they do.
  - At the end of a wave, one validation pass on the integration branch
    on the Mac: every suite, the image builds, the browser tests, the
    phones (iPad included), screenshots. Its fixes are one commit set.
    Only then a few grouped pull requests to `main`, which merge by
    themselves once "CI passed" is green (auto-merge-agents.yml); nothing
    merges red, and CI runs once on code that has already passed.
- **Parallel work that merges cleanly** (the owner, 2026-11-08: "avoid
  time wasted"):
  - Split work by area, so two agents never own the same files. Each
    brief names what the agent owns and what it must leave alone; a
    change another agent's area needs goes in the report, not the code.
  - Generated files are never merged by hand. On a conflict in
    `apps/web/src/lib/engine/contract.ts`, the `.wasm`, the API
    documents and types, or the phones' generated models, take either
    side and regenerate with the scripts (`npm run types`,
    `scripts/build/build-engine-wasm.sh`, `engine-contract-apps.sh`,
    `api-models-apps.sh`). The integration branch regenerates once after
    each merge.
  - Shared lists (`call.rs`, `engine.schema.json`, `docker-compose.yml`,
    `ci.yml`, `scripts/dev/check.sh`, the CloudFormation template, the
    docs' service tables): add an entry in its own block, in the list's
    order, and change no neighbouring line, so merges are additive.
  - Branches don't merge `main` in during a wave; the integration branch
    does, once.
  - Moves and renames across the tree (a folder regroup, a package
    rename) run alone, at the start or the end of a wave, never beside
    other agents.
  - The integration branch keeps a log of each conflict and how it was
    resolved, for the end-of-wave pass and the pull requests.
- **Fast turnover** (the owner, 2026-11-08, standing):
  - Start every independent piece at once; start dependent pieces on
    the branch they depend on, marking the seams (`TODO(<branch>)`)
    for the integration merge to wire.
  - Mechanical work (moves, renames, comment and doc cleanups, lint)
    goes to a faster model; aviation rules and architecture stay on the
    strongest one.
  - The end-of-wave pass is one command, `scripts/dev/validate-wave.sh`
    on `claude/integration`: every check area, the image builds, the
    smoke browser tests and the phones, then one list of failures.
  - Decisions the owner must make are gathered onto one page with a
    recommendation each, not asked one at a time mid-wave; work that
    doesn't depend on them goes on.
  - Agent briefs are short and point at files rather than retyping
    them; this file stays short, with the how-to in the skills.
- Claude's review is on demand, not a gate (the owner, 2026-11-06): the
  "review" label on a pull request asks for one. The aviation-check skill
  is still applied to every figure or rule while writing it.
- A session works only in a worktree of its own (`git worktree add
  ../wingtip-<topic> -b claude/<topic> origin/main`, or the harness's);
  the main checkout stays on `main`, and no session switches it or
  commits on it.
- Never push to `main`. Never force-push. Merge `main` into a branch to
  bring it up to date; never rebase a pushed one.
- On a pull request, an asked-for review is put right on the branch
  ("Address review:" commits). CI failures are not chased push by push:
  they are fixed in the end-of-wave pass, at most once more after it.
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

## Checks — at the end, on the integration branch

While writing code, run only a compile or type check of what changed
(see Branches). The checks below are the end-of-wave validation, run
once on `claude/integration` before the grouped pull requests; no test
holds up a code change (the owner, 2026-11-06 and 2026-11-08).

On the Mac, run them with `scripts/dev/check.sh all-changed` (the areas the
branch and its uncommitted files touch, in parallel) or `scripts/dev/check.sh
<area>` (web, py, planner, ingest, assistant, weather, jobs, engine, java,
ios, android); a change to `services/planner/wingtip` or `engine/` also
checks ingest, weather and jobs, which copy wingtip in. It runs the table's commands in Docker, or on the host for the
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
| `services/ingest/` | `ruff check ingest tests && pytest tests/` (in `services/ingest`, after `pip install -r requirements-dev.txt` and the engine's wheel) |
| `services/weather/` | `ruff check app tests && pytest tests/` (in `services/weather`, after `pip install -r requirements-dev.txt` and the engine's wheel) |
| `services/assistant/` | `ruff check app tests && pytest tests/` (in `services/assistant`, after `pip install -r requirements-dev.txt`); `python -m app.openapi` after a schema or route change |
| `services/jobs/` | `ruff check charts && pytest charts/tests/` (in `services/jobs`; CI runs them in its `test` job) |
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
the end-of-wave pass and CI; write or update the spec for a change a pilot
sees, with the code.
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
