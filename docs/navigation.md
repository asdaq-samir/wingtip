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
- **The same verbs:** Edit, Delete, Move, Undo, Copy; More Info for a thing's card;
  Direct To, Set Altitude…, Hold Here…, Add a Stop After, Remove for a point
  of the route. "Airplane", never "aircraft", except in the FAA's own form
  wording (the flight plan's "Aircraft identification").
- **Undo where it happened:** after a delete, an Undo row in the list it
  went from (web `components/UndoRow`, iOS `Views/UndoRow`, Android
  `ui/UndoRow`), or the route's Undo bar under the route (web
  `RouteUndoBar`, iOS `UndoBar`, Android `RouteUndoRow`); never a toast.
- **Frequencies copy:** every frequency shown copies with a tap (web
  `FrequencyButton`) or a hold (iOS `FrequencyActions`, Android
  `FrequencyRow`). No platform has Tune: none reaches a radio (the
  receiver is ADS-B/FIS-B in, the Bluetooth audio records only).
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
| `shared` | Shared Flight | yes | yes | yes | A flight another pilot sent: its plan shown first, with Use This Plan and Not Now, the receiver's own plan kept until they choose. Its keys are the plan's (dep, dest, stops, altitude_ft, depart, type, rules, tail) or a saved flight's share. |
| `about` | About | yes | yes | yes | The build, the data's cycles, the credits and the legal pages. |

The plan's own keys go beside it, and alone they open what they name:

- `dep`: The route's departure, an ident.
- `dest`: The route's destination, an ident.
- `stops`: The points between, idents comma-separated.
- `place`: A field's card, by its ident.
- `flight`: An airplane tracked, by its ICAO address (six hex digits).
- `altitude_ft`: A shared plan's cruise altitude, feet MSL.
- `depart`: A shared plan's departure time, an ISO 8601 instant in UTC; none for about now.
- `type`: A shared plan's airplane type, its designator (C172); shown, never assumed: the receiver flies their own.
- `rules`: A shared plan's flight rules, vfr or ifr.
- `tail`: A shared plan's N-number, only where its pilot chose to send it.
- `share`: A saved flight shared by its pilot, by its token (GET /api/shared-flights/{token}); read-only, until they stop sharing it.

<!-- END generated -->

A link with a route and a screen (`?dep=C81&dest=KDLH&open=brief`) plans
the route, then opens the screen: the web waits up to 30 s for the route
(`lib/navigation/wanted`), the phones open it after the route command
(`PendingCommand.then`, `Links.Route.then`). The word `open` is taken off
the web's address once used, so a reload or Back does not open it again.

## Sharing a flight

A pilot sends a plan to another pilot or an instructor as a link that opens
as a preview, the `shared` screen above, on the web, the iPhone and Android
alike (the owner, 2026-11-09). Two kinds, one address:

- **Plain:** `/app/plan?open=shared&dep=KMSN&dest=KOSH&stops=KJVL&altitude_ft=3500&depart=2026-11-10T15:00:00Z&type=C172&rules=vfr`,
  the plan in the link itself, which stores nothing on a server and opens
  signed out. `tail=` only where the pilot ticks Include N-number. Sent from
  the route's Share (the web's route menu and its cards' Share in the bar,
  iOS's Share menu, Android's FPL Share) through the platform's own share
  sheet: the Web Share API, or the link copied; `ShareLink`; the Android
  sharesheet.
- **Saved:** `/app/plan?open=shared&share=<token>`, a saved flight shared
  from its menu (the web's and iOS's Saved Flights: Share, Share with
  N123AB, Stop Sharing): `POST /api/flights/{id}/share` makes the link,
  read-only, read by anyone with it at `GET /api/shared-flights/{token}`
  (the route, altitudes, departure time, airplane type, picks and nav log;
  never the pilot's name, notes or risk, and the N-number only where they
  chose), until `DELETE /api/flights/{id}/share` (Stop Sharing) ends it for
  everyone. Android has no Saved Flights yet, so it opens these but makes
  none.

Opened, the link is never planned by itself: the web takes its keys off
the address before the planner reads its route (`features/shared-flight`),
the phones read `open=shared` before a route (`Links`). The preview shows
the route, altitude, departure time, the airplane type (the receiver's own
airplane flies it; none is assumed), the rules and, for a saved flight, its
filed nav log; **Use This Plan** plans it and opens its nav log, **Not Now**
leaves the receiver's plan as it was. Messages, Slack and the like preview
the web address with the route as its title ("KMSN → KOSH · 3,500 ft") and,
for a saved flight, its route drawn (`SharePreviewController`). The address
is under `/app/*`, which the iOS associated domain and the Android App Links
already claim, so it opens the app where it is installed and the web
otherwise.

## Screens, paths and taps

### Web

