# Wingtip Maps

<img src="docs/brand/mark.svg" width="72" alt="Wingtip Maps: the ownship chevron inside a sectional's dashed airspace ring">

**The map for flying.** Every airport and airspace on the FAA chart, on one map that works like Maps on an iPhone — and, when you go somewhere, the route, the checkpoints you'll see and the nav log.

[![CI](https://github.com/asdaq-samir/wingtip/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/asdaq-samir/wingtip/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Built with Rust, TypeScript and React, Swift, Kotlin, Python (FastAPI) and Java (Spring Boot), on PostgreSQL, Docker and AWS, with the Claude API.

## A planning aid

Wingtip Maps is a planning aid for VFR and IFR flight. It does not replace an official weather briefing (1800wxbrief.com or 1-800-WX-BRIEF), current FAA charts and publications, or the pilot in command's judgement and final authority (14 CFR 91.3, 91.103). Its checkpoints are a model's suggestions: check them against the chart. The app says so on first launch and under Settings, About & limits.

## Quick start

```bash
git clone https://github.com/asdaq-samir/wingtip.git
cd wingtip

docker compose up gateway          # UI + API at http://localhost:8080/app
```

No API key is needed for any of that. The Claude features — the written briefing, checkpoint descriptions, the assistant, all in the `assistant` service — want an `ANTHROPIC_API_KEY` of your own in `.env`; without one they say the model cannot be reached, and nothing else needs it.

Everything else — `ml`, the training run, and the full prerequisite/setup guide — is in [`docs/README.md#getting-started`](docs/README.md#getting-started). No native Python, Node, or Java toolchain is required; every service builds its own image.

## Architecture

![Architecture](docs/architecture-current.svg)

Four layers, each with one job, so a rule is written once and every app
gets the same answer:

| Layer | Where | Its job |
|---|---|---|
| The engine | [`engine/`](engine) (Rust) | Every aviation rule and figure, once: altitudes, winds, runways, fuel, weather limits, Go / No-Go, holds, procedures, a pilot's currency (14 CFR 61.56, 61.57) and 61.109 experience. No network, no screen, no clock. A facade (`wingtip-engine`) over ten domain crates; each rule is a name in `engine/facade/src/call.rs`, JSON in and out, typed by a contract (`engine/contract/engine.schema.json`) the apps' types are generated from. |
| The planner | [`services/planner/`](services/planner) over [`services/planner/wingtip`](services/planner/wingtip) (FastAPI) | Works out a flight: fetches the FAA data, reads the weather the weather service stores, reads the chart and scores its checkpoints with the chart model, and asks the engine every rule. |
| The assistant | [`services/assistant/`](services/assistant) (FastAPI) | Every Claude call: the assistant, the written briefing, the readings in words, the checkpoint notes, the mock oral. Holds the Anthropic key and asks the planner for every figure. |
| The weather service | [`services/weather/`](services/weather) | Fetches the weather on a schedule (METARs, TAFs, advisories, PIREPs, the GFS's winds aloft, GLMP, TFRs, the radar's time) into the store the planner reads, so no pilot waits on a live fetch. |
| Spring Boot | [`services/gateway/`](services/gateway) | Who the pilot is and what they saved: accounts, sign-in, records, the public API, scheduled mail. Holds no aviation logic, asking the planner (which asks the engine) for a figure such as currency, an endorsement's days or an inspection's due date; AC 61-65K's endorsement texts are still Java until #482 moves them. |
| The apps | [`apps/web/`](apps/web), [`apps/ios/`](apps/ios), [`apps/android/`](apps/android) | Get data, keep state, draw (a view model per screen), and ask the engine the rest: the web as WebAssembly, the phones through its C interface. |

Two server languages stay, on that line (the owner, 2026-11-06): the
boundary between them is plain HTTP, merging them would give a pilot
nothing, and Spring is good at identity and persistence. Some rules still
live outside the engine, in the Python, the Java and the apps; issue #482
moves them in, in order.

| Service | Role |
|---|---|
| `gateway` | Spring Boot: accounts, sign-in, the pilot's records, the public API and scheduled mail; serves the React front end and proxies the planner |
| `planner` | FastAPI: works out a flight (charts, checkpoints scored by the chart model in-process, the nav log, weather), the engine inside it |
| `ingest` | The live feeds, read always: the FAA's SWIM feeds (STDDS radar, FNS NOTAMs, TFMS flight plans) and the followed airplanes' adsb.fi rounds, into the SQLite stores on the data folder the planner reads ([`services/ingest/`](services/ingest)) |
| `assistant` | FastAPI: every Claude call (the assistant, the written briefing, the words, the checkpoint notes, the mock oral) over the planner's figures, behind the gateway at the same `/api/planner/...` addresses |
| `weather` | The weather the planner reads, fetched on a schedule into the weather store (`data/raw/weather`) |
| `db` | PostgreSQL — application data |
| `retrain` | The training run (`python -m wingtip.pipeline run`), a one-off job (`services/jobs/retrain`), which the developer console starts |
| `charts` / `charts-overlays` | The charts job (`services/jobs/charts`): a new FAA chart cycle rendered and packed into one archive per kind, and the map's overlay tiles, which the planner starts when due; the planner only serves them |
| `ml` | Jupyter environment for model development -- on demand: `docker compose up ml` |

`docker compose up` starts the services; the jobs run when they are due ([`services/jobs/README.md`](services/jobs/README.md)). Full write-up, including the AWS target architecture, is in [`docs/README.md`](docs/README.md).


## Under the hood

**A production-shaped platform that plans VFR and IFR cross-country flights end to end** — a trained model picks visually identifiable ground checkpoints off a real FAA sectional chart, a dead-reckoning engine computes headings, groundspeed, ETE, and fuel burn from live weather, a rules engine selects a legal cruising altitude from terrain, airspace, and weather constraints, and Claude, called from the planner with the Anthropic SDK, turns all of it into a natural-language pilot briefing.

Demo route: **Campbell Airport (C81)** → **Duluth International (KDLH)**.

- **Checkpoints a pilot can see on the chart.** Candidates come from OpenStreetMap and the FAA's own data along the corridor, and a model trained on ratings made against the sectional scores which ones a pilot could actually spot. Picks made on the chart itself in the training workspace — where a chart-vision detector reads features straight off the sectional's raster tiles — become training labels for the candidates they land on.
- **scikit-learn model selection.** Each retrain grid-searches Ridge, Random Forest and Gradient Boosting against a predict-the-mean baseline on the same feature set, by 5-fold cross-validation, and keeps the best; the planner scores checkpoints with the promoted model. Notebook 03 adds nested cross-validation and permutation importance.
- **A repeatable training run.** One command (`python -m wingtip.pipeline run`, the retrain job, which the developer console's Retrain starts as a container) runs collection, feature engineering, training, evaluation, and promotion in order; a new model goes live only if it beats the currently deployed one on held-out metrics.
- **FAA-accurate flight planning.** Dead-reckoning legs (wind correction angle, true/magnetic heading, groundspeed, ETE, fuel burn) from live NOAA winds-aloft and magnetic-declination data. Cruising-altitude selection accounts for terrain/obstacle clearance (FAA MEF methodology), live Class B/C/D airspace, and current METAR/TAF/SIGMET data.
- **Checklists and the passenger briefing, free and on the device.** Each airplane's normal and emergency checklists are the pilot's own, written from its handbook (the app ships headings only, never a maker's text), kept on the phone or in the browser and read by the shared engine; in flight an EMER button opens the emergency list in one tap. The passenger briefing follows the FAA's SAFETY briefing, citing 14 CFR 91.107(a) for the belts, and sends the passengers the flight in a few lines.
- **In the air, on both phones.** At flying speed the iPhone and Android apps show the flight's instruments over the map -- groundspeed, track, GPS altitude and vertical speed; on the route the next waypoint's distance, time and desired track, the distance off course and the destination's arrival with the fuel the plan leaves -- with the alerts ahead (airspace, TFRs, terrain) on screen and spoken, a dashed still-air glide ring over the ground under the airplane, Nearest one tap away, and own ship on the FAA's airport diagram, placed by the diagram's own latitude and longitude marks. Every figure is the engine's (`in_flight`, `vertical_speed`, `glide_ring`, `diagram_graticule`), and each screen says it is a planning aid, not for navigation. FIS-B weather from a cockpit ADS-B receiver is still to come (#218).
- **Claude in a service of its own.** The written briefing, the checkpoint descriptions, the plain-words readings and the pilot's assistant are each a direct call through the Anthropic Python SDK from `assistant`, over the planner's own figures: the briefing streams as it is written (`POST /api/briefing/narrative`), and the assistant runs the SDK's tool runner over the planner's HTTP API.
- **A cheap path to production.** One server behind CloudFront runs the gateway, the planner, the ingest, assistant and weather services and Postgres, and a Fargate Spot task (the charts job) draws each 56-day chart cycle once into S3, one archive per kind, which the planner reads tiles from and the edge caches: about $27 a month with the server on Spot capacity, in one CloudFormation template ([`docs/README-AWS.md`](docs/README-AWS.md) has the design, the cost and the runbook).


## Project layout

| Path | Contents |
|---|---|
| [`apps/web/`](apps/web) | The web app: React 19, TypeScript and MapLibre |
| [`apps/ios/`](apps/ios) | The native iOS app: SwiftUI over the shared Rust engine (docs/NATIVE.md) |
| [`apps/android/`](apps/android) | The native Android app: Kotlin, Compose and MapLibre over the shared Rust engine (docs/NATIVE-ANDROID.md) |
| [`engine/`](engine) | The shared Rust engine: every aviation rule once, in ten crates (`crates/`) behind one facade (`facade/`), its contract (`contract/`), and its Python, C and WebAssembly faces (`bindings/`) |
| [`services/planner/`](services/planner) | The planner: its HTTP layer (`app/`, FastAPI: route planning, chart vision, the chart model, the assistant), its Python package (`wingtip/`: data, charts, pipeline, model registry, and the nav log until it moves into the engine), and both their test suites (`tests/`, `tests_wingtip/`) |
| [`services/ingest/`](services/ingest) | The live feeds (SWIM, the followed airplanes), split from the planner (#535): written into the stores the planner reads |
| [`services/assistant/`](services/assistant) | Every Claude call, over the planner's figures (FastAPI) |
| [`services/weather/`](services/weather) | The weather service: the scheduled fetch of the weather the planner reads, into the weather store |
| [`services/gateway/`](services/gateway) | Accounts, sign-in, the pilot's records, the public API (Spring Boot) |
| [`services/jobs/`](services/jobs) | The one-off jobs, an image each: `retrain/` (the training run) and `charts/` (a chart cycle's tiles as archives, the overlay tiles) |
| [`services/Dockerfile.base`](services/Dockerfile.base) | The Python base every image that imports wingtip is built from |
| [`ml/`](ml) | The notebooks and their image |
| [`infra/`](infra) | AWS CloudFormation, the production server's files and compose file, CI's compose file, the local HTTPS certificates, the rehearsal, the dev-services sidecar and the load tests |
| [`scripts/`](scripts) | `build/` (the engine's WebAssembly, the phones' generated models), `ci/` (the flaky-test report), `dev/` (the checks, the hooks, one-at-a-time, tidy-branches) |
| [`docs/`](docs) | Full documentation, AWS deployment guide, architecture diagrams |

## Documentation

| | |
|---|---|
| [`CONTRIBUTING.md`](.github/CONTRIBUTING.md) | How to run it, where a change goes, the checks, and how a change lands |
| [`docs/README.md`](docs/README.md) | Architecture, service reference, data design, developer guide |
| [`docs/README-AWS.md`](docs/README-AWS.md) | AWS target architecture and deployment |
| [`docs/CI.md`](docs/CI.md) | What CI runs and when, and how to run it on the Mac mini |
| [`docs/GOOGLE-MAPS.md`](docs/GOOGLE-MAPS.md) | The map's overlays over the chart: the USGS's imagery, and Google's map and satellite with the owner's key |
| [`docs/TV.md`](docs/TV.md) | The TV apps for Samsung (Tizen) and LG (webOS), parked: the site made for a remote, and the shells deleted 2026-11-07 (in git history) |
| [`docs/NATIVE.md`](docs/NATIVE.md) | The native iOS app: SwiftUI over the shared engine, its rules and fixtures, and its build and tests on the macOS runner |
| [`docs/NATIVE-ANDROID.md`](docs/NATIVE-ANDROID.md) | The native Android app: Compose and MapLibre over the shared engine, its build and emulator tests on the Linux runner |
| [`docs/LEARNING-GUIDE.md`](docs/LEARNING-GUIDE.md) | Guided walkthrough of the system, section by section |

## License

[`LICENSE`](LICENSE)
