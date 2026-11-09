# 0008. Warn, never limit

- **Date:** 2026-10-23
- **Status:** Accepted

## Context

A planner that refuses an input is wrong when the pilot in command knows better (14 CFR 91.3).

## Decision

No hard limits anywhere in planning. Going over the airplane's ceiling, into weather or terrain, above oxygen altitude and the like is allowed and shown with a warning tick or label.

## Consequences

Inputs are never clamped or blocked for an aviation reason; the warning carries the reason and its source. A new rule shows a warning and lets the pilot go on.

## Source

The owner, 2026-10-23.
