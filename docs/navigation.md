# Navigation

How a pilot gets round Wingtip Maps on the web, the iPhone and Android:
every screen, the way to it from the map, how many taps that is, the link
that opens it, and what can be changed where it is shown. The owner's goals
(2026-11-09): "Let's make it easier for the pilots to navigate the app",
"Make the whole app experience easily editable", and "Just add the buttons
and options where they make sense intuitively, pilots don't have time to
find where things are."

Counted from the map with the sheet at rest and its tabs in sight: a tab
tapped is 1, a row on it 2. "Before" is `claude/integration` on
2026-11-09; "after" is with this branch. The audit was read from the code,
not timed on a device.

## The rules every platform keeps

- **Tap what you see.** Anything shown that is explained or changed
  somewhere opens that place: a field's name its card, the figures their
  nav log, a waypoint its menu. Closing goes back to where the pilot was
  (one level, never a Back button: `lib/openCards` on the web, `closesBack`
  on iOS, the sheet's close and system Back on Android).
- **Two taps at most** to every screen from the map and its sheet. A deeper
  screen gets a way in from a list that already holds its kind, never a new
  place on the screen; moving a panel or a control is the owner's call.
- **One way in per platform.** Every screen opens by its name from one place:
  the web's `useOpenScreen` (`features/plan/hooks`) through
  `lib/navigation/wanted`, iOS's `RootView.openScreen` through `ScreenAsk`
  and `PendingCommand.open`, Android's `OpenScreen` through
  `ScreenRequests`. A link, a figure tapped and a shortcut row all use it.
  Each is a `switch`/`when` over the generated list, so a screen added to
  `design/screens.json` fails each app's build until that app opens it.
- **The same verbs:** Edit, Delete, Move, Undo; More Info for a thing's card;
  Direct To, Set Altitude…, Hold Here…, Add a Stop After, Remove for a point
  of the route. "Airplane", never "aircraft", except in the FAA's own form
  wording (the flight plan's "Aircraft identification").
- **Undo where it happened:** after a delete, an Undo row in the list it
  went from (web `components/UndoRow`, iOS `Views/UndoRow`), or the route's
  Undo bar for the route; not a toast.
- **Look:** new rows and buttons are the platform's existing ones (web
  `ListRow` and the tint for what is tapped, iOS `List` rows and `Button`s
  with `WingtipSpace`, Android Material `TextButton`/`ListItem` with
  `WingtipSpace`), so they take the design tokens as their neighbours do.

## Deep links

One spec, `design/screens.json`, generates each app's list of screens
(`scripts/build/screens.sh`; CI's "The screens and their links are the
committed ones" fails on a difference) and the table below.

<!-- BEGIN generated from design/screens.json by scripts/build/screens.sh -->

Every screen opens from `https://<host>/app/plan?open=<id>` (a universal link on iOS, an App Link on
Android, the address on the web) or `wingtipmaps://plan?open=<id>` from another app.

| Link (`open=`) | Screen | Web | iOS | Android | What it is |
|---|---|---|---|---|---|
| `fpl` | FPL | yes | yes | yes | The route, its altitude and its figures: the FPL tab. |
| `airport` | Airport | yes | yes | yes | The Airport tab: search, favorites, recents, nearest. |
| `airplane` | Airplane | yes | yes | yes | The Airplane tab: the airplane picked and the traffic. |
| `setup` | Setup | yes | yes | yes | The Setup tab. |
| `brief` | Brief | yes | yes | yes | The route's Brief and its Go / No-Go (needs a route). |
| `navlog` | Nav Log | yes | yes | yes | The nav log, leg by leg (needs a route). Android's FPL tab is its nav log. |
| `profile` | Profile | yes | yes | -- | The route's side view and its altitudes (needs a route). |
| `flights` | Saved Flights | yes | yes | -- | The pilot's saved flights. |
| `favorites` | Favorites | yes | yes | -- | The pilot's favorite airports. |
| `nearest` | Nearest | yes | yes | yes | The fields nearest the airplane. |
| `ask` | Ask | -- | yes | yes | Ask the assistant about the flight. |
| `emergency` | Emergency Assistant | yes | yes | yes | The emergency assistant: the nearest fields, the checklist, 7700 and 121.5. |
| `checklists` | Checklists | yes | yes | yes | The picked airplane's checklists. |
| `airplanes` | Your Airplanes | yes | yes | -- | The pilot's own airplanes, their figures, checklists and squawks. |
| `logbook` | Logbook | yes | yes | yes | The pilot's logbook and currency. |
| `coach` | Coach | yes | yes | yes | The training coach. |
| `minimums` | Personal Minimums | yes | yes | yes | The weather the pilot will not take off or land in. |
| `guide` | Guide | yes | yes | -- | How the app works, and the practice drills. |
| `downloads` | Downloads | -- | yes | yes | Charts kept for flying with no signal. |
| `passengers` | Passenger Briefing | -- | yes | yes | The passenger briefing. |
| `about` | About | yes | yes | yes | The build, the data's cycles, the credits and the legal pages. |

The plan's own keys go beside it, and alone they open what they name:

- `dep`: The route's departure, an ident.
- `dest`: The route's destination, an ident.
- `stops`: The points between, idents comma-separated.
- `place`: A field's card, by its ident.
- `flight`: An airplane tracked, by its ICAO address (six hex digits).

<!-- END generated -->

A link with a route and a screen (`?dep=C81&dest=KDLH&open=brief`) plans
the route, then opens the screen: the web waits up to 30 s for the route
(`lib/navigation/wanted`), the phones open it after the route command
(`PendingCommand.then`, `Links.Route.then`). The word `open` is taken off
the web's address once used, so a reload or Back does not open it again.

## Screens, paths and taps

### Web

| Screen | Path from the map | Taps before → after | Edit in place |
|---|---|---|---|
| FPL: route box, route list, nav log rows | FPL | 1 | Route pills drag to reorder; each point's menu: Change, Direct To, Set Altitude…, Hold Here…, More Info, Add a Stop After, Remove; altitude and departure time chips open popovers; Undo bar after a removal |
| Figures at the sheet's foot | none | 0 | Fuel opens its breakdown (Add fuel stop); ETE/ETA and To swap; **Dist opens the nav log (new)** |
| Brief | FPL → Brief | 2 | Alternate filed or taken off; Ask chips apply changes |
| Nav log card | FPL → ••• → Nav log; **Dist tapped (new)** | 3 → 1 | Rows select; **a field's name opens its card (new)** |
| Profile | FPL → Profile | 2 | VFR/IFR, altitude in the side view, Dry run |
| Saved flights | FPL (no route) → Saved; Setup → Flights | 2 | Delete with a confirm; name and notes not editable (no API) |
| Airport card | Tap a field; a route row's More Info; **a nav log field (new)** | 1 | Add stop, Fly Here, favorite |
| Airport Favorites | Airport → Favorites | 2 | Drag to reorder, swipe to delete, **Undo row (new)** |
| Nearest | Airport → Nearest | 2 | Change the place it is from |
| Airplane card, past flight | Tap traffic; its past row | 1, 2 | Replay |
| Map menu | Map button | 1 | Every switch in place |
| Emergency assistant | Flying head; voice; emergency checklist | 1 in flight, 5–6 on the ground → `open=emergency` | -- |
| Setup | Setup | 1 | Layout tiles in place |
| Airplanes, Flights, Logbook, Minimums | Setup → row | 2 | Minimums inline; logbook entry and airplane in popover forms |
| Coach, Checkride, Instructing | Setup → Logbook → row | 3 | Checkride inline |
| Checklists, Squawks | Setup → Airplanes → airplane → row | 4 | Checklist as one text; squawks inline |
| Holding, Lost comms, drills | Setup → Guide → row | 3 | -- |

### iOS

| Screen | Path from the map | Taps before → after | Edit in place |
|---|---|---|---|
| FPL | FPL | 1 | From/To and altitude inline; stops Edit (delete, move) and each point's menu (**More Info and the destination's Brief, new**); Undo bar |
| Figures strip | none | 0 | **Tapped, the nav log (new)** |
| Nav Log | FPL → ••• → Nav Log; **the strip (new)** | 3 → 1 | -- |
| Brief, Profile, Flights | FPL → row or toolbar | 2 | Saved flights: **swipe to delete with an Undo row, swipe right or hold for Flown Track (new)**; title now "Saved Flights" |
| Passenger Briefing | FPL → Brief → Passengers | 3 → link | DatePicker |
| Risk Assessment, Weight & Balance | Brief → finding | 4 | Toggles, figures |
| Airport card | Tap a field; Airport → row; **a route point's More Info (new)** | 1 | Fly Here, Add Stop, Favorite |
| Airplane, checklists | Airplane → row | 2 | Checklist edited as text |
| Your Airplanes → airplane → Squawks | Airplane → Your Airplanes → … | 3–4 | Forms; squawk delete has no Undo |
| Setup pages (Logbook, Coach, Minimums, Guide, Downloads, About) | Setup → row | 2 | Logbook entry form, swipe delete with confirm |
| Emergency | Instruments bar (flying); checklist | 1 / 3 | -- |

### Android

| Screen | Path from the map | Taps before → after | Edit in place |
|---|---|---|---|
| FPL (its legs are the nav log) | FPL | 1 | Departure, destination, stops typed; VFR/IFR; leg rows open the leg |
| Figures strip | none | 0 | **Tapped, the FPL tab's legs (new)** |
| Brief | strip layout only | unreachable in tabs → 2 (**FPL → Brief, new**) | Departure hour |
| Airport tab, card | Airport; tap a field | 1 | Search |
| Airplane tab, checklists | Airplane → Checklist | 2 | Ticks; Edit as text |
| Setup, Logbook, Coach | Setup → Logbook → Coach | 2 / 3 | Logbook entries read-only |
| Downloads, Passenger Briefing, About | Setup → row | 2 | Downloads delete with no confirm or Undo |
| Emergency | Instruments bar; Airplane → Emergency → Assistant | 1 / 3 | -- |
| Nearest, Ask | Instruments bar; the sparkle | 1 | -- |

## Contextual actions: where each lives

The primary action is on the thing itself; the rest one tap away in its
menu (web popover or menu, iOS context menu and swipe, Android long-press
or overflow).

| On | Actions | Web | iOS | Android |
|---|---|---|---|---|
| A waypoint of the route | Direct To, Set Altitude…, Hold Here…, More Info, Add a Stop After, Remove | point menu (all) | point menu (all but Add a Stop After; More Info new) | route leg sheet: Direct, Remove |
| The destination | More Info (weather, frequencies, runways, approaches), Brief, Nearest | More Info; Brief on FPL | point menu: More Info, **Brief (new)** | **Brief beside Plan (new)** |
| The figures | the nav log | **Dist (new)** | **strip (new)** | **strip (new)** |
| A nav log row | its field's card | **name (new)** | leg detail | leg sheet |
| A saved flight | Open, Flown Track (replay, profile), Debrief, Delete, Undo | page; Debrief on its page | **swipe and hold: Flown Track, Delete; Undo (new)** | -- |
| A flight just ended | Debrief the approaches · Log it | FlightLoggedSheet | FlightLoggedSheet | FlightLoggedSheet |
| An approach | Brief, Dry Run, Load into Route, Plate | procedures sheet | procedure menu | -- (not on Android yet) |
| An alert | what it is and its fix | AlertsBanner opens it | **not tappable (gap)** | **not tappable (gap)** |
| A Go / No-Go item, a Brief line | its fix | opens its page | targets only | **not tappable (gap)** |

## Gaps left, for the owner

These need a decision, a server change or another branch's work:

1. **Emergency assistant on the ground** (web 5–6 taps, iOS 3, Android 3).
   It lost its map button on 2026-11-08 by the owner's call. A row for it
   in Setup's list, or in the Airplane tab's checklists, would make it 2;
   `open=emergency` opens it from a link meanwhile.
2. **Checklists and Squawks on the web** (4 taps, inside the airplane
   form). A Checklists row in Setup's list beside Airplanes would make it 2.
3. **Coach, Checkride, Instructing, the drills** (3 taps, web). Rows in
   Setup's list would make them 2.
4. **Saved flights' name and notes** can't be changed anywhere: the gateway
   has no update for a flight (`PUT /api/flights/{id}` exists only for its
   track). An endpoint, then an inline field on each platform.
5. **Logbook entries on Android** are read-only; entries on the web and
   iOS open a form rather than editing in the row.
6. **The route's Undo is a toast on the web** (`use-plan-history`), where
   the rule is "where it happened". The iPhone's is a bar over the sheet.
7. **Alerts and Go / No-Go lines on the phones** don't open their fix; the
   ready-to-fly branch is doing the Go / No-Go fixes.
8. **Frequencies** (all three) show but can't be copied or tuned.
9. **Android has no Profile, saved flights, favorites list or Guide**
   (`design/screens.json` says which platform has which screen); that is
   the android-parity branch's.
10. **Close inconsistencies left:** the iOS Pick an Airplane sheet has no
    close button (the own-figures branch owns that view); Android's
    airport diagram is a full-screen dialog with no swipe.