| Screen | Path from the map | Taps before → after | Edit in place |
|---|---|---|---|
| FPL: route box, route list, nav log rows | FPL | 1 | Route pills drag to reorder; each point's menu: Change, Direct To, Set Altitude…, Hold Here…, More Info, Add a Stop After, Remove; altitude and departure time chips open popovers; **Undo bar under the route after a removal or clear (was a toast; new)** |
| Figures at the sheet's foot | none | 0 | Fuel opens its breakdown (Add fuel stop); ETE/ETA and To swap; **Dist opens the nav log (new)** |
| Brief | FPL → Brief | 2 | Alternate filed or taken off; Ask chips apply changes |
| Nav log card | FPL → ••• → Nav log; **Dist tapped (new)** | 3 → 1 | Rows select; **a field's name opens its card (new)** |
| Profile | FPL → Profile | 2 | VFR/IFR, altitude in the side view, Dry run |
| Saved flights | FPL (no route) → Saved; Setup → Flights | 2 | **Name and notes edited in the row (Edit in its menu; new)**; delete with a confirm |
| Airport card | Tap a field; a route row's More Info; **a nav log field (new)** | 1 | Add stop, Fly Here, favorite; **frequencies copy (new)** |
| Airport Favorites | Airport → Favorites | 2 | Drag to reorder, swipe to delete, **Undo row (new)** |
| Nearest | Airport → Nearest | 2 | Change the place it is from |
| Airplane card, past flight | Tap traffic; its past row | 1, 2 | Replay |
| Map menu | Map button | 1 | Every switch in place |
| Emergency assistant | Flying head; voice; **Setup → Emergency Assistant (new)**; the checklist page | 1 in flight, 5–6 → **2** on the ground | Its frequencies copy |
| Setup | Setup | 1 | Layout tiles in place |
| Airplanes, Flights, Logbook, Minimums | Setup → row | 2 | Minimums inline; **logbook entry edited in the row, delete with an Undo row (new)**; airplane in a popover form |
| Checklists | **Setup → Checklists (new)**; Setup → Airplanes → airplane → row | 4 → **2** | Checklist as one text |
| Coach | **Setup → Coach (new)**; Setup → Logbook → Coach | 3 → **2** | -- |
| Practice (Holding, Lost comms, the drills) | **Setup → Practice (new)**; Setup → Guide → row | 3 → **2** | -- |
| Checkride, Instructing | Setup → Logbook → row | 3 | Checkride inline |
| Squawks | Setup → Airplanes → airplane → row | 4 | Squawks inline |

### iOS

