# 0030. Controls never grow to reach 44 points

- **Date:** 2026-10-22
- **Status:** Accepted

## Context

Enlarging every control to 44 points changed the design the owner had approved.

## Decision

Hit areas are 44 points, but controls keep their stock sizes: a pseudo-element (`after:absolute after:-inset-...`) makes the area, and rows sit at `gap-2` so the areas meet. Verified with `elementFromPoint`.

## Consequences

Layout also holds at the owner's larger Dynamic Type (check at 17.88 and 19.65 px).

## Source

The owner's standing rule; CLAUDE.md, The app on the phone.
