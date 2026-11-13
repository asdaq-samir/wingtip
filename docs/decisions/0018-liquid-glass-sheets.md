# 0018. Panels are Liquid Glass sheets with detents; a throw moves one size

- **Date:** 2026-10-15
- **Status:** Accepted

## Context

The sheet should feel like Apple Maps, without a spring and without jumping from the pill to full.

## Decision

Panels are Liquid Glass sheets with detents (pill, half, full), as in Apple Maps. No spring: ease-out, 0.3 s for a pill-to-half move, with speed changed through the constants, not the curve. A throw moves one size: never pill to full or full to pill in one flick, though a finger dragging past half may carry it on. Panel fields share one glass fill and tinted glass buttons; glass glyphs are black.

## Consequences

Motion is transform only, with one shape at every size and no backdrop change mid-motion.

## Amended 2026-11-09

The owner: these rules were made for hand-built sheets. Where an app now uses the platform's stock sheet, the stock sheet's own states, motion, haptics and back behaviour apply instead. On Android the panel is Material's standard bottom sheet (peek and expanded, the expressive motion scheme's springs), so the half stop, the 0.3 s ease-out and one-stop throws no longer hold there.

## Source

The owner, 2026-10-15 ("The pill should not go straight to full"), 2026-10-20, 2026-10-22 and 2026-10-23.

## Amended 2026-11-10

The owner approved the scrolling rule. On Android every card opens at
half -- the standard sheet's peek is half the window while a card is
open -- and grows to the whole height when pulled up; with no card open
the peek is the search again. Back with a card open closes the card and
never just lowers the sheet.

## Amended 2026-11-10 (web and iPhone)

The 2026-11-09 amendment now holds on every platform. The web's phone
sheet is Base UI's Drawer as it is: its own 450 ms curve, velocity snap
(a hard flick may go from the pill all the way up) and drag arbitration,
in place of the no-spring 0.3 s settle and one size per throw. (On
2026-11-11 `snapToSequentialPoints` was set on the sheet and its cards
in error, from the retired rule, and taken off the same day: the owner,
"Just let the drawer do what it does, don't modify its behavior". Later
that day the owner asked for the sizes to hold "regardless of how fast you
swipe", and the Drawer's own `snapToSequentialPoints` option went back on,
on his word.) The
iPhone's sheet and glass are the system's as they come (plain
`glassEffect`, the system's Reduce Transparency and scroll-edge
effect), with no haptic of the app's at a detent. Pill, half and full
remain the detents.

## Amended 2026-11-10 (the web's sheet is solid)

Owner decision 2026-11-10 (decisions page), on the sheet audit's F-L1:
the web's sheet stays solid at every size, the look's `--sheet` (the
light grey of Apple Maps' web sheet in Wingtip), as it is now; it is not
Liquid Glass at the pill or anywhere else. Glass on the web is only what
floats over the map, the map's buttons (`liquid-glass`, `MapControls`).
The iPhone's sheet keeps the system's glass as it comes.
