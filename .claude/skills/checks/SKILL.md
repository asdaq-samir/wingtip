---
name: checks
description: Run the checks that cover a change in this repo, on the owner's Mac (in containers, since it has no npm or pytest) or in CI, and read failures correctly. Use for the end-of-wave validation on the integration branch, before opening pull requests, before saying a feature works, and whenever a test, a build or the running stack fails. During a wave of code changes, only a compile or type check runs (CLAUDE.md, Branches). Covers web (tsc, eslint, vitest), services/planner/wingtip and the Python services, the Spring Boot app, OpenAPI types, the running stack, Playwright, the iPhone audit and WebKit.
---

# Checks

CLAUDE.md says what to run for each part of the repo; this says how to run it here.

**When (the owner, 2026-11-08, a standing rule):** code first, validation at the end. While a wave of code changes is being written, run only a compile or type check of what changed. Run the full checks below once, at the end of the wave, on `claude/integration`, where every finished branch has been merged. Fix what they find there, then open the grouped pull requests. Sections below that say "before pushing" mean before those pull requests.

**Where you are running matters:**
- **In CI (GitHub's runners):** the workflow sets up node, Python 3.15 and Java 25. Run CLAUDE.md's commands directly, after `pip install -r requirements-dev.txt` (or `requirements-dev-wingtip.txt` for wingtip's suite) in that directory, and skip sections 3 and 4.
- **On the owner's Mac:** it has no node, npm, pytest or ruff, so everything runs in a container from the repo root. Chain every step with `&&` so that one failure stops the rest. Report exit codes, never an "OK" marker found with grep: an old marker can look like a new pass.

## 1. What the change needs

| Changed | Run | Then |
|---|---|---|
| `apps/web/` | Web checks, then the specs the change touches | CI runs the whole suite on the push |
| `services/planner/wingtip`, `services/planner/tests_wingtip/` | wingtip's Python suite | restart the planner (it mounts the checkout) |
| `services/planner/app`, `services/planner/tests/` | the planner's Python suite | restart the planner |
| `services/gateway/` | Java | rebuild the gateway |
| an API's request or response | regenerate its OpenAPI document, then `npm run types` | commit all three |
| any `requirements*.txt`, `pom.xml`, `package.json` or Dockerfile | rebuild every image that installs it | before verifying anything |

## 2. Commands

**On the Mac, use `scripts/dev/check.sh`.** `scripts/dev/check.sh all-changed` runs every area the branch touches (`git diff origin/main...` plus the uncommitted files, mapped as CI's changes filter maps them), in parallel, each in its own turn of `scripts/dev/one-at-a-time.sh`, each area's log shown whole when it ends. `scripts/dev/check.sh web py engine …` runs named areas: `web`, `py` (services/planner/wingtip and tests_wingtip), `planner`, `engine` (CI's `cargo test --profile ci` line), `java`, `ios` and `android` (both on the host). It prints `check: <area> exit <code> in <n>s` per area and exits non-zero if any failed. `scripts/dev/check.sh --areas < paths` prints the areas without running anything.

It is fast because nothing starts cold after the first run on the Mac, in any worktree:
- `wingtip-check-web:<hash of the Node version (.tool-versions), package.json and package-lock>`: node with web's packages at `/node_modules`, found by walking up from `/repo/apps/web`. A worktree's own `apps/web/node_modules`, if it has one, is hidden behind an empty one.
- `wingtip-check-py-<dir>:<hash>`: python with that directory's requirements-dev (followed through `-r`) and the wingtip_native wheel built from this `engine/`, rebuilt when either changes.
- Volumes: `wingtip-cargo-registry`, `wingtip-cargo-git`, `wingtip-cargo-target-tests-<rust>-<arch>` (the engine tests' build; each worktree is mounted at its own path, so its own crates are never taken for another's), `wingtip-check-raw` (the FAA files the Python tests fetch into `data/raw`), `fp-m2`. BuildKit's caches `wingtip-npm`, `wingtip-uv` and the wheel's target.
- The engine for each app (wasm, xcframework, Android's `app/engine`, the planner's wheel) in the engine store, `~/Library/Caches/wingtip/engine/<hash>`, keyed by the engine's files; Rust through sccache; Xcode's compilation cache; Gradle's build cache in `~/.gradle` (docs/LOCAL-DEV.md, "Shared build caches").

`scripts/build/build-engine-wasm.sh` stays apart: a clean build in its pinned image, so the committed `.wasm` is reproducible. Run it after an engine change, as before. Removing any image or volume above costs one cold run, nothing more.

**Formatting is `scripts/dev/format.sh`** (all six languages, or `web python rust swift kotlin java`; `--check` to only report). It pins each tool and fetches what the Mac lacks (Prettier through Docker's node, ruff through uvx, SwiftFormat and ktlint as checksummed release binaries); CI runs each language's `--check` in that language's job, and the pre-push hook those a push changes. A `--check` failure is fixed by running it without `--check` and committing what it wrote, never by hand.

The commands below are what it runs, for reading a failure or running one by hand.

**Web.** These are CI's steps; node 26 is `.tool-versions`' (`apps/web/.nvmrc` is written from it).
```sh
docker run --rm -v "$PWD":/repo -w /repo/apps/web node:26-slim sh -c 'npm run -s types && npx tsc --noEmit && npx eslint . --max-warnings 0 && npx vitest run'
```

**Python.** This mirrors CI: Python 3.15, the suite's requirements installed with uv, and a cache volume that brings a repeat run down to under a minute. Both suites run from `-w /repo/services/planner`: `requirements-dev-wingtip.txt` with `ruff check wingtip tests_wingtip && pytest tests_wingtip/`, or `requirements-dev.txt` with `ruff check app tests && pytest tests/`.
```sh
docker run --rm -v "$PWD":/repo -v fp-uv-cache:/root/.cache/uv -w /repo/services/planner python:3.15-slim sh -c 'pip install -q uv && uv pip install --system -q -r requirements-dev.txt && ruff check app tests && pytest tests/ -q -p no:cacheprovider'
```
The planner's OpenAPI document comes from the same container: `python -m app.openapi` in `services/planner`.

**Java.** Java 25 is required. The socket mount and the host override are what let Testcontainers start Postgres. The anonymous `target` volume keeps any stray host build output out of the run. `fp-m2` caches Maven's downloads, so never prune it.
```sh
docker run --rm -v "$PWD/services/gateway":/build -v /build/target -v fp-m2:/root/.m2 -v /var/run/docker.sock:/var/run/docker.sock -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal -w /build maven:3.10-eclipse-temurin-25 mvn -B test
```
To rewrite `services/gateway/openapi.json`, run the same command with `-e WRITE_OPENAPI=1 … mvn -B test -Dtest=OpenApiDocumentTest`.

## 3. The running stack

The stack is `docker-compose.yml` alone; the phone (`PUBLISH_ADDRESS`, `PHONE_BASE_URL`, `MAILPIT_UI_AUTH`) and front-end work (`COMPOSE_PROFILES=web-dev`, `WEB_DIST_MOUNT`) are settings in the main checkout's `.env`, so run it from `~/Developer/wingtip`, where compose reads that `.env`:
```sh
docker compose up -d
```
- From another directory (a worktree), pass `--env-file ~/Developer/wingtip/.env -p wingtip`, or the stack comes up on loopback with the image's bundle: the iPhone loses the app and a web fix seems "not to work". To check what the running gateway has: `docker port wingtip-gateway-1` (0.0.0.0 for the phone) and `docker inspect wingtip-gateway-1 --format '{{range .Mounts}}{{.Destination}} {{end}}'` (`/app/static/app` for apps/web/dist).
- **Web change:** `web-build` (vite `--watch`) rewrites `apps/web/dist` about 2 s after a save (built whole into `apps/web/.dist-next`, then renamed in, index.html last), and the gateway serves it on the next request. Nothing needs restarting.
- **Python change in `services/planner` (wingtip or the app):** run `docker compose restart planner`, then wait until `curl -s localhost:8084/` shows `"warm":true`.
- **Java or dependency change:** run `docker compose up -d --build --no-deps <service>`. A change to `services/planner/requirements-wingtip.txt` or `engine/` rebuilds wingtip's base image (`services/Dockerfile.base`, compose's `base` service) first, by itself. Then wait until `curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/app/plan` prints 200, which takes 20 to 30 s after the container starts. Read `docker compose logs --tail=30 <service>` for import errors: a container can show "running" and still fail to import its own code. To prove a service imports what it uses, run `docker compose run --rm --no-deps -T --entrypoint python3 <service> -c "from wingtip import …"` with that service's real list, from `grep -rh "from wingtip import" services/<service>/app`.
- **Before building images:** check `df -h /System/Volumes/Data` and run `docker builder prune` when under about 20 GB is free. Docker's VM is capped at 6 GB, so never run a second stack or a heavy job beside the suite: build through `scripts/dev/one-at-a-time.sh` (section 4).

## 4. Playwright

**Heavy runs take turns.** On the owner's Mac, run every browser test, test suite, image build and speed measurement through `scripts/dev/one-at-a-time.sh "<who and what>" <command…>`. Several Claude sessions and their agents share the Mac. On the old four-core MacBook two suites at once timed out (2026-10-15), so there was one turn; the Mac mini (12 cores, 24 GB, Docker given 12 GB) has two (`ONE_AT_A_TIME_SLOTS`): three, with Xcode or Gradle on the host, swapped it and cost more time than they saved (2026-11-08). Before taking a turn the script also waits while macOS says memory is short ("waiting for memory": under `ONE_AT_A_TIME_FREE_MIN`, 20% free, or over `ONE_AT_A_TIME_SWAP_MAX_MB`, 4096 MB of swap). The label comes first: a first word that is a program (`./x.sh`, `bash`) is refused with the usage line. **A speed measurement runs with `--alone`**: it waits until no turn is held and then holds them all, so its numbers come from a quiet machine. The script keeps a first-come line, says whose turn it waits for, runs the command, and frees its turns however the command ends. A turn left by a killed run is taken back. **Quick checks skip the line:** a single type check, lint or unit-test run that takes a minute or two (tsc, eslint, one vitest run, ruff, a pytest file) runs directly, not through the script, so it isn't stuck behind 20-minute builds and renders (2026-11-06, with 28 tickets in line); builds, image builds, browser runs, renders, whole suites and measurements always take a turn.

```sh
scripts/dev/one-at-a-time.sh "session: <spec>" docker run --rm --network host -v "$PWD/apps/web":/w -w /w \
  -e BASE_URL=http://localhost:8080 -e MAILPIT_URL=http://localhost:8025 \
  -e MAILPIT_UI_AUTH="$(grep '^MAILPIT_UI_AUTH=' .env | cut -d= -f2-)" \
  mcr.microsoft.com/playwright:v1.65.0-noble npx playwright test e2e/<spec>.spec.ts --reporter=list
```
- The image tag must equal `@playwright/test` in `apps/web/package.json`. Change both together.
- Reach the stack at `localhost`, as CI does: the browser counts it as a secure origin and gives the page a position. Over `host.docker.internal` it is not one, and every test that taps the location arrow fails ("No position over this connection"). Four dry-run tests failed that way on 2026-10-19 and passed over `localhost`.
- The `setup` project signs in developer@example.com through Mailpit, and every spec reuses that session.
- **Locally, run only the specs the change touches, and its new test** (the owner's pick, 2026-10-15). The whole suite runs in CI on the push, in a few minutes on GitHub's runners, so don't run it here unless the owner asks. Run a broader local set only where CI can't stand in, such as a WebKit-only bug or a measurement. Keep the full log rather than piping it through `tail`, so the details of a real failure survive.
- **iPhone audit:** `e2e/ios` runs on three devices in every run. `IOS_AUDIT=1` takes all eight, plus `--project=webkit-iphone --workers=2` for Safari's engine.
- **Before pushing a change a pilot sees, run the iPhone audit on the screens it touches,** on CI's three devices: `npx playwright test e2e/ios/audit.spec.ts --project=iphone-16-pro --project=iphone-landscape --project=ipad-pro-13 -g "<screen name from e2e/ios/screens.ts>"`. The specs a change touches don't measure what the audit does (hit areas, one size per component, contrast in dark, sideways scroll), and on 2026-10-19 three pushes in a row failed CI only there (P18 on a new info button and a pager, P15 on a pattern label). A new screen or state gets its entry in `e2e/ios/screens.ts` first.
- **WebKit-only bugs:** the suite is Chromium. When the user reports something from the phone that the suite passes, reproduce it in WebKit before guessing. Write a scratch `.cjs` script with `require("@playwright/test").webkit` and `storageState: "/w/e2e/.auth/developer.json"`, and run it in the same image with `-e NODE_PATH=/w/node_modules`. Abort every write with `page.route(…, r => r.abort())` so the user's data isn't touched.
- **Changes to CI's e2e job, `infra/docker-compose.ci.yml` or the planner's startup** can pass here and fail in CI. Simulate CI first: clone into the scratchpad, shift the clone's host ports, build with `-p fpci -f docker-compose.yml -f infra/docker-compose.ci.yml`, keep `CHARTS_AUTO_REFRESH=0`, wait for `warm`, and run with `-e CI=1` with nothing else heavy running. Tear down with `down -v --rmi all` and `docker builder prune -af`.

## 5. Reading a failure

Rule these out before calling something a regression:
1. **Boot race:** the first mobile tests fail right after a rebuild. Wait for `/app/plan` to return 200, then rerun.
2. **Stale code:** a change "doesn't work". Check the gateway's compose files (above) and whether the image needed a rebuild for a dependency.
3. **Load:** nav-log or map tests time out while a chart re-render, an image build or a second suite is running. Rerun on a quiet stack.
4. **A planner wedged after disk or data trouble:** restart it and wait for `warm`.
5. **Safari only:** reproduce in WebKit.

A failure that repeats on a quiet, freshly built stack is real. In the report, say which checks ran, with their counts, and which didn't.

## 6. Flaky tests

The unit suites run in a new random order every time (pytest-randomly, vitest's `sequence.shuffle`); docs/CI.md, "Flaky tests", has the whole setup.
- **A test that fails here and passed before your change, in code you did not touch,** may be order-dependent. Rerun with the seed printed at the top of the failing run (`pytest --randomly-seed=N`, `npx vitest run --sequence.seed=N`); if it fails again in that order and passes alone (`pytest -p no:randomly <file>`), the test before it left something behind. Fix that test, not yours.
- **Guards fail a test for what it leaves behind:** a module function replaced without `monkeypatch` (Python), fake timers left on (web). The message names it; use `monkeypatch.setattr` or `vi.useRealTimers()` in an `afterEach`.
- **Browser tests retry once in CI.** One that passed on its retry is reported, not failed; the nightly issue "Flaky tests (nightly)" lists it with the unit tests the nightly five shuffled runs caught. Take a test from that list as work, like any other issue.
- **No `.only`:** ESLint fails it in unit tests and specs, and Playwright's `forbidOnly` in CI.
