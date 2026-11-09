# 0015. Close goes back one level; no Back buttons

- **Date:** 2026-10-22
- **Status:** Accepted

## Context

Back arrows and close buttons together made the sheet's navigation ambiguous.

## Decision

Anything expanded opens with its title on top and a close at the right that goes back one level. No Back buttons anywhere. The expanded view has a fixed height and scrolls inside; a swipe only goes back; the minimized bar has Share at its left.

## Consequences

A new detail view gets a title and a close, not a Back button.

## Source

The owner's standing UI rule, 2026-10-22.
