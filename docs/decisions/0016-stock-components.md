# 0016. Stock components over hand-rolled ones

- **Date:** 2026-10-28
- **Status:** Accepted

## Context

Hand-rolled tabs and pills were "very glitchy"; MapPanel had grown to 1,672 lines of drag and motion code.

## Decision

"Always yes to stock components": shadcn/ui and Radix, Base UI, TanStack and the like over hand-rolled code. The panel's sheet is Base UI's Drawer. A batch of new swaps is shown on a canvas to the owner first, and a swap never moves a panel.

## Consequences

Change the sheet through the Drawer's props. Before writing a component, check for a stock one (the reuse-before-build skill).

## Source

The owner, 2026-10-28 and 2026-11-04.

## Amended 2026-11-09

The platform's own component is used even when it is only in a release
candidate, never a copy of our own, and bumped to stable when it ships
(Android's Material 3 1.5.0-rc01 for Expressive; docs/versions.md lists
what waits on a stable release). The web's components are shadcn on
Base UI (base-vega), not Radix, with React Aria's date, time and number
fields and drag and drop.

## Amended 2026-11-10

The owner: no look or behaviour on top of a stock component ("Native
means how they come out of the box, look and behavior wise"). Stock
parts keep their own states, shadows, motion, gestures and haptics: the
web's sheet is Base UI's Drawer as it is, the iPhone's glass and sheets
the system's, Android's sheet, pull to refresh, loading and Undo
Material's. What is still built by hand, and why, is listed in each
docs/design/<platform>.md.
