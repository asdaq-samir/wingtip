# 0007. Nothing is in production: break and rename freely

- **Date:** 2026-11-07
- **Status:** Accepted

## Context

No pilot depends on the current names, API fields or infrastructure yet, and compatibility shims cost complexity.

## Decision

Breaking changes (renames, API fields, image and infra names) are fine until the first launch or App Store release. Rename all the way through and keep no compatibility shims.

## Consequences

The gateway, planner and image names changed together (commits 4eb99dd1, 983d0bf8) with nothing left behind. This stops being true at the first launch; revisit then.

## Source

The owner, 2026-11-07.
