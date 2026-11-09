# 0020. The app says "airplane"

- **Date:** 2026-11-06
- **Status:** Accepted

## Context

The 2026-10-23 audit had picked "Plane" for the pilot's own airplane; the owner reversed it for the FAA's own word.

## Decision

The app's words say "airplane" (the FAA's word), never "aeroplane", and the section is "Airplane". The FAA's own capitalised text is set in sentence case with its codes kept (`faaWords`); raw reports stay as sent.

## Consequences

Copy, comments and docs use "airplane".

## Source

The owner, 2026-10-07 and 2026-11-06 (commit 98b778d6).
