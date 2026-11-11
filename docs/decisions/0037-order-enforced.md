# 0037. The order of a wave is enforced, not remembered

- **Date:** 2026-11-11
- **Status:** Accepted

## Context

Decisions 0005 and 0006 set the order of a wave: code changes, a quick
compile, the merge into `claude/integration`, tidy up, the owner's live
stack, and only then the long tests and CI. CLAUDE.md said so, and still,
on 2026-11-11, agents were briefed to run browser checks and take
screenshots before pushing, and test suites were run while fixing, so the
owner waited hours for changes he could have tried on his phone. He asked
for the rule to be permanent, "so even I am not able to ask for anything
else later".

## Decision

The order is enforced by the project's PreToolUse hook
(`.claude/hooks/guard.py`, on the owner's Mac, which every Claude session
and agent there runs under). A long test -- Vitest, pytest, `cargo test`,
Playwright, Gradle's test and connected tasks, `xcodebuild test`,
`mvn test`, `scripts/dev/check.sh`, `scripts/dev/validate-wave.sh` -- is
refused unless the live stack (`~/Developer/wingtip-live`) runs the
current `claude/integration`: the wave merged, tidied and live. Compile
and type checks always pass (tsc, ESLint, `cargo check` and clippy,
Gradle's compile tasks, `xcodebuild build-for-testing`, ruff). A request
in the chat does not lift it; changing the order is an edit to the hook
and to this record, made deliberately.

## Consequences

- An agent's brief never asks it to verify before pushing; it writes its
  tests with the code and pushes after a compile.
- The lead merges, tidies and runs `scripts/dev/go-live.sh` before any
  suite, so the owner tries a change first.
- CI is unaffected: it runs on GitHub, outside the hook.
