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
`warnings_fatal.py` and `workflow_rules.py` fail `guards` (was
`rules-boundary`);
`ci_budget.py` warns on every run; `sources_answer.py` asks the live
sources at night; `nightly_issue.py` and `newest_versions.py` keep one
issue each.

## Consequences

A new spec chooses its tier, a new job gets a budget, a new step longer
than 15 lines goes into a script, and the workflows' total line count
cannot creep back. The browser suite still reaches live sources; recording
them is the follow-up (docs/CI.md, "Live sources").

## Amendment, 2026-11-10: a three-minute gate

The owner's pick on the decisions page, the same day: **"3-minute gate:
browser smoke, images and iPhone UI smoke run after merge."** A pull
request waited for nearly everything, about 8 to 14 minutes. CI now runs
in three tiers ([docs/CI.md, "The tiers"](../CI.md#the-tiers)):

1. **The pull request's gate**, about 3 minutes, what "CI passed" waits
   for: one `guards` job for every quick check (format, lint, tsc, file
   sizes, brand, rules boundary, links, toolchain, the tiers, warnings,
   the workflows' rules, flight-critical), the unit tests the change
   reaches (Vitest's `--changed`, the engine's touched crates and those
   that use them with the contract test, each Python suite's own leg, the
   gateway when Java changed), and the phones' builds when their inputs
   changed: Android compiled, unit-tested and linted, iOS built with its
   unit tests. Dependency review only when a manifest or lock changes, API
   compatibility only when an API document does.
2. **After merge**, main's push, holding nothing: the browser suite's
   `@smoke` and `@flight-critical` shards, the image builds, and the
   iPhone's `CardSmokeTests` (native-ios.yml's own run). A failure opens
   or updates one issue, "Main CI failed (after merge)", labelled
   `ready`, in one write, as the night's does. CodeQL is a workflow of
   this tier (`codeql.yml`, main's push and weekly, no dependency cache)
   since 2026-11-14: GitHub's default setup, kept here at first, ran on
   every pull request push too and filled the cache store (docs/CI.md,
   rule 4); it is switched off in the repository's settings.
3. **The night**, unchanged: everything.

#499's guarantee holds in its new form: a pull request that changes an
app's inputs still builds that app in tier 1. Rule 1 now reads 3 minutes
rather than 10; `test_tiers.py` fails a `ci.yml` out of this shape (a
tier-1 job "CI passed" does not wait for, a slow proof back on the pull
request, an app no longer built, a tier-1 budget over 3 minutes but the
phones'), and `ci_budget.py`'s budgets are tier 1's.

## Source

The owner, 2026-11-10: "how can we make it permanent rule to keep CI
efficient, using cache, non-redundant testing and latest versions and
warnings as errors etc."; and the eleven further rules, the same day:
"Yes". The tiers: the owner's pick on the decisions page, 2026-11-10,
"3-minute gate: browser smoke, images and iPhone UI smoke run after
merge".
