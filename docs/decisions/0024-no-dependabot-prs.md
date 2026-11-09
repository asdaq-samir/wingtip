# 0024. Dependabot opens no pull requests

- **Date:** 2026-11-09
- **Status:** Accepted

## Context

Its monthly version bumps landed on main in the middle of each wave, against paths and lock files about to change, and each one stalled.

## Decision

Dependencies are updated on a working branch in each wave's end pass, with the full checks. Dependabot's alerts stay on to flag an advisory between passes.

## Consequences

`dependabot.yml` and the auto-merge workflow's Dependabot job are deleted; SECURITY.md says how pins move now.

## Source

The owner, 2026-11-09 (commit efeb841b).
