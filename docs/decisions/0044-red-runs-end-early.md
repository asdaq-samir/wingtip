# 0044. A red run ends early, a push is judged by what it adds, and the phones gate their own trees

- **Date:** 2026-11-15
- **Status:** Accepted (the owner, 2026-11-15, on the recommendations below: "just do your recommendations")
- **Amends:** 0034 (the tiers), and what #499 made the phones' gate

## Context

The owner, 2026-11-15: "audit how we can make CI smart and minimal so that
it takes no more than 3 mins for a complete CI run", then "how can we make
software development start with CI so that wait times are minimal" and
"make some permanent rules".

The audit read the last 100 runs of CI (12 to 14 November) and the steps of
the slowest:

- 94 were pull-request runs, nearly all the wave's; 69 were cancelled by
  the next push, 21 failed and 4 passed. A full run took 9 to 22 minutes.
- The Linux jobs already ended in 3.3 to 4.2 minutes. The rest was the
  phones' builds: iOS 10 to 21 minutes, Android 5 to 11, on every run,
  since their filters hold `engine/**`, the shared fixtures and
  `design/**`.
- In 19 of the 22 failed runs read, a job had failed within four minutes
  (in 10 of them `api-compat`, within one). Each run then went on 9 to 25
  minutes to a verdict already known.
- The failures opened were quick checks: Prettier, the simplicity ratchet,
  copy-paste, one API break across ten runs, one Vitest assertion.
- The pre-push hook checks most of those and was installed. The Mac mini's
  session logs of the four days before show about 250 of 900 pushes made
  with `SKIP_HOOKS=1` or `--no-verify`, about 200 of the 510 to
  `claude/integration` (counts of commands in logs, so approximate).
  CLAUDE.md told every session how. Run on a clean checkout of the wave's
  head, the hook refused it for two things no pusher could put right: a
  missing Rust toolchain, read as a failure, and another branch's SwiftLint
  finding, since every push was held against `main` and so answered for
  the whole wave.
- The cache store held 10.65 GB of GitHub's 10, 9.5 of it code scanning's,
  so main's build caches were evicted and the phones built from nothing.
  Rule 4 of docs/CI.md already answers that (`codeql.yml`,
  `pr-caches.yml`); it waits on the repository's default CodeQL setup
  being turned off.

## Decision

1. **A red run ends when its Linux jobs do.** `ci.yml`'s `halt` job waits
   for every tier-1 job but the phones' builds and, if one failed, cancels
   the run; "CI passed" then fails at once. Every Linux job still reports,
   so one push can fix all they found. Only a verdict already known is
   dropped: the phones' builds. *Guard:* `test_tiers.py`.
2. **A push is judged by what it adds.** The pre-push hook holds a push
   against the branch it builds on, `main` or the wave's
   `claude/integration`, whichever is nearer, not always against `main`;
   and a tool that is not on the machine is a note, never a failure. The
   wave against `main` is CI's to judge, on its pull request. With that,
   the hook is not skipped: `SKIP_HOOKS=1` and `--no-verify` are for a hook
   that is itself broken, and the push's report says so.
3. **The phones gate their own trees.** A pull request builds an app when
   it changes `apps/ios/**` or `apps/android/**`, generated code included,
   or the app's own workflow. A change to the engine, the shared fixtures
   or the tokens' source alone builds the apps after merge, in their own
   workflows, as before. #499's rule stands for what it was about: a pull
   request that changes an app must compile it.
4. **The web's tests, its build and its generated files each have a
   runner.** `test-web` is three legs (`scripts/ci/web_suite.sh
   tests|build|generated`), so the gate's longest job no longer adds them.
   Running tests and build at once on one runner was tried first and
   measured slower, 264 s against about 150 s in turn (run 43727254429):
   each starved the other of the runner's four cores. The build alone is
   89 s since the wave presses the assets in Brotli at 11 (commit
   c816e78f5; about 30 s before), which is why it does not share a leg
   with the generated files' 78 s.
5. **The guards say what was slow, and have three runners.** `guards.sh`
   prints each check's seconds and the five slowest, so the next cut is
   read off a run. The first such run (43730938912) read: 5.2 minutes for
   a wave's guards, with tsc, ESLint and Prettier beside clippy, cargo
   machete and two Rust builds on four cores, and no Rust cache, the wave
   having changed `Cargo.lock`. So `guards` is three legs, `repo`, `web`
   and `engine` (`PART`), as `test-web` is two.

