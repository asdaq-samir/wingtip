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

1. **The route is its timeline, read and edited at once** (the owner's
   two-row timeline, 2026-11-17: "Yes let's try that"; it replaced the
   timeline folded to read and the Directions list opened to edit, which
   needed the sheet all the way up). Under the first row (the airplane and
   the altitude; VFR/IFR is the Profile card's): one rounded group, the
   sheet's solid grouped-list fill, Apple Maps' Directions' look (the
   owner: "give it similar look to Apple Maps for single rows"). A line a
   point, 44 points tall: its mark, a filled 32-point circle with a white
   glyph -- My Location the tint with the location arrow, an airport its
   flight category's colour (the map's, grey with no report) with an
   airplane, a fuel stop the pump, a waypoint a grey triangle, a point it
   cannot fly to the red with ✕ -- the mark being its menu; between the
   marks the route's magenta in Apple's short rounded dashes ("make lines
   magenta"); after a hairline inset to the text, as iOS's grouped lists
   have it, its ident at the body size (a link to its airport's card), the
   fuel in the tanks there right after it (as the cards had it; none with
   no airplane; the owner, 2026-11-17: "Fuel should go right after
   airport"),
   its time in the secondary colour (the departure's leave time, a picker;
   the others' arrival, a dash with no airplane) and its grip, iOS's thin
   light three lines on the ident's row (the owner, 2026-11-17). No city
   ("We don't need to say the city name"); the category is the mark's
   colour and in what VoiceOver hears. Where the mark is the point's menu
   (the route being edited) it says "•••" alone, the tint's ellipsis on
   its wash (the owner, 2026-11-17: "Make the left buttons say ... only"),
   the category then in the ident's label alone. Past four points the middle ones
   fold into "N more stops", a tap showing them all. Add a Stop is the
   last row, its mark the tint's + and its words in the tint, asking the
   one search (no microphone of its own: the search's field has one).
   Then the figures; "Suggested routes" over the Routes' chips.
2. **A tap on a field's line opens it, and that is all** (the owner: "Each
   timeline line is one 44pt row", "exactly three rows, always"): the line,
   then its wind at the left (the cards' figure, the METAR now or the
   forecast for when the airplane is there) and its elevation at the
   right, under the time (the owner, 2026-11-17), then one row of chips, wrapping where they do not fit -- the
   runway (its line folded to the one picked, RunwayTray, headed "RWY"
   where it had the landing's or the takeoff's glyph, the owner 2026-11-17) and its kinds of
   procedure, each picked one its short name's chip ("ILS 26 ⌄",
   ProcedureMenu's menu as it was: transition, plate, Learn This Approach,
   another, none; taking one off gives the plan's toast Undo) and each not
   picked "+ APCH" in the FAA's contractions (JO 7340.2; the owner
   2026-11-17, so the row fits one line, a reader hearing the whole word):
   a departure's runway and "+ DEP", a stop's landing runway, "+ APCH",
   its takeoff runway, "+ DEP" and when it leaves again, a destination's
   runway, "+ ARR" and "+ APCH", a
   field with no CIFP procedures its runway alone, whose chip says its
   pattern. One line open at a time; the open line tapped again folds, and
   another moves it. While one is open the map centres its field above the
   sheet and shows the route's points alone, the chart and the TFRs kept
   (`lib/map/routeOnly`, plan-map's `useLineFocus`). My Location and a
   waypoint open nothing. A field NASR lists as closed (the engine's
   field_status, decision 0043), or a point the planner does not know,
   says why in red under its line ("Closed permanently. Pick another
   field."), no chips. The stock parts carry it: React Aria's GridList the
   list, its drag and drop the hold and the grip that move a point and
   the keyboard's moves; SwipeRow a swipe to the left that takes a stop
   out (the plan's toast Undo); Base UI's Collapsible the line's opening;
   Base UI's menus the mark's menu and the chips (`TimelineRoute`,
   `TimelineLine`).
3. **A point is changed from its mark's menu** (Change, by the one search,
   My Location offered first where the point is not it; a Direct To's
   start changed a route from there), as are Direct To, Set Altitude, Hold
   Here, Create a Fix, Add a Stop After, Move Up and Down and Remove;
   "Runways & Procedures" left the menu, the line's tap its home. The
   route's field (RouteEditor: RouteEnds with no route, the route typed or
   pasted whole, read by the engine's `route_read`, and the figures under
   it) opens under the timeline with "Route" over it while the route is
   not whole, while a point the planner does not know is in it, or from
   the route's ••• (Type the Route), Done folding it away. The sheet's
   height no longer opens or folds anything: the timeline is where the
   route is edited, at half as all the way up. In flight and in a dry run
   the route is read, the list of the cards with each procedure's branch
   of fixes (ProceduresRoute); on the ground a procedure's fixes are
   reached from the map.
4. **A new plan opens its field**: with no route, the departure's and the
   destination's cards to fill and the route's field. Half a route is its
   timeline over the field, the field saying the end it lacks. A route
   typed or pasted into the field keeps it open till Done; one made whole
   by a pick of the one search, or arriving whole from elsewhere (Fly
   Here, a link, a Saved flight), is the timeline alone. A point the
   planner does not know keeps the field open, its Remove a tap away, its
   line on the timeline red with why.
5. **One name for a present position**: "My Location", Apple Maps'
   words (the owner, 2026-11-17), wherever the route shows it -- the folded line (on two
   lines where one has no room, nothing under it), the cards, the pills,
   the strip, the Nav Log, the Brief, the map (identSchema's
   `POSITION_NAME`, through `pointName`); it was "POS0" at the owner's earlier ask ("Let's call current position as POS0"),
   which the screenshot showed over "Present position".
   Told after the flight (a saved flight, a shared briefing), a present
   position stays its coordinates (`placeOfPoint`), as "My Location"
   says nowhere to someone else. The pilot's own points stay POS1 on.
6. **Labels C**, but the first row's: the "Airplane" and "Cruise"
   captions came out the same day (the owner: "No need for airplane and
   cruise labels"), the fields' names VoiceOver's as before; each card's role over its
   ident; "Suggested routes" over the chips. The figures keep their own
   short names and explain on tap.
7. **Gone**: Show Route As and the `routeEdit` preference (persisted
   preferences are read as they are and the key is no longer written),
   Route Line's split (`RouteSplit`), Route Cards' new-stop card
   (`NewStopCard`), the cards' ident text boxes and their second card look
   (`POINT_CARD`, `CARD_BODY`), and the route box's own Done. The first
   row's ••• before there is a route stays: it holds Undo (a cleared route
   put back), the map's choice (Checkpoints) and Clear
   for half a route.

## Consequences

- One code path on the ground, the timeline (`TimelineRoute` over
  `RouteGrid`), edited wherever it is shown; `routeEditing` says only
  whether the route's field is open under it. The Directions list opened
  to edit (the cards' grouped rows, the row's tap to change, the
  sheet-height rule that opened it) is gone; the cards' list stays for
  reading in flight and a dry run.
- What works today stays: the unknown place opens the route's field by
  itself, saying so with Remove; the fuel stops' suggestions are the
  map's and the field's pills; Direct To, holds and a point's altitude
  are the marks' menus; a hold or a procedure asked for from the map or by
  voice opens its sheet over the timeline; the departure picker is the
  departure line's time, a stop's leaving time its chips'; the dry run
  and flight read the list, never edit it; the pill is the figures alone;
  deep links are unchanged; keyboard reorder is the lines' grips. A hold
  set has no row of its own on the timeline: its point's menu says Change
  Hold….
- The owner's earlier "no need to use the word depart, fuel stop,
  arrive" (2026-10-21) gives way to labels C's role words on the cards.
- The phones keep their layouts until the owner's word (decision 0038).
