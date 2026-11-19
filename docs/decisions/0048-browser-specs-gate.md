# 0048. The browser specs a change reaches gate its merge

- **Date:** 2026-11-19
- **Status:** Accepted (the owner, 2026-11-19: "Make it a hard rule so we
  don't waste time")
- **Amends:** 0034 (the tiers), 0042 (validation on CI) and 0044's rule
  that a pull request's own specs run beside the gate

## Context

The web audit wave (#585) ran three days of redesign (the FPL timeline,
selection, labels, the sheet) with no browser test. A spec ran on a pull
request only when its own file changed, and the wave changed few spec
files, so almost none ran; "CI passed" did not wait for those that did.
At the end the browser suite found about 25 app bugs: focus lost, the
camera's follow racing a new route, a tap opening the wrong line, figures
sliding off at the pill. It took two rounds to fix them, and #585 merged
with three specs still red, which #586 put right. Each bug would have been
a fix of minutes on the day it was written.

## Decision

1. **A pull request runs every browser spec its change reaches, and "CI
   passed" waits for them.** `apps/web/scripts/reached-specs.mjs` follows
   each changed file to the specs whose screens it draws or feeds: the
   source files that hold a spec's test ids (in the spec or the helpers
   it imports), and what those import, within the features they are in,
   by dependency-cruiser's graph. A changed spec or helper reaches the
   specs that import it. A change the graph cannot place (the page's
   HTML, the styles, the build's config, the packages, the tokens, an API
   document) runs the `@smoke` set. CI's `specs` job runs it; `e2e` runs
   what it chose, on the phone project, three a shard and ten shards at
   most. *Guard:* `scripts/ci/test_tiers.py`.
2. **Each branch passes the specs it reaches before it is pushed.**
   When a piece's code is done, `scripts/dev/branch-specs.sh` builds the
   branch's page, serves it beside the local stack (the API passed to the
   gateway on :8080; `scripts/dev/go-live.sh --up` starts it) and runs the
   specs its change reaches against the branch it builds on, on the phone
   project with CI's waits, in a turn of `one-at-a-time.sh`. A pass is
   recorded against the commit's tree, and the pre-push hook refuses a
   push that changes the web app without one for the tree it pushes. A
   change that reaches more than 30 specs (shared ground such as
   `lib/text.ts` reaches all 167) runs the `@smoke` ones among them here,
   and the rest on the pull request. One
   spec took 85 seconds, the packages' first install among them
   (2026-11-19). The wave's own branch, `claude/integration`, answers on
   its pull request instead. This is the end of the piece, not coding
   time: the owner's rule of no browser run while coding (2026-11-14)
   stands, and the order (all code, then merge, then live, then validate)
   is unchanged.
3. **A red spec is fixed, never moved.** Moving a spec to
   `test_tiers_nightly.txt`, skipping it, or loosening what it checks so
   a pull request passes is raising a baseline: the app or the spec's
   setup is fixed, as #586 did.
4. **A red night is fixed first**, as docs/CI.md's rules already say. The
   nights of 16 to 18 November were red with their shards at the 30-minute
   limit, and no one acted on it.

## Consequences

- A pull request that changes the web app takes the browser run's 6 to 15
  minutes rather than three; about half of the web's files reach every
  spec (a sample of 53, 2026-11-19: 29 reached all 167), so a wave's pull
  request runs nearly the whole suite on the phone project. One that
  leaves the web app alone is unchanged.
- The Mac runs the specs a piece reaches once, when its code is done, and
  never a whole suite (decision 0042); CI runs them again on the pull
  request.
- A spec that asks for no test id is followed nowhere, so any web change
  runs it. Such a spec costs every pull request; give it a test id.