The one search (the owner's design of 2026-11-09) replaced the sheet's
four tabs: the plan is the sheet's root, under one stock `.searchable`
field ("Search airports, airplanes, or ask") with the microphone and the
account button beside it, and every other screen is a page on the sheet's
one stack (`Search/PlanSheet`, `SheetPage`), its close going back one
level. The iPad's sidebar holds the same search and plan. Counted from the
map with the sheet at rest: the search or a row of the plan is 1.

| Screen | Path from the map | Taps before → after | Edit in place |
|---|---|---|---|
| Plan (was FPL) | the sheet itself | 1 → **0** | From/To and altitude inline; stops Edit (delete, move), **Add a Stop (the search)**; each point's menu; Undo bar |
| Search (was Airport) | the field | 1 | Nothing typed: Your Flight, Favorites (fields and airplanes), Recents, Nearest; typed: Airports, Waypoints and Navaids, Airplanes, Do (Direct To, screens, Ask) |
| Airport card | Tap a field; a search row; hold for its preview | 1 | **Its own sheet (half, full) with Fly Here (the flight's time when planned), Depart, Add Stop, Diagram; the floating bar's Add to Plan, Favorite, Share, •••**; frequencies copy on hold, runways' details on hold |
| Airplane profile | the search's N-number or own airplane; any N-number | 2 | **Fly This Airplane** in its head; every figure edited in place |
| Airplane (was the tab) | the plan's Airplane button; the search's types | 2 | N-number typed, No Airplane |
| Figures strip | the sheet's foot, with a route | 0 | Tapped, the nav log |
| Nav Log | the plan's ••• → Nav Log; the strip | 2 / 1 | -- |
| Brief, Profile, Flights | the plan's row or bar; the search's Do; the account menu | 2 | Saved flights: swipe to delete with an Undo row |
| Settings (was Setup) and its pages (Logbook, Coach, Minimums, Guide, Downloads, About, Practice, Your Airplanes, Checklists) | the account button → row | 1 → **2** | Logbook entry edited in the row; swipe delete with an Undo row |
| Emergency | the instruments bar; the account menu; "mayday" in the search | 1 / 2 | Its frequencies copy |
| An alert ahead, a copilot message | the banner | 0 | Tapped: the airspace card; the message's Direct To and More Info |

### Android

| Screen | Path from the map | Taps before → after | Edit in place |
|---|---|---|---|
| FPL (its legs are the nav log) | FPL | 1 | Departure, destination, stops typed; VFR/IFR; leg rows open the leg; **each point's ⋮ menu: More Info, Brief (destination), Direct To, Hold Here, Add a Stop After…, Move Up, Move Down, Remove; Undo row over the legs (new)** |
| Figures strip | none | 0 | **Tapped, the FPL tab's legs (new)** |
| Brief | strip layout only | unreachable in tabs → 2 (**FPL → Brief, new**) | Departure hour |
| Airport tab, card | Airport; tap a field | 1 | Search; **Frequencies section, tap to copy (new)** |
| Airplane tab, checklists | Airplane → Checklist; **Setup → Checklists (new)** | 2 | Ticks; Edit as text |
| Setup, Logbook, Coach | Setup → Logbook; **Setup → Coach (new)** | 2 / 3 → **2** | **Logbook entries edited in the row; Delete with an Undo row (new; were read-only)** |
| Downloads, Passenger Briefing, About | Setup → row | 2 | Downloads delete with no confirm or Undo |
| Emergency | Instruments bar; **Setup → Emergency Assistant, Airplane → Emergency Assistant (new)** | 1 / 3 → **2** | Its frequencies copy |
| Alerts ahead, a copilot message | the banner | 1 | **Tapped: the Ahead sheet, More Info on a Class B, C or D; the message's Fly to and More Info (new)** |
| Nearest, Ask | Instruments bar; the sparkle | 1 | -- |

## Contextual actions: where each lives

The primary action is on the thing itself; the rest one tap away in its
menu (web popover or menu, iOS context menu and swipe, Android long-press
or overflow).

| On | Actions | Web | iOS | Android |
|---|---|---|---|---|
| A waypoint of the route | Direct To, Set Altitude…, Hold Here…, More Info, Add a Stop After, Move, Remove, Undo | point menu (all) | point menu (all but Add a Stop After; More Info new) | **⋮ point menu: all but Set Altitude… (no per-point altitude on Android); Undo row (new)** |
| The destination | More Info (weather, frequencies, runways, approaches), Brief, Nearest | More Info; Brief on FPL | point menu: More Info, **Brief (new)** | Brief beside Plan; **point menu: More Info, Brief (new)** |
| The figures | the nav log | **Dist (new)** | **strip (new)** | **strip (new)** |
| A nav log row | its field's card | **name (new)** | leg detail | leg sheet |
| A saved flight | Open, Edit (name, notes), Flown Track (replay, profile), Debrief, Delete, Undo | page; Debrief on its page; **Edit in the row's menu (new)** | swipe and hold: Flown Track, **Edit (new)**, Delete; Undo | -- (no saved flights on Android yet) |
| A logbook entry | Edit, Delete, Undo | **in the row; Undo row (new)** | **in the row; Undo row (new)** | **in the row; Undo row (new)** |
| A frequency | Copy (Tune nowhere: no radio link) | **tap (new)** | **hold (new)** | **tap (new)** |
| A flight just ended | Debrief the approaches · Log it | FlightLoggedSheet | FlightLoggedSheet | FlightLoggedSheet |
| An approach | Brief, Dry Run, Load into Route, Plate | procedures sheet | -- (ProceduresRow picks the procedure only; gap) | -- (no approach list on Android; gap) |
| An alert | what it is and its fix | AlertsBanner opens it | **the airspace card; copilot: Direct To, More Info (new)** | **the Ahead sheet; copilot: Fly to, More Info (new)** |
| A Go / No-Go item, a Brief line | its fix | opens its page | targets only | **not tappable (gap)** |

## Gaps left, for the owner

The nav follow-ups (2026-11-09) closed the first list's gaps 1 to 8 as far
as each platform has the screen. What is left needs a decision, a server
change or another branch's work:

1. **Approach actions on the phones.** iOS's `ProceduresRow` only picks a
   procedure and its transition (this page said earlier it had a procedure
   menu; it does not), and Android lists no approaches at all, so neither
   has Brief, Dry Run, Load into Route or Plate on an approach row.
2. **No Tune anywhere.** No platform reaches a radio; Copy is the action.
   The web nav log and ATIS rows, Android's ATC card, nav log, D-ATIS and
   the strip's chips show no frequency to copy (the ATC card is
   android-parity's).
3. **Alerts ahead have no one-tap fix**: the planner sends only the rule
   (`need`), so the phones open the airspace's card (iOS) or the Ahead
   sheet (Android) with it; a fix needs the planner to say one. TFRs,
   special-use areas, terrain and obstacles have no card on Android.
4. **Android's route Undo row** shows only on the FPL tab (an edit from the
   map's Route Leg sheet makes one there); the point menu is not on the
   departure or in the strip layout, and has no Set Altitude… (no
   per-point altitude on Android).
5. **Logbook delete differs underneath:** the web deletes at once and its
   Undo logs the flight again (a new id), the phones hold the DELETE until
   the Undo goes. The web's confirm before a delete is gone on all three.
6. **Android has no Profile, saved flights, favorites list, Guide or
   Practice** (`design/screens.json`); that is the android-parity branch's,
   and saved flights' Edit follows it there.
7. **Close inconsistencies left:** the iOS Pick an Airplane sheet has no
   close button (the own-figures branch); Android's airport diagram is a
   full-screen dialog with no swipe.
8. **Go / No-Go lines** opening their fix are the ready-to-fly branch's.
