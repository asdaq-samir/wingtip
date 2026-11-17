# 0046. FPL has one route layout: folded to read, opened to edit

- **Date:** 2026-11-17
- **Status:** Accepted

## Context

FPL showed its route in three ways, picked from the route's ••• menu's
Show Route As (lib/preferences `routeEdit`): Route Box, the box of pills
over the plan's list (the default); Route Line, the box folded to one
line, its ends' names under their idents (the owner's L1, 2026-11-05);
and Route Cards, no box, the plan's own cards (option 3, 2026-11-05).
Each did the same job a little differently, and each kept its own code
path through the route head, the list, the nav log and the Profile's Add
a Stop. The FPL redesign's canvas
(https://claude.ai/artifact/Y1ZMboDo1ehRfsnfLZRQNp, boards "Three layouts
→ one", "Labels: three options" and "Tap the route to expand") proposed
one layout built from the best of each, light labels (option C), and
tapping the route to expand it, as iOS's lists separate reading from
editing with Edit and Done. The owner, 2026-11-17: "Ok let's try it".

## Decision

1. **Folded, to read**, the default once the route is whole: the first
   row (the airplane, the altitude, VFR/IFR); the route as one line, both
   ends' idents with their names under them and the stops counted
   between, a chevron in the tint (`RouteSummary`); the figures right
   under it; "Suggested routes" over the Routes' chips; nothing else.
   A tap on the line opens it.
2. **Open, to edit**: a head, "Route" and Done; the airport cards
   (always filled, their role over the ident: Departure, Stop,
   Destination), the waypoints as plain rows between, Add a Stop at the
   end; the route's field to type or paste a whole route (RouteBox, read
   by the engine's `route_read` as before); and the figures under all of
   it, changing as it is edited. The Routes' chips are put away while it
   is open: they change the route rather than edit it.
3. **On a phone the sheet's height drives it** (the coordinator's rule
   after the owner's iPhone screenshot of a Direct To folded at full, the
   sheet blank under the strip, 2026-11-17), as Apple Maps shows more as
   its sheet rises: at half and the pill the route is folded; raised to
   full it opens; lowered to half it folds again, so a full sheet is never
   blank. A tap on the line opens it and raises the sheet to full; Done,
   or a tap on "Route", folds it and lowers it to half (Base UI Drawer's
   snap points, set by the panel's state, nothing mirrored in CSS). It
   never folds while its field has the focus, what is typed not yet sent.
   From md up, where the panel is beside the map, the tap and Done alone.
4. **A new plan opens to edit**: with no route, the departure's and the
   destination's cards to fill and the route's field. Half a route lists
   its fields over the field, the field saying the end it lacks. A route
   made whole a point at a time, or typed or pasted into the field, stays
   open till Done; one that arrives whole from elsewhere (Fly Here, a
   link, a Saved flight) arrives folded, or open where the sheet is all
   the way up.
5. **One name for a present position**: "Present position", in the
   pilot's words, wherever the route shows it -- the folded line (on two
   lines where one has no room, nothing under it), the cards, the pills,
   the strip, the Nav Log, the Brief, the map (identSchema's
   `POSITION_NAME`, through `pointName`); it was "POS0" at the owner's earlier ask ("Let's call current position as POS0"),
   which the screenshot showed over "Present position".
   Told after the flight (a saved flight, a shared briefing), a present
   position stays its coordinates (`placeOfPoint`), as "Present position"
   says nowhere to someone else. The pilot's own points stay POS1 on.
6. **Labels C**: "Airplane" over the N-number and "Cruise" over the
   altitude, inside their fields (`InlineField`'s `caption`, its words
   the start of the field's name for VoiceOver); each card's role over its
   ident; "Suggested routes" over the chips. The figures keep their own
   short names and explain on tap.
7. **Gone**: Show Route As and the `routeEdit` preference (persisted
   preferences are read as they are and the key is no longer written),
   Route Line's split (`RouteSplit`), Route Cards' new-stop card
   (`NewStopCard`), the cards' ident text boxes and their second card look
   (`POINT_CARD`, `CARD_BODY`), and the route box's own Done. The first
   row's ••• before there is a route stays: it holds Undo (a cleared route
   put back), the map's choices (Checkpoints, Class B Weather) and Clear
   for half a route.

## Consequences

- One code path from the route head to the list: `routeEditing` says
  whether the route is open, and the list edits whenever it is shown on
  the ground (Change asks the one search, as Route Cards' did).
- What works today stays: the unknown place opens the route by itself,
  its field saying so with Remove; the fuel stops' suggestions are the
  field's pills; Direct To, procedures and holds are the cards' menus
  (a hold or a procedure asked for from the map or by voice opens the
  route); the departure picker is the departure card's time; the dry run
  and flight read the list, never edit it; the pill is the figures alone;
  deep links are unchanged; keyboard reorder is the cards' grips, and the
  line and "Route" are one disclosure (`aria-expanded`), the change said
  to VoiceOver.
- The owner's earlier "no need to use the word depart, fuel stop,
  arrive" (2026-10-21) gives way to labels C's role words on the cards.
- The phones keep their layouts until the owner's word (decision 0038).
