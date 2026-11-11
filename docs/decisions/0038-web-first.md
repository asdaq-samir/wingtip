# 0038. Web first; the phones on the owner's word

- **Date:** 2026-11-11
- **Status:** Accepted

## Context

A change the owner asked for on the web was built on all three apps at
once (the sheet's carousel, the map's buttons), before he had tried it on
the web, so phone work was done for designs that might change. The owner,
2026-11-11: "First let's make changes to webapp only for poc, then we can
decide on the phones. Make this a hard rule", and "Actually enforce this
rule as well".

## Decision

Every change a pilot sees is made on the web first, as the proof of
concept, and put on the owner's live stack. The iPhone and Android apps
follow only once the owner has said so for that piece of work. Shared code
stays open: the engine, the planner and the files generated into the apps
from them (the engine contract, API models, design tokens, string tables).

It is enforced by the PreToolUse hook (`.claude/hooks/guard.py` on the
owner's Mac): a write into `apps/ios` or `apps/android`, and a merge of a
`claude/<topic>` branch that changes them, is refused unless `<topic>` is
listed in `~/.config/wingtip/phones-approved`, which the lead adds to only
on the owner's word.

## Consequences

- A brief for phone work names its approved topic; without one, an agent
  works on the web.
- Phone branches built before this (`claude/carousel-ios`,
  `claude/carousel-android`) stay pushed and unmerged until the owner
  decides.
- Rules in docs/design/rules.md still describe all three apps; the phones'
  columns may lag the web until approved.
