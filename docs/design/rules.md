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

   **On the web every card but an airport's floats** (the owner,
   2026-11-13: "Except for airport card, redesign the others as
   recommended"), as Apple Maps' iOS 27 cards and You do: the stock Base
   UI Dialog in one shell (`components/FloatingCard`, drawn by
   `components/sheet/FloatingCards`), ten points in from the screen's
   sides and foot (from `sm` up at the side panel's top corner), corners
   `radius.sheet`, only as tall as its content and scrolling inside, its
   head row (a leading button such as Share or the Map card's gear, the
   name, ✕) at its top, no grabber; its material the sheet's ground at
   `material.card-fill` over `material.card-blur` (`card-glass`), solid
   under Reduce Transparency or Increase Contrast, so nothing under it
   is read through it. The sheet under it stays as it was -- its size,
   its search, its list -- and the map's buttons stay on the sheet's top.
   One opened from another floats over it, and its ✕ goes back to it; one
   opened from an airport's card floats over that. An airport's card
   (`SheetCard`'s `ride`, `PlaceCard`) and the route's Brief, Nav Log,
   Profile and Stops (`CardLayer`) still ride the sheet as nested
   Drawers, with its sizes, grabber and swipe and the map's buttons on
   their top; an airport's card opened from a floating one (Nearest's
   list) puts the floating ones away while it is up (`ridingOver`). The
   map's room is what the sheet and the floating cards leave (MapLibre's
   padding, `components/map/cardRoom`'s `padOf`, each card's box told by
   `components/sheet/floatRoom`): the chart stays still as a card comes,
   goes or changes size, and only if the spot tapped to open it is then
   under it does the map ease that spot to the middle of the room left,
   as Apple Maps does (`useFloatingInSight`). The detent rules below
   (2, 10, 11) are the riding cards'.
