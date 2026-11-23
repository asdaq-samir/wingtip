# 0062. Validation checks each branch early, reruns only what failed, and ends with one full run

- **Date:** 2026-11-22
- **Status:** Accepted (the owner, 2026-11-22: "I think you can make
  validation smart but you didn't do it. This happens over and over
  again.")
- **Amends:** 0054 (a wave's heavy validation on GitHub) and 0005 and
  0006 (one validation at the end of a wave)

## Context

Under decision 0054 a wave's only validation was the whole of it, pushed
to `claude/validate-<wave>` once every branch was merged. Wave 3, on
2026-11-22, went like this:

- No branch was checked until the end, so about 25 failures piled up at
  once. Run 45089884568 had 54 hard-red browser tests (53 file-and-line
  locations) over 13 of its 16 shards, a shard that never started its
  tests, and reds in the engine, wingtip, X-Plane, the guards and both
  phones.
- Each fix round ran the whole wave again to check a few specs: 32 to 36
  minutes a run (runs 45082809822, 45089884568; wave 2's 44962927664,
  44968065738 and 44982811697 were the same), the browser shards 13 to 27
  minutes and the iPad's legs 23 to 32.
- A known red waited out its two-minute timeout twice, once more for its
  retry (`flight-critical.spec.ts:114`: "Test timeout of 120000ms
  exceeded", then again on "Retry #1").
- A run made stale by a newer push ran on: only pushes to the same
  validation branch cancelled each other.

## Decision

1. **Each branch is checked on GitHub as soon as its fix is ready.**
   `scripts/dev/validate-wave.sh --check` pushes it to
   `claude/check-<topic>`. `validate-wave.yml` then runs `ci.yml` as a
   check: the areas the branch reaches and their unit tests, and the
   specs it reaches on the wave's four browser projects, all measured
   against the branch it builds on. That branch is the nearest of
   `claude/wave*`, `claude/integration` and `main`, or a dispatch's
   `base`. Each check is its own concurrency group. The Mac runs nothing
   for it.
2. **A red run is followed by a rerun of what failed.**
   `validate-wave.sh <wave> --failed [<run>]` pushes to
   `claude/validate-failed/<wave>/<run>`. The rerun takes:
   - the jobs that failed or were cancelled in that run, and those the
     commits since reach;
   - the hard reds from each red shard's Playwright summary, on their own
     projects, with no retry (each still has its own timeout), six to a
     shard; a known red's spec that the commits edit or reach runs whole,
     still with no retry;
   - each shard that left no list, run again with the arguments its
     annotation gives;
   - the specs the commits since reach.

   The guards run on every run, since any file reaches them. iOS runs in
   full only when it failed.
3. **Every validation is one concurrency group** (`validate-wave`, with
   cancel-in-progress), so a newer push cancels the older run, whichever
   wave or kind it was.
4. **One full run ends it.** Once the reruns are green, `validate-wave.sh
   <wave>` (or `--full`) runs everything with CI's normal retries. That
   run is the proof the wave's pull request to `main` follows.
5. **Unchanged:** tier 1 stays about three minutes, no timeout is raised,
   no test is quarantined, and a known red still fails its run. It is
   only not retried in a rerun. The night keeps the full suite, the flake
   hunt and the issue.

## Consequences

- A fix round whose reds are in the browser suite, the engine or Python
  takes about 9 to 12 minutes. That is about a minute for `changes` and
  `specs`, then a shard's setup (275 s before the first test on run
  45089884568, most of it waiting for the images), then at most six
  known reds with no retry. A rerun of that run deals its 53 reds and
  its lost shard over 12 shards. Today's rounds took 32 to 36 minutes,
  so each saves about 22 to 25. A round with iOS still red waits on the
  iPad's legs (23 to 32 minutes), as before, but runs nothing else that
  passed.
- Wave 3's fix rounds each reached all 191 specs: `useOpenScreen.ts`
  alone reaches 190. So when a rerun's commits reach half the suite or
  more, only the known reds and the specs the commits edit run, and the
  full run at the end covers the rest. A check that wide runs the
  wave's own 16 shards.
- Reds come in branch by branch, from checks run while the rest of the
  wave is still being written, not all at once at the end.
- `ci.yml` keeps its one `wave` input. `scripts/ci/validation.py` tells a
  wave from a rerun and a check by the branch, and the `changes` job
  passes its outputs to `plan.py` and `browser_specs.py`. Each e2e shard
  now names its Playwright arguments in its annotation, so a rerun can
  repeat a shard that left no list.
- A rerun's branch names the run it repeats. The script deletes the
  wave's earlier rerun branches; their runs are kept.
- A dispatch of `validate-wave.yml` works only once the file is on
  `main`. Until then, pushes are the way in.
