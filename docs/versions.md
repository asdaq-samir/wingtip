# Versions: what each part runs, the rules, and what is next

What every part of Wingtip pins today, the rules a version follows, the
upgrades already known to be coming and what each one waits on, and how
an upgrade lands. Checked against the files on 2026-11-10; the files win
where this page and they differ, so correct the page in the same commit
as a bump.

## The rules

The owner, 2026-11-09, standing:

- **Newest, always, majors too.** Every toolchain, image, library and
  Action is on its newest stable release, checked that day against the
  project's own release page, the installed SDK or its registry (PyPI,
  npm, Maven Central, Google Maven), never from memory. "Yes definitely
  do it, don't even ask": an upgrade needs no approval; it is reported
  after. Anything held back is listed below with the reason.
- **Warnings are errors** in every toolchain: tsc, ESLint
  (`--max-warnings 0`), Vite and vitest, ruff, Python tests under
  `-W error`, Rust (`-D warnings`, clippy), Swift
  (`SWIFT_TREAT_WARNINGS_AS_ERRORS`, Swift 6 mode), Kotlin
  (`allWarningsAsErrors`) and Android lint, Java (`-Werror`). Staying on
  the newest is how deprecation warnings are kept away; a suppression
  needs a comment saying why the cause cannot be fixed.
- **One version of each toolchain everywhere**: the Mac, every Docker
  image and CI read [`.tool-versions`](../.tool-versions). The places that
  cannot read a file (a Dockerfile's `FROM`, the pom, the Gradle files,
  `rust-toolchain.toml`, `.nvmrc`, the dev container, the docs) are
  written from it by `scripts/build/toolchain.sh`, and
  `scripts/build/toolchain.sh --check`, in CI's architecture job, fails
  on any place that differs.
- **The platform's own component, even in a release candidate**, never a
  copy of our own, and bumped to stable when it ships (decision
  [0016](decisions/0016-stock-components.md)). Android's Material 3
  1.5.0-rc01 and AppFunctions 1.0.0-rc01 are on that rule.
- **Exact pins.** Python requirements pin `==`, the web's lockfile is
  committed, every image is pinned by digest beside its tag, and every
  GitHub Action is pinned to its newest release's commit with the
  release in a comment. No bot opens pull requests (decision
  [0024](decisions/0024-no-dependabot-prs.md)): Renovate only lists, in its
  dashboard; Dependabot's alerts stay on.

## What each part pins today

### Toolchains (`.tool-versions`)

