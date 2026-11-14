# Icons and card actions: one concept, one shape

The UI audit of 2026-11-09 found the same thing drawn and named differently
on each app (the Airport tab's ⊘ that read "prohibited", bare glyphs with no
word, "Add Stop" beside "Add to Route"). This table is the one list. Each
concept has one glyph per platform, chosen so the shapes match: the web's
lucide icon (or the app's own glyph), iOS's SF Symbol and Android's
Material Symbol. A screen asks for the concept, never the glyph's name:
the web's `ICON` and `TAB_ICON` (apps/web/src/lib/icons.ts); the phones'
own maps follow this table.

## Concepts

| Concept | Web (`ICON.*`) | iOS (SF Symbols) | Android (Material Symbols) | Where |
|---|---|---|---|---|
| close | lucide `X` | `xmark` (`Button(role: .close)` on iOS 26) | `close` | Every level's close, at the right; it goes back one level (decision 0015). |
| back | none | none: close goes back | system and predictive back | No Back buttons (decision 0015). |
| share | lucide `Share` | `square.and.arrow.up` | `share` | A card's share; the minimized bar's left. |
| more | lucide `Ellipsis` | `ellipsis.circle` | `more_vert` | The route box's ••• (share, print, nav log). |
| myLocation | lucide `Navigation` | `location` / `location.fill` | `near_me` | The map's position button. |
| brief | lucide `Sparkles` | `sparkles` | `auto_awesome` | The route box's AI brief. |
| navLog | lucide `ListOrdered` | `list.number` | `format_list_numbered` | The nav log, in the route's menu. |
| profile | lucide `ChartArea` | `chart.xyaxis.line` | `show_chart` | The side view. |
| mapLayers | lucide `Map` | `map` | `layers` | The map's layers and weather. |
| flightPlan | lucide `Route` | `point.topleft.down.to.point.bottomright.curvepath` | `route` | A route as a list's mark. |
| nearest | lucide `LocateFixed` | `scope` | `my_location` | Nearest fields. |
| directTo | `DirectToIcon` (the chart's D-arrow) | the same, drawn | the same, as a vector | Direct To; Fly Here. |
| departFrom | lucide `PlaneTakeoff` | `airplane.departure` | `flight_takeoff` | Depart From. |
| addToRoute | lucide `MapPinPlus` | `mappin.and.ellipse` with `plus` | `add_location` | Add as Stop; Add to Route. |
| weather | lucide `CloudSun` | `cloud.sun` | `partly_cloudy_day` | An airport card's Weather tile (its Weather tab). |
| holdHere | lucide `Repeat2` | `arrow.triangle.2.circlepath` | `sync` | Hold Here. |
| undo | lucide `Undo2` | `arrow.uturn.backward` | `undo` | The route's last edit taken back. |
| redo | lucide `Redo2` | `arrow.uturn.forward` | `redo` | An edit taken back, put back (the wide window's route toolbar). |
| call | lucide `Phone` | `phone` | `call` | A field's phone. |
| address | lucide `MapPin` | `mappin` | `place` | A place in Maps. |
| copy | lucide `ClipboardCopy` | `doc.on.doc` | `content_copy` | A frequency to the clipboard. |
| send | lucide `Send` | `paperplane` | `send` | File or send a flight plan. |

## The panel's tabs (`TAB_ICON`)

The tab glyphs are the app's own, on one 28-point grid with a 2-point line,
each with a filled face for the tab that is up (apps/web/src/lib/glyphs/tabGlyphs.tsx).

| Tab | Glyph | iOS | Android |
|---|---|---|---|
| FPL | the route: two rings and a fix | the same, drawn | the same, as a vector |
| Airport | a sectional's airport with services: a circle, its runway up the middle and four ticks round it (FAA Aeronautical Chart User's Guide). It was the runway on a diagonal, which read as a "prohibited" sign. | the same, drawn | the same, as a vector |
| Airplane | an airplane from above | `airplane` | `flight` |
| Setup | a gear | `gearshape` | `settings` |

## Card actions (`CARD_ACTIONS`, apps/web/src/lib/cardActions.ts)

One name and one glyph per action, and one set per kind of card, the first
filled:

| Card | Actions, in order |
|---|---|
| Airport | Fly Here, Depart From, Add as Stop, Call, Address |
| A point held on the map (the airspace card) | Direct To, Add to Route, Hold Here |
| A VOR, a fix or a VFR waypoint | Direct To, Add to Route, Copy (the first two greyed with no route) |

- **Fly Here**: a new route from the airplane to this field.
- **Direct To**: from the airplane to the point, then on along the route.
- **Depart From**: the field the route's departure, the rest of the route kept
  (the one-search design, 2026-11-09).
- **Add as Stop**: the field a landing on the way, as Maps' Add Stop.
- **Add to Route**: the point a turn on the way, where it bends the route
  least; not a landing.
- **Hold Here**: a hold at the point (AIM 5-3-8).

## Small buttons have words

A glyph alone is a guess. A small button whose glyph is not one of the
system's own (close, share, more) carries its word where there is room
(the desktop panel's route box), and its name for VoiceOver and a
tooltip on hover everywhere.
