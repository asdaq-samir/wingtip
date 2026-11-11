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
   SC-1).
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

| | Web | iPhone (Apple Maps' way) | Android (Google Maps' way) |
|---|---|---|---|
| A card | The card is the sheet's content and hides the title row and the search; ✕ goes back to the search with its query kept (`lib/openCards`) | One card over the plan's sheet, the same view (`SheetPageView`) from every way in, presented through one `.sheet(item:)` (`Navigation/CardHost`); the search is out of sight while it is up | The search bar becomes "← KOSH", the card's name with ←, its actions and ✕ at the end (`ui/sheet/CardPage`); the card fills the sheet, on the sheet's own NavHost (`ui/SheetNav`, `ui/SheetPages`) |
| Inside a card | Its own stack in the sheet; ✕ goes back one level | Pushed in the card's `NavigationStack` with the system's Back and edge swipe (`Navigator.push`) | `SheetNav.push`; ← and system Back go back one level, ✕ closes every card |
| Back, Escape | Escape and a device's Back close the top card (`lib/backNavigation` `closeTopmost`); the browser's history is not the app's, as the planner replaces its address | The stack's Back; the card's close at the right of its bar | System Back closes the top card at once (`MapSheet`'s `lowerOnBack` only with none open); the dry run, the ATC card and the assistant's answer close on Back too |
| Questions | `SheetDialog`: a bottom sheet on a phone with ✕ or Cancel, centred from `md` up | `.alert` and `.confirmationDialog`, hung on the top of the stack (`TopHosts`) so they always show | `AlertDialog` (`ui/SourceDialog` for a source report) |
| Emergency | The one full-height card, ✕ at the top right, the map not dimmed | `fullScreenCover`, its close at the top right | Material's full-screen dialog, ✕ at the start of its app bar |
| One search | The traffic's airplane and Nearest's place are the search scoped to them (`listSearchOf`); the route's points ask it for an airport (`askSearchPick`) | The one `.searchable` field | Add a Stop and Add a Stop After open the one search (`SearchControl.stopAfter`) |
| By name | `useOpenScreen` through `lib/navigation/wanted` | `RootView.openScreen`, which opens the card by `Navigator.open` | `OpenScreen` through `ScreenRequests` |

Each "by name" path is a `switch` or `when` over the generated list of
`design/screens.json` (`scripts/build/screens.sh`), so a screen added
there fails each app's build until that app opens it.

## 2. The scrolling rule (the owner, 2026-11-10)

1. **The title and ✕ always stay in view.** The title starts large and
   folds into a pinned head as the content scrolls. A card's tabs or
   segmented control pin under the head. On Android, at half height a
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
| Pinned head | `PinnedCardBar`: Apple Maps' card head, the large title folding into a compact pinned head, scroll-linked with CSS scroll-driven animations where the browser has them (index.css `card-pinned`, `card-title-fold`); on `CardTitle`, `CardHead`, `SheetCard` and `ListPageHead`. The airport card's tabs pin under it | The stock large navigation title collapsing to inline; nothing forces `.inline` but forms. The airport card's section picker pins under the bar | Material 3 Expressive's large flexible top app bar with `exitUntilCollapsed` on every card and page at full height, the plan included, and the small `TopAppBar` at half (`LocalSheetFull`); the airport card's tabs a `stickyHeader` |
| Grow, then scroll | Base UI's Drawer gives a drag to any scroller that can scroll, so below full the body's scrollers are `overflow-y: hidden` (index.css), which its arbitration skips; a script, the keyboard and a focused row still scroll them, and a row focused under the sheet's edge raises the sheet (MapPanel) | The system sheet's own behaviour, with nothing overriding it; no zoom push inside a resizable sheet, whose pull-down would pop the page | The sheet's nested scroll; every card shown from the search or the map opens at half (`halfWindow`) and grows to full; one pushed inside a card keeps the height |
| Detents | The sheet comes up half way for a card at the least | A thing opens at `.medium`, a page at `.large`; every card grows to `.large`, and the map stays live under it up to `.medium` (`presentationBackgroundInteraction`); questions and forms stay modal | A card from the search or the map opens at half and grows to full; one opened inside a card keeps the height |
| Sideways rows | The Embla carousels (`CardPictures`, `RecentCards`) and the route's pills carry `data-base-ui-swipe-ignore="x"`; every native sideways row `overscroll-x-contain`; the upright altitude Slider and the sortable rows' grips keep `""`, their drag being up and down | No control takes the sheet's drag: the Profile opens at full height for its upright altitude slider, the flown track's chart moves the replay on a tap | A sideways row takes only a sideways drag; the sheet's nested scroll takes the rest |
| Place kept | The airport card's tabs each keep their place (`useTabScroll`), Settings' list its place after a page (`lib/scrollPlace`); the suggestions, a sent search's results and its Filters page each have their own scroll box | The stack's own behaviour | Each card is its own back stack entry with its own scroll and title state; the welcome starts each page at the top |
| Footers | The card's own content | Every footer is the system's bar, `safeAreaBar` (`glassFoot`); a card's toolbar the stock bottom bar | The card's own content |
| Forms | `useDiscardGuard` (`components/discardGuard`): a swipe, Cancel, Escape or a tap beside asks first | `interactiveDismissDisabled` while there is an edit, Cancel at the leading edge asking in a `confirmationDialog` (`Navigation/FormCancel`) | `DiscardDialog` on a swipe or Back (Add Flight, Your Airplanes' form) |

The keyboard never hides the search row being typed in: all the way up
with the search in use, the web's head scrolls away with the list
(`sheet/useScrollAway`) and the field keeps its focus.

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

The sheet has no tabs. Its first row is one field, "Search airports,
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
- **Picking:** an airport opens its card with Fly Here, Depart From and
  Add as Stop at the top; an airplane its profile with Fly This Airplane;
  an action runs.
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

## Changing a rule

A rule here changes only when the owner says so (the `owner` label). Then
add a decision that supersedes the old one, change this page, the
platform references and [navigation.md](../navigation.md), and the
tables and suites above in the same branch.
