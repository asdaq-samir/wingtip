# 0006. A wave goes live on the owner's stack before any lengthy test or CI

- **Date:** 2026-11-08
- **Status:** Accepted

## Context

The owner tries the work on a phone; waiting for the long validation first delayed the only feedback that matters.

## Decision

"Make all the changes live for me to test after the code changes are done, before any lengthy tests or CI." Once a wave's code is merged into `claude/integration`, `scripts/dev/go-live.sh` puts it on the owner's local stack, run from its own worktree so the main checkout stays on `main`. The Mac is tidied first (`scripts/dev/tidy-local.sh`: "make sure that local is all tidy up during the integration, before it goes live").

## Consequences

The phone's address, certificate and saved data do not change between waves. The validation pass and CI follow the owner's look, not precede it.

## Source

The owner, 2026-11-08 (commits 5dd3d1b5, 6ba2c253).
