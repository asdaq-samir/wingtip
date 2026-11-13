# 0004. Spring Boot for accounts, FastAPI and the engine for aviation; services split by job

- **Date:** 2026-11-06
- **Status:** Accepted; its `services/assistant` superseded by [0041](0041-claude-taken-out.md) (2026-11-12)

## Context

The owner kept both server languages rather than rewriting one, and wanted a product, not a showcase. The planner had also grown into one process that fetched weather, ran Claude and held one-off jobs.

## Decision

Spring Boot (`services/gateway`) is who the pilot is and what they saved: accounts, sign-in, records, the public API, scheduled mail. It holds no aviation logic and asks the planner over HTTP for a figure. The planner (FastAPI) works out a flight and asks the engine. On 2026-11-08 the planner was split (#535): `services/weather` fetches aviationweather.gov products, `services/assistant` makes every Claude call (the planner calls no model), `services/ingest` reads the live FAA feeds, and `services/jobs` holds the one-off work (training, chart cycles, overlay tiles).

## Consequences

The apps only ever talk to the gateway, which proxies to the planner and the assistant. Apache Airflow, the model-service container and the briefing agent were removed as showcase weight ("product, not showcase"). Routers meant to move to the gateway are marked `x-gateway`.

## Source

The owner, 2026-11-06 ("product, not showcase") and 2026-11-08 (#535); commits 31dcfd7e, 36b00321, 4920fc02, 7a762e6a.
