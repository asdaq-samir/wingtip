# 0045. FPL for every pilot: one head, one route field, ages, explanations and one Undo

- **Date:** 2026-11-17
- **Status:** Accepted

## Context

The owner, 2026-11-17, of FPL and its nested drawers: make them easier
for every pilot, new and experienced, "no redundancies and less clutter
and fresh looking and modern and reliable and robust", and "Do it all but
keep it less cluttered". An audit of the web's FPL found: the forms that
open from a card (an altitude's, a fix's) drew a head of their own, the
title at the start in a smaller type; a route leg's card put its ends in a
grey row and Active in a pill under the head; the route box said "Route"
and nothing of what it takes, and a pasted filed route's DCT and its
speed and level group were read as points; the nav log's MH and MC, the
strip's ETE and the cruise's FL were never explained; a live figure's
age showed only offline ("Fetched 42 min ago") or as a long line
("Observed 1453Z, 12 min ago -- an old report"); a figure still coming
showed a dash, which also means "needs an airplane"; Undo was a toast
after a removal and a keyboard's Cmd-Z, so a phone could not undo an
altitude, and the departure time and the airplane were not in it, and
a reload lost it.

## Decision

1. **One drawer head.** Every card and every form sheet a card opens has
   the same head: its title centred at a card's size, one line under it,
   ✕ at its end -- or an iOS form's Cancel and Done -- through the shared
   `CardHeadRow` / `HeadGrid` (the web's `PhoneSheetHeader` now lays its
   row out with `HeadGrid`). What a card is goes in that line, not a row
   or a pill under it.
2. **One route field.** The route box takes the route step by step
   (departure, then destination) or typed whole as a pilot files it; the
   engine reads a typed route's words (`route_read`: DCT out, item 15's
   speed and level group the cruise, a change "LEXOR/N0467F380" read),
   AIM Appendix 4. The empty box says in a few words what it takes.
3. **Explain on tap.** An abbreviation or a figure's name a pilot may not
   know says what it means in one plain sentence with its source when
   tapped (the stock Popover, `components/Explain`), with no label added;
   the sentences are data in `lib/explain`, each source cited.
4. **Ages where read.** Every live figure says its age in a few
   characters ("12m", `components/LiveAge`), greyed once the engine's
   freshness rule (`weather_in_force`, `kept_age`) says it is stale, and
   "offline" in the row while the browser has no network.
5. **A dash means "needs an airplane".** A figure still coming is the
   stock Skeleton's shape in its place (`components/FigureWait`).
6. **One Undo.** Every FPL edit -- the route, the altitude, the
   procedures and stops, the departure time and the airplane -- is in one
   history, undone and redone from the first items of the route's •••
   menu, named by what they put back ("Undo Altitude"), kept in the tab's
   session across a reload. The removal toast and Cmd-Z stay (2026-11-10): a removal's Undo is offered
   where the pilot acted, every other edit's from ••• alone (the owner,
   2026-11-17, taking the recommendation).
7. **One surface.** No box in a box, fewer borders and pills: spacing
   groups, colour only for meaning.

Panels and controls stay where they are but one. Four moves were offered
and the owner set three aside (2026-11-17, "don't worry about the 4
decisions"): one Flight card for Brief, Nav Log and Profile; the Go / No-Go
verdict on the strip; "To" off the strip on the ground. The fourth he took,
and then said what he meant ("No I meant move everything to the tab bar
with a ... instead of share"): Share left the floating bar and the
in-flight tiles, and the route's •••, "More", took its place there -- the
one menu of the route, its undo and redo, its link, Open in ForeFlight,
the checkpoints, the kneeboard, Save, File, Plan again, Show Fuel Stops,
Show Route As and Clear. The first row keeps a ••• only before there is
a route, for Show Route As.

## Consequences

- The web first (decision 0038); the phones follow on the owner's word.
- The route field reads a typed route through `route_read` word by word
  as the box puts each in, a level group typed anywhere setting the
  cruise as the altitude field does. The strip's Time, Arrival and Fuel
  explain themselves on a tap, and wait as placeholders until the nav
  log's totals come. An airplane heard says its age in seconds, stale by
  the engine's `traffic_fresh`. FL is not explained: it is written only
  inside the cruise field, where a tap types, and on the Altitude
  Advisor's rows, which are buttons.

## Amended 2026-11-21

Item 6's Undo and Redo are no longer the ••• menu's items: every edit
offers its own toast Undo, and More holds three items (0049). The head is
as 0050 has it.