| Tool | Version | Read by |
|---|---|---|
| Java | Temurin 25 (`temurin-25`, the LTS) | the gateway (pom `java.version`, `maven:3.10-eclipse-temurin-25`, `eclipse-temurin:25-jre`) and Android (Gradle's daemon JVM, Java 25 bytecode) |
| Python | 3.15.2 | every service and job image (`python:3.15-slim`), CI's setup-python, the dev container |
| Rust | 1.99.1, edition 2024 | `engine/rust-toolchain.toml`, every engine crate, the WebAssembly build |
| Node | 26 | `apps/web/.nvmrc`, the web build (`node:26-slim`), CI |
| Gradle | 9.9.1 | `apps/android/gradle/wrapper/gradle-wrapper.properties` |
| Maven | 3.10.0 | the gateway's build image |
| Xcode | 27.2 (the iOS 27.2 SDK) | `scripts/ci/select-xcode.sh`, CI's `xcode-27` runner and the Mac mini |
| Debian | trixie | every Debian-based image (`postgres:18-trixie`; a `-slim` tag is trixie) |
| Formatters | ruff 0.17.4, SwiftFormat 0.64.6, ktlint 1.8.0, palantir-java-format 2.103.0, Prettier 3.9.10 | `scripts/dev/format.sh` (SwiftFormat and ktlint installed by mise) |
| Linters | shellcheck 0.11.0, actionlint 1.7.12, zizmor 1.32.0, lychee 0.24.2, SwiftLint 0.65.1, Semgrep 1.185.0; mise 2026.11.7 installs them | `scripts/build/tool.sh`, CI's `guards` job, the pre-push hook |

Not held to `.tool-versions` on purpose (`scripts/build/toolchain.py`
says why): ruff's `target-version` and the engine wheel's `abi3-py311`
floor say the oldest Python the code reads on, not the one it runs on.

### Web (`apps/web/package.json`, its lockfile)

React 19.3.1, Vite 8.3.7, TypeScript 6.0.3, React Router 8.5.1
(`react-router`; `react-router-dom` went with v8), Base UI 1.9.0
(`@base-ui/react`) under shadcn 4.23.0 in its `base-vega` style
(`components.json`, neutral base), React Aria 3.53.1 and React Aria
Components 1.22.1 (date, time and number fields, drag and drop, long
press), Tailwind CSS 4.3.5, MapLibre GL 6.17.0, TanStack Query 5.107.1
and Table 9.3.1, zod 4.6.7, ESLint 10.14.0 with typescript-eslint
8.72.2, vitest 5.1.0, knip 6.44.2, Playwright 1.65.0 (CI's image
`mcr.microsoft.com/playwright:v1.65.0-noble`).

### iPhone, iPad and Watch (`apps/ios/project.yml`)

Built with Xcode 27.2 against the iOS 27.2 SDK; deployment target iOS
26.0 and watchOS 26.0 (the owner's rule: the newest APIs, the floor raised
when they need it; only iOS 27 features sit behind `#available`); Swift 6
language mode with complete strict concurrency.

### Android (`apps/android/gradle/libs.versions.toml`)

AGP **9.6.0-alpha03** (its built-in Kotlin compiles the app), Kotlin
**2.5.0-RC**, KSP 2.3.13, the Compose alpha BOM (`compose-bom-alpha`)
2026.11.00, which carries Material 3 **1.5.0-rc01** (for Material 3
Expressive) and Material adaptive 1.4.0-alpha03 with its Navigation 3
scenes, Navigation 3 **1.3.0-alpha04**, Lifecycle **2.12.0-alpha05**,
Activity 1.14.0-alpha03, Hilt (Dagger) 2.60.1 with AndroidX Hilt 1.4.0,
Room 3.0.3
(`androidx.room3`), DataStore 1.3.0, WorkManager 2.12.0, Glance 1.2.0,
MapLibre Android 13.7.1, OkHttp 5.5.1, AppFunctions 1.0.0-rc01, ML Kit's
Prompt API (`genai-prompt`) 1.0.0-beta5. compileSdk 37 (its 37.2 minor
SDK), targetSdk 37, minSdk 26.

### Servers (`services/*/requirements*.txt`, `services/gateway/pom.xml`)

- **Gateway:** Spring Boot 4.1.2 on Java 25, Maven 3.10.
- **Planner, weather, ingest, assistant, jobs:** Python 3.15 with FastAPI
  0.162.2, pydantic 2.14.3, uvicorn 0.54.0, numpy 2.5.4, pandas 3.1.1,
  shapely 2.2.0, pyproj 3.8.0, rasterio 1.5.2, scikit-learn 1.9.1, the
  Anthropic SDK 2.8.0, pytest 9.2.0; the engine's Python binding on PyO3
  0.30.1.
- **Images the stack runs:** PostgreSQL 18 (`postgres:18-trixie`), Caddy
  2.11.9, Mailpit 1.33.1, Jaeger 2.23.0.

### Machine learning (`ml/requirements-ml.txt`)

scikit-learn only (decision [0027](decisions/0027-scikit-learn-only.md)):
scikit-learn 1.9.1, matplotlib 3.11.2, Pillow 13.0.0, folium 0.20.0,
Jupyter 1.1.1, over wingtip's own list, on Python 3.15 like every other
image. Nothing here is held back today: the notebooks' image was held on
Python 3.13 for TensorFlow, and that hold went with the PyTorch,
TensorFlow and Spark notebooks on 2026-11-06 (`ml/Dockerfile.ml`).
PyTorch comes back only in an image of its own, for vision or speech,
and only if it ships wheels for the Python in `.tool-versions`; if it
does not, that image is the one place allowed to lag, with the reason
written here.

## Held back, and why

| What | Pinned | Newest | Why it waits | Moves when |
|---|---|---|---|---|
| TypeScript | 6.0.3 | 7.x | typescript-eslint 8.72 supports TypeScript below 6.1 only ([its support range](https://typescript-eslint.io/users/dependency-versions/)), and openapi-typescript 7.13, its newest, asks for 5.x (let onto 6 by an override in package.json); on 7 neither the lint nor `npm run types` would run (commit dd9dae944, 2026-11-09) | typescript-eslint declares TypeScript 7, and openapi-typescript runs on it |
| Material 3 (Android) | 1.5.0-rc01 | 1.5.0-rc01 (1.4.0 the newest stable) | Not held back: the release candidate is taken on purpose, as 1.4.0 keeps Expressive internal (decision 0016); it comes from the alpha BOM since 2026-11-12 | 1.5.0 stable ships |
| Java | 25 (LTS) | 27 (non-LTS, September 2026) | The gateway and Android stay on one Java, the LTS the owner named on 2026-11-09 ("Java 25 everywhere"), which AGP's D8 and Spring Boot 4.1 both take | The next LTS, or the owner's word |
| CI's Android emulator | API 35 x86_64 | API 37 | The instrumented tests' emulator image (`native-android.yml`); the app itself compiles against 37.2 | No reason is recorded: try API 37 at the next pass that touches the job |

## Planned upgrades

| When | Upgrade | Blocked by | Source |
|---|---|---|---|
| 2026-11-12 | Rust 1.100.0 (`.tool-versions`' `rust`) | Nothing: bump on release, rebuild the `.wasm` | [releases.rs](https://releases.rs/) |
| 2026-11-19 | Spring Boot 4.2.0 (and 4.1.3 the same day) | Nothing known; its milestone is due that day | [spring-boot milestones](https://github.com/spring-projects/spring-boot/milestones) |
| When Google ships it | Material 3 1.5.0 stable (rc01 since 2026-11-04; beta02 was 2026-10-21) | Google's release; then `material3` may go back on the BOM if the BOM carries 1.5.0 | [Compose Material 3 releases](https://developer.android.com/jetpack/androidx/releases/compose-material3) |
| When Google ships it | AppFunctions 1.0.0 stable; ML Kit Prompt API out of beta | Google's releases | [docs/android-ai.md](android-ai.md) |
| When the tools accept it | TypeScript 7 | typescript-eslint and openapi-typescript (above) | [typescript-eslint](https://typescript-eslint.io/users/dependency-versions/) |
| 2026-12-24 | Rust 1.101.0 | Nothing | [releases.rs](https://releases.rs/) |

Each wave's end pass also runs `npm outdated`, the Python pins against
PyPI, `./gradlew` dependency updates and the Maven versions against
Maven Central, and takes whatever is newer; this table is only what is
already known to be coming.
Renovate's Dependency Dashboard ("Newer versions (Renovate dashboard)",
`renovate.json`) lists them between passes, with the pinned Actions' newest
commits. It is dashboard only: it opens no pull request and merges nothing
unless the owner ticks an update in that issue. The holds above are rules in
`renovate.json` (TypeScript below 7, Java 25), so they are not listed as new.

## How an upgrade lands

1. **A toolchain** (Java, Python, Rust, Node, Xcode, Gradle, Maven,
   Debian, a formatter): change its line in `.tool-versions`, run
   `scripts/build/toolchain.sh` (it rewrites the images' tags and
   digests, the pom, the Gradle files, `rust-toolchain.toml`, `.nvmrc`,
   the dev container and the docs that name it, and prints any step only
   another tool can do, such as `./gradlew updateDaemonJvm`), then
   `scripts/build/toolchain.sh --check`.
2. **A library**: change its pin where it lives (`apps/web/package.json`
   with `npm install`, `services/*/requirements*.txt`,
   `services/gateway/pom.xml`, `apps/android/gradle/libs.versions.toml`,
   `engine/*/Cargo.toml`), and the lockfile with it.
3. **Regenerate what comes from it**, never by hand: the engine contract
   (`cargo run -p wingtip-contract-gen`), the web's types (`npm run
   types`), the phones' engine calls (`scripts/build/engine-contract-apps.sh`)
   and API models (`scripts/build/api-models-apps.sh`), the assistant's
   client (`scripts/build/assistant-client.sh`), the OpenAPI documents
   (`python -m app.openapi`, `WRITE_OPENAPI=1 mvn -B test`), the design
   tokens (`scripts/build/design-tokens.sh`) and the `.wasm`
   (`scripts/build/build-engine-wasm.sh`).
4. **Check** the areas it touches with `scripts/dev/check.sh <area>`
   (CLAUDE.md's table; warnings fail them), then
   `scripts/dev/format.sh --check`, `python3 scripts/ci/file_sizes.py` and
   `scripts/build/toolchain.sh --check`.
5. **Commit** with what moved from what to what, why anything stayed, and
   the checks that passed; update this page in the same commit.
