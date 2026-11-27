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

   **On the web every card is a nested drawer riding the sheet, but the
   welcome** (the owner, 2026-11-13: "For webapp, why don't we make
   everything a nested drawer except the welcome one?"): You with
   Settings and its pages inside it, the Map card, an airport's, an
   airspace's, a fix's, a route leg's, an airplane's, a past flight's,
   Nearest, the airplane's profile, the Brief, Nav Log, Profile and
   Stops, and Emergency (at full, 4) -- each Base UI's own nested Drawer
   (`components/sheet/CardStack`), with the sheet's sizes, grabber and
   swipe and the map's buttons on its top. The welcome (`WelcomeSheet`)
   stays its own sheet; questions stay the stock alert (7), menus
   Popovers (on the web a finger's drag down from the top of a menu's
   list closes it, as a sheet's does: `components/ui/dragClose`, every
   DropdownMenu and ContextMenu; the owner, 2026-11-26), and a plate or diagram full screen its viewer. The page
   toggle stays in sight over any card, riding the front card's top, and
   a tap on it closes the cards and turns the page (the owner,
   2026-11-13: "airport card hides the fpl toggle"; §4a, §7).

2. **What opens inside a card stays in that card's stack, with Back**
   (NOTAMs, a diagram's details, a past flight, a page of Settings).
   **A card opened from another card opens at that card's size**: all
   the way up over one all the way up, at half over one at half, as Apple
   Maps' cards do (the owner, 2026-11-26). **Opened from anywhere else it
   opens at half** (the medium detent) -- the search, the map, a list, the
   plan, a link, the account button -- and over a card at its pill at half
   too, so it can be seen; then it goes where the pilot drags it (the
   owner, 2026-11-11: "I thought stock was to open each card medium by
   default"). Emergency always opens all the way up (4). A page opened inside a card stays at the height the card is at
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
   as it is. The route box's own as-you-type suggestions
   (the web's `routeBox/RouteSuggestions`) are a written
   exception (the owner, 2026-11-14): typing a route's idents in place is
   faster than leaving for the search, and the suggestions only complete
   the ident being typed. Beside it, the FPL's airplane field ("N-_____")
   suggests as it is typed (the owner's pick of S1, 2026-11-14, "I take
   your rec"; canvas <https://claude.ai/artifact/XFZoWyJWzov7RCwRRPH253>,
   "N-number field as a search"): a list under the field, the FPL still in
   view, in four groups -- Your airplanes, Recent and kept, the FAA
   registry once the N-number is whole (its type and year, or "Not
   registered"; "Type the rest to look it up" while it is not), and Types
   flown by the book -- built from the one search's own airplane rows
   (the web's `features/plan/useAirplaneHits`), so the two never differ. Enter or
   leaving the field still takes a whole N-number as typed; arrows and
   Enter pick a row, Escape closes the list.
   While the search is asked to pick (Add a Stop, Change Stop, an end), a
   tap on an airport on its page -- Nearest's tiles, Home, a Favorite, a
   Recent -- picks it as a result row does and goes back to where the pick
   was asked from; it does not open its card (the owner, 2026-11-21: "When
   picking stop, when I tap a nearest airport, it opens the airport card
   instead of selecting it"). Outside a pick a tap opens the card.
   While it picks, an airport it cannot take is shown greyed in every list
   -- Nearest's tiles, Home, Favorites, Recents and the result rows -- with
   its reason in a note's grey in the place of its detail: "Closed" (the
   engine's field_status through the airport index, `closedOf`, decision
   0043) and, for Add a Stop, "On the route already" (`SearchPick.taken`).
   A greyed one is disabled (`aria-disabled`, the reason in its accessible
   name), a tap or Enter does nothing and says nothing more
   (`lib/pickRefusal`, the model's `refusal`; the owner, 2026-11-21).
   Outside a pick nothing is greyed.
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
   list's top (`CardHead` takes nothing more; cards.spec checks every
   card); VFR/IFR is the Profile card's, a segmented control at the top
   of its content (back from FPL's first row, the owner, 2026-11-17: "No
   need for vfr/ifr, that can stay somewhere else, maybe in the
   profile?") -- as Apple
   Maps' place card at its smallest size (the owner, 2026-11-11: "let's move the title in the
   middle"; `HeadGrid`, the inset each side the wider side's),
   `CardHeadRow` (`CardHead`, `CardTitle`, `SheetCard`,
   `ListPageHead` and Settings and its pages draw it); a section's title
   `SectionTitle` (`ListGroup`, `PillSection`, `AccordionSection`,
   `SectionPane`; the Altitude Advisor's, the approach lesson's step count
   and the search Filters' groups too, no small grey capitals over a
   section: the owner, 2026-11-11); a close `CloseButton` (`CardClose` on a card a
   device's Back holds); a list's row `ListRow`; nothing to show
   `EmptyState`; two or three choices `Segmented`. A discrete setting is
   a menu or a segmented control, never a slider (decision 0017); a
   continuous one, such as the Map card's Dimmer and Contrast, is the
   stock `Slider`, its thumb's 44-point reach a pseudo-element's
   (`THUMB_HIT`) and its name its row's. A day or a time of day is one
   button showing it, as iOS's compact date and time pickers are (the
   owner, 2026-11-21): a day's (`ui/date-field`, "31 Dec 2027") opens
   the calendar in a popover, a card on a phone, its month and year
   pull-downs and a day's tap picking and closing, Clear where one is
   set; a time's (`ui/time-field`, "15:00 CST", the 24-hour clock and
   the zone as the app writes it) opens the hours and minutes under it
   as two wheels, React Aria's ListBox, rows of 44. Never segments a
   finger must hit one by one (React Aria's DateField and TimeField,
   20 points each and 25 apart, the iOS audit's P1), nor the browser's
   `<input type="time">`, which an iPhone on the 12-hour clock writes
   "3:00 PM". Its name holds what it shows ("Departure time, 15:00 CST:
   change").
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
    swipe down from half closes a card, its close as ✕'s, on the web
    every card, Emergency too; the main sheet alone, Search and FPL,
    stays at its pill (the owner, 2026-11-26: "The main sheet with search
    and FPL are the ones that should stay to a pill", where it was the
    settings cards alone, You and the Map
    card, 2026-11-14: "Apple Maps closes all setting drawers on swipe
    down"); all the way up, a swipe down brings it to half,
    the Drawer's own next snap point, and it stays open (the owner,
    2026-11-14: "Settings cards should only close from a swipe down when
    in medium detents"). A form with an edit still asks first (6). A
    card with a short line under its name keeps it there too: the Nav Log
    its totals ("65 nm · 35m · 9.0 gal"), the Profile by how much the
    cruise clears the ground ("Clears terrain by 2,552 ft", the engine's
    least room; the cruise is the side view's tag and FPL's altitude, not
    said again: the owner's list, 2026-11-17), the Stops how
    many ("2 stops", "None on the route"). With no card open the pill is
    the page's own: the search on Search, the route's figures on FPL (with
    no route, FPL's bar); on the web the one round toggle that turns the
    pages starts Search's first row and the account button ends it (the
    owner, 2026-11-20; §4a), nothing under the sheet. FPL's head has a round Search button instead, which turns to Search's resting page (the FPL button back, the route kept) rather than into typing; a tap on the field there types.
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
12. **A flight's figures and its way out sit at the foot of the card in sight**, never on a sheet under it: the dry run's figures and Done flying are the Profile card's foot while it is up, the native pattern of Apple Maps' navigation card with its arrival figures and End (the owner, 2026-11-12: "Just do it the native way"). On the ground, planning, the Profile has no foot strip: FPL's strip under it says the same (the UI audit's L2, 2026-11-17).
13. **Every thing's card is laid out alike**, the native pattern of Apple Maps' place card: its name, the short line under it (an airport's town, an airplane's type), then its row of action tiles (`CardAction`), then its content (the owner, 2026-11-12: "Just do it the native way"). **The name is the thing's ident or name; the line is its kind and details** (the owner, 2026-11-18, the selection audit): "KMSN" / "Dane County Regional · Towered", "OBK" / "VORTAC · 113.0 · Northbrook", "BXCMB" / "Fix · JOT 045° 12 nm", "VPBNG" / "VFR Waypoint", "6/4116" / "TFR · Security" with its badge, a PIREP by where it is ("JOT 045° 12 nm" / "PIREP · 1255Z · C172"), a wind barb by its station ("MSN" / "Wind 270° true at 25 kt · at 9,000 ft"), an airspace by its name ("Chicago Class B" / "Class B"), a checkpoint by its name ("Checkpoint 3 · 12 nm along"), a route point by its name ("WETEV" / "Route point", "TOC" / "Top of climb"), own ship "My Location". No mark or badge before the name: the head has no place for one (the owner's iPhone, 2026-11-14). The name and the line are one line each, cut short, the line a note's 13 points on every card (`CardHeadRow`, and `MapCard` with its sizes), and the line is in the head, so it shows at the pill (10): a point held's place and ground, a past flight's day and times. An airport's full name alone is fitted to its line (`FitLine`), as the owner asked on 2026-11-11. A card with a link has its Share at the head's start: an airport, a VOR, a fix and a VFR waypoint (`mark`), an airspace (`mark`), a TFR, a point held (`at`), an airplane.

|               | Web                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | iPhone (Apple Maps' way)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Android (Google Maps' way)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A card        | Base UI's own nested Drawer over the map's sheet, one per card, the last opened on top (`components/sheet/CardStack`; the owner, 2026-11-11): every `SheetCard` -- the one card component (the card rule's 8; `PanelCard` merged into it, 2026-11-11), its head row `CardHeadRow` drawn by it or, for an airport, an airspace, traffic, a past flight and Nearest (`head={false}`), by the content's `CardTitle` or `CardHead` --, the Brief, the Nav Log, the Profile, the Stops and You with Settings in it (`CardLayer`; every card but the welcome, the owner, 2026-11-13), with the sheet's sizes, its grabber and its swipe; it covers the search and the title row, the sheet under it kept as it was; ✕ goes back to the search with its query kept (`lib/openCards`). The Nav Log, the Profile and the Stops are kept between their openings (`CardLayer`'s `open`, their drawers closed but laid out: index.css's kept cards)                                                                                                       | One card over the plan's sheet, the same view (`SheetPageView`) from every way in, presented through one `.sheet(item:)` (`Navigation/CardHost`); the search is out of sight while it is up                                                                                                                                                                                                                                                                                                    | The search bar becomes "← KOSH", the card's name with ←, its actions and ✕ at the end (`ui/sheet/CardPage`); the card fills the sheet, on the sheet's own Navigation 3 stack (`ui/MapViewModel`, `ui/SheetPages`)                                                                                                                                                                                                                                     |
| Inside a card | Its own stack in the sheet; ✕ goes back one level                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Pushed in the card's `NavigationStack` with the system's Back and edge swipe (`Navigator.push`)                                                                                                                                                                                                                                                                                                                                                                                                | `SheetNav.push`; ← and system Back go back one level, ✕ closes every card                                                                                                                                                                                                                                                                                                                                                                             |
| Back, Escape  | Escape is the top card's own nested drawer's, closing it (CardStack); with no card up the sheet's own Escape lowers it to the pill. A device's Back closes the top card the same way (`lib/backNavigation` `closeTopmost`): Android's through the browser's stock CloseWatcher, held only while something is open (`useBackCloses`), a TV remote's by its key; where there is no CloseWatcher (Safari) the browser's Back is left as it is. The browser's history is not the app's, as the planner replaces its address                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The stack's Back; the card's close at the right of its bar                                                                                                                                                                                                                                                                                                                                                                                                                                     | System Back closes the top card at once (`MapSheet`'s `lowerOnBack` only with none open); the dry run, the ATC card and the assistant's answer close on Back too                                                                                                                                                                                                                                                                                      |
| Questions     | `SheetDialog`: a confirmation (`useConfirm`) is the stock centred alert at every width, Cancel beside its action (2026-11-20); Ready to Fly's prompt and the other alerts a bottom sheet on a phone with ✕ or Cancel, centred from `md` up                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `.alert` and `.confirmationDialog`, hung on the top of the stack (`TopHosts`) so they always show                                                                                                                                                                                                                                                                                                                                                                                              | `AlertDialog` (`ui/SourceDialog` for a source report)                                                                                                                                                                                                                                                                                                                                                                                                 |
| Emergency     | The one full-height card, ✕ at the top right, the map not dimmed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | A card on the system sheet (`SheetPage.emergency`) at the large detent, the card's own close; the iPad's inspector                                                                                                                                                                                                                                                                                                                                                                             | A card on the sheet's stack (`SheetPage.Emergency`) at full height, the card's bar; at half the glide ring shows                                                                                                                                                                                                                                                                                                                                      |
| One search    | Search's page, turned to by one round toggle button at the end of the sheet's first row, where the account button was (`PageToggle`; the owner, 2026-11-14, "Swap the fpl toggle and account buttons"), its magnifier showing while FPL is up; it finds airplanes too -- the pilot's, the kept, those the map hears by callsign or address, the FAA registry's -- with no traffic page or airplane field of its own (the owner, 2026-11-14), and the airplanes' Favorites and Recents are its page's, after the airports'; the airplanes' Adds ask it ("Search for your airplane"), as Home's and a Favorite airport's do; Nearest's place is the one field scoped to it, at its card's top (`nearSearch`), where the card covers the sheet's first row; the route's points ask it for an airport (`askSearchPick`), the ask's title (Add Stop, Change Stop, Departure) large in the first row with a ✕ that cancels back to FPL and the field under it, as Apple Maps' Add Stop sheet (the owner, 2026-11-20; `OneSearchField`, `SearchBox`) | The one `.searchable` field, on the TabView's `Tab(role: .search)`; it finds the airplanes heard too, their Favorites and Recents after the airports', and the airplanes' Adds open it with "Search for your airplane" or "Search for an airplane to keep" (`OneSearchModel.Keeping`), no traffic page of its own (2026-11-14)                                                                                                                                                                 | Search a `NavigationBar` item beside FPL's; Add a Stop and Add a Stop After open the one search (`SearchControl.stopAfter`)                                                                                                                                                                                                                                                                                                                           |
| At the pill   | The card's pinned head (`data-sheet-head`: `PinnedHead`, Settings' title row, a console page's head) is all of the card left in sight there (CardStack's scroller), with its short line under its name (`CardHead`'s `sub`); a tap on the row raises the card to half. Only the main sheet parks there; every card's frame has `onSwipeClose` (`lib/sheetCards`; `SheetCard`'s `onClose`, each `CardLayer`'s own, 2026-11-26), and a swipe down from half closes it by the Drawer's own close, from all the way up brings it to half (the owner, 2026-11-14: "Settings cards should only close from a swipe down when in medium detents")                                                                                                                                                                                                                                                                                                                                                                                                  | The system sheet's smallest detent shows the card's bar, where a swipe down parks a content card (`SheetPage.detents`) and a drag past it leaves it there (every card but the settings cards `interactiveDismissDisabled`, `Navigation/CardHost`), so Emergency too closes by its ✕ alone; You, Settings and the Map card have no pill detent, so from all the way up a swipe brings them to half, the next detent, and from half closes them (`SheetPage.swipeCloses`, the owner, 2026-11-14) | No pill with a card open: the sheet's peek is half the window while a card is up (`halfWindow`), and a drag down from half closes nothing -- but under You, its pages (Pilot Details, Minimums, Settings and Settings' pages) and the Map card (`SheetPage.swipeCloses`), where the sheet may take its Hidden value and a swipe down closes the cards and brings the search back at its peek (the owner, 2026-11-14); Emergency closes by its ✕ alone |
| By name       | `useOpenScreen` through `lib/navigation/wanted`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `RootView.openScreen`, which opens the card by `Navigator.open`                                                                                                                                                                                                                                                                                                                                                                                                                                | `OpenScreen` through `ScreenRequests`                                                                                                                                                                                                                                                                                                                                                                                                                 |

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

**On Android every card is on the sheet's own Navigation 3 stack**
(2026-11-13, the owner: "For phones, just do it natively, but stay
consistent"; Google Maps' way): `ui/SheetPage` has every card, the Nav Log
(`ui/NavLogCard`, the legs and totals out of the plan's page) and
Emergency (`emergency/EmergencyCard`, no longer a full-screen dialog; this
replaces the table's Emergency cell for Android) among them, each with
the one `CardPage` bar, opening at half and Emergency alone at full
(`SheetPage.opensFull`); the round toggle under the 3D stays in sight over
a card and closes the cards as it turns the page (`SheetNav.togglePage`);
signed out, You's one name is its Sign In (`ui/YouScreen`). The welcome
stays Material's modal bottom sheet, questions `AlertDialog`, a task's
form `WingtipSheet`, and the photo, plate and diagram viewers full screen.

## 2. The scrolling rule (the owner, 2026-11-10)

1. **The title and ✕ always stay in view.** On the web, owner decision
   2026-11-10: one pinned frosted head, no large title -- the card's head
   is one row (its name, Share, ✕) pinned at the sheet's top under the
   grabber from the start, the content scrolling under it blurred through
   its frost ("just keep the title on top and content moves under with a
   frosty style"). A card's tabs or segmented control pin under the head,
   frosted the same way. The airport card is laid out after Apple Maps'
   place card (the owner, 2026-11-14, sending Maps' Teriyaki Madness
   card: "How can we make our airport card more similar to this? Can tabs
   be similar to that floating buttons group at the bottom?", then "fix it
   all"; option C1 on the canvas
   https://claude.ai/artifact/V1d9RDbmY1aczc4LfXed7a, board "Airport card
   after Apple Maps"), top to bottom: the head (Share, the ident with its
   name and "Towered" or "Non-towered", ✕); the four actions, glyph over
   word in 56-point tiles, Fly Here saying the time there ("≈ 38m") where
   it can be worked out; then the tab's page, Info's starting with a
   sideways strip of facts and the pictures as large rounded tiles (the
   owner, 2026-11-14: "Info tab should start from the info strip and
   images and the rest. Switching tabs should not show those"), Weather,
   Runways and Charts straight under the actions. The strip is always the
   same five, in this order, a dash where one is not known (the owner the
   same day: "the info strip can have these fixed things: weather,
   airspace, elevation, pattern altitude and distance"), short so all
   five fit across an iPhone with no sideways scroll, at most one note:
   Weather (the category), Airspace ("D", the class at the surface now,
   its note the day's next change at the field's clock, "E after 22:00",
   or "Part-time" where the hours cannot be known; a tap opens its hours),
   Elev., Pattern (the TPA in feet MSL, no note), Distance ("12 nm").
   After the frequencies come Airspace hours (as Maps' Hours: the class
   now and today's times, then Normal hours, closed by default) and
   Details in Maps' row form, a grey label at the left and the value at
   the right in the tint (phones, website, address). A tab picked opens
   at its own top, just under the actions, the card's height unchanged.
   Its tabs (Info, Weather,
   Runways, Charts) float in a glass bar at the card's foot, as Maps'
   group of buttons does, in reach at every height and hidden at the
   pill, the page scrolling under it and clearing it at its end: the
   picked tab in the tint on a soft lighter pill, Weather with the field's category dot
   and Charts with its count. Each tab is an icon (Info, CloudSun,
   PlaneLanding, FileText; the owner, 2026-11-14: "make the tabs icons
   instead so it takes less space"), every tab showing its word under its icon (the owner, 2026-11-14, from an iOS 26 tab bar: "similar size and see through"), in the one floating bar FPL's actions are drawn in too (`components/FloatingBar`; the owner, 2026-11-18: "Yes make it common. Also I meant shorter not narrower, but apply the same height and width for both"): items 48 points tall in a 56-point capsule, the glyph 24 over the word on the `tab-bar` type (12/16 regular, iOS 26's tab bar), its items one width on every bar, 73 points (a quarter of 18.75 rem less the capsule's sides, so four tabs make it 300 and FPL's three 227; growing with the text size as the words do, capped at a quarter of the room there is, never narrower than its words; the owner, 2026-11-21: "fpl and other tabs placement look different"), 4 points over the screen's foot or the home indicator's inset, so FPL's figures at half clear it), centred, with equal columns, the glass much more see-through (`material.bar-fill` 0.6, the blur kept), so nothing moves on a switch, each named by its aria-label
   ("Weather, VFR"), the dot and count over the icon's corner. The bar is glass because it floats over the
   card (the owner's decision of 2026-11-10 keeps glass for what floats).
   On a phone's bottom sheet the bar comes in, a short fade, once the card
   has come to rest under it, and goes at once as a finger takes the card.
   It stands outside the card's sliding popup, so a drag that starts on
   its capsule does not move the card: Base UI's Drawer has no part that
   hands a drag on another element to an open drawer (its `SwipeArea`
   only opens a closed one), and the bar inside the popup, counter-moved,
   slid apart from the card on the iPhone (the sheet-motion audit of
   2026-11-23). The card's grabber and its ground above the bar take the
   drag; the bar is for taps.
   This replaces T4's tabs under the actions and its one-line report.
   A closed runway is crossed out on the pictures' runway sketch where
   the airport marks it on the ground, the engine's
   `runway_closure_marks` (2026-11-17; AC 150/5340-1M 5.6 and 5.7, AIM
   2-3-6): an X at each end of one a NOTAM closes, 50 ft in over its
   designation; for one closed for good (NASR's CLSD INDEFLY or PERMLY)
   every 1,000 ft too and one each side of an open runway it crosses;
   never on an open runway, an X that would be moved along the centre
   line clear of it; each X square to its runway and just wider than its
   strip. A part a NOTAM closes ("RWY 09/27 E 500FT CLSD", "RWY 27 FIRST
   1000FT CLSD") is faded and crossed at its own ends; a closure between a
   taxiway and an end is the whole runway's, as the Runways tab's badge
   says. The Xs are the Closed badge's red where the FAA paints them
   yellow (Figure A-27): the owner's to change.
   The airplane cards are laid out the same way, with the same parts (the
   owner, 2026-11-14: "make sure the airplane card looks similar to
   airport card"; one card an airplane since the owner's design of
   2026-11-26): its facts in the strip (its maker over its model, "Airbus" over "A321", Year, Seats, Engines,
   Weight, Operator, five at the most and one row, its maker the small grey name,
   its model the value, Engines giving way to Operator, spread with
   no sideways scroll as the airport card's, 2026-11-27; its registration and owner in its Registration section, the
   owner, 2026-11-27) under its actions and over its pictures (the
   owner, 2026-11-26: "It should be buttons, info strip and then the
   pictures"), then two tabs in the glass bar at its foot as the airport
   card's (the owner, 2026-11-27: "let's have two tabs, info and flights.
   by default info opens, and then flights are fetched in the
   background"; "info can show the pictures, flights can show the in the
   air card"): Info, its photos and sketch then its record; Flights, its
   flight now then its flights. Each section its first three rows and its
   title the rest, as the airport card's sections ("make the sections of
   3 entries like airport card"), its Figures a fourth button opening
   their own card. On
   Android, at half height a
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

|                   | Web                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | iPhone                                                                                                                                                                                                                                                                                                            | Android                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pinned head       | One scroller per sheet (`sheet/SheetScroller`'s `data-sheet-scroll`), its scroll indicator the browser's own, shown while it scrolls (iOS's transient bar; 2026-11-11), its head band (the search, the route's row) `position: sticky; top: 0` in it and frosted, and in the flow while it is taller than the scroller (`sheet/bandFits`: FPL's open route ran 795 points in a 757-point scroller and hid the route's field, 2026-11-19), FPL's band always in the flow with its title row alone pinned (`bandScrolls`: its route near the scroller's height crossed that line and back as cards opened, and the list jumped, 2026-11-25), the grabber's room inside it; on a phone frosted only all the way up, the sheet's solid ground at the pill and half, where its body does not scroll and the frost redrawn as the sheet slid striped the route's card in iPhone Safari (`SOLID_BAND`, 2026-11-17), and solid too while the sheet moves from all the way up, a finger on it or settling (`FULL_BAND`, 2026-11-18); tab pages laid out whole in it, nothing measured and no scroller pulled up under the head (2026-11-11); a card has its own nested drawer's scroller (CardStack). `PinnedHead`: one row sticky at the sheet's top from the start (under the search's row, a fixed height, `--sheet-head`, on a tab's list), frosted (index.css `frost-head`: the sheet's ground at the head fill, 0.94 (tokens.json `head-fill`), over the sheet blur, solid without backdrop-filter and under Reduce Transparency); on `CardTitle`, `CardHead`, `SheetCard`, `ListPageHead`, Settings' title row and a console page's head. The airport card's tabs float at its foot instead (C1, the owner, 2026-11-14): a glass bar sticky at its scroller's foot, held at the foot of the part in sight by the Drawer's offset (`CardTabBar`, the airport's `place/PlaceTabBar`), its pages starting under the head (`PINNED_BELOW`, `CardTabPages`); the airplane cards' the same (2026-11-14) | The stock large navigation title collapsing to inline; nothing forces `.inline` but forms. The airport and airplane cards' tabs are the stock `.tabs` picker in the system's bottom toolbar, floating Liquid Glass at the card's foot and put away at the pill (`Design/CardParts`' `CardTabBar`, C1, 2026-11-14) | Material 3 Expressive's large flexible top app bar with `exitUntilCollapsed` on every card and page at full height, the plan included, and the small `TopAppBar` at half (`LocalSheetFull`); the airport card's tabs Info, Weather, Runways and Charts in Material 3 Expressive's floating toolbar at the foot of the card in sight, the stock short navigation bar's items in it, each glyph over its word (`ui/AirportTabs`' `AirportTabBar`, lifted over the window's foot at half by `sheet/SheetFoot`'s `InSightFoot`; C1, 2026-11-14) |
| Grow, then scroll | Base UI's Drawer gives a drag to any scroller that can scroll, so below full the sheet's scroller and any in its body are `overflow-y: hidden` (index.css), which its arbitration skips; a script, the keyboard and a focused row still scroll them, the sheet left at its size                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | The system sheet's own behaviour, with nothing overriding it; no zoom push inside a resizable sheet, whose pull-down would pop the page                                                                                                                                                                           | The sheet's nested scroll; every card shown from the search or the map opens at half (`halfWindow`) and grows to full; one pushed inside a card keeps the height                                                                      |
| Detents           | A card's nested drawer has its own snap point among the sheet's three sizes, the same fixed values in the Drawer's own units (`"4.25rem"`, `"23rem"`, `1`; `components/sheet/insets`), never px worked out from the window: it opens at the size of the card it is opened from, else at half, Emergency all the way up (`lib/sheetCards`' `cardOpening`), and the sheet under it stays where it was; what is drawn follows the snap point the moment it is set; a swipe moves one size however fast, by the Drawer's own `snapToSequentialPoints` (the owner, 2026-11-11, "enforce the detents, regardless of how fast you swipe")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Every card opens at `.medium` (Emergency at `.large`) and the pilot's drag sizes it, a card opened inside a card keeping the height; the map stays live under it up to `.medium` (`presentationBackgroundInteraction`); questions and forms stay modal                                                            | A card from the search or the map opens at half and grows to full; one opened inside a card keeps the height                                                                                                                          |
| Sideways rows     | The Embla carousels (`CardPictures`, `RecentCards`, a field's hours `HourlyForecast` and the Brief's departure hours `DepartureWindowStrip`, shadcn's Carousel since 2026-11-17 where they were scroll-snap rows) and the route's pills carry `data-base-ui-swipe-ignore="x"`; every native sideways row `overscroll-x-contain` and, in the sheet, `overflow-y: hidden` (index.css: `overflow-x: auto` alone made it a few points' vertical scroller, which took a drag up at half); the upright altitude Slider and the sortable rows' grips keep `""`, their drag being up and down                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | No control takes the sheet's drag: the Profile's upright altitude slider is a stock `Slider` the sheet does not take; the flown track's chart moves the replay on a tap                                                                                                                                           | A sideways row takes only a sideways drag; the sheet's nested scroll takes the rest                                                                                                                                                   |
| Place kept        | A card under a card keeps its place in its own drawer's scroller, and a card opened anew is a new drawer, at its top (CardStack); a kept tab keeps its place in the sheet's one scroller (`TabKept`'s `useKeptScroll`), and a tab's page opened anew starts at its top (`useStartAtTop`); the airport card's tabs each open at their own top under the actions, Info's too when picked again, and a short one leaves the pages where they were (`useTabScroll`; the owner, 2026-11-14: "Switching tabs should not show those"), Settings' list its place after a page (`lib/scrollPlace`); the suggestions, a sent search's results and its Filters page each have their own scroll box                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | The stack's own behaviour                                                                                                                                                                                                                                                                                         | Each card is its own back stack entry with its own scroll and title state                                                                                                                                                             |
| Footers           | The card's own content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Every footer is the system's bar, `safeAreaBar` (`glassFoot`); a card's toolbar the stock bottom bar                                                                                                                                                                                                              | The card's own content                                                                                                                                                                                                                |
| Forms             | `useDiscardGuard` (`components/discardGuard`): a swipe, Cancel, Escape or a tap beside asks first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `interactiveDismissDisabled` while there is an edit, Cancel at the leading edge asking in a `confirmationDialog` (`Navigation/FormCancel`)                                                                                                                                                                        | `DiscardDialog` on a swipe or Back (Add Flight, Your Airplanes' form)                                                                                                                                                                 |

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

No page draws a scroll bar, on the web at any size (the owner,
2026-11-18: "No visible bar needed on any page"): everything scrolls by
touch, wheel and keys with its bar out of sight, as an iPhone's lists do.
One rule for every scroller (`styles/feel.css`), none per component.

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

| Platform                            | Table                                                                                                                        | Suites                                                                                                                                                                                                                                        | On a pull request                                                                           | Every night                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Web (Playwright, the phone project) | [`e2e/cardTable.ts`](../../apps/web/e2e/cardTable.ts), its ways in [`e2e/cardEntries.ts`](../../apps/web/e2e/cardEntries.ts) | [`cards.spec.ts`](../../apps/web/e2e/cards.spec.ts), [`card-scroll.spec.ts`](../../apps/web/e2e/card-scroll.spec.ts); [`sheet-cards.spec.ts`](../../apps/web/e2e/sheet-cards.spec.ts) for the cards a control or a chart tap opens            | The one `@smoke` test: the airport card from the search, opened, scrolled and closed        | The rest                                               |
| iPhone (XCUITest, `WingtipUITests`) | `CardTests.cards` in [`CardTestSupport.swift`](../../apps/ios/WingtipUITests/CardTestSupport.swift)                          | [`CardRuleTests`](../../apps/ios/WingtipUITests/CardRuleTests.swift), [`CardScrollTests`](../../apps/ios/WingtipUITests/CardScrollTests.swift), each at the default size and accessibility XXL; the detent read off the "Sheet Grabber" value | [`CardSmokeTests`](../../apps/ios/WingtipUITests/CardSmokeTests.swift) on the newest iPhone and iPad | The full suites on the iPhone, the iPad and iPhone Duo |
| Android (Compose UI, `androidTest`) | `CARDS` in [`ui/CardRuleTest.kt`](../../apps/android/app/src/androidTest/kotlin/app/wingtipmaps/android/ui/CardRuleTest.kt)  | `CardRuleTest`, `ui/SheetNavTest` on the emulator; `SheetPageTest`, `OpenScreenTest`, `CardRequestsTest`, `SearchControlTest` on the JVM                                                                                                      | The JVM tests                                                                               | The instrumented tests on the emulator                 |

A check a card cannot meet says why in its row (`not` on the web), and
the suite prints that reason. What runs when is [docs/CI.md](../CI.md).

## 4. One search (the owner, 2026-11-09)

The sheet's Search page (§4a: its pages turned by one round toggle
button at the end of their first row, the owner, 2026-11-14) has one
field as its first row, "Search airports and
airplanes" on the phones (the owner, 2026-11-14) and on the web the placeholder
"Search" alone, named "Search airports and airplanes" to a screen reader (the
owner, 2026-11-20: "just say Search"; no Ask on the web since decision 0041, the phones' on-device
answers still offered among the suggestions), with the on-device microphone and, on the web, the page
toggle beside it (on the phones still the account button, until the owner's word); the account button,
on the web over the map under the 3D, opens You, who the pilot is and what is
theirs, with Settings one of its rows (§8), where Setup was. The approved canvas: <https://claude.ai/artifact/XmbNqJTLRwwzebouLbXzCV>.

- **Nothing typed:** Nearest and Find Nearby, then Favorites (airports
  and airplanes) and Recents. The current flight is the FPL page's, one
  toggle away, not a card here (the owner, 2026-11-11: "We can remove plan
  button and saved from search"; kept so 2026-11-17, less cluttered).
- **Typing:** one list in groups: Airports; Waypoints and Navaids;
  Airplanes (your own, an N-number from the FAA registry, a type; an
  N-number's registry row shows its type at once and, under it, whether
  it is in the air -- "Checking whether it's in the air…" until the live
  find answers, then "In the air · 4,500 ft · 108 kt" with Track, or "Not
  in the air now", a failure said in the row: the owner, 2026-11-14); Do
  (Direct To, Brief, Nearest, Emergency and every screen by name, and on
  the phones "Ask: …", answered on the phone). Results come from the existing endpoints
  and generated models; the search holds no aviation logic.
- **Picking:** an airport opens its card with Fly Here, Add as Stop, Call
  and Favorite at the top (its address the town link and the Info tab's
  row), Share in its head and Refresh in its Weather tab (the owner,
  2026-11-11; the web first, the phones still
  with Depart From); opened while a stop is asked for (Add a Stop), Add
  Stop, filled, in Fly Here's place, then Call, Favorite and Address (the
  owner, 2026-11-18; the web first); an airplane its profile with Fly This Airplane; an
  action runs.
- **The airplane card** is one card an airplane, however it is reached:
  by its N-number (the search, the plan's Airplane and its ⓘ, a link's
  `airplane=`, the pickers), the pilot's own airplanes too, or by its ICAO
  address (traffic tapped on the map, a link's `flight=`). The owner's
  design of 2026-11-26 (mockups Main, Ground, Figures and Unregistered)
  merged the airplane card and the traffic card into it: the registry
  gives an N-number's address and adsb.lol's detail an address's US
  registration, so a flight with an N-number is that N-number's card, and
  its "In the air" opens nothing more. Laid out as the airport card is:
  Share at the head's start, the title, ✕ at its end; the title its
  N-number, else its call sign; under it its call sign while it flies and
  what it is ("Piper PA-28, 1998", else its ICAO type). Four action
  tiles, always the four in their places, the first filled, by its state:
  in the air **Track** (the map keeps it in sight, a switch), on the
  ground **Fly This** ("Flying This", greyed, once it is the plan's
  airplane); then **Alerts** (takes off, lands, comes near),
  **Favorite** and **Figures**. A tile that does nothing for this
  airplane is greyed, not taken away (the owner, 2026-11-27: "Keep four
  buttons on top, just disable the one when needed"): Fly This and
  Figures for an airplane the planner cannot fly (it can fly one the
  FAA's registry holds, or the pilot's own). Alerts is offered
  where its history is, greyed where the registry gives no ICAO address.
  Then two tabs, the glass bar at its foot (the owner, 2026-11-27): Info,
  where it opens, and Flights, its flights asked for in the background as
  the card opens (OpenSky's take seconds). Flights opens with its flight
  now (the owner, 2026-11-27: "flights can show the in the air card"): in the air the
  status badge, its ends with the bar of the way flown, height, speed and
  track, when it arrives, how far and how high from own ship, carried on
  each second; on the ground one line ("On the ground · landed KPWK 2h
  ago", "Not heard in the last 6 weeks", "Checking whether it's in the
  air…" while the live find is out). Info opens with its pictures, one sideways row as the
  airport card's ("info can show the pictures"): its photo, credited and
  linked to its page, then, where it has flown two reports at the least,
  the sketch of where it has flown; none where it has neither. Who flies it and its
  squawk are facts in the strip over the pictures, as is traffic's ICAO
  address where the FAA's
  registry does not hold it (the owner, 2026-11-27: no Now section, its
  scheduled route and departure being the flight slide's). Opened by
  its N-number while it flies, it is tracked without the map moving.
  Each section its first three rows, its title opening the rest and "3
  of 12" at its right (FirstFew): on Flights its flights, Earlier
  while it flies, newest first (the last ten, Show Earlier Flights once
  the section is open, a day picked), each ▶ opening its replay and
  debrief over the card (the owner, 2026-11-14: "How do I see the
  flights of airplane and play them?"); on Info its public record, its
  identifiers with it (ICAO address, Mode S octal, call sign).
  **Figures**, the fourth action button for an airplane the
  planner can fly (the owner, 2026-11-26: "It should be the fourth
  button above"), opens a card of its own over this one, open at once
  from the plan's N-number's ⓘ or a figure asked for: every planning
  figure, edited in place, a missing one asked for there, then its **POH** (the owner, 2026-11-26): the app ships
  none, the manufacturers' being copyrighted, so the row is Add Your POH,
  a PDF from the device kept in the pilot's own documents and linked to
  the N-number, with "Use for All <model>" under it (the registry's make
  and model, else the profile's type); linked, it opens in the reader, and
  its menu changes or unlinks it, the document kept. An airplane with no
  Figures has the row after its record. Traffic the FAA's registry does not hold is the same
  card titled with its call sign, its registration, type, model, ICAO
  address and call sign in its first section, its registration row
  saying it is not in the FAA's registry, then its flights, its photo by
  its address in the row. Its record is the airplane's
  public record in sections, in this order -- Registration (owner, owner
  type, town, co-owners, issued and expires, last action, FAA region,
  fractional), Airplane (type, category, builder certification, seats,
  engines, weight class, the FAA's reference cruise said as a reference
  figure and not for planning, kit, serial, Mode S hex and octal), Engine,
  Airworthiness (class and operations, date, type certificate data sheet
  and holder), Usually based at ("6 of 9 takeoffs and landings", nothing
  where its flights show no one field, "Looking…" while it is looked up),
  Safety history (the NTSB's cases, each linking to its report and
  docket), Ownership history (this airframe's past registrations first,
  then other airplanes that held the N-number) and Documents filed with
  any reservation -- each group saying in place where it has nothing; its
  Planespotters.net photo in the card's pictures once one is found, the
  photographer named on it and the picture a link to its page.
- **The owner rule:** the FAA aircraft registry is public data, so Info's
  Owner group always shows the registry's owner for every airplane --
  name, town and state, kind of owner and co-owners -- as the FAA
  publishes it (the owner, 2026-11-14: "For owner info though, it's
  public info"); the town, never the street.
- **The plan is the sheet's main content** with a route, everything the
  FPL tab had in the same order.
- **Desktop web:** the same search and plan in the side panel; ⌘K, Ctrl K
  or / focuses it. There is no separate command palette.
- **Links** keep their ids: the old tabs map to the plan, the search, the
  airplane's profile and the account page.

| Web                                                                                                                                  | iPhone                                                                                                                          | Android                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Base UI Autocomplete with groups (`OneSearchField`, `OneSearchResults`, `features/fpl/search/useOneSearch`), Base UI Menu, list rows | `.searchable` with `.searchSuggestions` in the sheet's `NavigationStack` (`Search/OneSearch`, `OneSearchModel`), `Menu`, `List` | Material 3 `SearchBar` with its expanded results (`search/OneSearch`), `DropdownMenu`, `ListItem` |

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
   page toggle) and its home list (Favorites, Recents, Nearest,
   Saved, Find Nearby), the traffic and the search's lists in full.
2. **FPL** (the second page): its first row the search's row's twin
   (the owner, 2026-11-14: "for all three fpl layouts, keep the n-number
   strip with buttons in the same size as search bar"): the airplane's
   strip -- its N-number and the altitude, no captions (the owner,
   2026-11-17: "No need for airplane and cruise labels"; VFR/IFR the
   Profile card's, the same day), and before there is a route its •••
   (the route options, the link), a plain glyph in the
   tint as the search bar's microphone is -- in a bar exactly the search
   field's size, the page toggle at its end, so a turn of the page changes
   only what is in the bar; under it the route in its one layout (the
   owner, 2026-11-17, "Ok let's try it"; decision
   [0047](../decisions/0047-one-fpl-layout.md)), never in the bar: its timeline, read and edited at
   once at any height of the sheet (the owner's two-row timeline,
   2026-11-17) -- one rounded group in Apple Maps' Directions' look, a
   44-point line a point: its mark a filled circle with a white glyph (My
   Location the tint and the location arrow, an airport its flight
   category's colour and "•••" (the owner, 2026-11-20: "replace the
   plane icon with three dots"), a fuel stop the pump, a waypoint a
   grey triangle), the mark its menu (Change by the one search, Direct To,
   Set Altitude, Hold, Add a Stop After, Move, Remove); the route's magenta
   one solid line between the marks; the card the grouped lists' box (its
   corner and edge), each row's hairline running to its trailing edge, a
   row greyed under a finger, a drag button shown while the keyboard has
   it, and Add a Stop saying "Up to 16 stops" when the route is full (the
   grouped box's audit, 2026-11-20); after a hairline inset to the
   text its ident (a link to its card), the fuel in the tanks there (past empty the gallons short, "12 gal short" in the short's red, 2026-11-23; it was "−12 gal", the owner, 2026-11-20) right
   after it -- a gauge to read, no control (the owner, 2026-11-25:
   "Tapping fuel tanks should not do anything"; it set the fuel at the
   departure and after a stop from 2026-11-21). The figure is the
   address's `tanks` ("C81:20,KMSN:0"), the
   engine's `fuel_in_tanks` walks the gauges from it and the planner's
   fuel check, fuel stops and loading fly the same (its `tanks` query,
   `navlog_fuel_plan`'s `on_board_gal`). A gauge is red under the reserve
   of the flight it is on, each flight's own as the planner's totals give
   it (30 minutes by day, 45 at night or under IFR: 14 CFR 91.151(a),
   91.167(a)(3)), so a day flight after a night one is not held to the
   night's 45 minutes; the departure's is red where what is on board, less
   the start and taxi, is under its reserve, and under IFR the
   destination's where it lands without the fuel on to the alternate too
   (91.167(a)(2)); the web passes each flight's reserve and the alternate's
   fuel and the engine says which point is low. A stop's gallons typed
   under what the airplane lands with keep what it lands with, and the
   field says so ("Keeps the 13 gal it lands with"). The plan's Undo ("Undo Fuel")
   puts it back. The destination's gauge and a waypoint's are read only,
   and with no airplane there is no gauge (the one ask for an airplane
   stays the N-number field, the UI audit's C3), at the right its time (the departure's a picker); no city; below full, two stops
   or more one row between the ends, "2 Stops" and their idents, a tap taking the sheet all the way up, where each is its own row (one stop always its own); Add a Stop the last row, by the one
   search, with a pill at its end where there is fuel to plan: "Add Fuel
   Stops" puts the planner's suggested ones in, every flight's of the
   route, in one step: the planner picks the stops on the flight's figures
   as one flight, then plans the route again with them in, each stop's
   flight on its own altitude and winds, which is the check, and puts in
   what those plans suggest too, till none is short (three plans more at
   most; `wingtip.fuel_rounds`, the owner's KDSM to KCBK landed 3 gal
   short, KLAS to KPWK 21, 2026-11-20). Each suggestion says whether its
   flights pass (`passes`) or which is still short (`short`), the same
   answer for the phones; the nav log says "Checking fuel stops…" while
   it plans (`useSuggestedStops`' `fuelToAdd`); the pill stays Add while
   any flight still has stops suggested, and "Remove Fuel Stops" takes
   them out once none is, the first in the tint's light wash and the second in the
   destructive light red (the owner, 2026-11-20; `FuelStopsChip`). A flight
   still short with no stop offered says why in the pill's place
   (`NoFuelStopNote`, the totals' `no_fuel_stop`): "No fuel stop in reach
   on KMSN → KDLH", or "Too little fuel on board for C81 → KMSN" where the
   fuel on board at the start is under its start, taxi and reserve already;
   its tanks red; it may still be flown (warn, never limit). Under IFR the
   search keeps the fuel on to the alternate for the last stretch
   (91.167(a)(2)); each stop is itself a first landing (91.167(a)(1)), and
   only the destination's alternate is counted; a hold moves
   a point and its menu's Remove takes a stop out, the plan's toast Undo
   putting either back. A tap on a field's
   line opens it, one at a time: its wind at the left and elevation at the
   right, then one row of runway and procedure chips, wrapping where they
   do not fit, each runway's tray saying what it is for, "Land RWY 24"
   and "Takeoff RWY 24"; a kind not picked stays its "+ APCH" chip. With
   an approach picked the landing runway is the approach's own, folded to
   "Land RWY 9" as soon as the approach is in the route, a wind's pick
   giving way to it; another only where the pilot picks it and the plate
   publishes circling minimums (the engine's `landing_runway`, AIM
   5-4-20; the HIG review's Q3, the owner 2026-11-21). With the tray
   folded to its runway the chips wrap from the line's leading edge,
   under "Land RWY", not under the runway's chip; open, they slide with
   the runways (the HIG review, 2026-11-21). The chips stand 12 apart, so
   their 44-point areas meet and never cross. A
   procedure picked is no chip: its fixes are points on the route's
   magenta line itself, in the order they are flown (the owner's option
   D, 2026-11-21), an arrival's and an approach's before the field's line
   and a departure's after it, shown whether the line is open or not:
   a head row, the kind and the field in the procedure's indigo, small
   capitals ("APPROACH · C81"), over the procedure's name with the runway
   it lands on ("RNAV (GPS)-B · RWY 24", wrapping, never cut), the whole
   row one button with a chevron that opens the kind's menu to pick
   another ("just tapping it should show the approaches menu"); then a
   44-point row a fix, its mark an indigo ring with "•••" in the marks'
   column, its menu (Direct To, its altitude and card), its name (a tap
   opens its card) with the parts it plays under it, and its altitude at
   the right (`TimelineProcedureRows`). An approach picked is loaded
   first, as a GPS navigator loads one (the owner, 2026-11-22): one
   grouped box (`ListGroup`) of its fixes after the field's line, off the
   magenta, not in the route the planner and the nav log fly, with
   Activate and Remove; Activate puts its fixes on the line as above,
   with Deactivate (back to its box) and Remove at their foot; Remove
   takes it out with the plan's Undo toast; a Direct To one of its fixes
   activates it. Activated, its missed approach is its own part after
   the field's line, suspended at the MAP ("SUSP at RW09") in a dimmed
   box off the line, and dimmed on the map, until Unsuspend puts its
   fixes on the line and its legs in the route, the nav log and the dry
   run, magenta on the map; Suspend stops it at the MAP again (AIM
   5-4-21; the engine's `procedure_missed` says which legs). Both are
   kept with the pick in the address and a shared link (`procs`, "L"
   loaded, "M" flown into its missed approach). Arrivals and departures
   have no load step: picked, they are flown (`TimelineApproachParts`).
   The buttons are stock, 36 tall, 44 to a finger by the base hit area,
   at gap-2;
   the map centres
   it above the sheet and shows the route's points alone (the chart and
   the TFRs kept; lib/map/routeOnly). My Location and a waypoint open
   nothing; a closed field or an unknown point says why in red under its
   line, no chips. The route's field to type or paste a whole route opens
   under the timeline ("Route" over it, Done after) with no route, half a
   route or an unknown point; on a whole route the keyboard button at the
   grouped box's bottom right, after Add a Stop and the fuel stops' pill on
   one line (2026-11-22: "pinned to the bottom right"), is a toggle that
   turns the same box into the route's field and back, its size and shape
   kept at the least and the route wrapped in it, each pill and chip whole,
   never cut at the edge, the box growing to hold every
   line and the toggle's row under the last, below full no further than
   the room above the foot bar, past which its lines scroll inside the
   box with the toggle's row kept in sight, the sheet left where it is
   (`useFieldRoom`, the owner, 2026-11-25) (the owner's iPhone,
   2026-11-23; the row takes no tap but on its own two controls, the
   field's last line under it the field's), pressed while it is the field,
   with no "Route" row and no Done (the owner, 2026-11-22: "It should make
   the same grouped box into route box and the other way"), what is typed
   read as the field is left, the plan's Undo as ever; the
   figures under it and the Routes' chips put away (Routes not offered). **The route box's
   pills** are ForeFlight's route editor's (the owner's screenshot,
   2026-11-23): in the order flown, left to right with no arrows, `gap-2`
   between two (each one's 44-point area half the gap wider each side),
   wrapping whole; a field's arrival and approach chips sit before its
   pill and its departure's after it at a gap of 4, each chip its own
   piece that may wrap, a long title cut with "…"; nothing written after
   the last point ("Destination" is the timeline's word). A tap on a pill
   is its menu, the stock DropdownMenu with the same items as the
   timeline's "⋯" (`PointMenuItems`, one menu for both): Info (an
   airport's card), Insert Before and Insert After (the one search asked
   for the point, put in there; after the destination it is the new
   destination), Show on Map (the map brought to it and ringed, the sheet
   down to half from full), Procedures (where the FAA publishes one of the
   kind the route flies there, its d-TPP DP, IAP or STR), then Change,
   Direct To, the altitude, Move Up and Down, and Remove last, its Undo the
   plan's toast. Enter on a pill opens it, the left and right arrows go
   from pill to pill, Delete takes one out. What is wrong is on the pill:
   a point not known, or a field NASR lists closed (the engine's
   `field_status` on its card; decision 0043), is red, "Closed" or "not
   known" in its name and the reason at its menu's head; a caution there
   (the altitude's, a flight short of fuel with no stop offered) is a red
   "!" at its top right, its words at the menu's head. A suggested fuel
   stop stays dashed after the point its flight leaves (`fuelStopsAt`, by
   both the flight's ends): one tap puts it in the route there, no menu; a
   swipe to the left (`SwipeRow`), its held or right-clicked menu's
   Dismiss, or Delete dismisses it for this plan. A flight with more than
   one suggested is one dashed pill in that place, the same look and
   height, "+3 fuel stops" ("+3 stops" for breaks; `FuelStopFold`, the
   owner, 2026-11-23: a long route's box was mostly dashed pills): a tap
   or Enter puts them all in there; held, right-clicked or the menu key,
   the stock menu lists them, each with its own Add to Route and Dismiss,
   then Add All and Dismiss All; a swipe to the left or Delete dismisses
   the flight's suggestions. The map keeps a pin for each. A present position is "My Location" (Apple Maps' words)
   wherever the route shows it, never an ident (decision 0047); under the
   timeline the route's figures (To,
   Distance, ETE (ETA for an arrival), Track: short words, ETE and ETA the FAA's (2026-11-20), the distance whole
   miles, "1,334 nm", the owner's list, 2026-11-17) at their own size, always
   exact and one column each, never wrapped, and never set smaller to fit:
   a long figure ("1,320 nm", "⚠ 111.3 gal") is the size of a short one
   ("262 nm", "23.1 gal"), the columns as wide as their content, the first
   flush left, the last flush right and the rest spread between, and only
   where even that is too wide cut with "…", never a rounded form in their
   place (the owner, 2026-11-21, replacing the shrink-to-fit of 2026-11-17); in
   flight and in a dry run no To, which the flying head names, so Distance,
   ETE, Track and the GPS altitude are its four columns; whenever the
   airplane's position is known, on the ground too, "GPS alt" is the last
   column, in feet to the nearest 10, "—" where the fix gives no altitude
   (the owner, 2026-11-20: "The figures don't show gps altitude"). It is
   the GPS's height, the W3C Geolocation API's metres above the WGS84
   ellipsoid (section 9.2), never named MSL or the altimeter's
   (`gpsFigure`). Track, in the fuel's place (the owner, 2026-11-21:
   "replace Fuel with Track"), is the airplane's GPS track over the ground
   in degrees magnetic, three figures and north 360 ("274°", "004°"): the
   fix's true course (the W3C Geolocation API's `coords.heading`; a dry
   run's, the plan's track) less the engine's WMM variation at the fix
   (`magnetic_variation`, turned by `magnetic_of`; `trackFigure`), asked again only a mile on or
   on a new UTC day (`lib/magnetic`'s `nearVariation`: the WMM's field
   changes over miles and years, its track written in whole degrees), "—" with no position, no course
   or below flying speed (the engine's `underway`), a column always. The
   fuel stays on the timeline's tank gauges, the nav log and the Brief,
   no longer on the strip, so the strip no longer opens its breakdown. The
   strip and FPL's tab bar are one fixed bar over the screen's foot, outside
   the sliding sheet (`sheet/FootBar`, a sibling of the Drawer's popup on a
   phone; the side panel's foot beside it): the sheet slides behind it and
   nothing in it follows the sheet, iOS 26's tab bar with its bottom
   accessory (the sheet-motion audit of 2026-11-23, option B, which the
   owner took, after the strip held at the foot from inside the sliding
   sheet led it, jumped into the route and cut the tabs out mid-slide).
   Always in sight at the bottom (the owner's rule); at the pill the figures
   alone at the pill's size in the pill's room under the grabber, the tabs
   folded away (about 50 points of map), and at half and all the way up the
   strip one thin line on the tab bar, one stack (each value a detail's 15
   after its name in a note's 13, two by two where the line is too short
   for every figure whole; the owner, 2026-11-22, "make the figures strip
   very thin when fpl is half or full"). The pill is one row of at most
   four figures, the GPS altitude the first left out, a figure still too
   wide cut short with "…", never stacked; at a large text size the bar
   grows taller than the pill's room and the map's room follows its
   measured height (the r6 UI audit's H1). It changes between the two only once the sheet
   has come to rest (`sheet/sheetMotion`, from Base UI's own data-swiping
   and the popup's transform transition), with a 200 ms fade, never with
   the finger. It is opaque on the sheet's ground with no fade or scrim
   over the route above it (the owner, 2026-11-23: "the strip fades the
   route buttons above it"); the page ends with room as tall as the bar
   (`--foot-bar`, set as the bar is resized), so the route's last row
   scrolls clear above it all the way up; the map's room is never less than
   the bar, and a row tabbed to stops clear above it (scroll padding as tall
   as the bar). Its ground takes no touch at any size, only its buttons
   do, so a drag on it is the sheet's, as on Apple Maps; at the pill a tap
   raises the sheet to half, and from half up a tap on its ground does
   nothing. Only what it holds fades as it changes, never its ground; it
   goes at once, with no fade, under a card (before the card rises), on
   Search's page and while the keyboard is up, as iOS puts a tab bar away. The tab bar is a floating glass bar, the one floating bar the airport card's
   tabs are drawn in, the same height and width (`FloatingBar`, 2026-11-18),
   round Base UI's stock Toolbar (one tab stop, the arrows between them),
   of four buttons: Brief and Nav Log, each opening its card over FPL;
   Routes, the route glyph FPL's button had before it read "FPL", pressed
   while the suggested routes are out, their chips then in the figures'
   place in the foot bar, at the pill too, the same slot over the tabs so
   nothing else moves; a chip tapped is flown and the chips stay out to
   compare; Routes again, Brief or Nav Log bring the figures back (the
   owner, 2026-11-23: "When routes is tapped, show the routes instead of
   the figures strip") (Route Options, More's first item
   until the owner's 2026-11-22: "route option can show in the tab bar
   instead with the previous fpl icon we used"), always in the bar and
   greyed, named "No route options", while there are no ways to suggest
   (2026-11-22: "Routes should always show in the tab bar, just disabled if no routes"); and the route's •••, "More", its one menu, two
   items: Share link and Open in ForeFlight. Undo and Redo, Clear route, the map's choices,
   Show Fuel Stops, Refresh, Save and Type the Route are no longer its items:
   Undo is the toast's, "Route Cleared · Undo" or "Altitude Changed · Undo",
   with Cmd-Z and Shift-Cmd-Z on a keyboard (the toast 5 s on screen, held
   while hovered or focused: on a phone it lies over FPL's head; the HIG
   review, 2026-11-21); Clear is FPL's ✕; Checkpoints
   a switch in the Map card (Route Checkpoints); Add Fuel Stops (also asking
   again for any taken out) the timeline's pill; Refresh and Save the Brief's
   Share menu (Refresh replans too); Type the Route a keyboard button at Add a
   Stop's end; the checkpoints (ForeFlight's pack) and the printed nav log (the
   kneeboard) are the Nav Log card's own Share's, after its link (the owner,
   2026-11-21: "Print navlog should be in navlog share, not in more. Same with
   the checkpoints") (the owner, 2026-11-16, "make those action buttons as tab bar again and move the
   calculations strip to where the action buttons are now", buttons not
   tabs at the owner's pick; 2026-11-17, "move everything to the tab bar
   with a ... instead of share"); the Profile's button is the altitude
   pill's end, its caution counted there, and the N-number pill's end an
   ⓘ that opens the airplane's card (the owner, 2026-11-20: "can N number
   show an info button and can FL show profile button rather than in the
   tab bar?"); in flight the drawer's tiles are Brief, Nav Log, Profile
   and More. File flight plan is a button of its own,
   "File" (its glyph over its word, as the bar's items), to the bar's right in its
   glass and height, a gap-2 apart, the pair centred together (the owner,
   2026-11-21: "File flight plan should be a separate button next to tabs");
   no longer More's item, greyed where the plan cannot be filed. Hidden
   for now, with the Brief's Flight Plan form, until filing works through
   Leidos Flight Service (the owner, 2026-11-22: "For now hide the file
   button as we don't support it"; `FILING_OFFERED` in features/brief/filing.ts). At the
   pill the figures alone, large: swiped down, they grow. Taken up from
   the pill, FPL rises as the airport card does, one shared way for every
   sheet (the owner, 2026-11-16: "can we make it a shared code for all
   cards?"): what the sheet shows risen is laid out at the pill too, out
   of sight, and comes into sight by CSS the moment a finger takes the
   sheet, nothing built or swapped while it moves (on a phone: the
   desktop's side panel has no detents, nothing is laid out out of sight
   there, and its cards keep one height; the owner, 2026-11-19); FPL's
   figures stay in the foot bar beside the sheet meanwhile. A light tick as it settles where the browser has one. In flight the
   four are a row of tiles at the top of the flying drawer and the foot
   the figures, large, with Done flying. The Routes' chips are behind the
   tab bar's Routes, out in the figures' place in the foot while it is
   pressed (they were a row above the stops until 2026-11-23), their ways
   drawn on the map only then; put away as the route's ends change or its
   ways go, and Routes greyed while the route's field is open. The first
   row is three columns, the airplane's bar centred between the routes'
   button's slot (kept empty without it) and the page toggle, giving way
   in a narrow row, its airplane's pill first. What the Brief found
   to act on is the Brief's, which opens with it, not a list on FPL
   (the owner, 2026-11-16: "isn't there a better place for them? Like
   brief"): the Brief's button carries their count on its glyph's
   corner, red where one is a stop, amber where all are cautions, and
   the Profile's a 1 for the altitude's own caution; no bare dots, which
   said nothing of how many. A badge means a finding wherever it is
   drawn, red a stop and amber a caution, its figure in the ground's
   colour so it reads in either theme; a plain count (an airport's
   charts, an airplane's flights) is said in its tab's name, not drawn
   as a badge (the owner's list, 2026-11-17). A fuel stop is no
   caution: its pump on the field's symbol is in the tint and its tanks'
   gauge in the text's colour, never the amber (the owner, 2026-11-17:
   "Yes to all recs"). The gauge is React Aria's stock Meter
   (`procedures/FuelGauge`), heard as "Fuel in the tanks" with its
   gallons as its value. In FPL's timeline a stop's or
   the destination's time is on the device's clock, as the departure's,
   except at a field that keeps another time than the departure then:
   there it is the field's own time with its zone after it, smaller,
   "18:24 MST" (the owner, 2026-11-20: "just if any stop differs from the
   departure"; `lib/format`'s `clockElsewhere`, the field cards'
   `time_zone`; My Location, with none, takes the phone's). Once one
   point keeps another zone, every point says its own, the departure's
   too, each its own clock ("When the time zone changes then show it on
   all the stops"; `clockIn`). The fuel
   stays the gauge after the ident ("I like the previous fuel tanks"). A point's mark is its
   menu where the list edits the route, an airport's glyph "•••" to say so
   (the owner, the same day: "Stops should have ... buttons to show that
   there are more options"); a hold on its line still lifts it to move.
   Changing a point offers My Location first only where the route is not
   at it already ("Why show my location for destination when it's
   already picked for departure"). Winds stay as they are, by the owner's choice the
   same day: no "T" after the direction in FPL's rows (his "No need to put
   T next to wind"), "°T" in the Brief and the Nav Log, where a true wind
   unmarked reads as the magnetic one a tower gives (the UI audit's A7).
   The Brief's line under its name has no airport names: its title has
   the idents, and the names ran it off the line ("FL-145 · leaving now ·
   Chicago Exec to Harry R…"); its time carries its zone ("leaving 14:00
   CST"), as the Depart row and the timeline write a clock time (the
   Brief audit of 2026-11-21). The Routes are one row of chips, each a way's name and time --
   As typed, With Fuel Stops (the route as typed with the fuel stops it
   needs, each landing with 14 CFR 91.151's reserve, offered only where
   one is put in; the owner, 2026-11-17: "Suggested routes should also
   have 'add fuel stops'"), Avoid Weather, Fastest, Over Land, Avoid
   Class B, Most Filed -- the
   one flown filled, a swipe for more, every unpicked one the same
   neutral look: a way that meets something says so by its amber
   warning mark alone, its name in the text's colour (the owner's list,
   2026-11-17); their miles and fuel are the
   figures' and in each chip's spoken name. In the route's list an
   airport's ident is a link in the tint to its card (the nav log's
   `navlog-field-open`, the owner, 2026-11-17: "Can we make the
   airports/stops tappable as the navlog does?"), the rest of its lines
   folding its runways and procedures open, one disclosure with no
   chevron beside the symbol (the UI audit's C14), the symbol its menu;
   a waypoint's or a fix's stays plain. Every airport of the route is
   always a card, its role over its ident (Departure, Stop, Destination;
   labels C) -- the Nav Log's picked row's fill and
   corner, no border or shadow -- and a tap on its lines makes it bigger,
   its runways and procedures opening inside it, as the Nav Log's note
   opens inside its row (the owner, 2026-11-17: "show it all the time,
   tapping just makes it bigger"); the waypoints between stay plain rows.
   One card look for the list (`routeListStyle`'s FIELD_CARD). Change in
   an airport's menu asks the one search for the airport to put in its
   place. On the
   map the way flown is solid magenta and the others thin dotted lines
   in the chart's ink, each chip named -- every chip white and small,
   12 points, quieter than the line: the way flown's words in the map's
   tint, the others' in the chart's ink (the owner's list, 2026-11-17) --
   the others' chips left out where
   they would overlap (the owner's pick of the routes canvas, board 5,
   2026-11-16); then the route in order, and
   the figures and the actions' bar in the one foot bar, the figures alone
   at the pill, both FPL's alone; the Brief, the Nav Log, the Profile and the Stops are cards over it. With
   no route, the route is open to edit, "Route" over the departure's and
   the destination's cards to fill and the route's field, and the bar keeps
   the airplane and the menu, with a Close that goes back to the card or Search it came from
   (the owner, 2026-11-11: "We don't need plan a flight either with two
   buttons"). The first time, a welcome sheet says what the app is
   (Search like Maps, FPL like an EFB, the FAA charts), offers Theme and
   Appearance (as tiles, the picks the Map card's Look rows make), and its one
   button, Let's Go Flying, goes on to the map with the one search ready
   for where to (Search up at half, its field not focused), the airport picked
   planned from where the airplane is; after that first route one tip points at the toggle while it shows FPL ("Your flight plan is one tap away ... tap here any time"), once (the
   owner's option A, 2026-11-13; the web first, the phones keep their
   first-flight card until the owner's word).
   FPL has no field of its own: adding a stop asks the one search.

- **FPL's head** has Search at its start, where Share was, and at its end the
  ✕ alone (the owner, 2026-11-20: "replace the share button with search
  button"; "✕ clears"; and, when the FPL button was drawn on FPL's page
  too, "FPL button was supposed to be on search page as it is now": 95fd57f19,
  so the word FPL is on Search's page only); the sharing is
  More's. One tap on the ✕ asks "Clear Route?" in the stock centred alert,
  never a card, the page staying up, Undo bringing the route back; with no
  route it is dimmed, as iOS dims a toolbar button with nothing to do.
  Its Search button turns the page to Search, the route kept. Its title
  "Flight Plan" is a heading's 20 in bold on the heading's own 25-point
  line, iOS's Title 3 (CardHeadRow's name at `nameSize="heading"`, the
  owner, 2026-11-21: "a bit bigger and move up a bit"; the rule over an
  exemption, the HIG review), lifted 4 points, the pills under it; Search's
  field is as tall as the two rows (49 at the default size), so a turn of
  the page moves nothing. The search in use on Search ends its row
  with a round ✕, not the word Cancel. The map's buttons are 44-point
  buttons in their glass, Apple Maps' size, the right-hand group one
  capsule. They stay 44 and their glyphs 20 whatever the pilot's text
  size, as Apple Maps' do not grow with Dynamic Type (`size.map-button`,
  `size.glyph-map`; the scale audit, the owner, 2026-11-21): the 3D
  button, the compass, the page toggle and the radio's circle too.
- **One round toggle button turns the page** (the owner, 2026-11-13), a
  44-point disc in the field's white: on Search at the start of the first
  row, before the field, with the account button at its end, as Apple
  Maps' avatar is (the owner, 2026-11-20: "move the fpl button on the left
  side of search and avatar to the right side"); on FPL the bar's end is the ✕ that clears the route, and its Search
  button at the start is the way back. Both hide while the search is in use, Cancel in their
  place. The toggle shows the page a tap goes to, as
  Apple Maps' 2D/3D button shows the mode it switches to: the word
  FPL ("FPL, show flight plan" to a screen reader; the owner, 2026-11-20); FPL's page has none. A real button, never pressed, its name
  saying where it goes; a 44-point tap by its hit area, never grown. It
  turns the page and leaves the sheet's size. A card over the sheet
  covers the row and both buttons with it; the card's ✕ brings them back.
- **Nothing under the sheet**: its three sizes stand on the screen's foot
  (the home indicator's inset), the bar's room given back. The account
  button gives way with the map's buttons all the way up, where the
  toggle stays in the pinned row; both go while the airplane flies the
  route (the flying sheet is the figures alone).
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
  over it, and nothing else: on Search the search's row, on FPL the
  route's figures -- To, Distance, Time, Fuel -- (the owner, 2026-11-11, the
  canvas's b, as ForeFlight and Garmin Pilot keep them), FPL's bar and
  the route's row from half up; with no route, FPL's bar. The
  pill is one fixed height for both (the web's `"4.25rem"` snap point,
  on the screen's foot).
- **Links**: `open=search` and `open=fpl` (design/screens.json).

| Web                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | iPhone                                                                                                                                                       | Android                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shadcn's Toggle on Base UI's (`components/PageToggle`), never pressed, at the start of Search's first row only (`OneSearchField`; FPL's head has its own Search button and ✕, `features/fpl/workspace/FplBar`), drawn on the page that is up, told the pages by `MapPanel` (`sheet/pageToggle`); the bar before it one size on both (`panelField`'s `SHEET_BAR`), each page's first row laid out by the same `SheetBarRow` (`sheet/SheetHead`); the account button at the end of Search's first row (`OneSearchField`); the two pages the sheet's scrollers (`SheetParts`, `sheet/SheetPages`, kept by `data-hidden`), the grabber the plain `SheetGrabber`; FPL's body `features/fpl/workspace/PlanPage` (the open route's field and figures `RouteEditor`), the route's row under the bar `RouteHead` (folded, `route/RouteSummary`; whether it is open, `routeEditing`) | One round glass button in the map's left column under 3D (`Views/MapButtonsDock`), in sight over any card; a tap closes the cards and turns the sheet's page | One round button in the left column's floating toolbar under 3D (`SheetSideButtons`), in sight over any card; a tap closes the cards and turns the page (`SheetNav.togglePage`) |

The iPhone's and Android's columns are still the tab bar's design; the
toggle reaches them at the owner's word (web first), and so does the
swap of the toggle and the account button and FPL's bar (2026-11-14).

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
(`@smoke`: Fly Here from an airport's card lands on FPL, live); FPL's one
layout, folded and opened, its labels and a new plan's card, in
[`e2e/fpl-one-layout.spec.ts`](../../apps/web/e2e/fpl-one-layout.spec.ts)
(nightly).

## 5. Airport weather marks (the owner, 2026-11-10)

At each airport the chart already shows, from the map's own
`/api/airports/in-view` answer (`weather`). The approved canvas:
<https://claude.ai/artifact/V9FqBkmCyB25yrQzWMto5f>.

- **The mark, sized by the field (the owner, 2026-11-14, option I of
  <https://claude.ai/artifact/V1d9RDbmY1aczc4LfXed7a>, in place of the
  halo):** every field on the chart wears the planner's one airport mark,
  the one Nearest, the route and the stops draw (web
  `lib/map/marks/airportMark`'s `airportMarkSvg`): a ring in the chart's
  code for the class of airspace at the field's surface (B and D blue, C
  and E magenta, G faded magenta; D and E dashed; B's ring the thickest,
  then C's), its four ticks, and the weather as the large disc in the
  middle, in the flight category's colour (the no-report grey with none,
  or with the setting Off); a private, military or heliport field the R,
  M or H disc with its weather dot. The category is the engine's
  (`flight_category`, AIM 7-1-7 and the AWC's definitions), never a
  threshold in an app. Its size is the engine's step
  (`field_mark_rank`'s `size`, which the overlay tiles carry): a Class
  B's field the largest (1.5 times an ordinary towered field), a
  Class C's next (1.2), the other towered and long-hard-runway public
  fields 1, the rest small (0.82). Which mark gives way where two would
  overlap is the same rule's order: the Class B's field first, then the
  Class C's, then each tier by its longest hard runway; a field hidden by
  the give-way hides its weather too. Each variant (ring x weather x
  use) is one picture drawn once a page, the steps the layer's
  icon-size, so the chart's element count is unchanged.
- **What is drawn from which zoom** (the owner, 2026-11-21, against
  ForeFlight over California: "how come we don't see big airports and
  airspaces at our zoom levels?"): from zoom 5, a few states on a phone,
  the towered fields (`field_mark_rank`'s first tier) and the Class B and
  C rings, the rings at half their width and with no band, the towered
  fields named wherever they are drawn (the owner, 2026-11-21);
  from 7 the public fields with 3,000 ft of hard runway, named from 8,
  the Class D rings, the restricted areas and MOAs, and the rings at their
  full width with their band; the other public fields from 8, every field
  named from there, private ones from 10, heliports from 11, and the
  altitude tabs from 9; the VORs from 8, the VFR waypoints and the low
  enroute chart's fixes from 10. The names are capped so on the web (glOverlays'
  `AIRPORT_IDENT_FAR`, the tiles' `towered`): the cap thins only the
  untowered fields' names below 8, the long hard runways' some 2,400
  idents at 7 having been about a second of a phone's main thread a wheel
  notch out (the speed
  audit of 2026-11-21); the phones follow on the owner's word. Each number is a token, design/tokens.json's
  `map.zoom`, which the web, the iPhone and Android read and the charts
  job's overlay tiles hold each kind from (`map_zoom`, a zoom less in the
  tiles' own levels), so no app keeps a tier of its own. Where marks
  would overlap, the rule's order keeps them, each 2 px from the next.
- **The route over the whole country** (the owner's iPhone screenshot,
  2026-11-23): out there the route is its line, its ends and its stops.
  The Class B fields' weather marks are half size and unnamed below
  `map.zoom.class-b-named` (5), and give way to the route's marks, a
  stop's pin and own ship; the tops of climb and descent come in at
  `route-tags` (6), and a procedure's and a plate's fix tags at
  `procedure-words` (9). A route field's ident goes first on the side
  outside the course's turn there, off the line, then round the field
  before it gives way; a stop's pin and its field are drawn under the
  route's names, its ident giving way to them; own ship's room is kept
  clear by an empty symbol the airplane's size under the HTML arrow, so
  no label is drawn under it. A label shows whole or not at all (the
  owner's iPhone screenshot, 2026-11-23: a chart field's "KLW…" clipped
  against KBUF's mark, a lone "W" by own ship): every mark that is always
  drawn (a route field's mark, a turn's dot, a stop's field, a Class B's
  field, own ship's room) still takes its room in MapLibre's collision,
  and the route's names are placed before everything and drawn on top,
  the route's marks under them.
  No chart field is drawn bare (the owner's iPhone screenshot,
  2026-11-23, the Great Lakes at 6): a field's mark and its ident are
  placed together, so one whose ident has no room, or isn't named yet at
  that zoom, is not drawn there, the bigger field winning
  (`symbol-sort-key`, the engine's `field_mark_rank`, which orders only
  within a tile, so a Class C's fields are placed first in a layer of
  their own and their rings don't stand bare). A Class B's field
  and the one whose card is open always keep their mark, only the ident
  giving way; the route's fields and stops wear their own marks. A
  Class C's or D's ring is drawn only round a field that is (the tiles'
  airspace `ident` against the placed fields' `faa_id`, written at each
  rest of the map: placedRings), so no ring stands bare; a Class B's
  ring always, as its field's mark is.
- **Station model from zoom 10 in** (the matching span on the iPhone):
  the engine's `wind_barb` (5, 10 and 50 kt barbs and flags, a ring for
  calm, 0 to 2 kt calm), and two lines beside the field, the visibility with its weather
  ("2 SM BR") and the lowest ceiling ("OVC 008"), from the METAR as the
  planner decodes it. The mark's disc stays.
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
  of three (the owner, 2026-11-13) -- Flight Category (the disc alone),
  With Wind (the disc, the wind barbs farther out and the station model
  zoomed in close; the default) and Station Model (wherever it fits).
  The getting-worse badge is always drawn; Off, the Dot and the three
  switches went.
- **Access:** brand tokens only; a screen reader says the category and
  wind ("KJVL, IFR, wind 220 at 18 gusting 26").

|             | Web                                                                                                 | iPhone                                                                                     | Android                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drawing     | MapLibre style layers (`features/plan-map/layers/AirportWeatherGl`, `lib/map/marks/airportWeather`) | MapKit annotations on the chart's marks (`Views/FieldWeatherMarks`, `FieldWeatherDrawing`) | MapLibre symbol layers (`map/AirportWeatherMarks`, `StationLayer`)                                                                                        |
| The setting | `components/AirportWeatherSettings`: `Segmented` (shadcn ToggleGroup) and `SwitchRow`s              | `Views/AirportWeatherSettings`: `Picker(.segmented)` and `Toggle`s                         | `ui/AirportWeatherRows`: `ChoiceGroup` (Material 3 Expressive's connected `ToggleButton` group) and `Switch`es, kept in DataStore (`AirportWeatherStore`) |
| Tests       | `lib/map/marks/airportWeather.test.ts`                                                              | `WingtipTests/FieldWeatherMarksTests`                                                      | `AirportWeatherEngineTest`, `map/AirportWeatherStoreTest`                                                                                                 |

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

1. **The slider previews; Set flies.** An upright slider down the side
   view's left steps through the engine's altitudes (`altitude_advisor`'s
   rows, the altitude wheel's), laid on the chart's own scale in feet, so
   its knob is level with the altitude's tag and the ruler; the chart's top
   is 1,000 ft over the cruise (`sideViewTop`), and the ruler's figures sit
   beside the slider's track. It starts at the cruise flown, and with no
   airplane, where no climb is worked out, the cruise is drawn level and
   dashed (the UI audit's A1, 2026-11-17). As it moves, the ground and the DOF's obstacles
   within a mile of the line turn red within 500 ft of the altitude or
   above it (14 CFR 91.119(c)) and yellow within 1,000 ft (91.119(b)'s
   height over a congested area), as the engine's `profile_clearance`
   says; the legal floors are 91.119 (VFR) and 91.177 (IFR), which the
   legal altitudes keep. Nothing is planned until
   **Set**. In flight, **Auto** holds the preview at the GPS altitude.
2. **A waypoint's altitude, Start At or Cross At.** A tap on a waypoint
   sets its altitude: Cross At (done by the waypoint, the planner's
   `altitudes`) or Start At (begun there, `altitude_starts` beside it).
   A waypoint the route is at more than once keeps one for each visit,
   "VPBNG@2:6500" the second time (a bare ident is every visit), so the
   second visit's is never the first's (the web audit's WEB-2).
   Where the climb or descent is flown is the engine's `altitude_change`:
   the airplane's climb, the three-to-one descent, and with no airplane no
   time or fuel.
3. **The Altitude Advisor chooses the cruise.** One row per altitude with
   its time, fuel and head or tail wind, Fastest and Most economical
   marked; a row outside the legal altitudes stays with its warning (warn,
   never limit). An airplane with no climb fuel flow has no Most
   economical (the engine leaves it out) and its climbs' fuel is asked for
   where a leg says `climb_fuel_unknown`, never assumed.
4. **Accessibility.** The slider is adjustable a row at a time and says
   the engine's words ("3,500 ft, terrain within 500 ft near KXYZ");
   every mark is a 44 pt / 48 dp target.

|          | Web                                                                                                                                      | iPhone               | Android                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------- |
| Slider   | Base UI Slider, upright (`features/navlog/altitude/AltitudeProfile`, its view model `useAltitudePreview`)                                | See [ios.md](ios.md) | See [android.md](android.md) |
| Waypoint | Base UI Popover from a tablet's width up, `SheetDialog` on a phone (`altitude/LegAltitude`)                                              |                      |                              |
| Advisor  | shadcn Item rows (`altitude/AltitudeAdvisor`)                                                                                            |                      |                              |
| Tests    | `altitude/altitude.test.ts`, `navlog/profile.test.ts`; `e2e/plans.spec.ts`, `e2e/plans-altitude.spec.ts`, `e2e/plan-cards-heads.spec.ts` |                      |                              |

Class B has no setting (the owner, 2026-11-17: "We don't need the Class B whether setting, keep it true by default in the app"): a route is always planned through it with the clearance it takes (14 CFR 91.131), the Profile saying "Through <name>: clearance needed" with no button, and the address has no `class_b` or `class_b_via` (an old link carrying them ignores them). The planner has no switch for it either (no `class_b_clearance`; Class B is no ceiling in the engine's band), and a saved flight's picks take no `class_b`. The way round it is one of the Routes, Avoid Class B (the owner: "You can still avoid class B in the suggested routes"): offered once the route is planned and only where it enters Class B at its highest cruise altitude, the best fix round each leg that does put in (the engine's `class_b_entered` and `class_b_detours`, a mile clear of the edge, a VFR waypoint first, no more than 40 nm further), its time, miles and fuel on its chip like the others.

## 7. What rides the sheet, and the map's small print (the owner, 2026-11-11)

1. **The map's own buttons, the radio's, the 3D and the page toggle ride the sheet's
   top** (and the phones' first-flight card, until they take the web's
   welcome sheet), 24 points over it at the pill and half,
   following a finger's drag frame by frame as Apple Maps' buttons do;
   all the way up they give way. A card opened over the sheet comes up
   where the sheet's top is and they ride its top from its first frame,
   gliding only if its height changes, never hidden while it moves (the
   owner's iPhone, 2026-11-13: they "redraw" at every card). The page
   toggle rides it with them, a card up or not, and a tap on it closes
   the cards and turns the page (the owner, 2026-11-13: "airport card
   hides the fpl toggle"). The 3D and under it the page toggle
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
4. **The map turns, and the compass turns it back** (the owner,
   2026-11-17, "Yes to all recs"; it was read north up only): two fingers
   twisted, a right drag (or Ctrl and a drag) with a mouse, Shift and the
   left or right arrow from the keyboard, MapLibre's own gestures and
   keys (`components/map/makeMap`). Tilting stays the 3D button's: no
   two-finger tilt on the flat chart, and a right drag turns without
   tilting; MapLibre's keyboard ties tilt to turn, so Shift and up or down
   tilt it a little, which the compass also undoes on the flat chart.
   The compass is Apple Maps' dial (the owner, 2026-11-18, from Maps'
   screenshot): a round glass disc over the 3D button (in flight in the
   right stack, after My Position), shown only while the map is not north
   up, its ticks and a small red mark at north turning with the chart and
   the point of the compass the screen's top faces in its middle ("W"),
   and a tap eases it north up again as Apple Maps' does
   (`components/CompassButton`, the camera's `northUp`; it ends no
   follow). What is drawn keeps its sense as the map turns: the chart and
   everything fixed to it (airspace tabs and their rings' labels, runway
   numbers, wind barbs, the pattern's arrows, traffic and own ship on
   their tracks) turn with it, as on a turned paper chart; names and the
   weather's marks stay upright to the screen; a route point's name stays
   outside the turn (`routeTurns`' `turnSide`, again at each turn); a fit
   to the route keeps the bearing the pilot set; leaving 3D lays the map
   flat at its bearing; and a two-finger hold that turns the map is a
   turn, not the ruler.

|                         | Web                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | iOS                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Riding the sheet        | `components/sheet/sheetTop` (`OnSheetTop`): a slot in the Drawer's popup just over its top edge (`bottom: 100%`), the popup's corners clipped on an inner box                                                                                                                                                                                                                                                                                                                     | `MapButtonsDock`: the system sheet's own height, the plan's and a card's over it (`onGeometryChange`, `SheetEdge`), sets the glass group (Map, My Position, Ask) 24 over the higher top at the right, fading out past 60% of the screen; at the top right beside the iPad's sidebar. SwiftUI has no stock placement that follows a sheet over a UIKit map |
| Settings' foot          | `features/pilot/PilotPanel`'s "More" row, `settings-foot`; 44-point hit areas that meet (`PAGE_LINK`), a second line at a large text size                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                                                                                                                                                                                                                           |
| Status                  | `components/StatusPanel`: FAA Data, On the Map (`lib/map/gl/creditStore`)                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                                                                                                                                                                                                                           |
| Turning and the compass | `components/map/makeMap` (MapLibre's own rotation), `components/CompassButton` in `MapControls`, `lib/map/gl/camera`'s `northUp`                                                                                                                                                                                                                                                                                                                                                  |                                                                                                                                                                                                                                                                                                                                                           |
| Tests                   | `e2e/map-rotation.spec.ts` (the keyboard's turn, the compass shown and its tap), `lib/map/gl/camera.test.ts` (a fit keeps the bearing; north up holds the camera); `e2e/sheet-webkit.spec.ts` (WebKit at an iPhone's size: heads pinned, nothing over or through them, the page toggle and the map's buttons 24 over the sheet and clear of each other, the radio's among the map's, Settings at the pill, its seven links, no credits row, Status's cycles), `e2e/legal.spec.ts` | `WingtipUITests/MapButtonsTests` (over the search at half and the pill, at the right edge, 44 points, out of reach at full)                                                                                                                                                                                                                               |

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
Settings › Extras › ATC Copilot on and then Comms Assist on (Settings ›
ATC, off by default).

## 8. One home per control: You, Settings and the Map card (the owner, 2026-11-13)

The owner's pick of option A of the account canvas
(<https://claude.ai/artifact/NY1E2HHscfyzmvB9gCNuNs>), the Apple Maps
way: three homes, and every control in one of them.

1. **You**, the avatar's card: who the pilot is (a centred avatar, the
   name, a tap on them Pilot Details with the account's menu, not a row
   of the list, the owner, 2026-11-20) and what is theirs --
   Airplanes (each airplane's checklists inside it, and the picked one's
   Checklists row), Flights, Logbook, Minimums, Training (the Coach, and
   Practice while Settings' Extras has Training Tools on), the Emergency
   Assistant; Settings is
   the gear at its top left, the ✕ at its right. The avatar is the
   pilot's own photo where they chose one, their initials where not, on
   every avatar (the account button, You's head, Pilot Details'): Pilot
   Details heads itself with it, Choose Photo under it and Remove Photo
   beside that once there is one, as Contacts heads a card (the owner,
   2026-11-20: "Yes to choose photo"). An app cannot read the phone's own
   profile picture, so Choose Photo opens the system's picker (Photos,
   the camera or Files on an iPhone); the photo is cropped square from
   its middle and sent 256 pixels across as a JPEG, kept by the gateway
   with the account (`PUT /api/me/avatar`), and a refusal is said under
   the buttons.
2. **Settings**, one page, You's gear: Map (Airport Weather, Glide Ring, Clear Your Path), In
   Flight (Alerts; ATC, one page of Comms Assist, ATC Alerts and the
   Copilot; Comms Assist and ATC Alerts only while Extras has ATC Copilot
   on), Extras, Data (Keep for the Air, with the flight's plates' size, and
   Plates, kept by state), and Help & About (Guide, Status,
   Log, About, Sources, and the Privacy, Terms and Legal links). The Map
   card's gear opens the same page at its Map group; it is the one
   thing called Settings.
3. **The Map card**, the map's own button: only what is on the map --
   the charts (None, Sectional, IFR Low, IFR High: None draws no FAA
   chart, only the overlay over a plain ground in the look's colours,
   with every vector layer over it; the owner, 2026-11-14: "chart should
   also have none option"), each chart's terminal sheet (the TAC over the
   sectional, the IFR area chart over the IFR charts) always drawn where
   it exists, with no switch (the owner, 2026-11-14: "TAC switch is not
   needed, just have it on by default"), the base map under it ("Overlay" until the
   owner's "How can this be better?", 2026-11-14; None, USGS, Google Map,
   Google Satellite, Google's only with a key) with its Strength while
   one is picked, in 3D its Heights (×1, ×3 or ×5, ×3 unless picked; the owner,
   2026-11-14), and four layers (the owner, 2026-11-14: "I want to keep
   it simple though. can we just have four layers aeronautical, weather,
   traffic, private/military in the map settings?"): Aeronautical (the
   airspace, special-use areas, VORs, fixes and VFR waypoints), Weather
   (the fields' weather marks as Settings' Airport Weather says; a tap on
   the tile turns it on or off, and the ••• in its corner is a menu of
   which weather: AIRMETs and SIGMETs and PIREPs as checkbox items, Winds
   Aloft, Radar and Model Weather as submenus, each off by default),
   Traffic, and Private & Military (drawn whatever it says while the
   Emergency Assistant is open), two by two, every tile one size and
   every name on one line; then Look's tiles: Theme, Appearance (System,
   Light or Dark) and
   Sunlight, each its value under its name and a tap its menu, Sunlight
   in the tint while On, and Own Ship, how own ship is drawn on the
   chart -- the Airplane (the default), a Twin, a Jet or the Arrow, a dot
   with no heading -- its glyph the one picked as the chart draws it (the
   owner, 2026-11-14: "Maybe replace the position with the choice of own
   ship?"; You on the Map's pick, back) (Sunlight was Settings' Display until the owner's
   "Sunlight should also move to map settings", 2026-11-14; Settings has
   no Display now); under Look's tiles, at their edges, the chart's
   Dimmer and Contrast as two grouped-list rows with a slider each (the
   owner, 2026-11-18: "can we have a dimmer and contrast sliders under
   sunlight and remove it from the appearance?"; `ChartLookRows`). The
   Dimmer is how far the chart's tiles are dimmed, kept for light and for
   dark apart (none and half by default, the night's look before it), to
   at most 70%; greyed while Sunlight is on by day, which draws the chart
   at full brightness, keeping its value. At night (the dark theme) the
   Dimmer holds in sunlight too, its row enabled and with no note, so a
   light sensor misreading in a dark cockpit cannot blind the pilot (the
   owner, 2026-11-18); sunlight still adds its contrast. Contrast is an offset on the look's own
   contrast by day, at night or in sunlight, -30% to +40%, 0 the look as it
   is. Both set the chart's layers as they move. At night the Dimmer
   reaches what is drawn on the chart too -- its words, marks, lines and
   an approach plate, at the chart's own brightness -- so nothing on the
   map is brighter than the chart under it (AIM 8-1-6; the themes audit,
   2026-11-27); a plate is white on black at night until the pilot picks.
   The base map's imagery and the weather loop's radar and satellite
   take the chart's brightness, the 3D airspace its share as its
   opacity (round 4); the terrain's hazard tint is a warning and is never
   dimmed, as own ship is not; the route is dimmed by
   its colours, solid, so it stays the most visible line, and once.
   Sunlight at night keeps the look's own dark grounds and lifts only the
   grey words and the edges, never its white sheets; the device's
   Increase Contrast does the same by day and at night. Appearance's Dark +
   Bright went with them: the night's look of the route, the sky and the
   rest follows the dark theme alone. Every section is four tiles two by two in the layers'
   size and form, the sections lined up (the owner, 2026-11-14: "every
   section should have 4 tiles like Layers one"): the Chart and Base map tiles their picture as the
   face and their name on one line in the name's place, the one picked
   marked as a layer that is on, both Nones an empty map (the surface
   under a faint grid); Strength and Heights rows of an inset grouped
   list at the tiles' edges, in the list's row type; one section gap
   (space.xl) between the parts. The public
   fields, the route and the plan's points, own ship, the TFRs and the
   Class B fields' weather marks have no switch: always drawn, the Class B
   ones at every zoom (the owner, 2026-11-17: "Just keep it by default in
   the app so all the class B airports show even when zoomed out"). The
   route's VFR checkpoints are a switch of the Map card, Route Checkpoints, off by default (the owner's "Let's not enable waypoints
   for a pilot").

Taken out the same day, with no home: the sheet's Position (a phone's
sheet is always at the bottom), Terrain's Flat (the 2D chart is always
shaded; 3D is the map's own button) and You on the Map (own ship's
look, back on 2026-11-14 as the Map card's Own Ship). A new control goes into one of the three, never a
second home; the web first (`features/pilot`, `features/settings`,
`features/map-settings`), the phones on the owner's word.

**Extras (the feature review, the owner's word of 2026-11-21).** The
parked features' switches are one Settings group, Extras, right after In
Flight on every app: a stock switch each, its title and a one-line
description, all off to start (the web's `lib/extras`, the iPhone's
`Extra`, Android's `Extras`, the same keys). Web: ATC Copilot, Model Weather, 3D, Training Tools (every
airplane's flights, alerts and history shown, public, the owner,
2026-11-26; the phones keep Other Airplanes until they follow). iPhone: ATC Copilot, ADS-B
Receiver, Other Airplanes, Model Weather, Training Tools. Android: ATC
Copilot, ADS-B Receiver, Other Airplanes, Model Weather, Ask. Off, a
feature's controls are not drawn, nothing of it starts or is fetched,
and a setting inside it saved on acts as off; the pilot's own airplane
keeps its history, Alerts and flights whatever Other Airplanes says.
What each hides is in [../navigation.md](../navigation.md), "Settings'
Extras"; why, in [../store/feature-review.md](../store/feature-review.md).
A parked feature gets its switch here, never a second home.

**iPhone (2026-11-13):** You is `Views/YouView` (Pilot Details holds the
name, the contact, Export, Sign Out and Delete Account; Airplanes holds
the Checklists; Training the Coach, Practice (while Extras has Training
Tools on), Lessons and Instructing), Settings `Views/SettingsView` (no
Display: no Sunlight, which needs a light sensor iOS gives no app; Extras
after In Flight; Data holds what is kept for the air, Downloads, the
ADS-B receiver while Extras has it on, and the checkpoint notes), and the Map card the base charts as their pictures,
None first, the Approach Plates switch under them while a chart is
drawn, the four layers (Aeronautical, Weather, Traffic, Private/Military;
the web's words are Private & Military since 2026-11-14)
as the stock toggle's button style, and Look, Theme and Appearance as
menus (2026-11-14), Appearance the web's three since Dark + Bright went
(a kept one is Dark with the chart undimmed), and the chart's Dimmer
(one for light, one for dark) and Contrast as two stock sliders under
them (`Design/ChartLook`, the web's 2026-11-18 rows, the themes audit
2026-11-27), with no overlay row (Google's tiles are not drawn on the iPhone, and the USGS
imagery already comes in by itself close in). Show Route As (Route Box or
Strip) went with the route's ••• menu's other items; the web has one
layout since 2026-11-17 (decision 0047), the iPhone's to follow at the
owner's word.

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
the welcome is Material's modal bottom sheet with the Map card's own Theme
and Appearance rows (`firstflight/WelcomeSheet`), the FPL tip the stock
rich tooltip at the toggle; the route's Plan or Strip layout stays in
Settings › Look, as Android has no route box, line or cards to choose.
Theme and Appearance are the Map card's Look, as the web's and the
iPhone's are (the owner, 2026-11-14; moved 2026-11-27), Appearance the
web's three (a kept Dark + Bright is Dark with the chart undimmed), with
the chart's Dimmer (one for light, one for dark) and Contrast as two
stock sliders under them (`ui/ChartLook`); the app's Light or Dark is
handed to the system (`NightMode`, Android 12 and later) so the launch's
window is in it, not the phone's.

## 9. A status is a badge (the owner, 2026-11-14)

The owner, 2026-11-14: "Use badges where we can for example tfr active
etc." A status a pilot scans a list or a card for is a badge; the words
that explain it -- until when, whose word it is, how far, how high --
stay text beside it, never in the badge.

1. **One component.** On the web every such status is `StatusBadge`
   (`components/StatusBadge`, on shadcn's Badge), by its variant:
   `active` (a TFR, a NOTAM, a special-use area in force), `later` (in
   force later), `cold` (a special-use area not in use; "Not scheduled"
   where only its published hours say so, as a NOTAM can still activate
   it), `closed` (a field or runway NASR or a NOTAM closes; decision
   0043), `out-of-service` (a navaid), `restricted` (a navaid in service
   with restrictions, NASR's NAV_STATUS: usable, so not out of service),
   `private`, `military` and `joint`
   (who may use a field), `site` (what kind of field it is where it is not
   an airport: Heliport, Seaplane base, Gliderport, Balloonport,
   Ultralight; the engine's `field_site_type` words for NASR APT_BASE's
   SITE_TYPE_CODE), `inAir`, `ground` and `emergency` (a tracked
   airplane); and a flight category (`category`, AIM 7-1-7) in its chip
   colour. No card draws its own pill, coloured word or grey line for a
   status.
2. **Its look is the tokens'.** Each fill is `color.badge.status-*` in
   `design/tokens.json` (a flight category's `color.category`), under
   white words at 4.5:1 or more in every look (WCAG 1.4.3;
   `lib/looksContrast.test.ts`), its words the `badge` type role (iOS's
   Caption 1, semibold). A screen reader hears the status's word: it is
   the badge's own text, never only its colour. A flight category set as
   words with no chip (a search row's "MVFR") is in the scheme's
   `category-*-ink` (`color.theme`), the dot's hue at 4.5:1 and more on
   every surface, a lighter shade at night (the owner, 2026-11-27); its
   dot, chip and map mark keep the FAA's colour, ringed in the chart's
   casing on a dark surface as the map's marks are.
3. **Where it is now (2026-11-14):** airport rows in the search and
   Nearest (Closed, Private, Military, Joint use); the airspace card's
   special-use areas (Active or Cold from SFDPS, else the engine's
   reading of the times of use) and TFRs (Active, Later); the Brief's
   special-use areas and TFRs at the time the flight passes; a tracked
   airplane's card, its search row and its flights (In the air, On the
   ground, an emergency's code); the flight categories in the Brief and
   Nearest; the airport card's line under its name (Closed, Private,
   Military, Joint use, with the engine's or NASR's words; 2026-11-18),
   and beside it the field's site badge where it is not an airport
   ("Heliport", "Seaplane base"; the owner, 2026-11-18).
   The VOR card's line under its head (Restricted, 2026-11-18). The phones: SwiftUI's and Material 3's own badge or label
   with the same tokens (`WingtipColor.Badge.statusActive` and its
   siblings in Tokens.swift, `Badge.StatusActive` in Tokens.kt), on the
   owner's word (web first). The iPhone's is `Design/StatusBadge`
   (`BadgeStatus`, and `CategoryBadge` for a flight category), where the
   web has them but the Brief's, and on the TFR card (2026-11-14).

## 10. Where the route turns (the owner, 2026-11-14)

The owner picked option A of the route points canvas (2026-11-14): a
route point's name pill sat on the point, hiding the exact turn (POS0 →
WETEV → KMYJ) and own ship on POS0.

1. **A dot on the point.** A point the route flies through and turns at
   (a VFR or GPS waypoint, a present position) is a small ringed dot
   exactly where the legs meet: white, ringed in the course's magenta
   (`color.chart.course`, the ink look's own magenta in Chart ink). It is
   always drawn and takes no room from other marks.
2. **Its name beside it, outside the turn.** The name is on its white
   pill edged in the waypoint magenta, put off the point on the side away
   from the turn (the two legs leaving the point, added, point into it),
   never on the line; on a straight point or the route's first or last,
   square to the course on its upper side. The side follows the map as it
   turns. The name gives way to the route's fields as before; the dot
   stays.
3. **Airports keep their mark.** The departure, stops and destination are
   the chart's airport mark with the ident on its dark pill (section 5);
   a top of climb or descent is the fix's small magenta diamond on the
   course, on every leg (the owner, 2026-11-20: "toc/tod on every leg if
   possible"), none within 2 NM of its leg's ends, where it would sit on
   the field or the airplane; a tap opens its card
   (the readability list's F; `LegPointsGl`,
   `LEG_POINT_DIAMOND`). "TOC" or "TOD" is beside it as My Location's
   name is beside its dot: the same white pill edged in magenta, square to
   the course on its upper side, turning with the map, giving way to the
   route's own marks (the owner, 2026-11-20: "label toc and Tod just like
   my location"; the `leg-point-names` layer, `squareToCourse`).
4. **Taps are as they were:** the dot or the name opens the point's card.

Web: `lib/map/marks/routeMarks` (the layers `route-fix-dots` and
`route-fixes`), `routeTurns` (the side, and the layer's anchor for the
map's bearing), `markPictures`' `turnDotPicture` and `ROUTE_POINT_PILL`;
tested by `routeTurns.test.ts` and `e2e/stops-waypoints.spec.ts` (the
`route-turns` probe). The iPhone: `Views/RoutePointMarks` (`RouteTurns`
on MapKit's `MKMapPoint`, `RoutePointMarkView` turned with the map's
heading, `RouteMarksLayer`), tested by `RouteTurnsTests` (2026-11-14).
Android follows on the owner's word.

## 11. FPL for every pilot (the owner, 2026-11-17)

The owner: make FPL and its nested drawers easier for every pilot, new and
experienced, "no redundancies and less clutter", "Do it all but keep it
less cluttered". Decision [0045](../decisions/0045-fpl-for-every-pilot.md).

1. **One drawer head.** Every card, and every form a card opens, has the
   one head of the card rule's 8: the title centred at a card's size, one
   line under it, ✕ at its end, or a form's Cancel and Done; the same
   detents, a swipe down going back one level. What a card is goes in that
   line (a route leg's ends and "Active leg"), never a row or a pill under
   the head. Web: `CardHeadRow`, and `PhoneSheetHeader` laid out by the
   same `HeadGrid`.
2. **One route field.** The route takes its points step by step or a
   route typed whole ("KPWK V100 KLAS", "N0110A065 KPWK DCT OBK V100
   KLAS"), the engine reading the words (`route_read`, AIM Appendix 4);
   the empty field says what it takes ("From, to, or a whole route").
   On the web the route's box has two faces, the grouped rows and the
   field, swapped in the same place by one toggle (a stock Toggle in the
   tint: the keyboard glyph on the tint's wash in a chip's 32-point
   circle, filled while the field is the face) at the box's bottom right,
   inset by the box's own padding, the field's words left-aligned at that
   same padding with no ghost word after the last point, nothing outside the box changing as it turns,
   inside its last row on every face (the empty route's Destination, half
   a route's last row, a whole route's Add a Stop, the field's last line),
   never a row of its own and with no Undo beside it (the owner,
   2026-11-18; 2026-11-23: "the same area and not a separate entry row",
   "No undo needed next to toggle"). The web opens no
   route file (the owner, 2026-11-23: "No need for open a route file");
   the Android app keeps its own (`FlightFiles`).
3. **Explain on tap.** An abbreviation (MH, MC, ETE, TOC, TOD, FL, the VFR
   and IFR levels ...) is a tap on the word itself, in the tint, which
   opens one plain sentence with its source in the stock Popover; nothing
   is added beside it. Web: `components/Explain` over `lib/explain`.
4. **Ages where read.** A live figure (a METAR, the winds aloft, the
   NOTAMs, traffic) says its age in a few characters ("12m") where it is
   read, greyed once the engine says it is stale, "offline" in its row.
   Web: `components/LiveAge` (`lib/kept/liveAge`): the Brief's METAR,
   the nav log's winds, an airplane heard (`traffic_fresh`, in seconds).
   A field's TAF says when it was issued and to when it is valid under
   the card's hours, amber "TAF expired … : no forecast in force" once
   its period has ended (the engine's `taf_validity`, FAA-H-8083-28B
   27.4.1), and the card's NOTAMs say "Fetched 42 min ago" where they are
   the ones kept (`kept_age`). The FAA data's cycles are judged again on
   the device's own day (`data_cycle`, `lib/dataCycles` `onThisDay`), so
   an answer kept through a flight with no signal still turns out of date
   on the day it does.
5. **A dash only means "needs an airplane".** A figure still coming is a
   placeholder shape (`components/FigureWait`).
6. **One Undo.** Every FPL edit is undone by Cmd-Z and Shift-Cmd-Z on a
   keyboard, the steps kept across a reload (`lib/planUndo`,
   `hooks/planHistory`); the toast with Undo ("KMSN Removed", "Route
   Cleared", "Route Replaced") is shown only where the pilot took
   something away -- a stop, point or procedure removed, Clear Route, the
   route replaced whole -- and for no other edit, an altitude or an
   airplane changed (the owner, 2026-11-21); a runway the page picks into
   the wind is never a step. The route's ••• menu holds no Undo or Redo
   (the owner, 2026-11-21).
7. **One surface.** No box in a box, fewer borders and pills; spacing
   groups, colour only for meaning.
8. **A point the planner will not plan to is said, not planned.** An
   ident no US field, waypoint or navaid goes by (KZZZ, KIGN) is the
   unknown place: its pill and the strip's To in red with their mark, a
   line under the route's field with Remove (the route open by itself to
   show it), no distance, no Routes, and
   Brief, Nav Log and Profile off (the UI audit's B8). A real field
   abroad (AYID, Indagen) is the same, its line saying it "is outside the
   US charts": the planner plans on the FAA's charts, NASR and
   aviationweather.gov alone, and answers both with a 404 in its own
   words before any planning (`wingtip.airport_lookup`, OutsideCharts). A
   K before an FAA identifier reaches only a US field (FAA Order JO
   7350.9): KIGN was planned 7,191 nm to Indagen, Papua New Guinea, whose
   local code is IGN (2026-11-17). Web: `unknownPlaceIn`, usePlan's
   `unknownPlace`.
9. **One gap between groups, 16.** Between the page's groups (chips and
   the route's box, the suggested routes and the box, the box and what
   follows, a page's sections, the last row and the foot bar) the one
   token `space.group` (16, the side gutter's); inside a group `space.sm`,
   8 (the owner, 2026-11-23).

## 12. A list's rows: swipe to remove, hold to move (the owner, 2026-11-17)

The owner: "Can we add swipe gesture to remove and hold/drag to move etc
like iPhone?" Decision [0046](../decisions/0046-row-gestures.md).

1. **A swipe to the left removes.** On every row whose menu has Remove
   (the Recents and Favorites, airports' and airplanes', Home, your
   Airplane, the routes' Recents, saved Flights, the logbook's flights)
   and on a stop the pilot typed in FPL's route list (not the departure
   or the destination, whose menus have no Remove): a short swipe
   uncovers the red button with the menu's word, a full swipe (past 60%
   of the row) removes it when let go, felt as it crosses the line where
   the device can. Both call the menu's own Remove, so its Undo (the
   toast's, the route's •••) is the same. A tap anywhere closes an open
   row. Off in a list's Edit, where the minus removes.
2. **A touch and hold moves.** A movable row of FPL's route list (a
   typed point, where the list edits the route) is lifted by a hold
   anywhere on it and put down where the drop line shows; its words are
   not selected by the hold. The grip stays for a mouse, a keyboard and
   VoiceOver, shown only where the list can be reordered.
3. **The menu stays.** A swipe and a hold are additions: the row's •••
   and its long press (where the row does not move) keep every action
   for a mouse, a keyboard and VoiceOver (WCAG 2.5.7, a single pointer).
4. **Sideways is the row's.** A sideways drag on a swipeable row never
   moves the sheet; an upright one is the sheet's or the list's scroll.

|              | Web                                                                                                                                                                                                                                                                                                   | iPhone                                                                 | Android                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| Swipe        | React Aria's iOS List View recipe on Motion (`components/SwipeRow`, `components/swipe`), on RowMenu's `swipe` (not FPL's route: a stop is taken out by its menu's Remove, the owner 2026-11-17); `data-base-ui-swipe-ignore="x"`; a finger or a pen only; its chunk lazy, asked for on a touch screen | Not yet: SwiftUI's `swipeActions`, on the owner's word (decision 0038) | Not yet: Material 3's `SwipeToDismissBox`, on the owner's word |
| Hold to move | React Aria's `useDragAndDrop` (`RouteGrid`): the row is the browser's own `draggable`, Safari and Chrome lifting it on a long press; the grip is React Aria's drag button                                                                                                                             | Not yet: `onMove` / `draggable` on the owner's word                    | Not yet                                                        |
| Tests        | `e2e/swipe-rows.spec.ts` (a Recents row, the sheet still); `components/SwipeRow.test.tsx`, `components/swipe/swipeEnd.test.ts`; the hold's drop by `stops-reorder.spec.ts`                                                                                                                            | --                                                                     | --                                                             |

## 13. The map's words (the owner, 2026-11-18)

The owner took the map labels audit's recommendations on 2026-11-18. Every
word and figure drawn on the map, on all three apps, follows these rules:

1. **Airspace is written as the sectional writes it.** A Class B or C
   shelf is its ceiling over its floor in hundreds of feet MSL ("100"
   over "30", "100" over "SFC"). A Class C ceiling that stops under the
   Class B is "T". A Class D is its ceiling alone, with a minus where it
   is "from the surface to, but not including" ("-30"). The source is the
   FAA Aeronautical Chart User's Guide, 9 July 2026, VFR Terms and
   Symbols, Airspace, p. 16, and its legend, p. 52. The 2D chart and the
   3D view say the same words. The words are the engine's
   (`airspace_shelf_label`), and no app formats them. The charts job
   writes them into the overlay tiles (`airspace_labels.tab`,
   `wingtip.airspace_tabs`), and the 3D view asks the engine for them. A
   special use area's tab is the engine's `special_use_tab` ("M-BRADY
   NOR*:" over "3600-17999") in 2D and in 3D. The 3D view's volumes carry
   it as `tab`.
2. **A fix is tagged once.** Where an approach's plate is on the map with
   Show Annotations on, the plate's tag names the fix and gives its
   figures. The procedure's own tag then keeps only the pilot's own lines
   (Cross, Direct to, OUT OF DATE), or is left off. With plates off, the
   procedure's tag says it all.
3. **Codes in capitals, words in sentence case.** The FAA's codes and
   idents keep their capitals: TOC, TOD, IAF, FAF, OUT OF DATE, KMSN.
   Words on the map are in sentence case: "Right downwind 27", "Direct
   to", "Avoid weather". This is the map's exception to decision
   [0021](../decisions/0021-title-case-labels.md). The sheet's own labels
   stay in Title Case, so a route's chip reads "Avoid Weather" in the
   sheet and "Avoid weather" on its line.
4. **A figure on a map tag has no unit and no tick.** Write "3,000", not
   "3,000 ft" or "3,000'". This covers the pattern's altitude, a
   procedure's and a plate's altitudes (GS, TCH and TDZE among them), and
   traffic's height when own ship's is unknown. On a chart MSL is implied.
   Weather and TCAS codes keep their source's form: a PIREP's "065", a
   METAR's "CIG 008", the traffic's "+05".
5. **One type scale, one font, one look a kind.** Map labels use the
   sizes in `design/tokens.json` `map.label`: 11 (`size-small`, the floor
   no label goes under), 12, 13, the 14 of a cluster's count, the 16 of a
   runway's number close in and the 17 of the open card's field. Each kind
   of label (`map.label.kind`: a field's ident, a fix's, an airspace tab,
   a checkpoint's name, a hazard's words …) has one size, by zoom where it
   grows, one weight and one halo, and every layer that writes it takes
   them (`labelText`, `labelHalo`), so a Class B tab and a special-use
   area's tab, or a field's ident on the tiles and on a stop's mark, are
   lettered alike. Idents and figures are bold; a place's name (a
   checkpoint's) is regular, as the chart sets a town's. They are set in
   Inter in every look. A letter inside a mark's picture (R, M, H, a
   PIREP's glyph) is the system's sans serif (`MARK_FONT`), never the
   browser's default serif. Map words do not follow Dynamic Type: a
   chart's lettering is fixed, and the map's density sets it. The one
   exception is the Map card's **Larger Map Labels** switch (the owner,
   2026-11-21, for his larger text size): on, every kind grows by the
   pilot's text size over the standard 16 px, at most
   `map.label.scale-max` (1.2x), one global state the layers' sizes read
   (`labelScale`, `LABEL_SCALE`). Off by default. Words drawn as a picture
   (a procedure's or a plate's tag, a way's chip, traffic's tag) keep
   their size.
6. **After dark, light words on a dark halo** (the owner, 2026-11-21,
   in place of the white halo dimmed to 0.6 of 2026-11-18). The halo is
   one width (`map.label.halo`, 2 px), light (the chart's white round
   coloured or dark words) or dark (the tag's dark round white words: a
   runway's number, the open field's ident); words on their own chip, tab
   or pill have none. By day, coloured words reach 4.5:1 on the white
   halo: a VFR waypoint's ident is the green a step deeper
   (`chart.vfr-green-text`), a cluster's count sits on `map-blue-ink`.
   In the page's dark theme (`useDarkTheme`), as Apple Maps letters its
   dark map, the light halo turns to the tag's dark at
   `map.label.halo-night` (0.85) and each word's ink to its night ink
   (`map.label.night-ink`: the towered blue #82b4ff, the untowered
   magenta #f28ddc, the VFR green #62d48e, the fixes' near-white #eef1f5,
   the TFR's and a limit's red #ff8a8a, and each hazard's colour lighter),
   `labelInk` on every light-haloed layer. Worked out from the tokens
   (WCAG 2.x relative luminance), on that halo over the chart dimmed to
   half each ink is 6.5:1 or more, and 4.9:1 or more over an undimmed
   white, so no word glares white and none falls under 4.5:1. Under the
   white halo at 0.6 the coloured idents fell to about 2.5:1. The day
   inks are the chart's own and stay as they are.
7. **A field's ident looks the same whoever draws it.** Its colour is
   blue where it is towered and magenta where it is not, as the chart
   sets it. Its size follows the zoom. This holds on the tiles, a Class B
   field's mark and a stop's mark.
8. **Hazards are named on their outlines.** Each SIGMET, AIRMET and
   G-AIRMET carries its hazard and its top along its outline ("Ice to
   FL160", "Convective SIGMET to FL450"). A TFR carries its NOTAM number
   ("6/4116"). Words in a hazard's colour must reach 4.5:1 on white, so
   turbulence's amber is deepened for words (`weather.turbulence-text`).
9. **Where words collide, the more important keeps its place.** The
   route's marks and own ship are over everything; then the fields, by
   the engine's rank (a Class B's field first); then the VORs, the VFR
   waypoints and the enroute fixes, in that order, as the sectional
   weighs them; then the airspace and special-use tabs, under every mark.
10. **No new range or leg labels.** Nothing is added to the range rings
    or the legs.
11. **Only own ship is an HTML marker.** The replay's airplane is drawn
    with the traffic's own layers (`trafficMarks`), and its height is
    lifted with it in 3D.

|       | Web                                                                                                                                                                                                                                                                                                                                                 | iPhone                                                                        | Android           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------- |
| Where | `lib/map/gl/layers/common` (`labelText`, `labelHalo`, `labelInk`, `labelScale`, `LABEL_HALO`), ChartGl's `LABEL_NIGHT` and `LABEL_SCALE`, MapLayers' Larger Map Labels, `glStyle`'s `airspaceLayers` and `TAB_BOX`, `glSuaLabels`, `glOverlays`' marks' order, `airportIcons`' `AIRPORT_IDENT_INK`, `procedureMarks`' `fixMarks(plated)`, `plates/plateLook`'s `usePlateTagged`, `plan-map/weatherMap`'s `areaLabel`, `TfrGl`, `TracksGl`'s `ReplayGl` | Not yet, on the owner's word (decision 0038): the tokens are generated for it | Not yet: the same |
| Tests | `layers/common.test`, `glStyle.test`, `glOverlays.test`, `procedureMarks.test`, `plateTags.test`, `weatherMap.test`; `airspace-lines.spec`, `plates-map.spec`, `weather-map.spec`, `route-line.spec`; the tiles' `tab` in `services/jobs/charts/tests/test_overlays.py`, `services/planner/tests_wingtip/test_airspace_tabs.py`                     | --                                                                            | --                |

## 14. What is picked on the map (the owner, 2026-11-18)

The selection audit found three selection colours, rings that stayed
after their cards had gone, cards of different kinds stacked, and half
the things a pilot can tap with no ring at all. The owner took every
recommendation.

1. **One thing picked at a time.** A tap on anything on the map --
   an airport, a VOR, a fix, a VFR waypoint, an airspace's line, a TFR,
   a weather area, a PIREP, a wind barb, a checkpoint, a point the route
   turns at, a top of climb or descent, a procedure's fix, a route leg,
   traffic, own ship, a Stops field -- puts away every other card and
   ring first, so its card is the only one up and its ring the only
   ring. A tap on the chart itself puts all of them away; a card's ✕, a
   swipe or Back puts its ring away with it.
2. **One selection colour: Taxiway Yellow** (`color.chart.selected`)
   for everything, cased white and edged in the chart's shade so it
   holds over the sectional: a point is ringed (radius 20, the same ring
   for every kind, traffic's drawn in its picture), and an area -- a
   TFR, a Class B, C or D volume, an AIRMET, SIGMET or G-AIRMET -- lights
   its edge in the yellow, as the Brief's TFR hover does, while its card
   is up. A point held is the same ring, with no dot in it. **Blue is
   own ship's alone.** **The one exception is the route leg**, cased in
   green while its Route Leg card is up (the owner's ForeFlight choice,
   2026-11-09): a line, not a point.
3. **Every point ringed while its card is up**: an airport (from the
   chart, a list, a route's chip, a Class B chip, a fuel stop, a search
   result), a VOR, a fix, a VFR waypoint, a PIREP, a wind barb, a
   checkpoint chosen or not, a route point, a top of climb or descent, a
   procedure's fix, a point held, a Stops field (whose tap picks its row
   in the Stops card and rings it, no card of its own).
4. **A field's ident is said once.** The field whose card is open is
   written large over its ring, unless it wears a chip of its own -- the
   route's, a Class B field's, a Stops or fuel stop's -- whose ident is
   then the one; the tile layer leaves every chipped field out.
5. **One way the map comes to a pick**: a thing tapped keeps the pilot's
   zoom and, where it opens a card, is centred above the card's half
   detent; one picked anywhere else (a list, the Nav Log's row, a
   timeline line, a link) is brought in to level 9 at least, centred
   above the half detent, and flown to where it is off the screen.
6. **Own ship opens a card**, as Apple Maps' My Location does: "My
   Location", where it is and the GPS's altitude and speed, Nearest (the
   fields nearest it) and Direct To (the one search asked for the field).
7. **Every card reached by a link**: a fix's, a VFR waypoint's and an
   airspace volume's cards are in the address (`mark=fix:BXCMB@lat,lon`,
   `vfr:`, `airspace:<number>@lat,lon`), as a VOR's (`navaid`), a TFR's
   (`tfr`) and a point held's (`at`) are.

|                   | Web                                                                                                                                                                                                                                                                                                                           | iPhone                                       | Android |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------- |
| One pick          | `lib/map/mapPick`: each kind's card says how it is put away while it is up (`useMapPickOwner`), a pick puts the others away (`pickOnMap`), a tap on the chart all (GlMapShell); the map's own card's ring goes with it (`openCard`'s companions)                                                                              | Not yet: on the owner's word (decision 0038) | Not yet |
| Ring and lit edge | `selectionRing` (lib/map/gl/layers/common), drawn by AirportsGl and PickedGl in the `top` slot; a card rings its point while it is drawn (`useRingWhileUp`) and lights its area (`useAreaWhileUp`: TfrGl's feature state, AirspaceGl's `airspace-picked`, WeatherGl's `wx-area-picked`); traffic's in `trafficMarks`' picture | --                                           | --      |
| Tests             | `e2e/map-selection.spec.ts` (a ring clears on ✕ and on the chart, a route point opens its card, a new pick replaces the old card, own ship's card); `e2e/weather-map.spec.ts` and `e2e/airspace-lines.spec.ts` (an area lit while its card is up); `lib/address.test.ts` (the `mark` and `at` links)                          | --                                           | --      |

## 15. Outside the United States, the figures say they are US ones (the owner, 2026-11-21)

Every rule the engine holds is the FAA's (14 CFR 91.1; outside the
United States a U.S. airplane flies by the country's own rules and over
the high seas by ICAO Annex 2, 91.703(a)). A route that leaves the
United States is planned as any other, never refused, and says so where
its figures are (decision
[0053](../decisions/0053-us-rules-outside-the-us.md)):

1. **The words are the engine's** (`route_jurisdiction`): "Canada: rules
   not checked — figures use US rules", Mexico's, the Bahamas' or
   "Outside the US" by the same pattern, for a point or a leg (checked
   every 2 nm) outside the United States. The planner asks it with the
   course (`/api/course`, `app.route_borders`), each point carrying its
   own warning and its leg's, so the web's module carries no outlines.
2. **Not in FPL's timeline**: the plan's space is limited, so the warning
   lives in the Brief, not the plan (the owner, 2026-11-23).
3. **On the nav log's rail**, once before the first row of each stretch
   outside, not on every row.
4. **Once in the Brief**, a caution among its findings citing 14 CFR
   91.703(a), unfolding to what to do: Canada's rules (the CARs and the
   TC AIM) for Canada.

|       | Web                                                                                                                                                                                         | iPhone                                       | Android |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------- |
| Where | `features/plan/jurisdiction` (`routeJurisdiction`, `rowCautions`) over the nav log's rows; NavLogList's rail line, the Brief's glance `outside` line | Not yet: on the owner's word (decision 0038) | Not yet |
| Tests | `engine/crates/flight/src/jurisdiction_tests.rs`, `engine/facade/tests/jurisdiction.rs` (`lib/fixtures/jurisdiction.json`); `features/plan/jurisdiction.test.ts`, `features/brief/GlanceLines.test.tsx`; `e2e/jurisdiction.spec.ts` (KDET to KBUF, across Ontario) | --                                           | --      |

## 16. Times, figures and the phone's region (the audit of 2026-11-21)

On all three apps:

- **A product's time says whose it is.** A report's, a forecast's, a
  TFR's or a hazard's time is written on the device's clock
  with its zone and UTC beside it, "15:00 CST (2100Z)" (the web's
  `clockAndZulu` and `tfrTimes`, the iPhone's TfrCard), or in Zulu alone
  where the product's line is short. A NOTAM's time is the field's own
  clock with its zone's short name alone, "13:43 CDT", or "UTC" where the
  zone is not known (section 20). A local time with no zone is the
  airplane's own (the nav log's ETAs), and where that can be read as
  another clock it names its zone: the nav log's ETA column, the printed
  kneeboard and its head, the FPL timeline once the device keeps another
  clock than the departure field's. An arrival on another day than the
  flight left says its day, "Tue 15:54 CST", "11/30 09:10" a week or more
  on (the web's `arrivalDay`, in `etaAt` and the timeline), each day in
  its own field's zone: a bare "15:54" a day on read as 87 minutes after
  a 14:27 departure (2026-11-23).
- **A time from a feed with no zone is UTC** (the web's `instantOf`), and
  one that does not read is no bound, never "not in force".
- **A day is the pilot's own.** A logbook's or a currency's date is
  compared with the device's day (`localDay`), not UTC's, which turns over
  in the U.S. evening; the gateway reads the pilot's day from the zone
  each app sends (`X-Time-Zone`).
- **Local times follow the phone's own 12- or 24-hour setting on the
  phones**, the AM or PM kept: a two-figure hour with no AM or PM is
  never written.
- **Figures are written in the FAA's U.S. form whatever the region**:
  "4,500 ft", "8.5 gph", en_US on the iPhone (`Format.locale`), Locale.US
  on Android, never a bare `.formatted()` or `"%,d".format`.
- **A figure typed reads a decimal comma** ("8,5" is 8.5): the web's
  NumberField reads the browser's locale, the phones' `Typed`.
- **A visibility is written as a report gives it and never rounded up**:
  "5/8 SM", "1 1/8 sm", the reportable value at or below it of the
  Federal Meteorological Handbook No. 1's Table 6-1 (sixteenths to 3/8,
  eighths to 2, quarters to 3, whole miles on; never 11/16), the engine's
  `visibility_reportable`, which each app's `reportedVisibility` asks. A
  metric report reads its metres as the value they stand for: 1,600 m is
  1 sm, 800 m 1/2 (`metres_to_sm`).
- **Units are the FAA's, one set, each said**: nm for distance, sm for
  visibility, ft, kt, inHg (a Q group converted), °C, US gallons and
  pounds. There is no metric setting.

## 17. Unusual places and routes (the owner, 2026-11-21)

Most routes are flown over the Midwest; the edge-places audit of
2026-11-21 ("Yes to all") holds the rest to the same rules:

1. **The ADIZs, once in the Brief** (`route_adiz`, 14 CFR 99.41-99.49): a
   route whose points or legs (checked every 2 nm) meet the Contiguous
   U.S., Alaska, Hawaii or Guam ADIZ, or cross the land border with
   Mexico (99.43's line), says so once among the Brief's findings, a
   caution with what part 99 asks there (a flight plan, a listening
   watch, the transponder, a report before crossing) and 99.1(b)'s
   exceptions for under 180 kt. Warn, never limit. The course carries it
   (`/api/course`'s `adiz`), as it does the jurisdiction's line.
2. **An airplane lands on ground**: a field NASR files as a heliport, a
   balloonport or a seaplane base is in no list of fields to land at (the
   nearest, the Stops, a glide's), wherever OurAirports calls it an
   airport (the engine's `field_site_type` `airplane`); a water runway is
   never the runway a glide, a diversion or the wind picks
   (`water_surface`), and a field with water runways alone says so.
3. **The short way round the antimeridian**: night along a leg, a leg's
   variation and air, the TAFs along it, the airplane's place on the
   route and the course drawn on the map are each read along the
   geodesic, not a line in degrees the long way round (Adak to Shemya).
   Every search box in degrees (the obstacles, airspace, special-use
   airspace, TFRs, fixes, fields, stations, SIGMETs and G-AIRMETs, the
   IFR floor's and the terrain's tiles, the own-ship look-ahead) is
   worked out the short way round and read as its one or two halves
   either side of 180 (`wingtip.geo_boxes`, `wingtip_core::geo`
   `corridor_boxes`/`split_box`); a box nowhere near 180 is the one it
   always was.
4. **A route goes somewhere**: a departure that is its own destination
   with no stop (C81 to C81, or KOSH to OSH) is a local flight, not a
   route of no length (`same_field` on the web; a 422 from the plan).

|       | Web                                                                                                                                                              | iPhone                                       | Android |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------- |
| Where | `features/plan/adiz` (`routeAdiz`), the Brief's glance `adiz` line; `lib/geo` `unwrapLine`, `lonBounds`                                                          | Not yet: on the owner's word (decision 0038) | Not yet |
| Tests | `engine/crates/flight/src/adiz_tests.rs`, `engine/facade/tests/edge_places.rs` (`lib/fixtures/edgePlaces.json`), `core/src/geo_tests.rs`, `weather/src/forecast/route/tests.rs`; `tests_wingtip/test_geo_boxes.py`; `features/plan/adiz.test.ts`, `lib/geo.test.ts` | --                                           | --      |

## 18. Registry names in the store apps (the owner, 2026-11-21)

Decision 0055. The airplane card's Info, its facts strip and a tracked
airplane's FAA section name the FAA registry's owner and co-owners on the
iPhone and Android only for the pilot's own airplane, or where the
registrant's type is an organisation: Corporation, Government, LLC or
Non-citizen corporation (Type Registrant 3, 5, 7, 8; ardata.pdf).
Anyone else is their kind and state, "Individual, WI". There is no name,
town or co-owner's name, and the co-owners' count stays. Past
registrations name only organisations. A reservation names who reserved
it only on the pilot's own airplane. App Review 5.1.1(viii) does not
permit compiling personal data even from public databases. The web keeps
every name, the owner's choice of 2026-11-14, as it is not on the App
Store.

|       | Web | iPhone | Android |
| ----- | --- | ------ | ------- |
| Rule  | Not applied: every name (`AirplaneInfo`) | `Airplane/RegistryNames.swift`, drawn by `AirplaneInfoSections`, `AirplaneFacts` and `FAARecordSection` | `airplane/RegistryNames.kt`, drawn by `AirplaneInfo` |
| Tests | -- | `RegistryNamesTests` | `RegistryNamesTest` |

## 19. The app's words (the owner, 2026-11-21)

The owner took the words audit's fixes on 2026-11-21 ("Yes to all").
Every word a pilot reads, on all three apps, follows these rules
(decision [0055](../decisions/0056-one-set-of-words.md), which carries
on from [0020](../decisions/0020-airplane-not-aircraft.md) and
[0021](../decisions/0021-title-case-labels.md)):

1. **One thing, one name, on all three apps.** A screen's title is
   `design/screens.json`'s; a word every app says (a control, a figure's
   name, a shared message) is `design/wording.json`'s, generated into each
   app by `scripts/build/wording.sh` as the tokens are: the web's
   `WORDING` (`lib/wording/generated`), the iPhone's `Wording`
   (`Design/Generated/Wording.swift`, each kept by the string catalog) and
   Android's `R.string.wording_*`. A word added to a second app goes into
   the table, not into the app.
2. **A name is in Title Case.** Titles, section headings, tabs, segments,
   buttons, menu items, toggles, row and figure names, empty states'
   titles and toasts' titles are in Apple's title style: every word
   capitalised but the articles, the conjunctions and the prepositions of
   four letters or fewer, unless one begins or ends it ("Add to Route",
   "Read from a Photo", "Cross At", "Time En Route"). A menu item that asks
   for more before it acts ends with "…" ("Hold Here…", "Set Altitude…");
   one that only asks to confirm does not ("Delete Account"), as the HIG
   says.
3. **A sentence is in sentence case and ends with its stop.** Messages,
   errors, empty states' lines, hints, notes and a question that is a
   whole sentence ("Discard your changes?") begin with a capital and end
   with a full stop or a question mark. A figure's value ("No ceiling",
   "Not on record") has no stop. The map's words are sentence case
   (section 13), and the FAA's own capitals are set in sentence case with
   their codes kept (`faaWords`); a raw report stays as sent.
4. **Progress says "Fetching".** "Fetching the NOTAMs…", one ellipsis
   character, never three full stops (decision 0021's "Fetching").
5. **An error says what could not be done, plainly.** "The NOTAMs could
   not be fetched." with "could not", never "couldn't" or "can't", and
   "did not answer" for a service that was asked and gave nothing; what
   to do next follows as a second sentence ("Try again in a moment.").
6. **The FAA's words, as the FAA writes them.** "Airplane" for the
   pilot's own (decision 0020), "aircraft" only where the FAA's text or
   form says it (ICAO flight plan items 7 and 9, the FAA Aircraft
   Registry, 14 CFR 91.103's "aircraft performance"). Flight categories are
   VFR, MVFR, IFR and LIFR, said "marginal VFR" and "low IFR". "Ceiling"
   is 14 CFR 1.1's, "visibility" the report's, airspace "Class B" with the
   capital, and the FAA's codes in capitals: TFR, NOTAM, METAR, TAF, ETE,
   ETA, SM and NM spelled as the units module writes them (nm, sm). The
   nav log is "Nav Log" as a name and "nav log" in a sentence.
7. **The engine's and the gateway's words too.** A label the engine sends
   for an app to show (a finding's, a due item's, a handbook figure's, an
   endorsement's name: "Flight Review", "Passengers at Night", "Weight &
   Balance", "Solo Flight at Night") is in Title Case, and its sentences,
   errors and pages follow rules 3 to 6, as the gateway's pages and
   problems do ("The planner did not answer. Try again in a moment.").
   A label the engine also sets inside a sentence is lowered there with
   its codes kept (`in_sentence`); the aircraft form's field names, which
   begin its sentences ("Cruise speed must be a positive number"), stay in
   sentence case.

The words the three apps share, generated from `design/wording.json`:

<!-- BEGIN generated from design/wording.json by scripts/build/wording.sh -->

| Key | Kind | Words | Where |
|---|---|---|---|
| `planning_aid_title` | label | A Planning Aid | About's heading over the planning aid's words. |
| `planning_aid_notice_title` | label | A Planning Aid, Not for Navigation | The planning aid's notice, where an app shows it on its own. |
| `planning_aid` | sentence | Wingtip Maps is a planning aid for VFR and IFR flight. It does not replace an official weather briefing (1800wxbrief.com or 1‑800‑WX‑BRIEF), current FAA charts and publications, or the pilot in command’s judgment and final authority (14 CFR 91.3, 91.103). Its checkpoints are a model’s suggestions: check them against the chart. Before flight, verify current weather, NOTAMs, TFRs, airport status, aircraft performance, and applicable regulations (14 CFR 91.103). | What the app is and is not, in About and at the briefing's foot (14 CFR 91.3, 91.103; docs/legal/credits.md, "A planning aid"). |
| `planning_aid_kneeboard` | sentence | Wingtip Maps · a planning aid: check the charts, NOTAMs and an official briefing before flight. | The printed kneeboard's foot. |
| `try_again` | label | Try Again | The button that asks again after an error. |
| `sign_in` | label | Sign In | The button that starts signing in. |
| `add_stop` | label | Add Stop | Adds the place shown as a stop on the route (decision 0021's own example). |
| `add_to_route` | label | Add to Route | Adds the place shown to the route. |
| `add_to_favorites` | label | Add to Favorites | Keeps the airport or airplane shown among the favorites. |
| `add_airplane` | label | Add Airplane | Adds one of the pilot's own airplanes. |
| `edit_airplane` | label | Edit Airplane | Opens the pilot's airplane's figures to change. |
| `delete_airplane` | label | Delete Airplane | Deletes one of the pilot's airplanes. |
| `pick_an_airplane` | label | Pick an Airplane | Where the times and the fuel need an airplane. |
| `fly_this_airplane` | label | Fly This Airplane | Makes the airplane shown the one the plan flies. |
| `clear_route` | label | Clear Route | The menu item that clears the route. |
| `clear_route_question` | label | Clear Route? | The question before the route is cleared. |
| `direct_to` | label | Direct To | Flies straight to the point picked, the avionics' own name. |
| `enter_route` | label | Enter Route | Puts a clearance's route into the plan. |
| `read_back` | label | Read Back | Starts the pilot's read back of a clearance. |
| `read_back_again` | label | Read Back Again | Reads the clearance back once more. |
| `print_nav_log` | label | Print Nav Log | Prints the nav log, in the share menu. |
| `share_link` | label | Share Link | Shares the plan as a link. |
| `show_on_map` | label | Show on Map | Shows the thing in the row on the map. |
| `start_over` | label | Start Over | Starts a drill or a form again from its beginning. |
| `save_to_account` | label | Save to Account | Keeps the thing shown in the pilot's account. |
| `ask_about_the_flight` | label | Ask About the Flight | Opens Ask on the flight planned. |
| `file_with_flight_service` | label | File with Flight Service | Files the flight plan with Leidos Flight Service. |
| `delete_account` | label | Delete Account | Deletes the pilot's account. |
| `delete_account_question` | sentence | Delete your account? | The question before the account is deleted. |
| `discard` | label | Discard | Throws away what was typed. |
| `discard_changes_question` | sentence | Discard your changes? | The question when a form with changes is closed. |
| `weight_and_balance` | label | Weight & Balance | The weight and balance's section and row. |
| `forecast_icing` | label | Forecast Icing | The forecast icing along the route (aviationweather.gov's CIP/FIP). |
| `along_the_route` | label | Along the Route | What lies along the route, a section's heading. |
| `airport_weather` | label | Airport Weather | The map's airport weather marks, as a setting. |
| `flight_category` | label | Flight Category | A report's flight category, VFR, MVFR, IFR or LIFR (the FAA's names). |
| `time_en_route` | label | Time En Route | ETE written out. |
| `top_of_climb` | label | Top of Climb | The nav log's TOC written out. |
| `top_of_descent` | label | Top of Descent | The nav log's TOD written out. |
| `true_airspeed` | label | True Airspeed | TAS, a figure's name. |
| `indicated_airspeed` | label | Indicated Airspeed | IAS, a figure's name. |
| `ground_speed` | label | Ground Speed | GS, a figure's name. |
| `true_course` | label | True Course | TC, a figure's name. |
| `magnetic_course` | label | Magnetic Course | MC, a figure's name. |
| `magnetic_heading` | label | Magnetic Heading | MH, a figure's name. |
| `cruise_altitude` | label | Cruise Altitude | The plan's cruise altitude. |
| `cruise_power` | label | Cruise Power | An airplane's cruise power setting, a percentage. |
| `density_altitude` | label | Density Altitude | A field's density altitude. |
| `usable_fuel` | label | Usable Fuel | An airplane's usable fuel. |
| `fuel_burn` | label | Fuel Burn | An airplane's fuel burn an hour. |
| `start_and_taxi_fuel` | label | Start and Taxi Fuel | The fuel an airplane burns before takeoff. |
| `empty_weight` | label | Empty Weight | An airplane's basic empty weight. |
| `empty_moment` | label | Empty Moment | An airplane's basic empty moment. |
| `service_ceiling` | label | Service Ceiling | An airplane's service ceiling. |
| `glide_ratio` | label | Glide Ratio | An airplane's best glide ratio. |
| `climb_rate_at_sea_level` | label | Climb Rate at Sea Level | An airplane's climb rate at sea level. |
| `fetching_nearest_fields` | progress | Fetching the nearest fields… | Nearest, while it is asked for. |
| `fetching_notams` | progress | Fetching the NOTAMs… | A field's or the route's NOTAMs, while they are asked for. |
| `fetching_model_weather` | progress | Fetching model weather… | Model Weather's picture, while it is asked for. |
| `fetching_logbook` | progress | Fetching your logbook… | The logbook, while it is asked for. |
| `fetching_services` | progress | Fetching the services… | A stop's services, while they are asked for. |
| `reading_the_page` | progress | Reading the page… | A photographed page, while it is read. |
| `listening_to_the_radio` | progress | Listening to the radio… | The radio's words, while they are heard. |
| `planner_not_reached` | sentence | The planner could not be reached. | Where the planner did not answer. |
| `notams_not_fetched` | sentence | The NOTAMs could not be fetched. | Where the NOTAMs did not come. |
| `tfrs_not_checked` | sentence | TFRs could not be checked just now. | The route's NOTAMs where the TFR list did not come. |
| `tfr_list_not_read` | sentence | The TFR list could not be read: check the FAA's TFRs before flying. | A field's NOTAMs where the TFR list did not come. |
| `tfrs_not_loaded` | sentence | The TFRs did not load. Check tfr.faa.gov before flight. | The map's TFR card where tfr.faa.gov did not answer. |
| `special_use_no_answer` | sentence | The FAA's special-use airspace did not answer. Check the chart. | The airspace card where the SUA feed did not answer. |
| `airspace_not_read` | sentence | The planner could not read the airspace here. Try again in a moment. | The airspace card where the planner did not answer. |
| `weather_not_reached` | sentence | The weather service could not be reached. | An airport's weather where aviationweather.gov did not answer. |
| `services_not_fetched` | sentence | The services could not be fetched. | A stop's services where they did not come. |
| `places_not_looked_up` | sentence | Places near the field could not be looked up. | A stop's places where they did not come. |
| `logbook_not_fetched` | sentence | Your logbook could not be fetched. | The logbook where it did not come. |
| `nearest_not_found` | sentence | The nearest fields could not be found. | Nearest where it did not come. |
| `page_not_read` | sentence | The page could not be read. | A photographed page that could not be read. |
| `read_back_not_checked` | sentence | The read back could not be checked. | A clearance's read back that could not be checked. |
| `forecast_icing_not_checked` | sentence | The forecast icing could not be checked: aviationweather.gov did not answer. Verify it separately before flight. | The Brief's icing where aviationweather.gov did not answer. |
| `history_not_fetched` | sentence | Its history could not be fetched. Try again in a moment. | An airplane's registry history where it did not come. |
| `past_flights_not_fetched` | sentence | Its past flights could not be fetched. Try again in a moment. | An airplane's past flights where they did not come. |
| `coming_up_not_fetched` | sentence | What falls due could not be fetched. | Coming Up where it did not come. |
| `plan_a_route_first` | sentence | Plan a route first. | What needs a route, where there is none. |
| `no_connection` | value | No connection | What a list, a card or a figure says in place where its answer could not be had for want of a network (the web's lib/problems NO_CONNECTION). |
| `no_answer_in_time` | sentence | No answer in time. Try again in a moment. | A request that timed out (the web's describeError). |
| `answer_garbled` | sentence | The planner's answer came back garbled. Try again in a moment. | An answer that was not the JSON asked for (the web's describeError). |
| `planner_not_answering` | sentence | The planner is not answering. Try again in a moment. | The planner refused with a server error and no words of its own (the web's describeError). |
| `nav_log_empty` | sentence | Plan a route on FPL; its legs are listed here. | The Nav Log with no route. |
| `no_ceiling` | value | No ceiling | A report with no broken or overcast layer, a figure's value (14 CFR 1.1, "ceiling"). |
| `remove_from_favorites` | label | Remove from Favorites | Takes the airport or airplane shown out of the favorites. |
| `remove_from_account` | label | Remove from Account | Takes the thing shown out of the pilot's account. |
| `hide_from_map` | label | Hide from Map | Takes the thing shown off the map. |
| `sign_out` | label | Sign Out | Signs the pilot out. |
| `not_now` | label | Not Now | Puts an offer off (the owner's word, a shared flight's). |
| `new_airplane` | label | New Airplane | The title over a new airplane's figures. |
| `export_my_data` | label | Export My Data | Saves the pilot's account as a file. |
| `dry_run` | label | Dry Run | Flies the route on the map before the flight. |
| `wind_correction` | label | Wind Correction | WCA, a figure's name. |
| `true_heading` | label | True Heading | TH, a figure's name. |
| `compass_heading` | label | Compass Heading | CH, a figure's name. |
| `fuel_required` | label | Fuel Required | The fuel a leg or the flight needs. |
| `pattern_altitude` | label | Pattern Altitude | A field's traffic pattern altitude. |
| `fetching_the_map` | progress | Fetching the map… | The map, while its chart is asked for. |
| `adverse_conditions` | label | Adverse Conditions | The Brief's group of what the flight meets on the route, a briefer's first element (AIM 7-1-5(b)(1)). |
| `before_you_go` | label | Before You Go | The Brief's row for what is left to do and the fuel beyond the reserve. |
| `en_route` | label | En Route | The Brief's row for the flight between its fields. |
| `beyond_reserve` | label | Beyond Reserve | The fuel over what the flight needs and its reserve (14 CFR 91.151(a), 91.167(a)), a figure's name. |
| `lowest_ceiling` | label | Lowest Ceiling | The lowest ceiling a TAF near the route forecasts over the flight, a figure's name. |
| `visibility` | label | Visibility | A visibility, a figure's name. |
| `most_headwind` | label | Most Headwind | The strongest headwind on any leg (the engine's route_headwind), a figure's name. |
| `finding_where_you_are` | progress | Finding where you are… | The first route's wait for the phone's position. |
| `done_flying` | label | Done Flying | Flying mode's way out for this flight. |
| `larger_map_labels` | label | Larger Map Labels | The Map card's switch that lets the map's words follow the text size, up to 1.2 times. |

<!-- END generated wording -->

|       | Web | iPhone | Android |
| ----- | --- | ------ | ------- |
| Words | `lib/wording/generated/wording.ts` (`WORDING`) | `Design/Generated/Wording.swift` (`Wording`), kept by `Localizable.xcstrings` | `res/values/wording_strings.xml` (`R.string.wording_*`) |
| Tests | `lib/wording/wording.test.ts` | `WingtipTests/WordingTests.swift` | `WordingTest` |

## 20. A NOTAM's own card (the owner, 2026-11-23)

The owner, of FDC 6/3373 at KARR on his iPhone: the card said "SID" and
lowercased the departures' names. A NOTAM's own card now says, top to
bottom (web first, `features/place/NotamCard.tsx`; the phones on the
owner's word):

1. **Its title is what happened**, "Runway 18/36 closed", not its
   keyword; under it the field and its number, "KARR Aurora Municipal ·
   FDC 6/3373" (an FDC NOTAM with its accountability, JO 7930.2 4-2-1).
2. **Its category is a small label** ("Departure procedures", "Arrival
   procedures", "Instrument approaches", else Runway, Taxiway, Navaid,
   Airspace ...).
3. **Chips**: Active (or Later, Inactive), Permanent where the condition
   is (PERM, or PERMANENTLY in its words), and "Affects your departure"
   (arrival, alternate) where the field is the planned flight's. Stock
   Badge and StatusBadge.
4. **One plain sentence of its effect**: "Runway 18/36 is permanently
   closed, so its RNAV departures are not authorized."
5. **What it takes away**, under "Not authorized", by the procedures'
   charted names in capitals and their numbers: "ADELL 8 · BLOKR 8 ·
   CARYN 8 · DARCY 8 · ELANR 9 · OBENE 3 (RNAV)".
6. **Its times, one line each**, as the list's rows say them
   (`NotamTimeLines`): "Since 05/27/26 13:43 CDT", "Ends 05/27/28 13:43
   CDT · in 551d" (Starts, with how soon, for one to come). In the
   field's own time named by its zone's short name ("CST" at O'Hare),
   "UTC" where the zone is not known; never "local", never a Z time
   beside it, never "estimated" (the owner, 2026-11-23). A permanent
   one's end is "Permanent" (the engine's `until_charts`: a permanent
   condition with an EST end, or none; or a PERM end). The year on both
   lines only where either is not this year's. Each line stays one line
   at 390 pt and the owner's 19.65 px text: where "· in 551d" would not
   fit, it is dropped, never wrapped.
7. **As sent**, folded (the stock Collapsible), never rewritten.

Title, category, effect, the list and permanence are the engine's
(`notam_card`, read from the NOTAM's parts), and so is the chip saying
which part of the flight it affects (`notam_affects`: a departure
procedure taken is red at the departure and a stop, an arrival's at the
destination, a stop and the alternate, and what happened to the field
itself neutral at every role there); where it cannot structure a
NOTAM they are null and the card says its words written out
(`notam_read`) under its heading, as before. In those words a
procedure's name keeps its capitals and its number is a word ("BLOKR
Eight departure (RNAV)"), every one of a list alike. The list's rows say
the same title, with the same Since and Ends lines.

## Changing a rule

A rule here changes only when the owner says so (the `owner` label). Then
add a decision that supersedes the old one, change this page, the
platform references and [navigation.md](../navigation.md), and the
tables and suites above in the same branch.
