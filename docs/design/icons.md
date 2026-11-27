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
| more | lucide `Ellipsis` | `ellipsis.circle` | `more_vert` | FPL's More: Route Options, Share link, Open in ForeFlight. |
| myLocation | lucide `Navigation` | `location` / `location.fill` | `near_me` | The map's position button. |
| brief | lucide `Sparkles` | `sparkles` | `auto_awesome` | The route box's AI brief. |
| navLog | lucide `ListOrdered` | `list.number` | `format_list_numbered` | The nav log, in the route's menu. |
| profile | lucide `ChartArea` | `chart.xyaxis.line` | `show_chart` | The side view; FPL's altitude pill's end. |
| info | lucide `Info` | `info.circle` | `info` | The airplane's card, at the end of FPL's N-number pill. |
| mapLayers | lucide `Map` | `map` | `layers` | The map's layers and weather. |
| flightPlan | lucide `Route` | `point.topleft.down.to.point.bottomright.curvepath` | `route` | A route as a list's mark. |
| nearest | lucide `LocateFixed` | `scope` | `my_location` | Nearest fields. |
| directTo | `DirectToIcon` (the chart's D-arrow) | the same, drawn | the same, as a vector | Direct To; Fly Here. |
| departFrom | lucide `PlaneTakeoff` | `airplane.departure` | `flight_takeoff` | Depart From. |
| addToRoute | lucide `MapPinPlus` | `mappin.and.ellipse` with `plus` | `add_location` | Add as Stop; Add to Route. |
| weather | lucide `CloudSun` | `cloud.sun` | `partly_cloudy_day` (`filter_drama` in Compose's icon set, which has no `partly_cloudy_day`) | An airport card's Weather tile (its Weather tab). |
| runways | lucide `PlaneLanding` | none: the tabs picker's words | `flight_land` | An airport card's Runways tab. |
| charts | lucide `FileText` | none: the tabs picker's words | `description` | An airport card's Charts tab. |
| holdHere | lucide `Repeat2` | `arrow.triangle.2.circlepath` | `sync` | Hold Here. |
| undo | lucide `Undo2` | `arrow.uturn.backward` | `undo` | The route's last edit taken back. |
| redo | lucide `Redo2` | `arrow.uturn.forward` | `redo` | An edit taken back, put back (the wide window's route toolbar). |
| call | lucide `Phone` | `phone` | `call` | A field's phone. |
| address | lucide `MapPin` | `mappin` | `place` | A place in Maps. |
| copy | lucide `ClipboardCopy` | `doc.on.doc` | `content_copy` | A frequency to the clipboard. |
| favorite | lucide `Star` | `star` (`star.fill` while on) | `star_outline` (`star` while on) | Favorite, a switch in a card's row. |
| track | lucide `Crosshair` | not yet: the web's airplane card (2026-11-26) | not yet | Track, an airplane in the air kept in sight. |
| alerts | lucide `Bell` | `bell` | not yet | Alerts as an airplane takes off and lands. |
| figures | lucide `Gauge` | not yet | not yet | An airplane's book figures, from its card. |
| send | lucide `Send` | `paperplane` | `send` | File or send a flight plan. |

## The panel's tabs (`TAB_ICON`)

The tab glyphs are the app's own, on one 28-point grid with a 2-point line,
each with a filled face for the tab that is up, on the phones; the web's went with its tab bar when the sheet became one search (2026-11-09).

| Tab | Glyph | iOS | Android |
|---|---|---|---|
| FPL | the route: two rings and a fix | the same, drawn | the same, as a vector |
| Airport | a sectional's airport with services: a circle, its runway up the middle and four ticks round it (FAA Aeronautical Chart User's Guide). It was the runway on a diagonal, which read as a "prohibited" sign. | the same, drawn | the same, as a vector |
| Airplane | an airplane from above | `airplane` | `flight` |
| Setup | a gear | `gearshape` | `settings` |

## Card actions (design/card-actions.json)

One name and one glyph per action, and one set per kind of card, the first
filled. The table is generated, with each app's (the web's `CARD_ACTIONS`,
iOS's and Android's `CardKind`), by scripts/build/card-actions.sh from
design/card-actions.json: change an action there.

<!-- BEGIN generated from design/card-actions.json by scripts/build/card-actions.sh -->

| Card | Actions, in order | Apps | Which |
|---|---|---|---|
| `airport` | Fly Here, Add Stop, Call, Favorite | web, ios, android | An airport's (the owner, 2026-11-11: "fly here, add stop, call and address ... no need for other buttons", Favorite in Address's place since). |
| `airportAsStop` | Add Stop, Call, Favorite, Address | web, ios, android | An airport's, opened while the pilot adds a stop (the one search asked for one): Add Stop first and filled, no Fly Here, Address last (the owner, 2026-11-18). |
| `airportStopOff` | Fly Here, Call, Favorite, Address | web, ios, android | An airport's where Add Stop cannot be used (the field on the route already, closed): Address last in its place, not a greyed tile (the owner, 2026-11-20). |
| `point` | Direct To, Add to Route, Hold Here | web, ios, android | A point held on the map: the airspace card's. |
| `navaid` | Direct To, Add to Route, Copy | web, ios, android | A VOR, a fix or a VFR waypoint. |
| `airplane` | Fly This, Alerts, Favorite, Figures | web | An airplane's on the ground (the owner's design of 2026-11-26), one greyed where it does nothing for this airplane; the web's alone until the phones take the merged airplane card. |
| `airplaneAirborne` | Track, Alerts, Favorite, Figures | web | An airplane's in the air: Track in Fly This's place. |

- **Fly Here** (`flyHere`, glyph `directTo`): A new route from the airplane to this field.
- **Depart From** (`departFrom`, glyph `departFrom`): The field the route's departure, the rest of the route kept (the one-search design, 2026-11-09); the one search's and the airport mark's menus, on no card's row.
- **Direct To** (`directTo`, glyph `directTo`): From the airplane to the point, then on along the route.
- **Add Stop** (`addStop`, glyph `addToRoute`): The field a landing on the way (stops=), as Maps' Add Stop.
- **Add to Route** (`addToRoute`, glyph `addToRoute`): The point a turn on the way, where it bends the route least; not a landing.
- **Hold Here** (`holdHere`, glyph `holdHere`): A hold at the point (AIM 5-3-8).
- **Call** (`call`, glyph `call`): The field's own phone, from the FAA's airport file.
- **Favorite** (`favorite`, glyph `favorite`): The airport or the airplane in the Favorites or out, a switch, in the action row rather than the head, so every card's head holds its Share and its close alone (the owner, 2026-11-11).
- **Address** (`address`, glyph `address`): The field in Maps, by its street address where the FAA lists one.
- **Copy** (`copy`, glyph `copy`): A frequency or an ident to the clipboard.
- **Fly This** (`flyThis`, glyph `directTo`): The airplane shown the one the plan flies.
- **Track** (`track`, glyph `track`): An airplane in the air kept in sight on the map.
- **Alerts** (`alerts`, glyph `alerts`): Alerts as the airplane takes off and lands, by its ICAO address.
- **Figures** (`figures`, glyph `figures`): The airplane's book figures, opened over its card.

<!-- END generated card actions -->

## Small buttons have words

A glyph alone is a guess. A small button whose glyph is not one of the
system's own (close, share, more) carries its word where there is room
(the desktop panel's route box), and its name for VoiceOver and a
tooltip on hover everywhere.
