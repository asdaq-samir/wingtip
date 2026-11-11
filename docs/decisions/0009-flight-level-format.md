# 0009. Altitudes are FL-045 on cruise controls and FL045 on the map

- **Date:** 2026-10-20
- **Status:** Accepted

## Context

The FAA writes flight levels only at and above 18,000 ft; the owner prefers one format everywhere.

## Decision

FL everywhere, knowingly against FAA usage: cruise-altitude controls are written FL-045 (since 2026-10-27), and the map's weather says FL045 (2026-11-06, "Keep FL for now"). VoiceOver and the planner stay in feet.

## Consequences

Do not "correct" these to feet or to the FAA's usage. The Profile's wheel and graph write FL-055 as well (commit 5a19be3f).

## Source

The owner, 2026-10-20, 2026-10-27 and 2026-11-06.
