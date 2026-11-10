# 0034. CI stays lean, and the guards hold it there

- **Date:** 2026-11-10
- **Status:** Accepted

## Context

CI had grown to about fifteen minutes a pull request, with checks run in
two jobs at once (the planner's import contracts in `test` and
`test-planner`), journeys with two `@smoke` tests, specs in no tier,
caches that missed without anyone seeing, logic written only in YAML, and
no record of what a run cost. Each fix held only until the next change
undid it.

## Decision

The rules in [docs/CI.md, "Rules"](../CI.md#rules) are permanent: a pull
request in about ten minutes, each check in one tier and run once, only
what a change touches, everything cached (main and the night save),
newest versions and warnings fatal, pushes batched, and never a timeout
raised to get green. Approved the same day: no flaky tests on the pull
request, no live internet in its tests, a red night fixed first, CI
running the Mac's own scripts, every failure named, each rule tested once
at the lowest level, least privilege, macOS for iOS alone, and small
workflows.

What a script can check, a guard checks: `test_tiers.py`,
`warnings_fatal.py` and `workflow_rules.py` fail `rules-boundary`;
`ci_budget.py` warns on every run; `sources_answer.py` asks the live
sources at night; `nightly_issue.py` and `newest_versions.py` keep one
issue each.

## Consequences

A new spec chooses its tier, a new job gets a budget, a new step longer
than 15 lines goes into a script, and the workflows' total line count
cannot creep back. The browser suite still reaches live sources; recording
them is the follow-up (docs/CI.md, "Live sources").

## Source

The owner, 2026-11-10: "how can we make it permanent rule to keep CI
efficient, using cache, non-redundant testing and latest versions and
warnings as errors etc."; and the eleven further rules, the same day:
"Yes".
