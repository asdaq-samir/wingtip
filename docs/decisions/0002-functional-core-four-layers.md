# 0002. Functional core, imperative shell, four layers

- **Date:** 2026-11-03
- **Status:** Accepted

## Context

Several apps need the same answers, and the engine needs to be testable without a network, a screen or a clock.

## Decision

One core every app shares, and a thin shell per app around it (the owner, 2026-11-03). Four layers, each with one job: the engine (rules; no network, no screen, no clock of its own), the planner (works out a flight, fetches data, asks the engine every rule), the Spring Boot gateway (who the pilot is and what they saved), and the apps (get data, keep state, draw, ask the engine the rest). Data comes in at the edges: the planner's endpoints and the cycle packs feed the engine, and the engine never fetches. Each screen is a view and one view model (a hook on the web, an observable model on the phones).

## Consequences

The engine stays pure and is shared by the browser (WebAssembly) and both phones. The shells hold no aviation logic. See [ARCHITECTURE.md](../ARCHITECTURE.md) for the layers and every service.

## Source

CLAUDE.md, Architecture ("the owner, 2026-11-03").
