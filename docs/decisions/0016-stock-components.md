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
