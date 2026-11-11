# The rules every screen keeps

The owner's standing rules for how the apps open, close and scroll what
they show, how the one search works and how the map marks an airport's
weather. Every change to a card, a page, a sheet, the search or the map's
marks follows them, on all three apps. Each rule says what it is, each
platform's stock way of keeping it, and the tests that hold it.

This page says what the rules are. The platform references say how each
screen is built: [web.md](web.md), [ios.md](ios.md) (§0, "The sheet and
its detents") and [android.md](android.md) (§7). Where they disagree with
this page, this page wins and they are fixed. The reasons are in
decision [0033](../decisions/0033-one-card-rule-one-scroll-rule.md)
(cards and scrolling); the paths and tap counts in
[navigation.md](../navigation.md).

Stock means the platform's own component as it comes, with its own
states, motion and gestures (decision
[0016](../decisions/0016-stock-components.md)): on the web Base UI's
Drawer, Dialog, AlertDialog and Autocomplete under shadcn; on the iPhone
the system sheet, `NavigationStack`, `.sheet` and `.searchable`; on
Android Material 3's `SearchBar`, `BottomSheetScaffold` and Navigation
Compose. Nothing here is built by hand where a stock part does it.

## 1. The card rule (the owner, 2026-11-10)

1. **A thing opens as one card over the search, with ✕.** A thing is an
   airport, an airplane, a waypoint, navaid or fix, a route leg, traffic,
   an airspace, or the Map settings. It is the same card wherever it is
   opened from: the search, a map tap, a list (Nearest, Favorites,
   Recents), the plan, or a link.
2. **What opens inside a card stays in that card's stack, with Back**
   (NOTAMs, a diagram's details, a past flight, a page of Settings).
   It keeps the sheet's height: a card opens at half only from the search
   or the map, and a page opened inside a card stays at the height the
   sheet is at (owner decision 2026-11-10, on the Android sheet audit's
   SC-1). Each card sizes its own sheet (the owner, 2026-11-11): on the
   web its own nested drawer's snap point, asked through `useCardSize`,
   the sheet under it left at its own size.
3. **Pages are cards too.** Brief, Nav Log, Profile, Stops, Nearest, Ask,
   Settings and its pages, the Logbook, Checklists and Saved Flights
   cover the search the same way: ✕ closes, Back steps through the levels
   inside.
4. **Only Emergency is full screen**, its close where the platform puts
   a full-screen page's close, and it does not dim the map where the map
   is meant to stay usable.
5. **One search field.** Nearest, the traffic list, the airport picker
   and Add a Stop use the main search, scoped to what they ask for, never
   a field of their own.
6. **Back and Escape close the top card first**, then go back a level.
   Neither only lowers the sheet while a card is open; with no card open
   they may lower it.
7. **Questions are the platform's stock alert**: confirmations, Ready to
   Fly's prompt, a source report.
8. **The same thing is the same component.** A route leg is one view from
   the nav log and the map; the airplane is one profile card everywhere
   (the search, the plan's Airplane, a link, the pickers), with Edit
   inside it; Nearest is one list; Ready to Fly is one section plus one
   stock prompt.
9. **One way to open a screen by name**, which links
   (`design/screens.json`), Siri and App Actions all use.
10. **A card at the sheet's smallest size is its title row** (owner-reported
    2026-11-11: Account and Settings dragged down to the smallest size left
    the sheet empty, the grabber alone). As Apple Maps' place card does, a
    card at the pill shows its one title row -- its name, Share where it
    has one, and ✕ -- in the pill's room, and nothing else of it; a tap on
    the row or a drag up raises the sheet back to half with the card as it
    was; ✕ there closes the card and the pill then shows the search. With
    no card open the pill is the search, as before.
11. **The sheet keeps the size the pilot left it at** (the owner,
    2026-11-11: "I like the stock behavior"). The one size the app gives
    the main sheet is Apple Maps' rule: something new opened while the
    sheet is at its smallest size, the pill, rises to half so it can be
    seen. Nothing lowers the sheet (a card closed, Cancel, a tap on the
    chart, a flight starting), nothing takes it all the way up (a list,
    Saved, Favorites, a link), and a page put away (the Nav Log, the
    Profile, the Stops) leaves it where it is. Cards keep their own
    opening sizes (2, and the Detents row below): each card's drawer is
    its own, the sheet under it untouched.

| | Web | iPhone (Apple Maps' way) | Android (Google Maps' way) |
|---|---|---|---|
| A card | Base UI's own nested Drawer over the map's sheet, one per card, the last opened on top (`components/sheet/CardStack`; the owner, 2026-11-11): every `SheetCard`, every `PanelCard` (airport, airspace, traffic, a past flight, Nearest), the Brief and Settings (`CardLayer`), with the sheet's sizes, its grabber and its swipe; it covers the search and the title row, the sheet under it kept as it was; ✕ goes back to the search with its query kept (`lib/openCards`). The Nav Log, Profile and Stops stay pages of the sheet's own body, the route's figures pinned at its foot under them | One card over the plan's sheet, the same view (`SheetPageView`) from every way in, presented through one `.sheet(item:)` (`Navigation/CardHost`); the search is out of sight while it is up | The search bar becomes "← KOSH", the card's name with ←, its actions and ✕ at the end (`ui/sheet/CardPage`); the card fills the sheet, on the sheet's own NavHost (`ui/SheetNav`, `ui/SheetPages`) |
| Inside a card | Its own stack in the sheet; ✕ goes back one level | Pushed in the card's `NavigationStack` with the system's Back and edge swipe (`Navigator.push`) | `SheetNav.push`; ← and system Back go back one level, ✕ closes every card |
| Back, Escape | Escape is the top card's own nested drawer's, closing it (CardStack); with no card up the sheet's own Escape lowers it to the pill. A device's Back closes the top card the same way (`lib/backNavigation` `closeTopmost`): Android's through the browser's stock CloseWatcher, held only while something is open (`useBackCloses`), a TV remote's by its key; where there is no CloseWatcher (Safari) the browser's Back is left as it is. The browser's history is not the app's, as the planner replaces its address | The stack's Back; the card's close at the right of its bar | System Back closes the top card at once (`MapSheet`'s `lowerOnBack` only with none open); the dry run, the ATC card and the assistant's answer close on Back too |
| Questions | `SheetDialog`: a bottom sheet on a phone with ✕ or Cancel, centred from `md` up | `.alert` and `.confirmationDialog`, hung on the top of the stack (`TopHosts`) so they always show | `AlertDialog` (`ui/SourceDialog` for a source report) |
| Emergency | The one full-height card, ✕ at the top right, the map not dimmed | `fullScreenCover`, its close at the top right | Material's full-screen dialog, ✕ at the start of its app bar |
| One search | The traffic's airplane and Nearest's place are the search scoped to them (`listSearchOf`); the route's points ask it for an airport (`askSearchPick`) | The one `.searchable` field | Add a Stop and Add a Stop After open the one search (`SearchControl.stopAfter`) |
| At the pill | The card's pinned head (`data-sheet-head`: `PinnedHead`, Settings' title row, a console page's head) is all of the card left in sight there (CardStack's scroller; SheetParts' `headAlone` for a page of the sheet's body); a tap on the row raises the sheet to half | The system sheet's smallest detent shows the card's bar | The sheet's peek shows the card's bar |
| By name | `useOpenScreen` through `lib/navigation/wanted` | `RootView.openScreen`, which opens the card by `Navigator.open` | `OpenScreen` through `ScreenRequests` |

Each "by name" path is a `switch` or `when` over the generated list of
`design/screens.json` (`scripts/build/screens.sh`), so a screen added
there fails each app's build until that app opens it.

## 2. The scrolling rule (the owner, 2026-11-10)

1. **The title and ✕ always stay in view.** On the web, owner decision
   2026-11-10: one pinned frosted head, no large title -- the card's head
   is one row (its name, Share, ✕) pinned at the sheet's top under the
   grabber from the start, the content scrolling under it blurred through
   its frost ("just keep the title on top and content moves under with a
   frosty style"). A card's tabs or segmented control pin under the head,
   frosted the same way. On Android, at half height a
   card shows the small bar, its title and actions on one row, and at
   full the large flexible bar, folding as it scrolls (owner decision
   2026-11-10, on the Android sheet audit's H-1), so the half-height card
   keeps its room for content.
2. **Below full, a drag up grows the sheet first, then scrolls; at the
   top of the content, a drag down lowers it.** No pull to refresh inside
   a sheet: cards refresh by themselves.
3. **Everything scrolls.** No row is out of reach at any text size.
4. **Sideways rows only scroll sideways** and never move the sheet:
   photos, chips, route pills, hourly weather, the departure window.
5. **Back returns to where you were; something opened anew starts at the
   top.**
6. **A form swiped or backed away with an edit asks first**, and the
   prompt's Cancel keeps the edit.

| | Web | iPhone | Android |
|---|---|---|---|
| Pinned head | One scroller per sheet (SheetParts' `data-sheet-scroll`), its scroll indicator the browser's own, shown while it scrolls (iOS's transient bar; 2026-11-11), its head band (the search, the route's row) `position: sticky; top: 0` in it and frosted, the grabber's room inside it; tab pages laid out whole in it, nothing measured and no scroller pulled up under the head (2026-11-11); a card has its own nested drawer's scroller (CardStack). `PinnedHead`: one row sticky at the sheet's top from the start (under the search's row, a fixed height, `--sheet-head`, on a tab's list), frosted (index.css `frost-head`: the sheet's ground at the glass fill over the sheet blur, solid without backdrop-filter and under Reduce Transparency); on `CardTitle`, `CardHead`, `SheetCard`, `ListPageHead`, Settings' title row and a console page's head. The airport card's tabs pin directly under it by plain CSS (`PINNED_BELOW`: its room and its 3rem), frosted the same | The stock large navigation title collapsing to inline; nothing forces `.inline` but forms. The airport card's section picker pins under the bar | Material 3 Expressive's large flexible top app bar with `exitUntilCollapsed` on every card and page at full height, the plan included, and the small `TopAppBar` at half (`LocalSheetFull`); the airport card's tabs a `stickyHeader` |
| Grow, then scroll | Base UI's Drawer gives a drag to any scroller that can scroll, so below full the sheet's scroller and any in its body are `overflow-y: hidden` (index.css), which its arbitration skips; a script, the keyboard and a focused row still scroll them, the sheet left at its size | The system sheet's own behaviour, with nothing overriding it; no zoom push inside a resizable sheet, whose pull-down would pop the page | The sheet's nested scroll; every card shown from the search or the map opens at half (`halfWindow`) and grows to full; one pushed inside a card keeps the height |
| Detents | A card's nested drawer has its own snap point among the sheet's three sizes, the same fixed values in the Drawer's own units (`"4.75rem"`, `"23rem"`, `1`; `components/sheet/insets`), never px worked out from the window: it opens at half at the least, or as high as what it covers, and the sheet under it stays where it was; what is drawn follows the snap point the moment it is set; a throw goes where the Drawer takes it, its own behaviour (the owner, 2026-11-11) | A thing opens at `.medium`, a page at `.large`; every card grows to `.large`, and the map stays live under it up to `.medium` (`presentationBackgroundInteraction`); questions and forms stay modal | A card from the search or the map opens at half and grows to full; one opened inside a card keeps the height |
| Sideways rows | The Embla carousels (`CardPictures`, `RecentCards`) and the route's pills carry `data-base-ui-swipe-ignore="x"`; every native sideways row `overscroll-x-contain` and, in the sheet, `overflow-y: hidden` (index.css: `overflow-x: auto` alone made it a few points' vertical scroller, which took a drag up at half); the upright altitude Slider and the sortable rows' grips keep `""`, their drag being up and down | No control takes the sheet's drag: the Profile opens at full height for its upright altitude slider, the flown track's chart moves the replay on a tap | A sideways row takes only a sideways drag; the sheet's nested scroll takes the rest |
| Place kept | A card under a card keeps its place in its own drawer's scroller, and a card opened anew is a new drawer, at its top (CardStack); a kept tab keeps its place in the sheet's one scroller (`TabKept`'s `useKeptScroll`), and a tab's page opened anew starts at its top (`useStartAtTop`); the airport card's tabs each keep their place (`useTabScroll`); a tab not yet seen, picked with the bar pinned, opens at its own top under the bar, and a short one leaves the bar pinned (Apple Maps' place card; the owner's recording, 2026-11-11), Settings' list its place after a page (`lib/scrollPlace`); the suggestions, a sent search's results and its Filters page each have their own scroll box | The stack's own behaviour | Each card is its own back stack entry with its own scroll and title state; the welcome starts each page at the top |
| Footers | The card's own content | Every footer is the system's bar, `safeAreaBar` (`glassFoot`); a card's toolbar the stock bottom bar | The card's own content |
| Forms | `useDiscardGuard` (`components/discardGuard`): a swipe, Cancel, Escape or a tap beside asks first | `interactiveDismissDisabled` while there is an edit, Cancel at the leading edge asking in a `confirmationDialog` (`Navigation/FormCancel`) | `DiscardDialog` on a swipe or Back (Add Flight, Your Airplanes' form) |

The keyboard never hides the search row being typed in: on the web the
search row is the sheet's head alone (no title row over it since
2026-11-10), pinned at the top while the list scrolls under it, and the
field keeps its focus. A field's focus or what is typed in it never
changes the sheet's size (the owner, 2026-11-11: "Whenever I try to type
on search bar it takes the card to full screen"): the sheet stays where
the pilot put it, and the keyboard sits over the page as the Drawer
places it. The sheet, each card and each question sit on the keyboard by
Base UI's own `Drawer.VirtualKeyboardProvider` (`--drawer-keyboard-inset`
on the viewport), which also scrolls the field typed into into sight
over it.

## 3. The tests that hold the card and scrolling rules

The owner, 2026-11-10: "Can we have tests for opening/closing and
scrolling of the cards?" Each platform's suite is one table of cards,
each with its ways in, run through the same checks: a new card gets every
check by adding one row to the table.

**Open and close**, per card and way in: the same component (one stable
test id per card) whatever the way in; the search hidden (web, iPhone) or
"← name" (Android) while it is open; ✕, Back and Escape each close it in
one press, back to exactly where it came from; something opened inside
goes back to the card; a question is the stock alert and its Cancel
changes nothing; Emergency is full screen with its close where the
platform puts it.

**Scrolling**, per card: scrolled to its end, its title and ✕ are on
screen and take a tap, the large title collapsed; at half a drag up
raises the sheet before the body scrolls, and at full a drag down from
the top lowers it; the last row is reached and tapped at the largest
text size (web 200%, iPhone accessibility XXL, Android font scale 2.0); a
sideways swipe moves the row and not the sheet; the place is kept going
back, and a new card of the same kind starts at the top; a form with an
edit asks first.

| Platform | Table | Suites | On a pull request | Every night |
|---|---|---|---|---|
| Web (Playwright, the phone project) | [`e2e/cardTable.ts`](../../apps/web/e2e/cardTable.ts), its ways in [`e2e/cardEntries.ts`](../../apps/web/e2e/cardEntries.ts) | [`cards.spec.ts`](../../apps/web/e2e/cards.spec.ts), [`card-scroll.spec.ts`](../../apps/web/e2e/card-scroll.spec.ts); [`sheet-cards.spec.ts`](../../apps/web/e2e/sheet-cards.spec.ts) for the cards a control or a chart tap opens | The one `@smoke` test: the airport card from the search, opened, scrolled and closed | The rest |
| iPhone (XCUITest, `WingtipUITests`) | `CardTests.cards` in [`CardTestSupport.swift`](../../apps/ios/WingtipUITests/CardTestSupport.swift) | [`CardRuleTests`](../../apps/ios/WingtipUITests/CardRuleTests.swift), [`CardScrollTests`](../../apps/ios/WingtipUITests/CardScrollTests.swift), each at the default size and accessibility XXL; the detent read off the "Sheet Grabber" value | [`CardSmokeTests`](../../apps/ios/WingtipUITests/CardSmokeTests.swift) on the newest iPhone | The full suites on the iPhone, the iPad and iPhone Duo |
| Android (Compose UI, `androidTest`) | `CARDS` in [`ui/CardRuleTest.kt`](../../apps/android/app/src/androidTest/kotlin/app/wingtipmaps/android/ui/CardRuleTest.kt) | `CardRuleTest`, `ui/SheetNavTest` on the emulator; `SheetPageTest`, `OpenScreenTest`, `CardRequestsTest`, `SearchControlTest` on the JVM | The JVM tests | The instrumented tests on the emulator |

A check a card cannot meet says why in its row (`not` on the web), and
the suite prints that reason. What runs when is [docs/CI.md](../CI.md).

## 4. One search (the owner, 2026-11-09)

The sheet has no tabs. Its first page's first row is one field, "Search airports,
airplanes, or ask", with the on-device microphone and the account button
beside it; the account button holds settings and the account, where
Setup was. The approved canvas: <https://claude.ai/artifact/XmbNqJTLRwwzebouLbXzCV>.

- **Nothing typed:** the current flight as a card at the top (route,
  distance, ETE, fuel, altitude, airplane; a tap goes to the plan), then
  Favorites (airports and airplanes), Recents and Nearest.
- **Typing:** one list in groups: Airports; Waypoints and Navaids;
  Airplanes (your own, an N-number from the FAA registry, a type); Do
  (Direct To, Brief, Nearest, Emergency and every screen by name, and
  "Ask: …" to the assistant). Results come from the existing endpoints
  and generated models; the search holds no aviation logic.
- **Picking:** an airport opens its card with Fly Here, Add as Stop, Call
  and Address at the top, its star beside Share and Refresh in its
  Weather tab (the owner, 2026-11-11; the web first, the phones still
  with Depart From); an airplane its profile with Fly This Airplane; an
  action runs.
- **The plan is the sheet's main content** with a route, everything the
  FPL tab had in the same order.
- **Desktop web:** the same search and plan in the side panel; ⌘K, Ctrl K
  or / focuses it. There is no separate command palette.
- **Links** keep their ids: the old tabs map to the plan, the search, the
  airplane's profile and the account page.

| Web | iPhone | Android |
|---|---|---|
| Base UI Autocomplete with groups (`OneSearchField`, `OneSearchResults`, `hooks/useOneSearch`), Base UI Menu, list rows | `.searchable` with `.searchSuggestions` in the sheet's `NavigationStack` (`Search/OneSearch`, `OneSearchModel`), `Menu`, `List` | Material 3 `SearchBar` with its expanded results (`search/OneSearch`), `DropdownMenu`, `ListItem` |

Tests: [`e2e/one-search.spec.ts`](../../apps/web/e2e/one-search.spec.ts)
(`@smoke`: an airport picked from the search), `WingtipTests/OneSearchTests`,
Android's `search/SearchControlTest`.

### 4a. The sheet's two pages, Search and FPL (the owner, 2026-11-11)

The owner asked "Can we have a sheet carousel? With search and fpl?" and
chose swipe and dots, always two pages. This amends "The sheet has no
tabs. Its first row is one field": the sheet has two pages side by side,
and the one search is still the only field.

1. **Search** (the first page): the search's row (field, microphone,
   account button) and its home list (Favorites, Recents, Nearest,
   Saved, Find Nearby), the traffic and the search's lists in full.
2. **FPL** (the second page): the route's row (its pills, Routes, Brief,
   •••), the airplane and the altitude, the plan (the nav log, the
   Brief, the Profile, the Stops) and the route's figures pinned at the
   foot, which are FPL's alone. With no route, "Plan a flight" (the
   platform's empty view) with Search, which goes to the first page with
   the field focused, and Open Sample Flight. FPL has no field of its
   own: adding a stop asks the one search.

- **A sideways swipe on the sheet moves a page**; it never moves the
  sheet up or down, and a drag up or down is still the sheet's (and each
  page's own scroller's all the way up). Each page keeps its place.