2. **What opens inside a card stays in that card's stack, with Back**
   (NOTAMs, a diagram's details, a past flight, a page of Settings).
   **Every card opens at half** (the medium detent), whatever it covers
   and wherever it is opened from -- the search, the map, a list, the
   plan, a link, the account button -- then goes where the pilot drags it,
   as Apple Maps' cards do (the owner, 2026-11-11: "I thought stock was to
   open each card medium by default"); Emergency alone opens all the way
   up (4). A page opened inside a card stays at the height the card is at
   (owner decision 2026-11-10, on the Android sheet audit's SC-1). Each
   card sizes its own sheet (the owner, 2026-11-11): on the web its own
   nested drawer's snap point, asked through `useCardSize`, the sheet
   under it left at its own size.
3. **Pages are cards too.** Brief, Nav Log, Profile, Stops, Nearest, Ask,
   Settings and its pages, the Logbook, Checklists and Saved Flights
   cover the search the same way: ✕ closes, Back steps through the levels
   inside. The Nav Log, the Profile and the Stops are cards of their own,
   not pages of the sheet's body (the owner, 2026-11-11): each its own
   size, grabber, ✕ and Back, kept built between its openings so opening
   it again is at once. The route's figures that sat at the sheet's foot
   under them are the Nav Log's own totals under its name.
4. **Only Emergency is full screen**, its close where the platform puts
   a full-screen page's close, and it does not dim the map where the map
   is meant to stay usable.
5. **One search field.** Nearest, the traffic list, the airport picker
   and Add a Stop use the main search, scoped to what they ask for, never
   a field of their own. The airport card's NOTAM list has none: it shows every NOTAM in the
   engine's order, three first and the rest on the title (the owner,
   2026-11-13: "I don't want search notams"). Nearest's scoped field stays
   as it is.
6. **Back and Escape close the top card first**, then go back a level.
   Neither only lowers the sheet while a card is open; with no card open
   they may lower it.
7. **Questions are the platform's stock alert**: confirmations, Ready to
   Fly's prompt, a source report.
8. **The same thing is the same component.** A route leg is one view from
   the nav log and the map; the airplane is one profile card everywhere
   (the search, the plan's Airplane, a link, the pickers), with Edit
   inside it; Nearest is one list; Ready to Fly is one section plus one
   stock prompt. Each part of a screen is drawn by its one component on
   the web (owner-reported 2026-11-11: Settings' own title at 17 points
   under its pages' 22): a card's or a page's head row, its name at a
   card's 22 centred across the card with its line under it, Share (or
   the route's •••) at its start -- on the Map card a gear in that place,
   opening the app's Settings over it at its Map group, its ✕ back to the
   Map (`SettingsButton`; the owner, 2026-11-13: "put a settings button
   on the top left side"; §8) -- and ✕ alone at its end -- two buttons at
   most, a star a Favorite tile in the card's action row (the owner,
   2026-11-11: "all the cards have at most two head buttons"), and what
   else acts on a card in its ••• menu or its content: the Brief's Refresh
   in its menu as the route's is, the Stops' distance a filter at its
   list's top, the Profile's VFR/IFR a segmented control at the top of
   its content (`CardHead` takes nothing more; cards.spec checks every
   card) -- as Apple
   Maps' place card at its smallest size (the owner, 2026-11-11: "let's move the title in the
   middle"; `HeadGrid`, the inset each side the wider side's),
   `CardHeadRow` (`CardHead`, `CardTitle`, `SheetCard`,
   `ListPageHead` and Settings and its pages draw it); a section's title
   `SectionTitle` (`ListGroup`, `PillSection`, `AccordionSection`,
   `SectionPane`; the Altitude Advisor's, the approach lesson's step count
   and the search Filters' groups too, no small grey capitals over a
   section: the owner, 2026-11-11); a close `CloseButton` (`CardClose` on a card a
   device's Back holds); a list's row `ListRow`; nothing to show
   `EmptyState`; two or three choices `Segmented`.
   `scripts/ci/shared_parts_guard.py` fails a heading or a ✕ drawn by
   hand, past its allow-list of what is rightly its own (a form sheet's
   Cancel, title and Done; a page's content heading).
9. **One way to open a screen by name**, which links
   (`design/screens.json`), Siri and App Actions all use.
10. **A card at the sheet's smallest size is its title row** (owner-reported
    2026-11-11: Account and Settings dragged down to the smallest size left
    the sheet empty, the grabber alone). As Apple Maps' place card does, a
    card at the pill shows its one title row -- Share where it has one at
    its start, its name centred, and ✕ at its end -- in the pill's room, and nothing else of it; a tap on
    the row or a drag up raises the sheet back to half with the card as it
    was; ✕ there closes the card and the pill then shows the search. A
    card with a short line under its name keeps it there too: the Nav Log
    its totals ("65.3 nm · 35m · 9.0 gal"), the Profile its cruise and the
    clearance's verdict ("Cruise FL-055 · clear of terrain"), the Stops how
    many ("2 stops", "None on the route"). With no card open the pill is
    the page's own: the search on Search, the route's figures on FPL, and
    the one round toggle that turns the pages rides the sheet's top at the
    left over it, under the 3D (the owner, 2026-11-13; §4a), nothing under the sheet.
    **The smallest size is one fixed
    height for every page and card**, never one a page: the web's
    `"4.25rem"` on the screen's foot (sheet/insets), which the search's row, a
    card's title row with its line, and FPL's figures (2.6875 rem under the
    grabber's 1) all fit. The grabber takes the least room its platform
    keeps (the owner, 2026-11-13: "grabber and tabs taking minimal space
    and still meeting their platforms standard"): the web's one 36 by 5
    bar in a 16-point room, iOS's and Android's the system sheet's own.
11. **The sheet keeps the size the pilot left it at** (the owner,
    2026-11-11: "I like the stock behavior"). The one size the app gives
    the main sheet is Apple Maps' rule: something new opened while the
    sheet is at its smallest size, the pill, rises to half so it can be
    seen. Nothing lowers the sheet (a card closed, Cancel, a tap on the
    chart, a flight starting), nothing takes it all the way up (a list,
    Saved, Favorites, a link), and a card put away leaves it where it is. Cards keep their own
    opening sizes (2, and the Detents row below): each card's drawer is
    its own, the sheet under it untouched.
12. **A flight's figures and its way out sit at the foot of the card in sight**, never on a sheet under it: the dry run's figures and Done flying are the Profile card's foot while it is up, the native pattern of Apple Maps' navigation card with its arrival figures and End (the owner, 2026-11-12: "Just do it the native way").
13. **Every thing's card is laid out alike**, the native pattern of Apple Maps' place card: its name, the short line under it (an airport's town, an airplane's type), then its row of action tiles (`CardAction`), then its content (the owner, 2026-11-12: "Just do it the native way").

| | Web | iPhone (Apple Maps' way) | Android (Google Maps' way) |
|---|---|---|---|
| A card | Floating: the stock Dialog in one shell over the map and its sheet, the last opened on top, the sheet left as it was (`components/FloatingCard`, `components/sheet/FloatingCards`; the owner, 2026-11-13): every `SheetCard` but an airport's, and You. Riding (an airport's, `SheetCard`'s `ride`; the Brief, Nav Log, Profile and Stops, `CardLayer`): Base UI's own nested Drawer over the map's sheet, one per card, the last opened on top (`components/sheet/CardStack`; the owner, 2026-11-11): what follows was every `SheetCard`'s -- the one card component (the card rule's 8; `PanelCard` merged into it, 2026-11-11), its head row `CardHeadRow` drawn by it or, for an airport, an airspace, traffic, a past flight and Nearest (`head={false}`), by the content's `CardTitle` or `CardHead` --, the Brief, the Nav Log, the Profile, the Stops and Settings (`CardLayer`), with the sheet's sizes, its grabber and its swipe; it covers the search and the title row, the sheet under it kept as it was; ✕ goes back to the search with its query kept (`lib/openCards`). The Nav Log, the Profile and the Stops are kept between their openings (`CardLayer`'s `open`, their drawers closed but laid out: index.css's kept cards) | One card over the plan's sheet, the same view (`SheetPageView`) from every way in, presented through one `.sheet(item:)` (`Navigation/CardHost`); the search is out of sight while it is up | The search bar becomes "← KOSH", the card's name with ←, its actions and ✕ at the end (`ui/sheet/CardPage`); the card fills the sheet, on the sheet's own Navigation 3 stack (`ui/MapViewModel`, `ui/SheetPages`) |
| Inside a card | Its own stack in the sheet; ✕ goes back one level | Pushed in the card's `NavigationStack` with the system's Back and edge swipe (`Navigator.push`) | `SheetNav.push`; ← and system Back go back one level, ✕ closes every card |
| Back, Escape | Escape and a tap outside are the top card's, riding or floating (`components/sheet/cardClose`'s `answerClose`, the store's `topCard`), closing it; with no card up the sheet's own Escape lowers it to the pill. A device's Back closes the top card the same way (`lib/backNavigation` `closeTopmost`): Android's through the browser's stock CloseWatcher, held only while something is open (`useBackCloses`), a TV remote's by its key; where there is no CloseWatcher (Safari) the browser's Back is left as it is. The browser's history is not the app's, as the planner replaces its address | The stack's Back; the card's close at the right of its bar | System Back closes the top card at once (`MapSheet`'s `lowerOnBack` only with none open); the dry run, the ATC card and the assistant's answer close on Back too |
| Questions | `SheetDialog`: a bottom sheet on a phone with ✕ or Cancel, centred from `md` up | `.alert` and `.confirmationDialog`, hung on the top of the stack (`TopHosts`) so they always show | `AlertDialog` (`ui/SourceDialog` for a source report) |
| Emergency | The one full-height card, ✕ at the top right, the map not dimmed | `fullScreenCover`, its close at the top right | Material's full-screen dialog, ✕ at the start of its app bar |
| One search | Search's page, turned to by one round toggle button riding the sheet's top at the left, under the 3D (`PageToggle`; the owner, 2026-11-13), its magnifier showing while FPL is up; the traffic's airplane and Nearest's place are the search scoped to them (`listSearchOf`; Nearest's at its card's top, `nearSearch`, where the card covers the sheet's first row); the route's points ask it for an airport (`askSearchPick`) | The one `.searchable` field, on the TabView's `Tab(role: .search)` | Search a `NavigationBar` item beside FPL's; Add a Stop and Add a Stop After open the one search (`SearchControl.stopAfter`) |
| At the pill | The card's pinned head (`data-sheet-head`: `PinnedHead`, Settings' title row, a console page's head) is all of the card left in sight there (CardStack's scroller), with its short line under its name (`CardHead`'s `sub`); a tap on the row raises the card to half | The system sheet's smallest detent shows the card's bar | The sheet's peek shows the card's bar |
| By name | `useOpenScreen` through `lib/navigation/wanted` | `RootView.openScreen`, which opens the card by `Navigator.open` | `OpenScreen` through `ScreenRequests` |

Each "by name" path is a `switch` or `when` over the generated list of
`design/screens.json` (`scripts/build/screens.sh`), so a screen added
there fails each app's build until that app opens it.

**On the iPhone the cards stay the system sheet** (2026-11-13, the web's
floating cards ported the native way): iOS 26 and later draw a sheet at a
partial detent inset from the screen's edges with Liquid Glass, as Apple
Maps' own place, guide and account cards float, so the one `.sheet(item:)`
(`Navigation/CardHost`) is already the floating card, with the system's
grabber, detents and swipe; nothing is hand-built over it. You
(`Views/YouView`) and the Map card (`Views/MapSettingsView`) are such
cards, their gear at the top left of the bar and the close at its right,
and Settings (`Views/SettingsView`, `SheetPage.settings`) is pushed inside
the card it was opened from, its Back going back to it.
One card rule on the iPhone, the native way (the owner, 2026-11-13: "For phones, just do it natively, but stay consistent"): every card, the emergency assistant included (`SheetPage.emergency`, opened by its model through `CardTriggers`, no longer a `fullScreenCover`), is that one sheet or a page pushed in its stack, opening at half (`.half`) and only Emergency at `.large` (`SheetPage.opensFull`), the pilot's drag choosing the size from there; the Search ⇄ FPL toggle rides a half-height card's top and a tap closes the card and turns the sheet (`MapSideButtons`); signed out, You's head is Sign In alone, its bar title removed (`toolbar(removing: .title)`) and the rows that need an account disabled with no words (this line overrides the table's iPhone Emergency and Detents cells).

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
| Detents | A card's nested drawer has its own snap point among the sheet's three sizes, the same fixed values in the Drawer's own units (`"4.25rem"`, `"23rem"`, `1`; `components/sheet/insets`), never px worked out from the window: it opens at half, every card but Emergency (`lib/sheetCards`' `cardOpening`), and the sheet under it stays where it was; what is drawn follows the snap point the moment it is set; a swipe moves one size however fast, by the Drawer's own `snapToSequentialPoints` (the owner, 2026-11-11, "enforce the detents, regardless of how fast you swipe") | A thing opens at `.medium`, a page at `.large`; every card grows to `.large`, and the map stays live under it up to `.medium` (`presentationBackgroundInteraction`); questions and forms stay modal | A card from the search or the map opens at half and grows to full; one opened inside a card keeps the height |
| Sideways rows | The Embla carousels (`CardPictures`, `RecentCards`) and the route's pills carry `data-base-ui-swipe-ignore="x"`; every native sideways row `overscroll-x-contain` and, in the sheet, `overflow-y: hidden` (index.css: `overflow-x: auto` alone made it a few points' vertical scroller, which took a drag up at half); the upright altitude Slider and the sortable rows' grips keep `""`, their drag being up and down | No control takes the sheet's drag: the Profile opens at full height for its upright altitude slider, the flown track's chart moves the replay on a tap | A sideways row takes only a sideways drag; the sheet's nested scroll takes the rest |
| Place kept | A card under a card keeps its place in its own drawer's scroller, and a card opened anew is a new drawer, at its top (CardStack); a kept tab keeps its place in the sheet's one scroller (`TabKept`'s `useKeptScroll`), and a tab's page opened anew starts at its top (`useStartAtTop`); the airport card's tabs each keep their place (`useTabScroll`); a tab not yet seen, picked with the bar pinned, opens at its own top under the bar, and a short one leaves the bar pinned (Apple Maps' place card; the owner's recording, 2026-11-11), Settings' list its place after a page (`lib/scrollPlace`); the suggestions, a sent search's results and its Filters page each have their own scroll box | The stack's own behaviour | Each card is its own back stack entry with its own scroll and title state |
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

The sheet's Search page (§4a: its pages turned by one round toggle
button riding the sheet's top at the right, the owner, 2026-11-13) has one field as its first row, "Search airports,
airplanes, or ask", with the on-device microphone and the account button
beside it; the account button opens You, who the pilot is and what is
theirs, with Settings one of its rows (§8), where Setup was. The approved canvas: <https://claude.ai/artifact/XmbNqJTLRwwzebouLbXzCV>.

- **Nothing typed:** the current flight as a card at the top (route,
  distance, ETE, fuel, altitude, airplane; a tap goes to the plan), then
  Favorites (airports and airplanes), Recents and Nearest.
- **Typing:** one list in groups: Airports; Waypoints and Navaids;
  Airplanes (your own, an N-number from the FAA registry, a type); Do
  (Direct To, Brief, Nearest, Emergency and every screen by name, and on
  the phones "Ask: …", answered on the phone). Results come from the existing endpoints
  and generated models; the search holds no aviation logic.
- **Picking:** an airport opens its card with Fly Here, Add as Stop, Call
  and Favorite at the top (its address the town link and the Info tab's
  row), Share in its head and Refresh in its Weather tab (the owner,
  2026-11-11; the web first, the phones still
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

### 4a. The sheet's two pages, Search and FPL (the owner, 2026-11-11; one toggle button since 2026-11-13)

The owner asked "Can we have a sheet carousel? With search and fpl?" and
chose swipe and dots, always two pages; on 2026-11-13 the owner picked a
tab bar under the sheet in their place ("the owner, 2026-11-13: tab bar,
option A"; the canvas's boards "A · Tab bar",
<https://claude.ai/artifact/8QhNVP3EeyZCo9ZuFSAzEf>), and the same day
one button for both in the bar's place ("Why not make the same tab on
the right toggle between search and fpl"). This amends "The sheet has
no tabs. Its first row is one field": the sheet has two peer pages,
turned by one round toggle button riding its top, and the one search is
still the only field. The same day the toggle took the radio's button's
place at the left, under the 3D ("Let's replace the radio button on the
left with the fpl toggle but below 3d"), the radio's button going over
the map's buttons at the right, and then ("Or actually make it a setting
instead") only where Comms Assist is on: a switch of Settings' ATC page,
off by default (the owner, 2026-11-13).

1. **Search** (the first page): the search's row (field, microphone,
   account button) and its home list (Favorites, Recents, Nearest,
   Saved, Find Nearby), the traffic and the search's lists in full.
2. **FPL** (the second page): the route's row (its pills, Routes, Brief,
   •••), the airplane and the altitude, the route in order, and the
   route's figures pinned at the foot, which are FPL's alone; the Brief,
   the Nav Log, the Profile and the Stops are cards over it. With no route, the route's row stands
   empty, with a Close that goes back to the card or Search it came from
   (the owner, 2026-11-11: "We don't need plan a flight either with two
   buttons"). The first time, a welcome sheet says what the app is
   (Search like Maps, FPL like an EFB, the FAA charts), offers Theme and
   Appearance (Settings' own Look tiles), and its one
   button, Let's Go Flying, goes on to the map with the one search ready
   for where to (Search up at half, its field not focused), the airport picked
   planned from where the airplane is; after that first route one tip points at the toggle while it shows FPL ("Your flight plan is one tap away ... tap here any time"), once (the
   owner's option A, 2026-11-13; the web first, the phones keep their
   first-flight card until the owner's word).
   FPL has no field of its own: adding a stop asks the one search.

- **One round toggle button turns the page** (the owner, 2026-11-13),
  riding the sheet's top at the left, its own glass circle the size of
  the 3D and microphone circles, directly under the 3D circle, nearest
  the sheet, 8 points apart (two circles, never one capsule), level with
  the map's buttons' group at the right. Beside a side panel, under the
  map's buttons at the bottom right. It shows the page a tap goes to, as
  Apple Maps' 2D/3D button shows the mode it switches to: on Search FPL's
  route glyph ("Show flight plan" to a screen reader), on FPL the
  magnifier ("Show search"). A real button, never pressed, its name
  saying where it goes; a 44-point tap by its hit area, never grown. It
  turns the page and leaves the sheet's size; tapped while a card is up
  (it rides the card's top then) it puts the card away with its page.
- **Nothing under the sheet**: its three sizes stand on the screen's foot
  (the home indicator's inset), the bar's room given back. The toggle
  gives way with the map's buttons all the way up; it goes while the airplane flies the route (the flying sheet
  is the figures alone) and under Settings' layer.
- **No sideways swipe turns a page.** A drag sideways is the row's under
  it (Nearest, Favorites, Recents' cards), a drag up or down the sheet's
  (and each page's own scroller's all the way up). Each page keeps its
  place while the other is up.
- **The grabber is one plain bar** again, on the sheet and every card:
  a drag on it moves the sheet, a tap cycles its sizes, Up and Down step
  them.
- **A route made or opened** (Fly Here, a link, Saved) goes to FPL;
  clearing it stays on the page it is on.
- **Cards** open over both pages as before; ✕ comes back to the page
  they were opened over.
- **At the pill** the sheet shows the page's own one row, the grabber
  over it and the toggle riding its top, and nothing else: on Search the
  search's row, on FPL the route's figures -- To, Dist, ETE, Fuel -- (the
  owner, 2026-11-11, the canvas's b, as ForeFlight and Garmin Pilot keep
  them), the route's row from half up; with no route, FPL's own row. The
  pill is one fixed height for both (the web's `"4.25rem"` snap point,
  on the screen's foot).
- **Links**: `open=search` and `open=fpl` (design/screens.json).

| Web | iPhone | Android |
|---|---|---|
| shadcn's Toggle on Base UI's (`components/PageToggle`), never pressed, on a phone in the left-hand column under the 3D (`MapControls`, riding the sheet's top through `OnSheetTop`), told the pages by `MapPanel` (`sheet/pageToggle`); the two pages the sheet's scrollers (`SheetParts`, `sheet/SheetPages`, kept by `data-hidden`), the grabber the plain `SheetGrabber`; FPL's body `features/plan/components/workspace/PlanPage`. Beside the side panel the same circle under the map's buttons at the bottom right | A `TabView` with FPL's `Tab` and a `Tab(role: .search)`, its Liquid Glass tab bar under the system sheet (or inside it, where the sheet is the tab's content), the sheet's detents above the bar | Material 3 `NavigationBar` under `BottomSheetScaffold`, FPL and Search its two items, the sheet's peek and half over the bar |

The iPhone's and Android's columns are still the tab bar's design; the
toggle reaches them at the owner's word (web first).

**iPhone (2026-11-13):** the pager's dots and swipe are gone; the two
pages are kept laid out one over the other (`Search/SheetPager`'s
`SheetPages`) and turned by one round Liquid Glass map button under the
3D at the left, riding the sheet's top (`Views/MapButtonsDock`'s
`MapSideButtons`), its glyph where it goes, the pill's dots row given back
to the map; TipKit's one popover tip (`FplTip`) points at it after the
first route. `WingtipUITests/SheetPageToggleTests`.

Tests: [`e2e/sheet-page-toggle.spec.ts`](../../apps/web/e2e/sheet-page-toggle.spec.ts)
(`@smoke`: Search to FPL and back by the toggle, the size kept, by the
keyboard too; where it rides and the sheet on the screen's foot; a
44-point toggle and the one grabber bar) and, for the cards
over the pages, [`e2e/sheet-pages-cards.spec.ts`](../../apps/web/e2e/sheet-pages-cards.spec.ts)
(`@smoke`: Fly Here from an airport's card lands on FPL, live).

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
  calm, 0 to 2 kt calm), and two lines beside the field, the visibility with its weather
  ("2 SM BR") and the lowest ceiling ("OVC 008"), from the METAR as the
  planner decodes it. The halo stays.
- **Wind barb farther out** (the owner, 2026-11-12: barbs as the
  Aviation Weather Center's map draws them, in place of arrows): the same
  `wind_barb`, only where the engine's `wind_arrow` gives one (10 kt or
  more, or gusting); none below zoom 6, drawn at 0.6 of its size there and
  full size by zoom 9, the barbs giving way to one another rather than
  overlapping. A variable wind, which no barb can point, is written under
  the field ("VRB05"); gusts are left to the field's card, as a barb shows
  none. It is red only when the field's `least_crosswind` exceeds the picked
  airplane's maximum demonstrated crosswind from its profile; with no
  airplane, or no figure, it is never red, and nothing assumes a 172
  (decision [0011](../decisions/0011-no-assumed-airplane.md)).
- **Getting worse, ↓:** an amber badge at a field the plan uses
  (departure, stops, destination, alternates) when the engine's
  `weather_worse` says the TAF worsens by the pilot's ETA there. Off the
  route, no badge.
- **The setting**, in Settings' Map group (§8): Airport Weather, one menu
  of three (the owner, 2026-11-13) -- Flight Category (the halo alone),
  With Wind (the halo, the wind barbs farther out and the station model
  zoomed in close; the default) and Station Model (wherever it fits).
  The getting-worse badge is always drawn; Off, the Dot and the three
  switches went.
- **Access:** brand tokens only; a screen reader says the category and
  wind ("KJVL, IFR, wind 220 at 18 gusting 26").

| | Web | iPhone | Android |
|---|---|---|---|
| Drawing | MapLibre style layers (`features/plan/map/layers/AirportWeatherGl`, `lib/map/marks/airportWeather`) | MapKit annotations on the chart's marks (`Views/FieldWeatherMarks`, `FieldWeatherDrawing`) | MapLibre symbol layers (`map/AirportWeatherMarks`, `StationLayer`) |
| The setting | `components/AirportWeatherSettings`: `Segmented` (shadcn ToggleGroup) and `SwitchRow`s | `Views/AirportWeatherSettings`: `Picker(.segmented)` and `Toggle`s | `ui/AirportWeatherRows`: `ChoiceGroup` (Material 3 Expressive's connected `ToggleButton` group) and `Switch`es, kept in DataStore (`AirportWeatherStore`) |
| Tests | `lib/map/marks/airportWeather.test.ts` | `WingtipTests/FieldWeatherMarksTests` | `AirportWeatherEngineTest`, `map/AirportWeatherStoreTest` |

Every app's tests read the shared fixture
[`apps/web/src/lib/fixtures/airportWeatherMarks.json`](../../apps/web/src/lib/fixtures/airportWeatherMarks.json):
barb shown or not, red or not, ↓ shown or not.

**iPhone's setting (2026-11-13):** one `Picker(.menu)` of Off, Flight
Category, With Wind and Station Model in Settings' Map group
(`Views/AirportWeatherSettings`'s `AirportWeatherRow`), kept under one
key, a device's old look and switches brought over once
(`AirportWeather.kept`); the Dot is gone.

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

1. **The map's own buttons, the radio's, the 3D and the page toggle ride the sheet's
   top** (and the phones' first-flight card, until they take the web's
   welcome sheet), 24 points over it at the pill and half,
   following a finger's drag frame by frame as Apple Maps' buttons do;
   all the way up they give way. A floating card (§1) leaves them where
   they are, on the sheet's or the riding card's top, and floats over
   them. A riding card opened over the sheet comes up
   where the sheet's top is and they ride its top from its first frame,
   gliding only if its height changes, never hidden while it moves (the
   owner's iPhone, 2026-11-13: they "redraw" at every card). The 3D and under it the page toggle
   are at the left (the owner, 2026-11-13: "replace the radio button on
   the left with the fpl toggle but below 3d"), the map's buttons (Map,
   My Position) at the right, just above the search row (the owner,
   2026-11-11: "keep the top right map button to just above the search
   bar on the right"), with the radio's button, where Comms Assist is turned on in Map
   Settings (off by default, 2026-11-13), a circle of its own over
   them, its listening pill widening to the left (as from md up; in
   flight its circle grown to 60 points over NRST, D→ and the arrow),
   clear of each other and of the
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
| Tests | `e2e/sheet-webkit.spec.ts` (WebKit at an iPhone's size: heads pinned, nothing over or through them, the page toggle and the map's buttons 24 over the sheet and clear of each other, the radio's among the map's, Settings at the pill, its seven links, no credits row, Status's cycles), `e2e/legal.spec.ts` | `WingtipUITests/MapButtonsTests` (over the search at half and the pill, at the right edge, 44 points, out of reach at full) |

On Android the map's buttons (My Position, with Ask over it) ride the
`BottomSheetScaffold`'s top at the right the same way, placed from the
stock sheet's offset each frame and faded away when it is expanded
(`ui/sheet/MapSheet`'s `onTop`, `ui/MapButtons`;
`androidTest/.../ui/MapButtonsOnSheetTest`; [android.md](android.md)
§3.1).

On the iPhone the 3D ("3D" flat, "2D" standing, as Maps labels its own)
and under it the page toggle ride the same top at the left
(`MapSideButtons`), beside the iPad's sidebar under the map's buttons at
the top right. With no ground-clearance colours in MapKit's 3D there is no
key to them. The radio's button (the route's ends row) shows only with
Comms Assist on (Settings › ATC, off by default).

## 8. One home per control: You, Settings and the Map card (the owner, 2026-11-13)

The owner's pick of option A of the account canvas
(<https://claude.ai/artifact/NY1E2HHscfyzmvB9gCNuNs>), the Apple Maps
way: three homes, and every control in one of them.

1. **You**, the avatar's card: who the pilot is (a centred avatar, the
   name, Pilot Details and the account's menu) and what is theirs --
   Airplanes (each airplane's checklists inside it, and the picked one's
   Checklists row), Flights, Logbook, Minimums, Training (the Coach and
   Practice), the Emergency Assistant -- then Subscription; Settings is
   the gear at its top left, the ✕ at its right.
2. **Settings**, one page, You's gear: Look (Sunlight, Theme,
   Appearance), Map (Airport Weather, Glide Ring, Clear Your Path), In
   Flight (Alerts; ATC, one page of Comms Assist, ATC Alerts and the
   Copilot), Data (Keep for the Air), and Help & About (Guide, Status,
   Log, About, Sources, and the Privacy, Terms and Legal links). The Map
   card's gear opens the same page at its Map group; it is the one
   thing called Settings.
3. **The Map card**, the map's own button: only what is on the map --
   the charts, the overlay (None, USGS, Google Map, Google Satellite,
   Google's only with a key) with its Strength while one is picked, and
   the layers.

Taken out the same day, with no home: the sheet's Position (a phone's
sheet is always at the bottom), Terrain's Flat (the 2D chart is always
shaded; 3D is the map's own button) and You on the Map (own ship is
always the airplane). A new control goes into one of the three, never a
second home; the web first (`features/pilot`, `features/settings`,
`features/map-settings`), the phones on the owner's word.

**iPhone (2026-11-13):** You is `Views/YouView` (Pilot Details holds the
name, the contact, Export, Sign Out and Delete Account; Airplanes holds
the Checklists; Training the Coach, Practice, Lessons and Instructing; no
Subscription, nothing being sold), Settings `Views/SettingsView` (Theme
and Appearance as menus; no Sunlight, which needs a light sensor iOS gives
no app; Data holds what is kept for the air, Downloads, the ADS-B receiver
and the checkpoint notes), and the Map card the base charts as their
pictures and the layers as the stock toggle's button style, with no
overlay row (Google's tiles are not drawn on the iPhone, and the USGS
imagery already comes in by itself close in). Show Route As (Route Box or
Strip) is in the route's ••• menu, the empty route's too.

On Android (Google Maps' way, 2026-11-13): every card, You and the Map
card among them, rides the sheet's stack as Google Maps' place cards and
its Layers sheet do, nothing floats; You's and the Map card's gear is the
card bar's first action, before the ✕, Material's place for a card's own
actions (`ui/YouScreen`, `ui/MapCard`); the Map card is the Layers button
on the map's right column, its layers Google Maps' tiles (the stock
filled icon toggle over its name), and has no chart or overlay pictures,
as the phone draws one chart and no imagery overlay yet; 3D and the
pages' toggle are the left column's floating toolbar on the sheet
(`SheetSideButtons`), the toggle the only way between Search and FPL;
the welcome is Material's modal bottom sheet with Settings' own Theme
and Appearance rows (`firstflight/WelcomeSheet`), the FPL tip the stock
rich tooltip at the toggle; the route's Plan or Strip layout stays in
Settings › Look, as Android has no route box, line or cards to choose.

## Changing a rule

A rule here changes only when the owner says so (the `owner` label). Then
add a decision that supersedes the old one, change this page, the
platform references and [navigation.md](../navigation.md), and the
tables and suites above in the same branch.
