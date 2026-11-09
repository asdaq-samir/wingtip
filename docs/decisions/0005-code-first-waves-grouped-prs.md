# 0005. Code first, validate at the end, fewest and grouped pull requests

- **Date:** 2026-11-08
- **Status:** Accepted

## Context

CI waits and per-change validation were eating the working time (and the subscription), and parallel agents kept conflicting on shared files.

## Decision

"All code changes should be fast and all should be tested at the end with the integration branch." Work runs in waves: branches are compile-only checked while coding, merged into `claude/integration`, and validated once at the end (`scripts/dev/validate-wave.sh`), with grouped pull requests and one push each. Parallel work splits by area with each agent's owned files named in its brief, and generated files are rebuilt after the merges rather than hand-merged. Independent pieces start at once, and dependent pieces start on the branch they depend on with `TODO(<branch>)` seams. Heavy runs go through `scripts/dev/one-at-a-time.sh` (two turns at once on the 24 GB Mac mini).

## Consequences

CI never blocks work: new work stacks on open branches. Only quick covering checks run before a push; whole suites, browser tests and image builds are left to the wave's end or CI. Nothing merges red.

## Source

The owner, 2026-11-08 (commits 940894d3, 2222ce54, 8fc70b7d); 2026-11-06 ("work effectively, so CI is not delaying the actual work").
