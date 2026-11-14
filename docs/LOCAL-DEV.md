# Running it locally

The whole stack on one machine, on a phone over the Wi-Fi, and the
scripts that keep the owner's Mac tidy. What the services are is
[ARCHITECTURE.md](ARCHITECTURE.md); the checks and CI are [CI.md](CI.md).

## Prerequisites

- **Docker Desktop** with Compose v2. Nothing else is installed natively:
  every service builds its own image, and the checks run in containers.
- **Git** and **make** (it ships with macOS and every Linux).
- **No API key for a model.** The server calls none: its Claude features
  were taken out on 2026-11-12
  ([decision 0041](decisions/0041-claude-taken-out.md)).
- **Xcode and XcodeGen**, or **the Android SDK and a JDK 25** (the Android build's, as the gateway's;
  Gradle fetches a Temurin 25 into `~/.gradle/jdks` itself where there is none),
  only for the phone apps ([NATIVE.md](NATIVE.md), [NATIVE-ANDROID.md](NATIVE-ANDROID.md)).
- **The AWS CLI**, only for a deploy ([README-AWS.md](README-AWS.md)).

## First run

```bash
git clone https://github.com/asdaq-samir/wingtip.git
cd wingtip
make dev
```

`make dev` (`scripts/dev/dev.sh up`) does, in order:

1. Checks that Docker is installed and running, that Compose v2 is there,
   that Docker has 8 GB of memory or more (`WINGTIP_MIN_DOCKER_GB` changes
   the bar) and that nothing else holds ports 8080 and 8025. A failure is
   a line marked FAIL saying what to do, and nothing is started.
2. Makes `.env` from `.env.example` when there is none, and says what to
   fill in: your address in `APP_DEVELOPER_EMAILS` for the developer
   role. Nothing in it is
   required.
3. Builds the images, runs `docker compose up -d --wait` (gateway,
   planner, ingest, weather, db, mailpit, dev-services) and
   waits for every service's health, up to 25 minutes
   (`WINGTIP_WAIT_SECONDS`).
4. Prints the app's address, the API docs, the Mailpit inbox and how to
   sign in. If the wait runs out it shows `docker compose ps` and says
   which log to read.

