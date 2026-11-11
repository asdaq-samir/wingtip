# 0023. NOTAMs come from the SWIM feed; no FAA NOTAM API key

- **Date:** 2026-11-09
- **Status:** Accepted

## Context

The FAA NOTAM API's full load needs a registration; the SWIM feed (FNS) is already read.

## Decision

Option 2, wait it out: rely on the SWIM feed alone and do not register for the FAA NOTAM API. The planner's NOTAM sources carry `coverage_since` (the day the store first heard the feed), and the assistant never says there are no NOTAMs; it says "none heard since" that day.

## Consequences

A NOTAM issued before the feed was first heard and never changed is not held, and the app says so. #287 was closed.

## Source

The owner, 2026-11-09 (commit af2d9639).
