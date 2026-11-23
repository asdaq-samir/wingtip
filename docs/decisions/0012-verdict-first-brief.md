# 0012. The Brief opens on its verdict

- **Date:** 2026-11-08
- **Status:** Accepted

## Context

Pilots will not study a brief; every brief, verdict and AI answer must read at a glance.

## Decision

A verdict and at most three one-line actions come first, the Ask field sits straight under them, then the risk in words and the glance cards; the detail is folded under a tap. This applies to every brief and every AI answer.

## Consequences

A new brief section does not push the verdict down, and the actions stay at three or fewer. On the web's Brief (the owner's pick of the Brief audit's option 2, 2026-11-21) nothing stands between the verdict and the findings: what could not be checked is one caution row at their end, the Adverse Conditions (at most three, AIM 7-1-5(b)(1)) come after them, and When to go is at the foot.

## Source

The owner, 2026-11-03 ("look and go") and 2026-11-08 (commit 385ce20a).
