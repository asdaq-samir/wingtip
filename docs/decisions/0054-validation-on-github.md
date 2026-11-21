# 0054. A wave's heavy validation runs on GitHub, and waves are small

- **Date:** 2026-11-21
- **Status:** Accepted (the owner, 2026-11-21: "Do everything you can do",
  taking the recommendation below)
- **Amends:** 0005 and 0006 (one validation at the end of a wave), 0037
  (whole suites once the wave is live) and 0042 (the wave validated on
  GitHub by its pull request's tier 1)

## Context

Decision 0042 moved a branch's tests to the branch, narrowly, and the
wave's validation to its pull request's tier-1 CI. The heavy part stayed
on the owner's Mac mini: every area's checks (`scripts/dev/check.sh`), the
browser suite on a copy of CI's stack, both phones' builds and tests, run
by `scripts/dev/validate-wave.sh` through the turn queue. On a 24 GB Mac
beside the live stack and a score of agents, that took hours, swapped,
and restarted the Mac three times on 2026-11-21. The night's full browser
suite on GitHub, ten shards, ran its shards to their half-hour limit. And
the waves had grown to a dozen branches or more, so a red validation was
many changes' failures at once.

The recommendation the owner took: "a workflow you trigger runs the full
browser suite and both phones across many runners on a wave branch, so
validation takes minutes, not hours, and the Mac never swaps. The repo is
public, so minutes are free."

## Decision

1. **A wave's heavy validation runs on GitHub.** The integrator pushes
   the wave's tip on `claude/integration` to `claude/validate-<wave>`
   (`scripts/dev/validate-wave.sh <wave>`). That starts
   `.github/workflows/validate-wave.yml`, which calls `ci.yml` with
   `wave: true`, the same jobs and scripts as every run: every area in
   full, the images built, the browser suite on the phone, desktop and
   WebKit phone projects over 16 shards, the iPhone's build and unit
   tests on macOS, and Android's unit tests, lint and APK. About 20
   minutes. It opens no pull request or issue, promotes nothing, and is
   no pull request's check,
   so tier 1's three minutes are untouched. A push trigger, since a
   dispatch needs the workflow on main first.
2. **The Mac runs only narrow tests and quick checks**: decision 0042's
   list before a branch's push, and a CI failure reproduced with the
   narrow command its job's summary names. `.claude/hooks/guard.py`
   refuses a whole suite on the Mac, live stack or not.
3. **Waves are small:** 3 to 5 branches, merged into
   `claude/integration` and validated within the day, then the wave's
   pull request to `main`.
4. **Unchanged:** never push to main, never force-push; pushing a
   `claude/` branch starts no CI but `claude/validate-*` (this workflow)
   and `claude/native-*` (the phones' own); the live stack for the owner
   once a wave is merged; the full suites with the audits and the flake
   hunt at night.

## Consequences

- A wave's validation takes minutes on runners that cost nothing, and
  the Mac keeps its memory for the live stack, the simulators and the
  agents' builds.
- A red validation is a few branches' failures, read from one run's
  summary (`failure_summary.py`) and annotations, fixed on their
  branches, merged and pushed again to the same branch, which cancels
  the run before it.
- `ci.yml` gained a `workflow_call` input (`wave`) and its scripts an
  event, `wave`, rather than a copy of any job (docs/CI.md, "Validating
  a wave").
- The number: 0053 was taken by the decision on routes outside the
  United States, on its own branches the same day.
