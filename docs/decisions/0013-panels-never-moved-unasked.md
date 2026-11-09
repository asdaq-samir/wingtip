# 0013. A panel or control is never moved to another part of the screen unasked

- **Date:** 2026-10-22
- **Status:** Accepted

## Context

Layout churn (capsules, bottom tab bars, docked tabs) cost the owner time and broke muscle memory.

## Decision

The map's panel is one sheet docked on its edge, with the tabs FPL, Airport, Aircraft and Setup as its first row, at pill, half and full. No panel or control moves to another part of the screen unless the owner says so in the issue, including when swapping in stock components.

## Consequences

Refactors keep each control where it is. A change that needs a move gets an `owner` issue first.

## Source

The owner's standing layout rules; CLAUDE.md, Never.