Taken out as redundant: `npm audit` in `test-web` (advisory, it could not
fail; `dependency-review` covers a pull request's new dependencies) and
the `infra` job's own shellcheck (`guards` runs it over every tracked
script).

## Added the same day, on the owner's word through the lead (Mini3)

"Measure before and after as you did. Keep the PR under about 3 minutes
and keep the ratchet; never raise a budget."

6. **The hook checks the web without Node.** Where the Mac has no Node
   and Docker runs, Prettier and ESLint run on the web files a push
   changes, in check.sh's image: 12 s became about 15 s for a web push,
   3.3 s unchanged for any other. The Mac mini has no Node, and four
   unformatted web files reached CI in the wave for it.
7. **A generated file is checked before the job builds or tests
   further** (docs/CI.md, rule 17).
8. **A conflicted pull request says so**, in one comment
   (`scripts/ci/pr_conflicts.py`): GitHub runs no CI on one, and #579
   sat a day with nothing red on it.
9. **A pull request's own browser specs run on it** (rule 18). As first
   built they gated it, and that is where the three minutes did not
   hold: one changed spec took 4 min 07 s to "CI passed" (#582). No
   budget was raised for it; item 12 settles it.
10. **A red run's summary names each first error and its narrow
    command** (rule 12).
11. **CI autofix only formats.** As first asked it also left alone a
    branch pushed to in the last 30 minutes, which covers nearly every
    failed run, and `format.sh` formats a language's whole tree, so its
    commit could touch files the pull request did not; item 13 settles
    both. Neither it nor the conflict check can run until they are on
    main: `schedule` and `workflow_run` read main's file.

## Settled that evening, on the owner's word

Asked what a smarter, smaller CI would be, the session answered with
eight recommendations, and the owner said: "just do your
recommendations." Items 1 to 3 above stand accepted with that, the
phones' gate among them. The rest:

12. **A pull request's own specs do not gate it.** They run beside the
    gate, red is seen on the pull request and in the run's summary, and
    "CI passed" waits for no browser job. About 2 min 11 s of #582's
    4 min 07 s was the page's build, which any pull request changing web
    code with its spec pays.
13. **The autofix keeps one quiet rule: the branch still ends at the
    commit that failed.** A session that has pushed again has moved it
    on. And it commits only the pull request's own files of those
    `format.sh` laid out.
14. **No job waits for what it does not use** (rule 19). The planner's
    flight-critical test moves from the guards to `test-python`, which
    has the engine's wheel: every guard's leg had waited about a minute
    for it, cold. It still runs on every change but words (the owner,
    2026-11-09). And the build check makes no `.br` or `.gz`: 13 s
    against 47 on the Mac, the first load's bytes the same (1,011,535).
15. **Nothing more is added to CI until 2026-11-29.** This decision's
    pull request adds some 1,500 lines to make CI smaller. Two numbers
    are watched meanwhile, from the runs' list: pull-request runs for
    each pull request merged, and the share of runs that end green (4 of
    100 on 12-14 November).
16. **What moved out of the gate is only worth it while main is green.**
    Main's push and the night were red on 2026-11-15; a red main is
    fixed before anything else lands on it (docs/CI.md, rule 10).

## What it does not do

- **A phone build is not three minutes.** Android's Gradle step alone took
  265 s at its fastest; iOS is budgeted 4 to 6 minutes warm on GitHub's
  runner. Three minutes is the gate without them; a pull request that
  changes an app still waits for its build.
- **Flight-critical stays on every change** (the owner, 2026-11-09). It
  moved between jobs (item 14); it was not narrowed.
- **A draft pull request still runs CI.** Skipping it was proposed and
  dropped: a skipped required check reads as passed, so a draft marked
  ready could merge on it before the real run reported.

## Consequences

- A red wave run costs about four minutes, not ten to twenty.
- A change to the engine or the fixtures that breaks a phone's build or
  unit tests is found after merge, as one `ready` issue, not at the gate.
  The engine's own tests hold the same fixtures, and the generated code a
  contract change makes lands under the apps, which does gate.
- An agent's brief no longer mentions skipping the hook.
