# 0021. Labels are Title Case; the FAA's text is sentence case with codes kept

- **Date:** 2026-10-23
- **Status:** Accepted; made exact by [0056](0056-one-set-of-words.md) (which names are Title Case, and the shared words generated from `design/wording.json`)

## Context

Labels were inconsistent between screens.

## Decision

Control labels and tab names are Title Case ("Airplane", "Fetching", section titles 20 pt). The FAA's own capitalised text is the exception: sentence case with codes kept, so a summary reads "TFRs & special use", not "Tfrs".

## Consequences

A lowering helper keeps each code's capitals (commit 58ea65ba).

## Source

The owner's 2026-10-23 audit picks.
