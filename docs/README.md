# The docs

Every doc in the repository, one line each on what it is for. Start with
the [README](../README.md), then [ARCHITECTURE.md](ARCHITECTURE.md).
Each fact lives in one doc; the others link to it.

## The system

| Doc | Read it for |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | The four layers, every service and its port, the shared stores, feed health, outside sources, the tech stack |
| [DATA.md](DATA.md) | The database and its migrations, the data folder, the chart model and the notebooks |
| [LOCAL-DEV.md](LOCAL-DEV.md) | Running the stack, signing in through Mailpit, the phone over HTTPS, the jobs, the developer scripts, the nightly backup, gotchas |
| [CI.md](CI.md) | What CI runs and when, every job and test suite, what gates a merge, flaky tests |
| [README-AWS.md](README-AWS.md) | The AWS design (not deployed yet), its cost, the first deploy and running it |
| [LEARNING-GUIDE.md](LEARNING-GUIDE.md) | Why it is built this way, concept by concept, to build something like it yourself |
| [privacy-inventory.md](privacy-inventory.md) | What the app collects, what leaves the device, and the stores' privacy forms |

## Each part

| Doc | Read it for |
|---|---|
| [engine/README.md](../engine/README.md) | The Rust engine's crates, the contract, and the steps to add a rule |
| [services/planner/README.md](../services/planner/README.md) | The planner: every endpoint, the chart tiles and cycle, learning FastAPI from it |
| [services/planner/wingtip/README.md](../services/planner/wingtip/README.md) | wingtip, the planner's Python package, module by module |
| [services/ingest/README.md](../services/ingest/README.md) | The live feeds: what each SWIM feed sends and how the live store is shared |
| [services/weather/README.md](../services/weather/README.md) | The weather service: products, schedule and health |
| [services/assistant/README.md](../services/assistant/README.md) | Every Claude call: endpoints, models and settings |
| [services/jobs/README.md](../services/jobs/README.md) | The one-off jobs: the training run, the chart cycle, the overlay tiles |
| [services/gateway/README.md](../services/gateway/README.md) | The Spring Boot gateway: sign-in, records, the package map |
| [apps/web/README.md](../apps/web/README.md) | The web app: its layout, the fast test loop, the map |
| [NATIVE.md](NATIVE.md) | The iPhone, iPad and Apple Watch app: SwiftUI over the engine, its build and tests |
| [NATIVE-ANDROID.md](NATIVE-ANDROID.md) | The Android app: Compose and MapLibre over the engine, its build and tests |

## The product

| Doc | Read it for |
|---|---|
| [APP-STORE.md](APP-STORE.md) | The App Store listing, privacy answers and review notes |
| [GOOGLE-MAPS.md](GOOGLE-MAPS.md) | The map's imagery under the chart: the USGS's, and Google's with the owner's key |
| [TV.md](TV.md) | The TV apps (parked): the site's remote-control mode and the deleted Tizen and webOS shells |
| [brand/](brand) | The mark and the brand's files |

## Contributing

| Doc | Read it for |
|---|---|
| [CONTRIBUTING.md](../.github/CONTRIBUTING.md) | Where a change goes, the checks, and how it lands |
| [SECURITY.md](../.github/SECURITY.md) | Reporting a vulnerability, and how dependencies are kept current |
| [CODE_OF_CONDUCT.md](../.github/CODE_OF_CONDUCT.md) | The Contributor Covenant |
| [CLAUDE.md](../CLAUDE.md) | The rules every Claude session works by |

## The diagrams

[`architecture-current.drawio`](architecture-current.drawio) and
[`architecture-aws.drawio`](architecture-aws.drawio) are the sources of
the two `.svg` files beside them. A change that adds, removes or renames
a service, crate, app or outside source edits the `.drawio` and
re-exports the `.svg` with the `rlespinasse/drawio-export` image (run
through `scripts/dev/one-at-a-time.sh`).

The links in every doc are checked in CI (`scripts/ci/check_links.py`).