The first start downloads the FAA's reference data (about a gigabyte) and
takes some minutes before the planner is healthy. Then open
[localhost:8080/app](http://localhost:8080/app). The other commands are in
the [Makefile](../Makefile) (`make` lists them):

| Command | What it does |
|---|---|
| `make doctor` | Steps 1 and 2 alone: changes nothing but a missing `.env` |
| `make stop`, `make down` | Stop the stack, keeping its data; also remove its containers (the database volume stays) |
| `make ps`, `make logs s=planner` | Each service and its health; one service's log, followed |
| `make check` | `scripts/dev/check.sh all-changed`, the quick checks for what the branch changed |
| `make live b=<branch>` | `scripts/dev/go-live.sh`, a branch on the owner's phone stack ([below](#going-live-for-the-owner)) |

The same stack without `make` is `docker compose up -d`. The compose file
fixes the project's name (`wingtip`) and its ports, so two stacks cannot
run on one machine at once; stop the first.

### In a VS Code dev container

"Reopen in Container" builds `.devcontainer/devcontainer.json`: Node 26,
Python 3.15 and Rust 1.100 (`.tool-versions`), the Docker CLI and the
recommended extensions.
It shares the host's Docker (docker-outside-of-docker), so `make dev` and
`make check` start containers beside the dev container, and it mounts the
checkout at its own host path so those containers find its files. It has
no Xcode and no Android SDK; work on the phone apps on the Mac.

### Signing in

The local stack has a mail host, Mailpit, so it runs as a deployment
does: reading is open, and saving needs a session.

1. In the app, choose Sign in and enter an address.
   `developer@example.com` also gets the developer role (the console and
   the training workspace); add your own to `APP_DEVELOPER_EMAILS` in `.env`.
2. Open the inbox at [localhost:8025](http://localhost:8025) and follow
   the sign-in link.

Google and Apple sign-in need credentials of your own and the `oauth`
Spring profile ([services/gateway/README.md](../services/gateway/README.md)).

## Addresses

Every port is on `127.0.0.1` unless `.env` says otherwise (below).

| What | Address | Service |
|---|---|---|
| The app (bare `/app` opens Plan) | [localhost:8080/app](http://localhost:8080/app) | gateway |
| The developer page: training workspace and console | [localhost:8080/app/dev](http://localhost:8080/app/dev) | gateway |
| The gateway's API docs and spec | [/swagger-ui/index.html](http://localhost:8080/swagger-ui/index.html), [/v3/api-docs](http://localhost:8080/v3/api-docs) | gateway |
| Health | [localhost:8080/actuator/health](http://localhost:8080/actuator/health) | gateway |
| The planner's API docs | [localhost:8084/docs](http://localhost:8084/docs) | planner |
| The sign-in inbox | [localhost:8025](http://localhost:8025) | mailpit |
| Jupyter (token `wingtip`) | [localhost:8888](http://localhost:8888) | ml, on request |
| Traces | [localhost:16686](http://localhost:16686) | jaeger, on request |

The apps only ever talk to the gateway; it proxies `/api/planner/*` to
the planner. Port 8084 is for debugging. The database
is never published.

## On a phone, over the Wi-Fi

A phone needs HTTPS for its position and for the route's charts kept
offline, so the gateway also listens on 8443 once it has a certificate.

```bash
infra/local-https/make-certs.sh 192.168.1.42   # this Mac's address on the Wi-Fi
cat >> .env <<'EOF'
PUBLISH_ADDRESS=0.0.0.0
PHONE_BASE_URL=https://192.168.1.42:8443
MAILPIT_UI_AUTH=<user>:<password>
EOF
docker compose up -d
```

- `PUBLISH_ADDRESS` opens the gateway's two ports and the inbox on every
  interface, for a network you trust. Compose refuses to start without
  `PHONE_BASE_URL` (where the sign-in link points) and `MAILPIT_UI_AUTH`
  (the inbox holds sign-in links) once it is set.
- Install `infra/local-https/certs/ca.pem` on the phone once; the script
  prints the steps for iPhone and Android. The authority's own key stays
  in `~/.config/wingtip-local-ca`, out of the repository, and is limited
  to private addresses and `localhost` (`make-certs.sh --new-ca <address>`
  replaces an older one).
- Then open `https://<address>:8443/app`, and add it to the home screen to
  open it as an app. Over HTTPS the map shows your position, and its menu
  keeps the route's charts offline: the service worker holds the chart
  tiles within 10 nm of the course with the course, checkpoints and nav
  log. The briefing and the weather are not kept, since a cached METAR
  could only be shown as if it were current.
- `DEV_PUBLISH_ADDRESS=0.0.0.0` opens Jupyter (8888) too. It has no
  password and runs code. The planner (8084) and the database stay on
  loopback whatever it says: the planner answers without
  sign-in, and its developer routes are checked by the gateway alone, so
  another device reaches it through the gateway.

The top of [`docker-compose.yml`](../docker-compose.yml) lists every such
setting.

### Front-end work without rebuilding the image

```bash
cat >> .env <<'EOF'
COMPOSE_PROFILES=web-dev
WEB_DIST_MOUNT=/app/static/app
EOF
docker compose up -d
```

`web-build` runs `vite build --watch` into `apps/web/dist` and the gateway
serves that folder. Each build is swapped in whole, `index.html` last, so
a phone that loads mid-build never gets half of one
([apps/web/README.md](../apps/web/README.md)).

### Going live for the owner

`scripts/dev/go-live.sh [branch]` puts a branch (by default
`claude/integration`) on the owner's stack for the phone. It runs the
stack from its own worktree, `~/Developer/wingtip-live`, so the main
checkout stays on `main`; links the main checkout's `.env`, certificates
and `data/`; follows the Mac's address if DHCP moved it (a new
certificate and `PHONE_BASE_URL`); rebuilds what changed; and prints the
address when every service is healthy. Where the live tree holds a
phone's engine built before (`apps/ios/Frameworks/WingtipEngine`,
`apps/android/app/engine`) from an older engine than the branch's, it
builds it again (`build-xcframework.sh`, `build-android.sh`, in a turn;
from the shared store in a second or two when another worktree built
that engine, else about a minute), so a phone build from the live tree
never links an engine that lacks the branch's rules.

### The phone simulators

`scripts/dev/simulators.sh [ios|android|both] [--tree <dir>]`, after
`go-live.sh --up`, boots the newest iPhone simulator and an arm64 Android
emulator on the live tree (`~/Developer/wingtip-live` unless `--tree` says
otherwise), builds each app for `localhost:8443` (the gateway's HTTPS port,
above), installs it and launches it. Each heavy step takes a turn of
`one-at-a-time.sh`; each wait has a deadline (`SIM_BOOT_WAIT`, 240 s). It
stops with the next step when the stack does not answer, the certificate is
missing, or there is no simulator runtime, AVD or system image.

- **iOS:** the host is the `WINGTIP_HOST` build setting (`Config.swift`
  reads Info.plist's `WingtipHost`); the local authority goes into the
  simulator with `xcrun simctl keychain <udid> add-root-cert`.
- **Android:** the host is `WINGTIP_HOST` for Gradle (`BuildConfig`);
  `adb reverse tcp:8443 tcp:8443` makes the emulator's `localhost` the
  Mac's, a name the server certificate holds (`10.0.2.2` is not in it).
  The debug build trusts the authority itself: Gradle copies
  `infra/local-https/certs/ca.pem` (or the `wingtipLocalCa` property's file)
  into the debug variant's resources and a network security config
  (`<debug-overrides>`) trusts it beside the system store, so the stock Play
  Store image works with no `adb root`. The release build is unchanged, and
  a build without the certificate (CI's) is the platform's default.

## The jobs and on-demand services

The jobs are behind the `jobs` profile, so `docker compose up` never
starts one. The developer console starts them through `dev-services`,
which can start a container but not create one, so create them once:

```bash
docker compose create retrain charts charts-overlays charts-next
```

| Command | What it does |
|---|---|
| `docker compose run --rm retrain` | The whole training run, every stage in order; each model promoted only if it beats the one serving |
| `docker compose run --rm retrain collect` (or `engineer-features`, `retrain`) | One stage |
| `docker compose run --rm --entrypoint python retrain -m wingtip.model_registry evaluate` | Evaluate or promote by hand |
| `docker compose run --rm charts` | The chart cycle: overlay tiles where due, then the FAA's current cycle fetched, rendered and packed where due |
| `docker compose run --rm charts overlays` | The overlay tiles alone |
| `docker compose run --rm charts pack` | A cycle's loose tiles into archives (a cycle drawn before archives) |
| `docker compose run --rm charts-next` | Stage the FAA's next cycle before its date |
| `docker compose up ml` | Jupyter, for the notebooks ([DATA.md](DATA.md#notebooks)) |
| `TRACING=1 docker compose --profile tracing up -d` | Traces in Jaeger ([Tracing](#tracing), below) |

The planner starts the charts jobs by itself when a cycle is due, inside
`CHARTS_REFRESH_WINDOW` (01:00 to 06:00 by default); `CHARTS_AUTO_REFRESH=0`
and `CHARTS_CYCLE_AUTO=0` turn that off. The training run writes each
stage to `data/models/run.json`, which the console follows; one run at a
time. [services/jobs/README.md](../services/jobs/README.md) has the rest.

## Tracing

One request can be followed end to end in Jaeger: the page's call, the
gateway, the planner, every rule it asks of the engine, every weather
product it reads and every source it fetches. It is off unless asked for, and costs nothing off: no
service makes a span or imports OpenTelemetry, and nothing is sent.
Production sets none of it (`infra/docker-compose.prod.yml`).

Turn it on for the stack and open Jaeger:

```sh
TRACING=1 docker compose --profile tracing up -d   # jaeger, and the services again with tracing on
open http://localhost:16686                        # Jaeger's UI
```

`TRACING=0` (or unsetting it) turns it off again: each service reads
`TRACING` itself, so `0`, `false`, `no` or `off` win even though compose
still passes the endpoint; `docker compose up -d` brings the services back
without it.

What each service sends, over OTLP/HTTP to `jaeger:4318` on the compose
network:

| Service | Spans | Set up in |
|---|---|---|
| gateway | each request (Micrometer Tracing), tagged `wingtip.request_id`; the `traceparent` and `X-Request-Id` on every call to the planner | `management.tracing` in application.yml, `gateway/tracing/` |
| planner | each request (FastAPI) under the gateway's; each rule asked of the engine, `engine <rule>` with `wingtip.engine.rule` and no payload; each weather product read, `weather_store.read`; each source asked with requests; threads and pools kept in the trace | `app/tracing.py` over `wingtip/tracing.py` |
| weather | each product's fetch, `fetch <product>`, a trace of its own, the sources under it | `wingtip/tracing.py` |
| ingest | each round of following airplanes, `follow round`, with its adsb.fi asks | `wingtip/tracing.py` |

Each call the web app makes carries an `X-Request-Id` (`lib/api/requestId.ts`);
the gateway answers with it and writes it on the request's log lines. In
Jaeger, search the gateway's service with the tag
`wingtip.request_id=<id>` to find the trace of a call the page made (the
browser's network panel shows the id). With tracing on, every log line
written inside a span says its trace: the gateway's as `[trace,span,request id]`
after the level, the Python services' as `trace_id=… span_id=…` at the end.

The engine's spans are made only inside a request's or a fetch's, so the
planner's start-up and its background work make no traces of their own,
and the containers' health checks (the gateway's `/actuator`, the Python
services' `GET /`) are left out, so they do not bury the requests.

## The developer scripts

All in `scripts/dev/`, each with its usage at its top.

| Script | What it does |
|---|---|
| `check.sh <area>` or `check.sh all-changed` | The quick checks for a part of the repo (web, py, planner, ingest, weather, jobs, engine, java, ios, android), in Docker, warm from any worktree's first run ([CI.md](CI.md)) |
| `dev.sh doctor` or `dev.sh up` | What `make dev` and `make doctor` run (First run, above) |
| `one-at-a-time.sh "<label>" <command>` | Runs a heavy command (a suite, an image build, a browser run) in one of the turns the swap watcher allows (below), waiting while memory is short; `--alone` takes the whole machine for a measurement |
| `swap-watch.sh`, `install-swap-watch.sh` | Full throttle without swapping: a LaunchAgent that holds the heavy-turn limit as high as the Mac takes (below) |
| `validate-wave.sh` | The end-of-wave validation on `claude/integration`: every check area, the image builds, the `@smoke` browser specs on a throwaway stack, the iPad tests; one table of what passed |
| `go-live.sh [branch]` | A branch on the owner's stack for the phone (above) |
| `simulators.sh [ios\|android\|both] [--tree <dir>]` | The iPhone simulator and the Android emulator, each with the app built for the live stack and launched ([above](#the-phone-simulators)) |
| `tidy-local.sh [--dry-run]` | Removes merged, clean worktrees and branches and stopped scratch containers; never volumes, never a running agent's worktree |
| `tidy-branches.sh [--dry-run]` | Removes the `~/Developer/wingtip-*` worktrees whose commit is on `origin/claude/integration` or `origin/main`, with nothing uncommitted and untouched for six hours (never `wingtip`, `wingtip-live` or a locked one), then deletes local `worktree-agent-*` branches already on `origin/main` |
| `docker-tidy.sh [--dry-run]` | Reclaims Docker disk: images no container uses (`docker image prune -a`), build cache unused for 24 hours, and volumes no container uses except the named caches (`wingtip-cargo-*`, `wingtip-sccache*`, `wingtip-npm*`, `wingtip-format-npm`, `wingtip-m2`, `fp-m2`, `wingtip-check-raw`) and the stacks' own (`wingtip_*`, `fpam_*`, the database among them); never a container; prints the space freed; then `tidy-build-caches.sh` (Shared build caches, below) |
| `backup-db.sh`, `install-backup.sh` | The nightly database dump (below) |
| `install-hooks.sh` | Installs the pre-push hook (tsc and ESLint, ruff, `cargo check`, the formatters, and the generated-file and budget checks CI runs -- `screens.sh --check`, `design-tokens.sh --check`, `toolchain.sh --check`, `file_sizes.py`, `brand_guard.py` -- each for what a push changes) |
| `rename-local.sh` | Once, on a Mac that ran the stack before the rename to Wingtip |
| `mcp_token.py` | A token for the connector (`/mcp`) from the stack's own sign-in, as Claude gets one; the Inspector and Claude or ChatGPT through a tunnel are in [MCP-CONNECTOR.md](MCP-CONNECTOR.md) |

### Full throttle without swapping

The owner's standing rule (2026-11-12): "Make it permanent rule full
throttle while avoiding swapping memory". `scripts/dev/install-swap-watch.sh`
installs a LaunchAgent that runs `swap-watch.sh` from login, for ever. Each
minute it reads the Mac's swap-outs (`vm_stat`) and sets
`ONE_AT_A_TIME_SLOTS` in `~/.config/wingtip/one-at-a-time`:

- **6 turns** while the Mac isn't swapping;
- **3 turns** the moment it writes more than 2,000 pages a minute (about 31 MB) to swap;
- **one turn back** after each 3 calm minutes.

Swap-outs are the signal, not `memory_pressure`'s free percentage, which
counts compressed memory as free: on 2026-11-12 the Mac swapped about
35 MB/s while it read 44% free. Its log is
`~/Library/Logs/wingtip-swap-watch.log`; `--remove` takes it out. The
`SWAP_WATCH_*` settings at the script's top change the numbers.

### The nightly database backup

`scripts/dev/install-backup.sh` installs a launchd agent that runs
`backup-db.sh` at 03:30 every day: `pg_dumpall` of the `db` container into
`~/Developer/branch-backup/db-YYYY-MM-DD.sql.gz`, kept only when it is
whole, the newest 14 kept, hand-named dumps (`db-before-*.sql.gz`) never
touched. Its log is `~/Library/Logs/wingtip-db-backup.log`;
`install-backup.sh --now` runs one at once and `--remove` takes it out.
The server's backups are in [README-AWS.md](README-AWS.md#backups-and-restore).

## The linters and formatters

Installed by [mise](https://mise.jdx.dev), at the version each has in
`.tool-versions`, through one script: `scripts/build/tool.sh <tool> [args]`
(`--have <tool>` asks whether it can be had, `--path <tool>` where it is). Nothing
is installed by hand: the first call fetches mise's release (checked against
its sum in the script) into `~/.cache/wingtip-tools`, and mise fetches the
tool; a copy already on the PATH at the right version is used as it is. CI's
`guards` job calls the same scripts, so a finding is the same on the Mac:

| Tool | Run by |
|---|---|
| shellcheck | `scripts/ci/shellcheck.sh` (`.shellcheckrc`) |
| actionlint, zizmor | `python3 scripts/ci/workflow_rules.py` (`.github/actionlint.yaml`, `.github/zizmor.yml`) |
| lychee | `scripts/ci/check_links.sh` (`lychee.toml`) |
| SwiftFormat, ktlint | `scripts/dev/format.sh swift kotlin` |
| SwiftLint, Semgrep | `scripts/ci/phone_lint.sh ios`, `scripts/ci/semgrep_check.py` |

A tool mise cannot fetch (no network) is a skip on the Mac, a failure in CI.
A bump is a line in `.tool-versions` (Renovate lists the newer ones in its
dashboard issue), then `scripts/build/toolchain.sh --check`; mise's own
version carries its sums in `scripts/build/tool.sh`. The legal pages are
written with markdown-it-py by `scripts/build/legal_pages.py`, which uv
runs with the dependency pinned in its own header.

## Shared build caches

Many agents work at once on the Mac, each in its own worktree, each
building the same apps. What is the same across worktrees is built once
and shared (the owner, 2026-11-10: "make it all efficient and share
resources"), so a worktree that changed ten files compiles about ten
files. Every cache is keyed by content, so two builds at once (the turns
`one-at-a-time.sh` hands out) can share it safely; CI keeps none of them
(`CI` is set there) and `WINGTIP_SHARED_CACHE=0` turns them off on the Mac.

| What | Where | Shared how | Pruned |
|---|---|---|---|
| The engine for each app: the web's `.wasm`, the iPhone's XCFramework, Android's libraries, the planner's wheel | `~/Library/Caches/wingtip/engine/<hash>/<kind>` | `build-engine-wasm.sh`, `build-xcframework.sh`, `build-android.sh` and `check.sh` copy it (an APFS clone) when the hash of `engine/**`, `.tool-versions` and the build script matches; otherwise they build and publish it with one atomic rename. The phones' builds write that hash beside them (`engine.hash`), which `xcodebuild.sh` and `go-live.sh` hold to the checkout's engine | the newest 5 engines kept |
| Rust in Docker (`check.sh engine`, the `.wasm` built in a turn) | volume `wingtip-sccache-turn-<n>`, one per turn of `one-at-a-time.sh`: sccache's disk cache allows one server at a time, and a turn is one build | every worktree is mounted at the same path, so the engine's own crates hit too | sccache's own 10 GB cap per turn |
| Rust in BuildKit (`check.sh`'s wheel) | cache mount `wingtip-sccache-buildkit`, one build at a time (`sharing=locked`) | as above, at `/engine` | 10 GB cap, and BuildKit's prune |
| Xcode | `~/Library/Developer/Xcode/DerivedData/CompilationCache.noindex`, and one DerivedData per turn (`wingtip-turn-<n>`) | `scripts/dev/xcodebuild.sh` (which `check.sh ios` uses): compilation caching with the checkout's and DerivedData's paths mapped out of the keys, in the turn's DerivedData | over 25 GB; DerivedData of removed worktrees removed |
| Gradle | `~/.gradle/caches/build-cache-1`, the daemons and the JDKs in `~/.gradle` | `org.gradle.caching=true` (tasks come `FROM-CACHE`), configuration cache | Gradle's own (7 days) |
| npm, uv, Maven | BuildKit cache mounts `wingtip-npm`, `wingtip-uv`; volumes `fp-m2`, `wingtip-cargo-registry` | by id or name, whatever the worktree | `docker-tidy.sh` keeps them |
| The check images | `wingtip-check-web:<lock hash>` (web's `node_modules` at `/node_modules`), `wingtip-check-py-*:<hash>` | one tag per lockfile, whatever the worktree | the newest tag of each kept |
| Playwright's browsers | the Playwright image (`mcr.microsoft.com/playwright`) | one image, pulled once | `docker-tidy.sh` while no container uses it |
| The stacks' images | BuildKit's layer cache and cache mounts | by content: a worktree's stack (`wingtip-<topic>`) tags its own names on the same layers | `docker-tidy.sh` |

Build the iOS app with `scripts/dev/xcodebuild.sh` and the arguments
you would give xcodebuild: it takes a turn and builds in that turn's
DerivedData with the shared compilation cache, so the same commit in a
second worktree builds from the cache. A changed Swift file compiles its
module again (Swift's cache key is the whole module), the rest is
replayed. It refuses to build against an engine XCFramework made from
another engine than the checkout's (its `engine.hash` against the
engine store's hash of `engine/**`): the app asks its rules by name, so
an old framework links without a word and every screen asking a newer
rule says "the engine has no rule called …". Run
`engine/bindings/ffi/build-xcframework.sh` (a copy from the store when
another worktree built that engine). Plain `xcodebuild`, Xcode itself and
CI are unchanged.

What stays a worktree's own, on purpose: Cargo's target directory (Cargo
judges a crate fresh by its files' mtimes, so a target shared between
worktrees served one worktree's older build of a crate to another,
2026-11-08; sccache's key is the content, so it cannot), and TypeScript's
`tsBuildInfo` and Vite's cache (seconds, not worth a shared cache that
could go stale). Cargo's own content-based freshness
(`-Zchecksum-freshness`) is still unstable in Rust 1.100.

No sccache for the phones' engine on the Mac: Rust's cache key holds the
compile's directory and output paths, which are each worktree's own, and
a second worktree's build of a changed engine had no hits at all. The
engine store spares it whenever the engine is one another worktree built.

Measured 2026-11-10 on the Mac mini, in one `one-at-a-time.sh --alone`
turn, seconds (before: a worktree of `claude/integration`, the same in a
second one; after: this setup, cold, then a second worktree of the same
commit, then one with a Swift and a Kotlin file changed, then one with an
engine file changed):

| Build | Before (1st, 2nd worktree) | After, cold | 2nd worktree | One app file changed | One engine file changed |
|---|---|---|---|---|---|
| Phones' engine (iOS or Android, three targets) | 53, 53 | 53 | 0 | 0 | 53 |
| iOS `build-for-testing` | 32, 30 | 36 | 8 | 28 | 6 |
| Android `assembleDebug` | 25, 27 | 27 | 4 | 22 | 5 |
| Engine `.wasm` | 27, 24 | 26 | 0 | 0 | 23 |
| `cargo test -p wingtip-engine` (Docker) | 19, 20 | 21 | 9 | 9 | 10 |

A changed Swift or Kotlin file still compiles its whole module (the
app's), since that is the unit both compilers cache by.

`scripts/dev/tidy-build-caches.sh [--dry-run]` (run by `docker-tidy.sh` and
`tidy-branches.sh`) keeps them within bounds: the engine store's newest
five engines, the DerivedData and Cargo target volumes of worktrees that
are gone, and anything over 25 GB.

## Gotchas

- **A rebuilt image needs a recreated container.** `docker compose up
  <service>` can reuse the old one; `docker compose up -d --build
  --force-recreate <service>` does not.
- **`data/raw` (about 600 MB and up) stays in `.dockerignore`.** The
  services mount the repository at run time instead.
- **A checkout under iCloud Drive (`~/Desktop`, `~/Documents`) grows
  conflict copies** such as `file 2.ext`, which have broken Flyway's
  migrations and the planner's caches. Keep the checkout elsewhere; if
  one appears, delete the copy and restart the service that held it.
  `.gitignore`'s `* [0-9].*` keeps them out of commits.
- **`Path("s3://bucket/x")` collapses to `s3:/bucket/x`.** Code that
  rejects a remote URI checks the raw string for `://` before making a
  `Path` (`_reject_remote_uri` in `services/planner/wingtip/model_registry.py`).
- **A literal `--` inside an XML comment in `pom.xml`** breaks Maven with
  an opaque "Non-parseable POM".
- **Recent numpy, pandas and pyarrow wheels dropped Intel macOS**, one
  more reason everything runs in Docker.
