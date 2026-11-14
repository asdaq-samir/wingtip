# Navigation

How a pilot gets round Wingtip Maps on the web, the iPhone and Android:
every screen, the way to it from the map, how many taps that is, the link
that opens it, and what can be changed where it is shown. The owner's goals
(2026-11-09): "Let's make it easier for the pilots to navigate the app",
"Make the whole app experience easily editable", and "Just add the buttons
and options where they make sense intuitively, pilots don't have time to
find where things are."

Counted from the map with the sheet at rest. The sheet's tabs gave way
to the one search on 2026-11-09, so a search pick, a map tap or the
account button is 1 and a row inside what it opens 2; each platform's
section below says so for its own sheet. Where a table's first counts say
"tab", they are from before the one search. "Before" is `claude/integration` on
2026-11-09; "after" is with this branch. The audit was read from the code,
not timed on a device.

## The rules every platform keeps

- **Tap what you see.** Anything shown that is explained or changed
  somewhere opens that place: a field's name its card, the figures their
  nav log, a waypoint its menu. Closing goes back to where the pilot was
  (one level: `lib/openCards` on the web, the card's
  close and the stack's Back on iOS (`Navigation/Navigator`); on Android
  the card's ← and system Back, its ✕ closing every card, since the card
  rule of 2026-11-10).
- **Two taps at most** to every screen from the map and its sheet. A deeper
  screen gets a way in from a list that already holds its kind, never a new
  place on the screen; moving a panel or a control is the owner's call.
- **One way in per platform.** Every screen opens by its name from one place:
  the web's `useOpenScreen` (`features/plan/hooks`) through
  `lib/navigation/wanted`, iOS's `RootView.openScreen` (through
  `AppCommand.open`, a card's through the environment's `appCommand`;
  the strip's `ScreenAsk`), which opens the card
  by `Navigator.open`, Android's `OpenScreen` through
  `ScreenRequests`. A link, a figure tapped and a shortcut row all use it.
  Each is a `switch`/`when` over the generated list, so a screen added to
  `design/screens.json` fails each app's build until that app opens it.
- **The same verbs:** Edit, Delete, Move, Undo, Copy; More Info for a thing's card;
  Direct To, Set Altitude…, Hold Here…, Add a Stop After, Remove for a point
  of the route. "Airplane", never "aircraft", except in the FAA's own form
  wording (the flight plan's "Aircraft identification").
- **Undo after a delete, each platform's stock way** (the owner,
  2026-11-10: stock components): on the web a Base UI Toast with its Undo
  action (`lib/toast` `toast.undo`); on Android Material's `Snackbar` with
  its Undo action (`RouteUndoSnackbar` for the route); on iOS an Undo row
  in the list it went from (`Views/UndoRow`) or the route's Undo bar
  (`UndoBar`). Errors are never a toast.
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
| `fpl` | FPL | yes | yes | yes | The plan: the route, its altitude and its figures, the sheet's second page (Search, FPL). |
| `airport` | Airport | yes | yes | yes | The one search with nothing typed: the flight, favorites, recents, nearest. |
| `airplane` | Airplane | yes | yes | yes | The airplane picked's profile, or the one search where none is picked. |
| `setup` | Setup | yes | yes | yes | The account and settings page, the account button's. |
| `brief` | Brief | yes | yes | yes | The route's Brief and its Go / No-Go (needs a route). |
| `navlog` | Nav Log | yes | yes | yes | The nav log, leg by leg (needs a route). On Android the plan's Nav Log button opens it. |
| `profile` | Profile | yes | yes | -- | The route's side view and its altitudes (needs a route). |
| `flights` | Saved Flights | yes | yes | yes | The pilot's saved flights. |
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
| `search` | Search | yes | -- | yes | The sheet's first page: the one search and its home list (favorites, recents, nearest, saved). |

The plan's own keys go beside it, and alone they open what they name:

- `dep`: The route's departure, an ident.
- `dest`: The route's destination, an ident.
- `stops`: The points between, idents comma-separated.
- `place`: A field's card, by its ident.
- `flight`: An airplane tracked, by its ICAO address (six hex digits).
- `airplane`: An airplane's profile, by its N-number.
- `tfr`: A temporary flight restriction's card, by its FDC NOTAM number (6/4116).
- `navaid`: A VOR's card, by its ident and place (OBK@42.2214,-87.9517): an ident names navaids in more than one place.
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
(the screen `CommandHost` runs after a link's command, `Links.Route.then`). The word `open` is taken off
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
  everyone. Android lists Saved Flights (You → Flights) but makes
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

Since the one search (the owner's approved design, 2026-11-09, branch
`claude/one-search-web`) the web's sheet has no tabs. Its first row is one
field, "Search airports and airplanes" (the web has no Ask since decision 0041), with the microphone its
trailing button, and over it the title row with the account button at its
right (the owner's Apple Maps screenshot, 2026-11-10); under it the plan (with a route) or the search's
own page (with none, or the field in use). On a desktop the same in the
side panel, ⌘K or Ctrl K focusing the field (the command palette it
replaced), `/` too, and the airport card's F, D and S for Fly Here, Depart
From and Add as Stop. Counted from the map with the sheet at rest: the
search field or the account button tapped is 1. "Before" is the count
from before the one search. By the one card rule (the owner, 2026-11-10) every thing and page
is a card over the search with its ✕ (only Emergency fills the sheet's
height), and Escape or a device's Back closes the top card or page first,
then a level back, on a phone as on a desktop; with none open they lower
the sheet. By the one scrolling rule (same day) a card's name and ✕ stay
pinned as it scrolls, so the way out is always one tap; below full a drag
up on the sheet raises it before anything scrolls; back from a page, a
list is where it was.

| Screen | Path from the map | Taps before → after | Edit in place |
|---|---|---|---|
| Plan: route box, route list, nav log rows | the sheet (with a route); the search's Your Flight card | 1 → **0** with a route, 1 from the search | Route pills drag to reorder; each point's menu: Change, Direct To, Set Altitude…, Hold Here…, More Info, Add a Stop After, Remove; altitude and departure time chips open popovers; Undo bar under the route after a removal or clear |
| Figures at the sheet's foot | none | 0 | Fuel opens its breakdown (Add fuel stop); ETE/ETA and To swap; Dist opens the nav log |
| Brief | plan → Brief; search → Do → Brief | 2 | Alternate filed or taken off (iOS too: the Brief's Alternate sections, and the plan's Alternate row under IFR, 1 tap); Ask chips apply changes |
| Nav log card | plan → ••• → Nav log; Dist tapped; search → Do → Nav Log | 1 | Rows select; a field's name opens its card |
| Profile | plan → Profile | 2 → **1** with a route | VFR/IFR, altitude in the side view, Dry run |
| Search results (Airports, Waypoints and Navaids, Airplanes, Do, Ask) | the search field, typed | **new: 1** | -- |
| Saved flights | search → Saved; account → Flights | 2 | Name and notes edited in the row; delete with a confirm |
| Airport card | Tap a field; a search result; a route row's More Info; a nav log field | 1 (2 from the search) | **Fly Here, Depart From, Add as Stop at its top (new)**, favorite; frequencies copy |
| Favorites, Recents (airports' and airplanes') | search → Favorites / Recents | 2 | Drag to reorder, swipe to delete, Undo row; the airplanes after the airports in each, and in the search page's rows |
| Nearest | search → Nearest; search → Do → Nearest | 2 | Change the place it is from in the one search's field, scoped to it (no second field) |
| Airplane profile | an N-number tapped; a search result (yours, the FAA registry's) | 1, 2 | **Fly This Airplane (new)**; every figure edited in place; a card in the sheet over the search with ✕ (one card rule, 2026-11-10; was a dimmed sheet on a phone) |
| Airplane card, past flight | Tap traffic; the airplane found in the one search (heard on the map by callsign or address, kept, or the FAA registry's in the air); a Favorite's or Recent's tile; its past row | 1, 2 | Replay; search → Do → Show Traffic turns the traffic on the map. The traffic's own page, with a second search field, went for the one search (the owner, 2026-11-14), and an old `?aircraft=1` link lands on the search |
| Your Airplane or an airplane kept, added | search → Favorites' Add → Airplane; the Airplane tile's Add | 1 → 2 | The one search asks for it ("Search for your airplane", "Search for an airplane to keep"); the one picked is kept, not opened |
| A route point's airport picked | its pill or its menu's Change → the one search, scoped ("Search for a destination") | 1 → 2, as before | Enter takes what is typed until the rows answer it; picked, back where it was asked from |
| Questions (Ready to Fly's prompt, a source's report as sent) | as they come; a source chip | 0 / 1 | SheetDialog: a sheet from the bottom on a phone with its ✕ (Fly Anyway the prompt's answer), a dialog from `md` up |
| Map card (was the Map menu) | Map button | 1 | A card in the sheet over the search, as Apple Maps' Choose Map card (the owner, 2026-11-10): the charts as picture tiles (a tap applies), then the weather, the base map ("Overlay" until 2026-11-14), every switch and the alerts in place; its ✕ goes back to the sheet as it was; its Search row focuses the search |
| Emergency assistant | Flying head; voice; search → Do → Emergency Assistant | 1 in flight, **2** on the ground | Its frequencies copy; the one full-height card, ✕ top right, nothing dimmed |
| Settings (was Account and Settings, Setup) | account button (the page itself, no menu: the owner, 2026-11-10) | 1 → 2 → **1** | Layout tiles in place; covers the title row and the search, its ✕ back |
| Airplanes, Flights, Logbook, Minimums, Checklists, Coach, Practice | account button → row on the page | 2 | Minimums inline; logbook entry edited in the row, delete with an Undo row; airplane in a popover form |
| Status, Guide, About | account button → row on the page; About also the map's or the search page's Legal | 3 → **2** | -- |
| Checkride, Instructing | account button → Logbook → row | 3 | Checkride inline |
| Squawks | account button → Airplanes → airplane → row | 4 | Squawks inline |

### iOS

The sheet has two pages, Search and FPL, turned by one round toggle
under the 3D button (`Views/MapButtonsDock.swift`); Search is one stock
`.searchable` field ("Search airports, airplanes, or ask") with the
microphone and the account button beside it. Since the card rule (the
owner, 2026-11-10) every thing and every page opens as **one card over
the sheet**, as Apple Maps opens a place over its search: the system
sheet at half (`.medium`), the map live above it up to half height, its
close at the right, one card at a time (a field tapped after another
takes its place). Emergency alone opens at `.large`, a card like the
rest. What a card opens is pushed in the card's own stack with Back
(`Navigation/Navigator`, `CardHost`, `SheetPage`). Questions are the
stock alert or confirmation dialog (Ready to Fly's prompt, a form's
Discard Changes?). The iPad's sidebar holds the same search and plan, its
pages pushed there and its things in the inspector. Counted from the map
with the sheet at rest: the search or a row of the plan is 1.

**One row (owner decision 2026-11-10).** The "Flight Plan" title bar is
gone on the iPhone: the sheet's top row is the search with the microphone
and the account button beside it, and the route card sits under it (the
route, Ready to Fly, the figures, Brief, Nav Log, Airplane, •••). Saved
Flights, Share and Undo, which were the bar's, are in the route card's
•••: Flights 1 → 2, Share 1 → 2 (its ways a submenu, 3 to pick one), Undo
1 → 2, and Undo is still 0 taps by shaking the iPhone or ⌘Z.

| Screen | Path from the map | Taps before → after | Edit in place |
|---|---|---|---|
| Plan (was FPL) | the sheet itself | 1 → **0** | From/To and altitude inline; stops Edit (delete, move), **Add a Stop (the search)**; each point's menu; Undo bar |
| Search (was Airport) | the field | 1 | Nothing typed: Your Flight, Favorites (fields and airplanes), Recents, Nearest; typed: Airports, Waypoints and Navaids, Airplanes, Do (Direct To, screens, Ask) |
| Airport card | Tap a field; a search row; a list's row (Nearest, Favorites, Recents); hold for its preview; a link's `place=` | 1 | The one card from every way in: Fly Here (the flight's time when planned), Depart, Add Stop, Diagram; the floating bar's Add to Plan, Favorite, Share, •••; its sections' picker pinned under the bar once its head scrolls away; frequencies copy on hold |
| Airplane profile | any N-number or airplane figure; the search's N-number or own airplane; a link's `airplane=` | 1–2 | **One profile card**: its own card from the plan or the search, pushed in the card it was tapped in; Fly This Airplane; every figure edited in place (an inline ask's Edit opens it at that figure) |
| Airplane (was the tab) | the plan's Airplane button; the search's types; Pick an Airplane and Ready to Fly's fix (pushed in their card, with Back) | 2 | N-number typed, No Airplane |
| Route Leg | a tap on the map's course; a nav log row (pushed in the Nav Log card) | 1 / 3 | **One card** from both: Direct To, Remove, then the leg's figures |
| Figures strip | the sheet's foot, with a route | 0 | Tapped, the nav log |
| Nav Log | the route card's Nav Log; the strip | 2 → **1** / 1 | -- |
| Brief | the route card's Brief; the search's Do | 2 → **1** | the Brief's one foot bar, Start Flight |
| Profile | the route card's ••• → Profile; the cruise altitude in the route section; a stop's Set Altitude… (on that waypoint's Start At / Cross At popover); the search's Do | 1 / 2 | The vertical altitude slider (Set, Auto in flight); the Altitude Advisor's rows pick the cruise; a waypoint's altitude, typed or stepped |
| Saved Flights | the route card's ••• → Saved Flights (was the bar's, 1); the search's Do; Settings' Flights row | 1 → **2** (one-row header, owner decision 2026-11-10) | Swipe to delete with an Undo row |
| Share | the route card's ••• → Share → a way (was the bar's Share, 1 → 2) | 2 → **3** | -- |
| Undo | the route card's ••• → Undo (was the bar's, 1); shake; ⌘Z | 1 → **2**, shake 0 | -- |
| Nearest | the instruments bar; the search's All Nearest; the plan's Nearest for a Diversion; Siri | 1–2 | **One list** from every way in: Divert on a swipe or a hold, Diversion Drill |
| Map card (new) | the map's own Map button; Settings' Map row | **1** (was 2, Settings) | The layers, airport weather, traffic, the weather loop and the alerts, each switch in place |
| Settings (was Setup) | the account button, opening Settings with no menu between (the owner, 2026-11-10) | 1 → 1 | Every switch and picker in place; Sign In or the account's page with Sign Out |
| Settings' pages (Logbook, Coach, Minimums, Guide, Downloads, About, Practice, Your Airplanes, Checklists, Map) | the account button → row (pushed in the Settings card) | 2 → 2 | Logbook entry edited in the row; swipe delete with an Undo row |
| Hold, Clearance (forms) | a point's Hold Here…; the radio's button, shown only with Comms Assist on (Settings › In Flight › ATC, off by default; the owner, 2026-11-13) | 2 / 1 | Cancel and Add / Done; with an edit, a swipe down is held and Cancel asks first |
| Emergency | the instruments bar; Settings' Emergency row; "mayday" in the search | 1 / 2 | Full screen, close at the top right; its frequencies copy |
| An alert ahead, a copilot message | the banner | 0 | Tapped: the airspace card; the message's Direct To and More Info |

### Android

No tabs since the one search (the owner, 2026-11-09): the sheet's first row
is the search ("Search airports, airplanes, or ask"), the microphone and the
account button; under it the flight's card, Favorites, Recents and Nearest,
or the plan. Since the card rule (the owner, 2026-11-10) every card and
page takes the search's place with its name and ← (Google Maps' "← KOSH"),
opens at half, and goes on the sheet's own stack: ← and Back one level,
✕ every card back to the search. On a tablet or an unfolded phone the same
sits in Material's list and detail panes beside the map, the cards in the
detail pane. Taps are counted from the map with the sheet at rest; typing
in the search is not counted.

| Screen | Path from the map | Taps before → after | Edit in place |
|---|---|---|---|
| Plan (was FPL; its legs are the nav log) | the flight's card | 1 → 1 | Route fields, stops, VFR/IFR as before; Add a Stop and a point's Add a Stop After open the one search for the stop; each field of the route opens its card; under IFR an Alternate row after the destination (its card), or Add Alternate, which opens the Brief's Alternate (2026-11-10) |
| Nav Log, Profile | the flight's card → Nav Log (or the figures); the plan's Profile row or "profile" in the search opens the Profile card: the side view, its vertical altitude slider (Set, Auto in flight), a waypoint's Start At / Cross At sheet | 2 → 2 | as the plan; the Altitude Advisor's rows pick the cruise |
| A leg | a leg on the map, a nav log row, or a strip checkpoint: the one leg card | 1 / 2 | Direct, Remove |
| Brief | the flight's card → Brief; or search "brief" | 2 → 2 | Departure hour; Ready to Fly at its head; under IFR the Alternate (14 CFR 91.169): an alternate filed from those that will do, or taken off, as the web's (2026-11-10) |
| Airport card | search → the field; tap it on the map; a list row; the plan's field | 1 + typing (map 1) | Fly Here (with its time), Add as Stop, Call and Favorite under its head, in sight at half; Overview, Weather, Frequencies, Runways, Charts, NOTAMs pinned right under them, and the field's report in a line |
| A fix, VOR, airspace, traffic, What's Here | tap it on the map; an alert; a point's More Info | 1 | its actions |
| Airplane card (the one airplane card) | the flight's card → Airplane; search → an airplane; Ready to Fly's Pick an Airplane; a logbook N-number | 2 → 2 | The flown airplane's picker, registration (suggesting as typed), passengers, Your Airplanes; every figure a tap to edit; Fly This Airplane. An N-number's: Fly This, Follow, Favorite, Share; Flights (▶ replays one), Info, Figures |
| Checklists | Airplane → Checklists tab → a checklist (on the card's stack) | 3 → 3 | Ticks; Edit as text |
| You | the avatar | 1 | Pilot Details, Airplanes, Flights, Logbook, Minimums, Training, Emergency; a swipe down closes it |
| Settings | the avatar → its gear; also the Map card's gear | 2 | Map, In Flight, Data, Help & About (Sunlight is the Map card's Look since 2026-11-14); a swipe down closes it |
| Saved Flights | the avatar → Flights | 2 | A flight planned again with a tap |
| Map card (no Map Settings page; the owner, 2026-11-13) | the map's Layers button; or search "map" / "layers" | 1 (+ typing 0) | Four sections of four tiles each, Chart, Base map, Layers and Look (Theme, Appearance, Sunlight; the owner, 2026-11-14), each a tap; the terminal charts always drawn, no switch; its gear opens Settings at its Map group (Airport Weather, glide ring) |
| Logbook, Training (the Coach) | the avatar → its row | 2 | Logbook entries edited in the row; Delete with an Undo |
| Downloads, Passenger Briefing, ATC, About | the avatar → its gear → Settings' row (Data, In Flight, Help & About) | 3 | Downloads delete with no confirm or Undo |
| Clearance | search "clearance" or "radio"; the strip's chip | typing / 1 | Listen, Enter the Route |
| Dry run | the plan's Dry Run; or search "dry run" (with a route) | 2 / typing | Play, speed, forecast; Back ends it |
| Emergency (a card on the sheet's stack, opened at full height) | Instruments bar; search "emergency"; You → Emergency | 1 | Its frequencies copy; the card bar's ← and ✕; closed by ✕ alone, never a swipe |
| Alerts ahead, a copilot message | the banner | 1 | Tapped: the Ahead sheet, More Info on a Class B, C or D; the message's Fly to and More Info |
| Nearest, Ask | Instruments bar; the sparkle; Nearest also under the search | 1 | a field opens on Nearest's stack |

## Contextual actions: where each lives

The primary action is on the thing itself; the rest one tap away in its
menu (web popover or menu, iOS context menu and swipe, Android long-press
or overflow).

| On | Actions | Web | iOS | Android |
|---|---|---|---|---|
| A waypoint of the route | Direct To, Set Altitude…, Hold Here…, More Info, Add a Stop After, Move, Remove, Undo | point menu (all) | point menu (all but Add a Stop After; More Info new; Set Altitude… opens the Profile on the point's Start At / Cross At popover, which also takes typed feet) | **⋮ point menu: all but Set Altitude… (a waypoint's altitude is set on the Profile card, Start At or Cross At); Undo row (new)** |
| The destination | More Info (weather, frequencies, runways, approaches), Brief, Nearest | More Info; Brief on FPL | point menu: More Info, **Brief (new)** | Brief beside Plan; **point menu: More Info, Brief (new)** |
| The figures | the nav log | **Dist (new)** | **strip (new)** | **strip (new)** |
| A nav log row | its field's card | **name (new)** | leg detail | leg sheet |
| A saved flight | Open, Edit (name, notes), Flown Track (replay, profile), Debrief, Delete, Undo | page; Debrief on its page; **Edit in the row's menu (new)** | swipe and hold: Flown Track, **Edit (new)**, Delete; Undo | Open (You → Flights); the rest not yet |
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
4. **Android's route Undo row** shows only on the plan (an edit from the
   map's leg card makes one there); the point menu is not on the
   departure or in the strip layout, and has no Set Altitude… (a
   waypoint's altitude is set from the Profile card instead).
5. **Logbook delete differs underneath:** the web deletes at once and its
   Undo logs the flight again (a new id), the phones hold the DELETE until
   the Undo goes. The web's confirm before a delete is gone on all three.
6. **Android has no saved flights, Guide or Practice** (its Profile card came 2026-11-10); its
   Favorites are the fields starred on their cards and the pilot's own
   airplanes, kept on the phone (`design/screens.json`); that is the android-parity branch's,
   and saved flights' Edit follows it there.
7. **Close inconsistencies left:** Android's airport diagram is a
   full-screen dialog with no swipe. (iOS's Pick an Airplane now pushes
   the Airplane page in its card, with Back.)
8. **Go / No-Go lines** opening their fix are the ready-to-fly branch's.
