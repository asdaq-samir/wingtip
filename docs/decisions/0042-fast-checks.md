# 0042. Each change runs its own tests; the wave is validated on GitHub

- **Date:** 2026-11-13
- **Status:** Accepted
- **Amends:** 0005, 0006 and 0037 (its 2026-11-12 amendment is retired)

## Context

Decisions 0005, 0006 and 0037 kept every test until the end of a wave: each
branch was only compiled, and the guard refused any test while a branch was
in flight. On 2026-11-13 a day's wave met its tests for the first time in
one CI run. Nearly every failure was in a test written that afternoon and
never run: the floating cards' browser specs, the weather menu's unit test,
and Android's crash on a narrow screen. Each failing browser test also
waited out its full timeout, so the browser shards ran 21 to 35 minutes,
and every fix round meant merge, go live and run it all again. The owner
asked: "make it more practical for fast software development. We have
spent too much time on validation."

## Decision

- **Each change runs its own tests before its push, narrowly:**
  - the unit tests of the files it changed (`vitest <files>` or
    `--changed`, `pytest <paths>`);
  - the crates it touched (`cargo test -p`);
  - the browser specs it wrote or changed (`playwright test <spec>`);
  - the phone test classes it changed (`--tests`, `-only-testing`).

  That is a few minutes, never a whole suite.
- **The guard** (`.claude/hooks/guard.py`) lets a narrow test run at any
  time. It refuses a whole suite only until the live stack runs the
  current `claude/integration` (0037's order: live first). Branches still
  in flight no longer hold anything.
- **The wave's validation runs on GitHub, not the Mac:** the wave's pull
  request with its tier-1 CI (decision 0034), plus the browser specs the
  wave touched. The full browser suite stays the nightly run.
  `scripts/dev/validate-wave.sh` remains for reproducing a failure
  locally; it is no longer the default.

## Consequences

- Most failures are found on the branch that caused them, by the agent
  that wrote the code, in minutes.
- The Mac runs the live stack, the simulators and builds, and no suite for
  validation. The repo is public, so CI minutes cost nothing.
- A brief tells an agent to run its change's own tests narrowly before it
  pushes.