- **The grabber is the page control** (the owner, 2026-11-11: "Can the
  grabber itself be split into two to behave as dots do for carousel?"):
  two short bars side by side, the grabber's width in all, Search's on
  the left and FPL's on the right, the page up's bar the stronger. A tap
  on the other bar picks its page; a tap on the page up's bar sizes the
  sheet as the grabber always did, and a drag on either moves the sheet.
  Each bar is a 44-point tap, the two meeting in the middle; said
  "Search, page 1 of 2", selected or not. Left and Right switch pages,
  Up and Down size the sheet. No row of dots: the first row sits where
  it did before the pages. A card's own grabber stays one bar.
- **The grabber names the page as it changes** (the owner, 2026-11-11:
  "Can the split grabber dot animate to show search or fpl and then fold
  to the grabber dot when swiped?"): on a swipe, a tap on a bar or a page
  the app picks (a route made), the new page's bar grows into a small
  capsule on its own side, in the grabber's colour with the page's name in
  it (Search's leftward from the grabber's middle, FPL's rightward: the
  owner, 2026-11-11, "stay on their sides rather than a shared capsule"),
  about 20 points tall, the other bar staying; it holds about a second and
  folds back into its bar, the stronger of the two. While a finger drags the pages it
  names the page it is heading to. It moves as the Drawer does, on its
  own time and curve; under Reduce Motion the name fades in and out with
  no size change. It never moves the sheet or takes a tap, and is not
  read aloud (the bars say the page; a page changed by a swipe is said
  once, politely).
- **A route made or opened** (Fly Here, a link, Saved) goes to FPL;
  clearing it stays on the page it is on.
- **Cards** open over both pages as before; ✕ comes back to the page
  they were opened over.
- **At the pill** the sheet shows the page's own first row (the search's
  on Search, the route's on FPL), the split grabber over it, and nothing
  else: the pill is one fixed row's height (the web's `"4.75rem"` snap
  point, 2026-11-11), the route's figures shown from half.
- **Links**: `open=search` and `open=fpl` (design/screens.json).

| Web | iPhone | Android |
|---|---|---|
| shadcn's Carousel (Embla) with `data-base-ui-swipe-ignore="x"` inside the Drawer, the split grabber Base UI's Tabs (`components/sheet/SheetGrabber`, the pages `SheetPager`; FPL's body `features/plan/components/workspace/PlanPage`) | `TabView` with `.tabViewStyle(.page)` or a paging `ScrollView`, the stock page dots | Compose `HorizontalPager` with a pager indicator |

Tests: [`e2e/sheet-pages.spec.ts`](../../apps/web/e2e/sheet-pages.spec.ts)
(`@smoke`: Search to FPL and back by a swipe and by the grabber's bars;
the capsule naming the page after a swipe, then gone).

## 5. Airport weather marks (the owner, 2026-11-10)

At each airport the chart already shows, from the map's own
`/api/airports/in-view` answer (`weather`). The approved canvas:
<https://claude.ai/artifact/V9FqBkmCyB25yrQzWMto5f>.

- **Halo (the default):** a ring about 4.5 points wide in the flight
  category's colour round the chart's own symbol, which keeps its towered
  blue or non-towered magenta. The category is the engine's
  (`flight_category`, AIM 7-1-7 and the AWC's definitions), never a
  threshold in an app. A field hidden by the chart's give-way hides its
  halo too.
- **Station model from zoom 10 in** (the matching span on the iPhone):
  the engine's `wind_barb` (5, 10 and 50 kt barbs and flags, a ring for
  calm), and two lines beside the field, the visibility with its weather
  ("2 SM BR") and the lowest ceiling ("OVC 008"), from the METAR as the
  planner decodes it. The halo stays.
- **Wind arrow at any zoom**, the way the wind blows with "18G26", only
  where the engine's `wind_arrow` gives one (10 kt or more, or gusting).
  It is red only when the field's `least_crosswind` exceeds the picked
  airplane's maximum demonstrated crosswind from its profile; with no
  airplane, or no figure, it is never red, and nothing assumes a 172
  (decision [0011](../decisions/0011-no-assumed-airplane.md)).
- **Getting worse, ↓:** an amber badge at a field the plan uses
  (departure, stops, destination, alternates) when the engine's
  `weather_worse` says the TAF worsens by the pilot's ETA there. Off the
  route, no badge.
- **The setting**, in the Map card with the other map settings: Airport
  Weather, Off / Halo / Dot / Station (Dot is ForeFlight's filled dot in
  place of the symbol; Station draws the station model wherever it fits),
  and three switches, all on to begin with: Station Model When Zoomed In,
  Wind Arrows, Getting Worse by Arrival.
- **Access:** brand tokens only; a screen reader says the category and
  wind ("KJVL, IFR, wind 220 at 18 gusting 26").

| | Web | iPhone | Android |
|---|---|---|---|
| Drawing | MapLibre style layers (`features/plan/map/layers/AirportWeatherGl`, `lib/map/marks/airportWeather`) | MapKit annotations on the chart's marks (`Views/FieldWeatherMarks`, `FieldWeatherDrawing`) | MapLibre symbol layers (`map/AirportWeatherMarks`, `StationLayer`) |
| The setting | `components/AirportWeatherSettings`: `Segmented` (shadcn ToggleGroup) and `SwitchRow`s | `Views/AirportWeatherSettings`: `Picker(.segmented)` and `Toggle`s | `ui/AirportWeatherRows`: `ChoiceGroup` (Material 3 Expressive's connected `ToggleButton` group) and `Switch`es, kept in DataStore (`AirportWeatherStore`) |
| Tests | `lib/map/marks/airportWeather.test.ts` | `WingtipTests/FieldWeatherMarksTests` | `AirportWeatherEngineTest`, `map/AirportWeatherStoreTest` |

Every app's tests read the shared fixture
[`apps/web/src/lib/fixtures/airportWeatherMarks.json`](../../apps/web/src/lib/fixtures/airportWeatherMarks.json):
arrow shown or not, red or not, ↓ shown or not.

## 6. Altitude in the profile (the owner, 2026-11-10)

The cruise and each waypoint's altitude are set on the route's profile,
as ForeFlight's profile view sets them; the wheel and the plan's menu are
gone on every platform.

1. **The slider previews; Set flies.** An upright slider beside the side
   view steps through the engine's altitudes (`altitude_advisor`'s rows,
   the altitude wheel's). As it moves, the ground and the DOF's obstacles
   within a mile of the line turn red within 100 ft of the altitude or
   above it and yellow within 1,000 ft (`profile_clearance`; ForeFlight's
   display defaults, not a rule: the legal margins are 14 CFR 91.119 and
   91.177, which the legal altitudes keep). Nothing is planned until
   **Set**. In flight, **Auto** holds the preview at the GPS altitude.
2. **A waypoint's altitude, Start At or Cross At.** A tap on a waypoint
   sets its altitude: Cross At (done by the waypoint, the planner's
   `altitudes`) or Start At (begun there, `altitude_starts` beside it).
   Where the climb or descent is flown is the engine's `altitude_change`:
   the airplane's climb, the three-to-one descent, and with no airplane no
   time or fuel.
3. **The Altitude Advisor chooses the cruise.** One row per altitude with
   its time, fuel and head or tail wind, Fastest and Most economical
   marked; a row outside the legal altitudes stays with its warning (warn,
   never limit).
4. **Accessibility.** The slider is adjustable a row at a time and says
   the engine's words ("3,500 ft, terrain within 500 ft near KXYZ");
   every mark is a 44 pt / 48 dp target.

| | Web | iPhone | Android |
|---|---|---|---|
| Slider | Base UI Slider, upright (`features/plan/components/navlog/altitude/AltitudeProfile`, its view model `useAltitudePreview`) | See [ios.md](ios.md) | See [android.md](android.md) |
| Waypoint | Base UI Popover from a tablet's width up, `SheetDialog` on a phone (`altitude/LegAltitude`) | | |
| Advisor | shadcn Item rows (`altitude/AltitudeAdvisor`) | | |
| Tests | `altitude/altitude.test.ts`; `e2e/plans.spec.ts` | | |

## 7. What rides the sheet, and the map's small print (the owner, 2026-11-11)

1. **The radio's button, the map's own buttons and the first flight's
   card ride the sheet's top**, 24 points over it at the pill and half,
   following a finger's drag frame by frame as Apple Maps' buttons do;
   all the way up they give way. The radio's button is at the left, the
   map's buttons (Map, My Position) at the right, just above the search
   row (the owner, 2026-11-11: "keep the top right map button to just
   above the search bar on the right"), clear of each other and of the
   map's credit line, each tap its own 44 points. Over a top sheet they
   stay at the bottom right, riding its edge; beside a side panel, at
   the bottom right.
2. **No row of small print on the map.** Privacy, Terms and Legal are
   links at Settings' foot, after Status, Log, Guide and About (the
   owner: "Can privacy terms etc move next to status log"); Legal is
   About, every data source with its licence (`components/dataSources`).
   The FAA data's cycles are in Status, and what each layer drawn says of
   its source and currency (the overlay tiles' FAA cycle, the radar loop's
   source, the traffic's, old field weather) is Status's "On the Map"
   (the owner: "Yes status works"). The search page's foot keeps its
   links (`SheetFooter`).
3. **Google's credit alone stays on the map**, while its tiles are drawn,
   as MapLibre's stock compact attribution (the (i)), because Google's
   Map Tiles API policies ask for its attribution on the map itself.

| | Web | iOS |
|---|---|---|
| Riding the sheet | `components/sheet/sheetTop` (`OnSheetTop`): a slot in the Drawer's popup just over its top edge (`bottom: 100%`), the popup's corners clipped on an inner box | `MapButtonsDock`: the system sheet's own height, the plan's and a card's over it (`onGeometryChange`, `SheetEdge`), sets the glass group (Map, My Position, Ask) 24 over the higher top at the right, fading out past 60% of the screen; at the top right beside the iPad's sidebar. SwiftUI has no stock placement that follows a sheet over a UIKit map |
| Settings' foot | `features/pilot/PilotPanel`'s "More" row, `settings-foot`; 44-point hit areas that meet (`PAGE_LINK`), a second line at a large text size | |
| Status | `components/StatusPanel`: FAA Data, On the Map (`lib/map/gl/creditStore`) | |
| Tests | `e2e/sheet-webkit.spec.ts` (WebKit at an iPhone's size: heads pinned, nothing over or through them, the radio and the map's buttons 24 over the sheet and clear of each other, Settings at the pill, its seven links, no credits row, Status's cycles), `e2e/legal.spec.ts` | `WingtipUITests/MapButtonsTests` (over the search at half and the pill, at the right edge, 44 points, out of reach at full) |

On Android the map's buttons (My Position, with Ask over it) ride the
`BottomSheetScaffold`'s top at the right the same way, placed from the
stock sheet's offset each frame and faded away when it is expanded
(`ui/sheet/MapSheet`'s `onTop`, `ui/MapButtons`;
`androidTest/.../ui/MapButtonsOnSheetTest`; [android.md](android.md)
§3.1).

## Changing a rule

A rule here changes only when the owner says so (the `owner` label). Then
add a decision that supersedes the old one, change this page, the
platform references and [navigation.md](../navigation.md), and the
tables and suites above in the same branch.
