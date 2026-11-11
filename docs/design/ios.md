# Wingtip on iOS 27: a design reference for every screen

How each Wingtip screen should look and behave on the iPhone and iPad,
following Apple's own apps and the Human Interface Guidelines as they
stand for iOS 27 and iPadOS 27 (27.2). The owner asked for it on
2026-11-09: "Can you do research on everything and let's make it
consistent look and feel to its platform." He likes the current Apple
Maps and sent its place card as the model (see
[The airport card](#2a-the-airport-card-match-the-maps-place-card)).

This is a reference, not a change list. Where following Apple would move
a panel or a control, the section says so and leaves the decision to the
owner (CLAUDE.md, "Never").

**How this was checked (2026-11-09).**

- The HIG pages were read from Apple's own page data. Each page's
  change-log date is given where it matters.
- Apple's apps were checked against the iPhone User Guide. Its pages
  carry `os_version: "iOS 27"`.
- WWDC26 session pages, the iOS 27 release notes and Apple's Newsroom
  were also used.
- The owner's screenshot of Maps on iOS 27, taken on his own iPhone, is
  primary evidence for the place card.
- Every SwiftUI API named here was found in the iOS 27.2 SDK's
  `SwiftUI`, `SwiftUICore`, `WidgetKit`, `ActivityKit` or `AlarmKit`
  swiftinterface in `/Applications/Xcode.app`.
- Anything no Apple page states is marked **unverified**, or
  **[inference]** where it is this document's own reading.
- Links are listed by name in [Sources](#sources) at the end.

Companion docs:

- `docs/ios-27.md`: which iOS 27 APIs the app already adopted, and why
  others were left out.
- `docs/design/rules.md`: the card rule, the scrolling rule and their
  tests, the one search and the airport weather marks, on all three apps.
- `docs/navigation.md`: every screen, its link and the taps to reach it.
- `design/tokens.json`: the one source for colour, type, space, motion
  and haptics.

---

## 0. Rules for every screen

### The brand stays; the chrome is Apple's

- **Tint.** Everything tappable takes the Wingtip tint. By day that is
  `color.theme.light.tint`, #0066CC (5.6:1 on white), at night
  `color.theme.dark.tint`, #57A8FF, and in sunlight
  `color.theme.sunlight.tint`, #0047A0.
  - It is set at the root at run time for the brand looks (`lookTint`:
    SwiftUI's `.tint` and the window's `tintColor`, which the alerts and
    menus the system draws take), so stock controls pick it up. The app
    names no global accent colour, so Native gets the system's own.
  - Plain text never takes the tint.
  - HIG Color asks for colour on the *background* of a primary action
    on Liquid Glass, not on its symbol ([HIG Color][hig-color]). So the
    one filled button on a screen is `.buttonStyle(.glassProminent)`,
    or `.borderedProminent` below iOS 26, tinted with the brand blue.
- **The chart's colours** (`color.chart.*`) are the chart's own. They
  stay the same in every look and at night: the course magenta,
  towered blue, the NEXRAD levels, TFR red and the selected Taxiway
  Yellow.
- **The weather's colours** are fixed too:
  - flight categories `color.category.*` (AIM 7-1-7)
  - weather hazards `color.weather.*`
  - row badges `color.badge.*`
- **System grounds.** Sheets use iOS's grouped grey
  (`color.theme.light.sheet`, #F2F2F7) with white inset cards. Night is
  the cockpit navy: #0B1422 ground, #17283A card. Sunlight is solid
  white with no glass, and it wins over every look.
- **Liquid Glass is for controls only.** HIG Materials says "Don't use
  Liquid Glass in the content layer" ([HIG Materials][hig-materials]).
  - Glass goes on map buttons, the floating toolbar, the sheet's
    chrome and the tab bar.
  - **The map buttons (owner decision 2026-11-10)** are one glass
    capsule, Map, My Position and Ask stacked in it with a hairline
    between, each 48 points (`size.map-button`) as Maps' are, in place
    of three separate 44-point circles (`MapButtons`).
  - **Where (owner, 2026-11-11):** the group rides the sheet's top at
    the right, 24 points over it, just above the search row, following
    the sheet between its detents and under a finger, and fades out as
    the sheet goes on to full (`MapButtonsDock`; rules.md §7). Beside the
    iPad's sidebar it stays at the top right.
  - Rows, cards and figures sit on solid grounds.
  - The clear variant only goes over the chart. If the chart under it
    is bright, add a 35% dimming layer ([HIG Materials][hig-materials]).
  - iOS 27 adds a Settings slider that runs from "ultraclear to fully
    tinted" ([Newsroom WWDC26][news-wwdc26];
    [Find settings][sup-settings]). Do not fight it: draw no custom
    blur over a system glass.

### Type (Dynamic Type always on)

Every size comes from a text style, so it scales. The tokens map to
iOS's styles ([HIG Typography][hig-type]: Large defaults, in points):

| Token | iOS style | Used for |
|---|---|---|
| `type.hero` 28/34 bold | `.title` | A name over a card's photo (the airport card) |
| `type.card` 22/28 bold | `.title2` | A card's name at the medium detent |
| `type.heading` 20/25 semibold | `.title3` | Section titles |
| `type.title` 17/22 semibold | `.headline` | A sheet's or a bar's title |
| `type.row` 17/22 | `.body` | A row's name and value |
| `type.detail`, `type.prose` 15/20 | `.subheadline` | A row's second line; a paragraph |
| `type.note` 13/18 | `.footnote` | A group heading; one line of help |
| `type.tab-bar` 12/16 | `.caption` | Tab bar words |
| `type.caption` 11/13 bold | `.caption2` | A chip's category |
| `type.figure` 26/31 bold, tabular | `.title` + `.monospacedDigit()` | The figure strip |
| `type.label` 13 semibold caps | `.footnote` + `.fontWidth(.condensed)` + `.textCase(.uppercase)` | A figure's name; an ident |

Rules ([HIG Typography][hig-type]; [HIG Accessibility][hig-a11y]):

- **Weights and contrast.** Never Ultralight, Thin or Light. Contrast is
  4.5:1 up to 17 pt and 3:1 above.
- **Live figures.** A figure that changes (ETE, fuel, wind) uses
  `.contentTransition(.numericText())`. Its digits stay tabular.
- **Large text sizes.** The owner's iPhone runs a larger Dynamic Type
  size, so every layout is checked at his size and at AX sizes.
  - Side-by-side items stack ("horizontally adjacent views may need to
    stack vertically", [HIG Layout][hig-layout]).
  - Use `ViewThatFits`, or branch on `dynamicTypeSize.isAccessibilitySize`.
  - At AX sizes, a facts row of four becomes two by two, and the action
    row's labels go under their symbols or wrap. Never truncate an
    ident or a figure.
  - Glyphs grow with the text ("Increase the size of meaningful
    interface icons", [HIG Typography][hig-type]). Use
    `@ScaledMetric` for any fixed size.

### Hit areas and spacing

- **Hit areas.** At least 44 × 44 pt ([HIG Buttons][hig-buttons]).
  Controls keep their stock size: extend the hit area with
  `.contentShape` and padding, never by growing the control.
  - Rows sit `space.sm` (8 pt) apart, so the hit areas meet.
  - HIG Accessibility asks for about 12 pt around a bezeled element
    and 24 pt around one without a bezel ([HIG Accessibility][hig-a11y]).
- **Gutters.** The side gutter is `space.lg`, 16 pt. The owner's Maps
  screenshot measures a 16 pt gutter and 8 pt between action buttons
  [inference: measured at 393 pt wide].

### The sheet and its detents

The planner's one sheet is the Maps sheet. It is non-modal, so the
chart stays live under it ([HIG Sheets][hig-sheets]: "When a nonmodal
sheet is onscreen, people use its functionality to affect the parent
view without dismissing the sheet").

- **Code.** `presentationDetents([pill, .half, .large], selection: $detent)`,
  with `presentationBackgroundInteraction(.enabled(upThrough: .half))`
  and a grabber (`presentationDragIndicator(.visible)`).
  - `pill` is `.height(132)` today (`RootView.pill`).
  - **Half height (owner decision 2026-11-10).** `.half` is
    `.fraction(0.45)` (`Navigation/Detents.swift`), 45% of the screen as
    Maps' half covers it, in place of the stock `.medium`'s 53.5% (the
    iOS sheet audit measured both). The plan's sheet and every card that
    opens half way use it; the system animates between the detents as
    its own. The other modal sheets keep `.medium`.
  - **The figures strip at the pill (owner decision 2026-11-10).** The
    route's TO / DIST strip is the sheet's foot from half height up and
    not at the pill, where it drew 25 points over the search field
    (`sheetAtPill`, PlanSheet).
  - The HIG asks for a grabber on a resizable sheet. Tapping it cycles
    through the detents, and VoiceOver reads it ([HIG Sheets][hig-sheets]).
- **Content changes with the detent.** The owner checked Apple Maps on
  2026-11-09:
  - A place card shows its header photo only at the large detent.
  - At the medium detent it starts with the title, then the actions and
    the facts, with no photo.

  The HIG calls this "progressive disclosure": "In an iPhone app,
  consider supporting the medium detent to allow progressive disclosure
  of the sheet's content" ([HIG Sheets][hig-sheets]). Apple's pages do
  not give the detents' heights, or what Maps shows at each
  (**unverified** beyond the owner's observation and the screenshot).
- **How to build it.** Read the `selection` binding and switch what
  the card draws.
  - The photo is in the view only at `.large`.
  - Animate the change with the sheet (`motion.sheet`, 0.3 s), or with
    a fade under Reduce Motion.
  - Keep the title in the same place across a drag, so the eye has an
    anchor.
  - Each sheet screen below has a **Detents** row saying what shows at
    pill, medium and large.
- **Cards: one rule for every thing and page** (the owner's card rule
  and scrolling rule, 2026-11-10).
  - A thing (a field, an airplane by its N-number or in traffic, a
    route leg, a hold, a flown track, the Map settings) and every page
    by its name (Brief, Nav Log, Profile, Nearest, Settings, Ask…) opens
    as **one card over the plan's sheet**, as Maps opens a place over
    its search: the same view (`SheetPageView`) from the search, the
    map, a list, the plan or a link. `Navigator.open` is the one way in
    (`RootView.openScreen` for a screen by its name); the plan's sheet
    presents the card through one `.sheet(item:)` (`CardHost`), so one
    card is up at a time and a new one takes its place.
  - The card opens at `.half` for a thing and `.large` for a page,
    grows to `.large`, and the map stays live under it up to `.half`;
    a question or a form stays modal.
  - Its close is at the right of its bar; what it opens is pushed in its
    own `NavigationStack` with the system's Back (`Navigator.push`), and
    a page done (a form's Add, a leg's Direct To) goes back where it was
    opened (`Navigator.finish`).
  - The large title shows and folds into the bar as the card scrolls
    (no forced `.inline` but on forms); the airport card's head is its
    title until it scrolls away, then its name is the bar's and its
    sections' picker is pinned under the bar.
  - Every alert, the Ready to Fly prompt and the emergency assistant are
    hung on the top of the stack (`TopHosts`): the card while one is up,
    else the plan's sheet; never the map under the plan's sheet, where
    UIKit's one presenter would never show them.
  - Footers are the system's bar (`glassFoot`, `safeAreaBar`); a card's
    own toolbar (the airport card's) is the stock bottom bar.
  - No control in a card takes the sheet's drag: the Profile opens at
    full height, so its altitude slider never fights the drag, and the
    flown track's chart moves the replay on a tap.
- **Other sheets.**
  - A separate modal sheet (an edit form, Ask, the share sheet) uses
    `[.medium, .large]`.
  - HIG Sheets (updated 2026-03-24) puts Cancel on the leading edge of
    the top bar and Done on the trailing edge. It says to "avoid
    showing all three buttons — Cancel, Done, and Back — together".
  - With unsaved changes, swiping down asks first in a
    `confirmationDialog` ([HIG Sheets][hig-sheets]).
- **The map's legal mark.** If the map is MapKit, the Apple logo and
  legal link sit "10 points above the lowest resting position of the
  card" ([HIG Maps][hig-maps]). This applies only where MapKit draws
  the base map.

### Bars and where the primary action sits

- **Toolbars.**
  - Toolbar symbols are bare and monochrome ([HIG Toolbars][hig-toolbars]).
  - Use the standard Back and Close symbols, never a text label of
    Back or Close.
  - Titles are under 15 characters, in at most three groups.
  - There is one `.prominent` primary action, on the trailing side.
- **The primary action of a task screen** (Brief's Fly, a form's Save)
  depends on the kind of screen.
  - On a task screen it sits in a bottom bar: `safeAreaBar(edge: .bottom)`
    holding a full-width `.glassProminent` button.
  - On a form presented as a sheet it is the trailing Done.
  - HIG iOS says controls are easier to reach "in the middle or bottom
    area of the display" ([HIG Designing for iOS][hig-ios]).
- **iOS 27 bar APIs, already adopted** (docs/ios-27.md):
  - `toolbarMinimizationBehavior(.onScrollDown, for: .navigationBar)`
    on long lists
  - `.topBarPinnedTrailing` keeps Share in the bar
  - `visibilityPriority(_:)` decides what overflows first
    ([WWDC26 269][wwdc-269]; [iOS 27 release notes][relnotes])
- **iPhone Duo** (iOS 27 hardware; HIG page new 2026-09-09):
  - Bars move to the side, with Back or Close at the top, then the
    prominent action.
  - Give every toolbar item a title as well as a symbol.
  - Keep custom views off the fold with `ReservedRegion`
    ([HIG iPhone Duo][hig-duo]).

### Motion and haptics

- **Opening a card rises; a page inside it pushes.** No zoom from the
  row or the mark (the owner's scrolling rule, 2026-11-10): inside a
  resizable sheet the zoom transition's own pull-down popped the page
  where the pilot meant to lower the sheet, so `CardZoom.swift` is gone.
  A card is the system sheet rising, a page the stack's push.
  - HIG Motion: "Add motion purposefully", "avoid adding motion to UI
    interactions that occur frequently", "Let people cancel motion"
    ([HIG Motion][hig-motion]).
- **Durations** come from `motion.*`:
  - the sheet 0.3 s
  - a page 0.25 s
  - a fade 0.2 s
  - a press 0.1 s, scaling by `feel.press-scale` (0.97)
- **Haptics** come from `haptic.*` through `.sensoryFeedback`, and never
  play under Reduce Motion (`FeelHost`). HIG Playing haptics names
  three kinds ([HIG Haptics][hig-haptics]):
  - *selection*, "while the values of a UI element are changing": an
    altitude set
  - *impact*, "a physical metaphor": the sheet settling at a detent
  - *notification*, "the outcome of a task": Direct To taken, a warning
    shown

  "Avoid overusing haptics" ([HIG Haptics][hig-haptics]). A haptic marks
  a change to the flight or a warning, never a plain tap.
- **Data refresh.** Data refreshes by itself ("Don't make people
  responsible for initiating every update", [HIG Progress][hig-progress]).
  `.refreshable` is a backup, not the only way.

### Errors, empties and warnings

- **Errors show where they happen**, as a `ProblemLine` row inside the
  section that failed. They are never a toast, and never an alert for
  something that can be undone ([HIG Alerts][hig-alerts]: "Avoid
  displaying alerts for common, undoable actions").
- **Empty states** use `ContentUnavailableView`, with the one action
  that fills them. For example, "No airplane picked" and Pick an
  Airplane.
- **Warn, never limit.** A figure past a limit is shown, coloured
  caution or warning, with its reason. Nothing is disabled or hidden
  because a rule says no. The engine decides the figure and the
  verdict (CLAUDE.md, Architecture); the view only draws them.
- **No assumed airplane.** A figure that needs an airplane (ETE, fuel,
  the performance) shows an em dash and a "Pick an Airplane" row until
  one is picked. It never shows a default type's numbers.
- **No signal says so, in place.** What the iPhone answers from its
  own packs says it: "From this iPhone, without weather" over Nearest's
  and Emergency's fields, "No connection: airports from the chart data
  on this iPhone only" over the search. An edit the planner must make
  (Direct To, a diversion) is not half made: the route is put back and
  "Not changed: no connection" said where it was asked. A kept answer
  says its age (`KeptAgeLine`); a stale weather mark is greyed with its
  age by the ident. Never a spinner with nothing asked: with no GPS fix
  a list says so after ten seconds and what to do (docs/NATIVE.md, "In
  the air with no signal").

---

## 1. The one search and its results

**Follow:**

- **Maps search** ([Get started with Maps][sup-maps-start];
  [Find nearby][sup-maps-nearby]):
  - A search field, with categories under "Find Nearby".
  - The account picture sits next to the field, at the bottom of the
    screen.
  - Results update as the map moves ([apple.com/maps][apple-maps]).
- **HIG Search fields** (updated 2026-06-08):
  - "Place search at the bottom if there's room."
  - "If possible, start search immediately when a person types."
  - "Consider showing suggested search terms."
  - "Default to a broader scope and let people refine it"
    ([HIG Search fields][hig-searchfields]).
- **HIG Searching**: "Aim to make your app's content searchable through
  a single location" ([HIG Searching][hig-searching]).

**Structure, top to bottom (in the sheet):**

1. **The search field** in the sheet's head, with the account avatar
   at its trailing end.
   - **The avatar (owner decision 2026-11-10)** is its own 44 × 44
     round glass button, apart from the microphone's (a fixed
     `ToolbarSpacer` between them), as Maps' avatar is; it drew 40 × 36
     inside the microphone's capsule. Its name stays "Account and
     Settings", and the microphone keeps its place (`SearchBarItems`).
   - **One row (owner decision 2026-11-10: "I will take your
     recommendation for the one row").** The "Flight Plan" title bar is
     gone: the bar is the search field itself
     (`.searchable(placement: .toolbarPrincipal)`, `OneSearch`'s
     `oneRow`), the microphone and the account beside it, as Maps' search
     row. Under it, at half and full, the route card (`RouteCard`): the
     route (KMSN → KOSH) with the engine's Ready to Fly line and the
     route's ••• at its right; the figures in one line (distance, ETE,
     fuel, altitude, airplane); Brief, Nav Log and Airplane; then the
     route itself (From and To, Routes, the airplane and the altitude),
     the stops and the rest of the plan. At the pill, the search row
     alone. With no route, the same place holds Favorites, Recents, Find
     Nearby and Nearest. Saved Flights, Share and Undo moved from the bar
     into the route card's ••• with the Profile and Clear Route; Undo
     stays on shake and the Edit menu (UndoManager); the stops' Edit is
     at the Stops header's right. Cards still cover the search with
     their ✕ (the card rule).
   - Still the owner's to decide (2026-11-10): the altitude picker, a
     wheel or a list like ForeFlight's Altitude Advisor.
   - Use `.searchable(text:placement:prompt:)` and
     `searchToolbarBehavior`.
   - One field finds airports, navaids, fixes, airspace, procedures,
     traffic by N-number, and places (Overture).
2. **Before typing** (the same sections in the plan itself before
   there is a route, `BrowseSections`):
   - Recents.
   - Favorites, as a horizontal strip of ident tiles.
   - "Find Nearby" chips for the Stops kinds (Fuel, Food, Repair,
     Training), in their `color.badge.stop-*`.
   - Nearest.
   - Show recents only if the pilot keeps history on ([HIG
     Searching][hig-searching]: "Take privacy into consideration before
     displaying search history").
3. **While typing:**
   - Results update with each letter, using `searchSuggestions` for
     completions.
   - Results are grouped by kind in sections (Airports, Navaids and
     fixes, Airspace, Places), broadest first.
   - A scope bar narrows the kind (`searchScopes`), defaulting to All.
4. **A result row:**
   - leading, a badge in its kind's colour (`color.badge.*`, rounded
     `radius.badge`)
   - the ident in `type.label`, then the name in `.body`
   - second line: the city, and the distance and bearing from the
     airplane or the map's centre
   - trailing: the field's flight category pip, for an airport with a
     report
5. **Tapping a result** opens its card over the sheet, and the map frames it with the selected ring
   (`color.chart.selected`).

**Primary action.** The return key opens the top result. There is no
separate Search button.

**Detents:**

- pill: the field and the avatar.
- medium: recents and Find Nearby, or the results.
- large: the full list.

Focusing the field moves the sheet to large, because the keyboard needs
the room.

**Motion and feel.** Results appear without animation as letters come
in (frequent motion, [HIG Motion][hig-motion]). No haptic.

**Avoid:**

- a second search anywhere else
- a Search button
- an alert for "no results": use
  `ContentUnavailableView.search(text:)`
- dimming the map behind recents

**Sources:** [HIG Search fields][hig-searchfields];
[HIG Searching][hig-searching]; [Get started with Maps][sup-maps-start];
[Find nearby][sup-maps-nearby]; [apple.com/maps][apple-maps];
[Find settings][sup-settings] (search at the bottom of Settings).

---

## 2. The airport card and the airplane card

### 2a. The airport card: match the Maps place card

**Follow: the owner's screenshot of Apple Maps, iOS 27, 2026-11-09.** It
is a coffee shop's place card, measured at 393 pt wide at his larger
text size. Top to bottom:

1. **A header photo** across the card's top, fading into the card's
   grey.
   - A glass round **Share** button sits top-left over the photo and a
     glass round **Close** (✕) top-right.
2. **A logo tile**: a white rounded square, about 72 pt, overlapping
   the photo's fade, centred.
3. **A large centred title**, "Hometown Coffee & Juice", bold, wrapping
   to two lines.
4. **A subtitle**: "Coffee Shop · Lake Forest, IL ›", grey, with the
   town as a link.
5. **A row of four equal action buttons**, each about 84 × 57 pt with
   a symbol over a word.
   - The **first is filled blue**, with the travel time: a car and
     "18 min".
   - The other three are pale-tinted: Call, Website, Menu.
6. **A facts row** of four columns, each a grey caption over a value:
   - Hours: Closed, in red
   - 37 Ratings: 86%
   - Accepts: payment glyphs
   - Distance: 9.3 mi
7. **A white rounded card**, "Rate This Place / Visited 2 days ago",
   with round thumb buttons.
8. **A horizontal row of large image tiles** with titles over the
   photos ("From the Business", "Food & Drink", and more).
9. **About**, and the rest below.
10. **A floating glass capsule toolbar** at the foot over the content:
    Add (+), Favorite (☆), Rate (👍) and More (•••).

The owner also observed that **at the medium detent the photo is gone**.
The card starts with the title, then the actions and the facts.

**Corroboration from Apple's guide:**

- A place card has a directions button, then on scrolling the address,
  phone, website and reviews ([Get information about
  places][sup-maps-places]).
- An Add button sits "near the bottom", and the More (…) button holds
  Add to Places, Add a Note and Add Your Photos ([Add places][sup-maps-add]).
- Rating is a per-category Like or Dislike ([Rate places][sup-maps-rate]).
- The full top-to-bottom order is not written on any Apple page
  (**unverified** except by the screenshot).
- HIG Maps: "Keep the location on your map visible when displaying a
  place card" ([HIG Maps][hig-maps]).

**Wingtip's airport card, top to bottom (detent: large):**

1. **The header photo:** the field's picture, a satellite or aerial
   view. Its bottom 40% fades into `color.theme.*.sheet`.
   - Glass round Share at the leading top, glass round Close at the
     trailing top. Use `.buttonStyle(.glass)` in a `GlassEffectContainer`.
   - Close goes back one level.
   - With no picture, the photo row is left out and the card starts at
     the tile. Never show a placeholder photo.
2. **The ident tile**, centred over the fade.
   - A white rounded square with the ident in `type.label` large, the
     towered blue or untowered magenta from `color.chart.towered` and
     `untowered`.
   - Or the field's own logo where one exists.
3. **The title:** the field's name in `type.hero` (`.title` bold),
   centred, wrapping and never truncated.
4. **The subtitle:** "Class D · Frederick, MD ›" in `.subheadline` grey.
   - The airspace class is a link to the airspace card, and the city to
     the map.
5. **The action row**, four equal buttons at `gap-2`, each a symbol
   over a word. Each is at least 44 pt high; they measure about 57.
   - **First, filled** (`.glassProminent`): **Direct To** with the ETE
     from the engine ("18 min").
     - With no airplane picked it reads "Direct To" with the distance
       instead ("24.0 nm"). It never shows a time from an assumed
       airplane.
     - With a route, the first button is **Add to Route**.
   - **Then, pale-tinted**, the field's most-used actions: Weather
     (opens its METAR/TAF section), Frequencies (copy on hold), and
     Diagram.
   - These four are the owner's call; this keeps the pattern. Today's
     order and tabs ("airport tabs after the buttons, diagram first")
     stay unless he changes them.
6. **The facts row:** four columns, each a `.footnote` grey caption
   over a `.headline` value. The engine's figures:
   - **Category:** VFR, MVFR, IFR or LIFR, in its `color.category.*`
     colour, as Maps colours "Closed" red.
   - **Wind:** "270° 12G18 kt".
   - **Runway:** the engine's best runway for that wind, with its
     crosswind.
   - **Distance:** from the airplane, or from the map's centre when
     there is no fix.

   At AX sizes the row becomes a 2 × 2 grid.
7. **Cards**, white and rounded `radius.card` on the grey: the live
   ones first.
   - An alert card: a TFR, a NOTAM that closes a runway, or the field's
     own hazards.
   - A "Your last visit" card from the logbook, in place of Maps'
     "Rate This Place".
8. **The image tiles row:** large tiles that scroll sideways (Diagram,
   Approach Plates, Departure Procedures, Look Around/3D), each titled
   over its picture. The diagram comes first (owner's A2 pick).
9. **The sections:** Info, Weather, Runways, Charts, Frequencies, Fuel
   and services, Remarks. Each is a `Section` in an inset-grouped
   `List`.
   - The Info / Weather / Runways / Charts switch is `.pickerStyle(.tabs)`
     (iOS 27, already adopted). Apple says it looks like a segmented
     control, but VoiceOver reads it as tabs.
10. **The floating glass toolbar** at the foot, over the content:
    - Add to Route (+), Favorite (☆), Set as Home, and More (•••)
    - More holds Hold Here…, Copy Ident, Report a Problem and Open in
      ForeFlight
    - It sits in a `safeAreaBar(edge: .bottom)` as one glass capsule

**Detents:**

- **pill:** the ident tile, small and leading; the name; the category
  pip; the Direct To ETE.
- **medium:** no photo. The title (as `type.card`, `.title2`), the
  subtitle, the action row and the facts row. This matches the owner's
  observation of Maps.
- **large:** the photo fades in above, the title grows to `type.hero`,
  and everything below shows.

**Motion and feel.**

- The card rises over the plan as the system sheet does (no zoom; §0 Motion).
- The photo crossfades in at the large detent.
- The facts animate with `.numericText()` when a new METAR arrives.
- Direct To plays `haptic.direct-to`.

**Avoid:**

- A photo at medium.
- A filled style on more than one button.
- Coloured symbols on glass: colour the fill of the one primary
  button instead ([HIG Color][hig-color]).
- Truncated names.
- A computed figure in the view.
- A Back button.

**Sources:** the owner's screenshot (2026-11-09);
[Get information about places][sup-maps-places]; [Add places][sup-maps-add];
[Rate places][sup-maps-rate]; [HIG Maps][hig-maps];
[HIG Sheets][hig-sheets]; [HIG Color][hig-color];
[HIG Buttons][hig-buttons]; [HIG Toolbars][hig-toolbars].

### 2b. The airplane card: your airplane, and an airplane in traffic

**Follow:**

- **Wallet's pass details for your own airplane.**
  - A stacked card.
  - Tap it for details, with More or Info leading to settings switches.
  - "Suggest on Lock Screen" when the pass is relevant ([Manage
    passes][sup-wallet-manage]).
  - iOS 27 passes allow up to two featured actions ([WWDC26 209][wwdc-209]).
- **Find My's item card for an airplane tracked in traffic.**
  - The name, then "location and timestamp", then the actions: Play,
    Directions, Find ([Locate an item][sup-findmy-item];
    [Locate a device][sup-findmy-device]).
  - Lists sit over the map ([Locate a device][sup-findmy-device]).
- **Flighty's flight card for a tracked flight's phase words.** For
  example "Departed Gate", "Taxiing for 13m", "Landed / It's 6:32am
  (22m early)" ([flighty.com][flighty]).

**Your airplane, top to bottom:**

1. A **pass-like hero card**, white and rounded `radius.card` (navy at
   night). On it:
   - the N-number in `type.hero`
   - the type designator and name in `.subheadline`
   - the airplane's photo, if the pilot added one
   - the equipment suffix as a chip
2. **Facts row:** cruise TAS, burn, usable fuel and empty weight. These
   are the pilot's own entries, shown as entered. An empty one shows a
   dash and an Add row, never a typical figure.
3. Sections: Performance, Weight and Balance, Checklists, Squawks and
   Documents, as inset-grouped rows with badges.
4. The primary action sits in a bottom bar: **Use for This Flight**,
   when it is not the airplane in use.

**No airplane picked:** `ContentUnavailableView` reading "Pick an
Airplane", with a Pick an Airplane button and Your Airplanes below. No
figures anywhere depend on a default type.

**A traffic airplane, top to bottom:**

1. Ident or N-number, title-sized.
2. Type, then "1,500 ft below · 4.2 nm at 2 o'clock", then the
   timestamp "Seen 12 s ago".
3. Actions: Follow (filled), Track History and Share.
4. A facts row: altitude, ground speed, track and vertical rate, in
   `type.figure` digits.
5. The flight's phase line in Flighty's words, where ADS-B gives it.

**Detents:**

- pill: ident and relative position.
- medium: actions and facts.
- large: track history and the registry.

**Avoid:**

- Wallet's stack animation for a single airplane. Use a stack only on
  Your Airplanes when there are several.
- Showing a stale position as live. Grey the mark, with its age.

**Sources:** [Manage passes][sup-wallet-manage];
[Use passes][sup-wallet-use]; [WWDC26 209][wwdc-209];
[Locate an item][sup-findmy-item]; [Locate a device][sup-findmy-device];
[flighty.com][flighty]; [HIG Lists][hig-lists].

---

## 3. The flight plan and route editing

**Follow:**

- **Maps directions** ([Use Maps][sup-maps-use];
  [Driving directions][sup-maps-drive]; [Stops][sup-maps-stops];
  [Route overview][sup-maps-overview]):
  - Route option cards, each with "the estimated time and distance, and
    a Go button". Colour on each route shows traffic.
  - "Options" sits below Directions.
  - Stops: up to 14, reordered by a drag handle, swiped to delete, with
    Add Stop.
  - During navigation the route card sits at the bottom with Add Stop
    and End Route.
  - Tapping the route card shows the list of turns, with Share at the
    bottom.
- **HIG Lists:** "Prefer displaying text in a list" ([HIG Lists][hig-lists]).

**Structure, top to bottom (the FPL tab):**

1. **The route box.**
   - The route as pills: departure, the waypoints and the destination,
     each tappable to its menu.
   - Routes, Brief and ••• on the pills' first line, with ✕ in •••
     (owner's rule; positions unchanged).
2. **The figure strip:** To, Dist, ETE and Fuel, in `type.figure`
   digits, from the engine. The fuel is a dash without an airplane.
3. **Cruise:** the altitude in FL-045 form, a button that opens the
   Profile: its slider and Altitude Advisor are the one place the cruise
   is set (see [The profile](#the-profile-foreflights-way)). There is no
   typed cruise field: one control, one source of truth (2026-11-10).
4. **Route options**, after Routes: up to four cards (Direct, Fastest,
   Most Filed, Economical). Each shows its time, distance and fuel and
   has its own **Use** button, as Maps' route cards each carry Go.
   Browsing them draws the line on the map; Use commits it.
5. **Stops, in route order.**
   - A `List` with `onMove` (iOS 18+), or `reorderable()` where a reorder
     is needed outside a `List` (iOS 27).
   - Swipe to delete.
   - "Add a Stop After" in each row's menu.
   - After a delete or a change, the system's **Undo**: the window's
     `UndoManager`, so shake, Command-Z, the Edit menu and an Undo button
     in the sheet's bar (`arrow.uturn.backward`, shown while there is
     something to undo) all take it back. Never a toast or an alert
     ([HIG Alerts][hig-alerts]).
6. **Options:** flight rules, departure time and airplane, as menus
   (`Picker` with `.menu`), not sliders.

**A waypoint's menu.** Use `contextMenu` with a preview, and the
navigation verbs in order:

1. Direct To
2. Set Altitude…, which opens the Profile on that waypoint's Start At /
   Cross At popover (no typed alert of its own)
3. Hold Here…
4. Add a Stop After
5. Remove, last and destructive

HIG Menus: "Prefer listing important or frequently used menu items
first", and destructive items go "at the end" ([HIG Menus][hig-menus];
[HIG Context menus][hig-contextmenus]). The same actions must also be
reachable in the main interface ([HIG Context menus][hig-contextmenus]).

**Primary action.** Brief, in the route box (as now). In flight, the
route card at the foot holds Direct To and End Flight, as Maps' route
card holds Add Stop and End Route.

**Detents:**

- pill: the route box's first line and the figure strip.
- medium: plus cruise and the stops.
- large: plus options and the route options.

**Motion and feel.**

- An altitude set plays `haptic.altitude` (selection).
- Direct To plays `haptic.direct-to`.
- A reordered row moves with the system's own animation.

**Avoid:**

- sliders for discrete settings
- an alert to confirm a delete that can be undone
- recomputing a leg in the view
- moving Routes, Brief or ••• without the owner

**Sources:** [Use Maps][sup-maps-use]; [Driving directions][sup-maps-drive];
[Stops][sup-maps-stops]; [Route overview][sup-maps-overview];
[HIG Lists][hig-lists]; [HIG Menus][hig-menus];
[HIG Context menus][hig-contextmenus]; [HIG Pickers][hig-pickers];
[HIG Alerts][hig-alerts]; [WWDC26 269][wwdc-269] (reorderable containers).

### The profile, ForeFlight's way

The owner's spec of 2026-11-10, after ForeFlight's profile view; the
same on the web and Android. Code: `apps/ios/Wingtip/Profile/`, one
view model (`ProfileModel`), every figure the engine's (`ProfileRules`:
`profile_clearance`, `altitude_advisor`).

- **Full height.** The Profile opens at the large detent from every way
  in (the strip, a card, Ready to Fly's fix), so the slider's drag is
  never the sheet's.
- **The slider.** The system `Slider`, turned a quarter beside the
  chart: the iOS 27.2 SDK's `SwiftUI` swiftinterface has no vertical
  orientation, so no control is drawn by hand. It steps through the
  engine's altitudes (`altitude_wheel`'s rows) and only previews: a
  dashed rule at the altitude, and the ground coloured live, Chart
  Warning red within 100 ft (or above it) and Chart Caution amber within
  1,000 ft. These are ForeFlight's display defaults, not 14 CFR; the
  legal floors (91.119, 91.177) are the legal altitudes' own.
  - **Set** (the one prominent button) flies the preview; nothing
    changes before it.
  - **Auto**, in flight only (`InFlight.underway`), a button-style
    `Toggle`: the preview follows the GPS altitude.
  - The slider is 44 pt across, its stock size kept.
- **A waypoint.** A tap within 22 pt of one (a 44 pt target) opens a
  `.popover`, kept a popover on the iPhone
  (`presentationCompactAdaptation(.popover)`): the altitude as a menu
  `Picker`, or typed in feet for an altitude off the engine's steps (a
  field's elevation), **Start At** or **Cross At** as a segmented
  control, Set and Reset. A stop's "Set Altitude…" opens the Profile on
  this popover; it is the only way a point's altitude is set. VoiceOver reaches each waypoint as an accessibility action of
  the chart ("Altitude at KLVK").
- **The Altitude Advisor.** The cruise is chosen from a `List` section:
  one row per altitude, highest first, with time, fuel and the head or
  tail wind, **Fastest** and **Most Economical** marked and the flown
  row ticked. A row outside the legal altitudes stays a tap, its warning
  under it (warn, never limit). With no airplane, time and fuel are a
  dash.
- **VoiceOver.** The slider is the stock adjustable element: a swipe up
  or down steps one altitude, and its value is the engine's words, "3,500
  ft, terrain within 500 ft near KXYZ". The chart's value says the same.

---

## 4. The nav log

**Follow:**

- **HIG Lists and tables:** "Keep item text succinct" and "preserve
  readability of text that might otherwise get clipped"
  ([HIG Lists][hig-lists]).
- **HIG Toolbars:** minimize the bar while reading
  ([WWDC26 269][wwdc-269]).
- **Maps' list of turns:** tap the route card to see every step, with
  Share at the bottom ([Route overview][sup-maps-overview]).

**Structure, top to bottom:**

1. Large title "Nav Log". The bar minimizes on scroll
   (`toolbarMinimizationBehavior(.onScrollDown, for: .navigationBar)`,
   already adopted). Share is pinned trailing (`.topBarPinnedTrailing`).
2. **Totals** as one facts row: distance, ETE, fuel and the arrival
   time in Zulu.
3. **The legs.** One `List` row per leg:
   - the fix's ident in `type.label`
   - the magnetic course, the heading with the wind correction, the
     distance, ground speed and leg time (`0:18`, the nav log's own
     form)
   - each in tabular digits

   The selected row opens its **compact grid**: the shorthand leg grid,
   not smaller text (owner's rule). On iPad, and on iPhone in landscape
   with regular width, use `Table` with sortable columns.
4. **The profile:** a Swift Charts area of the terrain
   (`color.chart.terrain`) under the planned altitude. The ground near
   the airplane is in caution amber, and the line turns warning red
   where terrain or an obstacle is at or above it.
   - Axes in feet and nm.
   - Not interactive-only: the figures are also in the rows
     ([HIG Charts][hig-charts]: "don't require interaction to reveal
     critical information").

**Primary action.** Share or Print (the kneeboard PDF), in the bar.

**Accessibility.** Each figure is said in full with the `format.spoken-*`
tokens: "three four six degrees magnetic", "one hundred two point four
nautical miles". Swift Charts gives Audio Graphs ([HIG Charts][hig-charts]).

**Avoid:**

- shrinking text to fit a column: wrap or move it to the grid instead
- horizontal scrolling on iPhone
- a chart as the only place a figure is

**Sources:** [HIG Lists][hig-lists]; [HIG Charts][hig-charts];
[HIG Charting data][hig-chartdata]; [Route overview][sup-maps-overview];
[WWDC26 269][wwdc-269].

---

## 5. Brief, Go / No-Go and Ready to Fly

**The alternate, under IFR (2026-11-10, as the web's).** The plan's
Route section has an **Alternate** row after the destination: the one
filed (marked "Under minimums" in the problem ink where it is), or "Add
Alternate" (amber, "Required", where the destination needs one). It
opens the alternate's page, the same `List` sections the Brief shows
after its forecast: the destination's check (14 CFR 91.169(b), the
engine's `ifr_alternate_destination` over the window `ifr_alternate_window`
gives), the one filed against its minimums at the ETA there (91.169(c),
`ifr_alternate_check`) with its published minimums' page and Take It
Off, and the fields that will do, each filed with a tap. All of it is the
planner's `/api/alternate`, its reasons shown in the engine's words. The
filed alternate goes to the nav log as `alternate` (the leg on to it,
`navlog_alternate_leg`, is the nav log's Alternate section and its fuel
is in the totals, 91.167(a)(2)) and to the Go / No-Go with `rules=ifr`.
With no airplane the section asks for one (no stock cruise speed), and
with no nav log yet it says it waits for the ETA.

**Follow:**

- **Weather's way of putting the takeaway first.** "Weather provides a
  title and subtitle that succinctly describe the expected
  precipitation for the next hour" before the chart
  ([HIG Charts][hig-charts]).
- **Weather's main screen.** Its alerts module comes before the detail
  modules ([Check the weather][sup-weather]).
- **Health's Summary.** Pinned items first, then Highlights, then Trends,
  each with Show All ([View health data][sup-health]).
- **Wallet's "Suggest on Lock Screen"** for something relevant at a time
  ([Manage passes][sup-wallet-manage]).

**Brief, top to bottom:**

1. **The verdict as a title and subtitle.**
   - "Go: VFR the whole way" or "Caution: MVFR at KHGR by 1500Z", in
     `type.card`.
   - The verdict word takes its colour (`go-ink`, `caution-ink`,
     `destructive-ink`), with a symbol as well as the colour
     ([HIG Accessibility][hig-a11y]: "Convey information with more than
     color alone").
   - The engine decides the verdict.
2. **At most three one-line actions**, the owner's "look and go" rule.
   For example "Leave by 1430Z", "File IFR", "Check KFDK NOTAM".
3. **Hazards on the legs:** TFRs, convective SIGMETs and AIRMETs, as
   rows with their `color.weather.*` badge, each opening its area on
   the map.
4. **Departure, en route and destination** as cards, each with the
   flight category, wind and ceiling.
5. **Go / No-Go**, each line of personal minimums against the forecast.
   - The figure is in caution or warning colour where it is past a
     minimum, with the minimum beside it.
   - It is never a blocking switch: **warn, never limit**.
   - The pilot can still go on to Ready to Fly.
6. **Raw reports**, folded at the end and kept as sent.

**Ready to Fly**, top to bottom:

1. A short checklist: weather, NOTAMs read, weight and balance, fuel,
   currency, airplane documents.
   - A checkmark and the engine's word for each.
   - A row needing attention opens where it is fixed, pushed in the
     Brief's card with Back (the Airplane page, the Profile).
2. **The prompt** over a dry run's or a flight's start, while something
   is missing: one stock alert, "Ready to Fly?", its line and the most
   pressing actions, with Fly Anyway, Open the Brief and Not Yet (the
   owner's card rule, 2026-11-10: "Ready to Fly is one section, plus one
   stock prompt").
3. **The primary action**: **Start Flight** in a bottom bar
   (`safeAreaBar(edge: .bottom)`, `.glassProminent`). It starts the
   Live Activity (§15).

**Detents:**

- pill: the verdict word and its pip.
- medium: the verdict, the three actions and the hazards.
- large: everything.

**Motion and feel.** A verdict that changes on refresh crossfades its
word. A new caution plays `haptic.warning` once, never on every refresh.

**Avoid:**

- footnotes under figures
- a modal "Are you sure?" on No-Go
- a dashboard of gauges: HIG says "Not every collection of data needs
  to be displayed in a chart" ([HIG Charting data][hig-chartdata])

**Sources:** [HIG Charts][hig-charts]; [HIG Charting data][hig-chartdata];
[Check the weather][sup-weather]; [View health data][sup-health];
[Manage passes][sup-wallet-manage]; [HIG Accessibility][hig-a11y];
[HIG Feedback][hig-feedback].

---

## 6. NOTAMs

**Follow:**

- **HIG Search fields with scope bars:** "Default to a broader scope and
  let people refine it" ([HIG Search fields][hig-searchfields]).
- **HIG Lists:** a grouped style with headers ([HIG Lists][hig-lists]).
- **Files' sort menu** (Name, Kind, Date) under More
  ([Find and view files][sup-files-find]).

No Apple app shows notices in this form. The list structure is the
HIG's (**[inference]**).

**Structure, top to bottom:**

1. Large title, with `.searchable` and scopes: All, Departure, En Route,
   Destination, TFRs.
2. **Sections by place**, each sorted by what matters to the flight:
   - runway and airport closures first, then navaids, then the rest
   - each section's header is the ident and its count
3. **A row:**
   - a leading badge for its kind (`color.badge.runway`, `hazard`,
     `lights` and so on)
   - the plain-language summary in sentence case
     (`lib/advisories faaWords`) in `.body`
   - the effective times in Zulu, and "in effect now" or "from 1400Z"
     in `.subheadline`
4. **Tapping a row** pushes it in full: the summary, then the raw NOTAM
   in a monospaced block, kept as sent and selectable for copying.
5. **More (•••)** sorts the list by Time, Kind or Distance.

**Primary action.** None. It is a reading screen. On Brief, a NOTAM that
matters appears as one of the three actions.

**Avoid:**

- uppercase raw text as the row's main line
- badges coloured like flight categories
- an index down the side

**Sources:** [HIG Search fields][hig-searchfields];
[HIG Lists][hig-lists]; [Find and view files][sup-files-find].

---

## 7. Weather and the radar loop

**Follow: Apple Weather.**

- **The main screen** ([Check the weather][sup-weather]):
  - "the location, current temperature, the high and low temperatures
    for the day, hourly forecast, and the first few days of a 10-day
    forecast"
  - "Tap a symbol above the hourly forecast to switch between
    Conditions, Precipitation, and Wind"
  - detail modules: severe alerts, wind, visibility and more
  - wind can be set to **knots**
- **The weather map** ([Weather maps][sup-weather-maps]):
  - full screen, with layers for precipitation, temperature, air
    quality and wind
  - Close and a legend at the top left
  - "Overlay Menu, Current Location and Locations stacked at the top
    right"
  - a **timeline along the bottom**, with **1h / 12h** buttons for
    precipitation

**A field's weather, top to bottom:**

1. **Title and subtitle:** the ident and name, then the flight category
   word in its colour with "Wind 270° 12G18 kt · 1450Z, 12 min ago". The
   report's age is always shown.
2. **Severe weather first:** a card for any SIGMET, convective SIGMET,
   AIRMET or TFR touching the field, in its `color.weather.*`.
3. **The forecast strip:**
   - The TAF's periods scroll sideways, like Weather's hourly forecast.
   - A `.tabs` picker above it switches Conditions, Wind and Ceiling
     ([HIG Segmented controls][hig-segmented]: no more than about five
     segments on iPhone).
4. **Modules** in a two-column grid of rounded cards:
   - Wind, with a runway crosswind gauge (`Gauge`, `.accessoryCircular`
     style only on the Lock Screen)
   - Visibility, Ceiling, Altimeter, Temperature/Dew point
   - Density altitude, from the engine
   - Each card is a title, a large figure and one line. At AX sizes the
     grid becomes one column.
5. **Raw METAR and TAF**, kept as sent, selectable.

**The radar loop (map overlay), Weather's map:**

- **The layer menu, the location button and Locations** stack in glass
  at the top trailing.
  - The layer menu is a `Menu` with NEXRAD, Satellite, Ceiling,
    Icing, Turbulence and Winds aloft, each with a checkmark.
- **The timeline** sits along the foot, over the sheet's pill, in a
  glass bar.
  - Play/Pause, the frame's time in Zulu, and a scrubber.
  - Step buttons switch the loop between **1h / 3h** of radar or
    forecast, as Weather's 1h/12h [inference: the spans are Wingtip's
    choice].
- **The NEXRAD levels** use `color.chart.nexrad-1…7`, with a legend
  tile beside the layer menu.
- **The loop does not start by itself** under Reduce Motion, or when
  `systemPrefersReducedResourceUsage` is true (iOS 27, already adopted).

**Detents:** the loop needs the map, so opening the loop moves the sheet
to the pill. Medium shows the field's weather; large shows the modules.

**Avoid:**

- auto-playing animation under Reduce Motion
- hiding the frame's age
- colouring hazards like flight categories
- a raw METAR as the headline

**Sources:** [Check the weather][sup-weather];
[Weather maps][sup-weather-maps]; [HIG Charts][hig-charts];
[HIG Gauges][hig-gauges]; [HIG Segmented controls][hig-segmented];
[iOS 27 docs: systemPrefersReducedResourceUsage][doc-reducedresource].

---

### Airport weather marks on the map (2026-11-10)

On the chart, the owner's pick of 2026-11-10. Each reporting field wears its flight
category as a ring about 4.5 points wide round the chart's own symbol
(Halo, the default), or ForeFlight's filled dot in its place (Dot). From
zoom 10 in, a station model adds the wind barb (the engine's `wind_barb`:
flags, barbs and half-barbs to the nearest 5 kt, a circle for calm,
FAA-H-8083-28A 25.2.3.4.5) and two lines, the visibility with its weather
("2 SM BR") and the ceiling with its cover ("OVC 008", "VV 002", from the
planner's `ceiling_cover`). At any zoom an arrow shows the way the wind
blows, with "18G26", where the engine's `wind_arrow` gives one (10 kt or
more, or gusting); it is red only where the field's `least_crosswind` is
more than the picked airplane's demonstrated crosswind (its POH's, on
`/api/aircraft-profiles`), and never red with no airplane or no figure. An
amber ↓ marks a plan's field whose TAF for the pilot's time there is worse
than its METAR now (`weather_worse`); under IFR the alternates (the one
filed and those offered) wear it too, their TAF at the ETA there (the
planner's `/api/alternate`) against the map's own METAR of the field. The weather comes on the map's own
`/api/airports/in-view` answer (`weather`), the same for every app; the
shared fixture is `apps/web/src/lib/fixtures/airportWeatherMarks.json`. A
screen reader says each field's category and wind ("KJVL, IFR, wind 220
at 18 gusting 26"). The Map card's Airport Weather is a segmented
`Picker` (Off, Halo, Dot, Station) with three `Toggle`s: Station Model
When Zoomed In, Wind Arrows and Getting Worse by Arrival, all on by
default.

## 8. The emergency assistant

**Follow:**

- **HIG Modality:** for complex or urgent flows, "consider alternatives
  to sheets" such as a full-screen modal; "Always give people an obvious
  way to dismiss a modal view" ([HIG Modality][hig-modality];
  [HIG Sheets][hig-sheets]).
- **HIG Going full screen:** "Continue to provide access to essential
  features" ([HIG Full screen][hig-fullscreen]).
- **HIG Accessibility:** large targets; information not by colour alone
  ([HIG Accessibility][hig-a11y]).
- **Find My's list over the map, each card with Directions**
  ([Locate a device][sup-findmy-device]).

No Apple app's emergency screen was verified (Emergency SOS is a system
feature, not checked).

**Structure (`fullScreenCover`, the map still visible in its top
third):**

1. **The bar.** A Close (✕) at the top right, where iOS puts the
   system's close and every card of the app has it (the owner's card
   rule, 2026-11-10), which ends the emergency view only, and the title
   "Emergency". HIG Modality asks only that a full-screen modal have a
   clear way out; it names no other edge, so the platform's own place
   for close stands.
2. **The map**, with the line to the field picked in
   `color.chart.emergency` and the glide ring.
3. **Squawk 7700 and 121.5**, as two large figure tiles. They copy on
   tap, and VoiceOver says them in full.
4. **The nearest fields**, a `List`. Each row is ident, distance and
   bearing, the longest runway, and the flight category. Each row has
   one filled **Direct To** button, the row's primary action. With no
   planner the fields are the cycle packs' (`PackFields`), ranked by the
   engine, under one row: "From this iPhone, without weather". A Direct
   To with no connection is not made, and "Not changed: no connection"
   is said under the list; the rows keep the engine's heading and
   distance. With no fix the section says so, never a spinner forever.
5. **The checklist** for the airplane picked. With none picked it is
   the generic one, labelled as such: never a type assumed.

**Typography.** At least `.title3` for the rows, and `type.figure` for
7700 and 121.5. It must lay out at AX5 with no truncation, in one
column.

**Feel.** `haptic.warning` once on opening. Direct To plays
`haptic.direct-to`. No other motion; the map recentres without
animation under Reduce Motion.

**Avoid:**

- alerts on top of it
- an action sheet that scrolls
- any control under 44 pt
- red text for anything but the line and the destructive Close
- glass over the list: solid grounds read better in a hurry

**Sources:** [HIG Modality][hig-modality]; [HIG Full screen][hig-fullscreen];
[HIG Sheets][hig-sheets]; [HIG Accessibility][hig-a11y];
[Locate a device][sup-findmy-device].

---

## 9. The logbook

**Follow:**

- **Health's Summary:** Pinned, then Highlights, then Trends, each with
  Show All. A category's detail shows weekly, monthly and yearly views
  via "the tabs at the top of the screen" ([View health data][sup-health]).
  The D and 6M segments are **unverified** on iOS 27.
- **HIG Charts:** a "dynamic axis range", and bars from zero
  ([HIG Charts][hig-charts]).
- **Files for export:** `fileExporter` with a `WritableDocument` (iOS 27;
  `FileDocument` is deprecated) ([iOS 27 release notes][relnotes];
  [HIG File management][hig-files]).

**Structure, top to bottom:**

1. Large title "Logbook". Add (+) trailing; `.searchable` for remarks,
   airports and the N-number.
2. **Pinned: currency.** One card per currency (day passenger, night
   passenger, IFR, flight review), each with:
   - a status word and its date ("Current until 14 Jan")
   - a symbol and colour: go, caution or warning
   - The figures come from `/api/logbook/currency` (the gateway, until
     #482 moves the rule to the engine). The view never computes them.
3. **Highlights:** this month's hours, landings and approaches.
4. **Trends:**
   - A Swift Charts bar chart of hours, bars from zero.
   - The period switch at the top: Week, Month and Year, with
     `.pickerStyle(.tabs)`.
   - Show All.
5. **Entries:**
   - A `List` grouped by month: date, route ("KFDK → KHGR"), the
     airplane, and the total time on the trailing end.
   - Swipe to delete, then an Undo row.
6. **Export** under More, as a CSV or PDF through the file exporter.

**Add or edit an entry.** A sheet `[.medium, .large]`, with Cancel at
the leading edge and Save at the trailing edge (HIG Sheets 2026). A
draft from the auto-logbook is pre-filled and says so.

**Avoid:**

- pie charts
- colour as the only status signal
- a confirm alert for an undoable delete

**Sources:** [View health data][sup-health]; [HIG Charts][hig-charts];
[HIG Charting data][hig-chartdata]; [HIG Sheets][hig-sheets];
[HIG File management][hig-files]; [iOS 27 release notes][relnotes].

---

## 10. The coach

**Follow:**

- **Fitness Trends:** "the last 90 days compared with the last 365",
  shown as up or down arrows with coaching text
  ([Activity summary][sup-fitness]).
- **Fitness Summary:** cards the pilot can edit ("Edit Summary").
- **HIG Onboarding:** "Teach through interactivity" and context-specific
  tips ([HIG Onboarding][hig-onboarding]). TipKit's `TipView` and
  `popoverTip` are in the SDK.

**Structure, top to bottom:**

1. Large title "Coach".
2. **Next lesson:** one card with the title, why it is suggested, and a
   filled **Start** button.
3. **Trends:** approaches flown, landings and debrief scores, each with
   an up or down arrow and one line of coaching words. A trend needs
   enough flights before it shows; until then it says how many more.
4. **Practice:** quizzes, mock oral and drills, as rows with badges.
5. **Debriefs:** past flights, each opening its debrief.
6. **Instructor:** the CFI invited, endorsements, and the 61.93
   solo cross-country review.

**Primary action.** Start, on the next lesson card. In a running drill,
the drill's action sits in a bottom bar.

**Feel.** A correct quiz answer plays a success notification haptic,
and a wrong one an error haptic, sparingly ([HIG Haptics][hig-haptics]).

**Avoid:**

- streaks or badges that reward flying in poor weather
- mandatory tutorials ([HIG Onboarding][hig-onboarding]: make tutorials
  optional)

**Sources:** [Activity summary][sup-fitness];
[HIG Onboarding][hig-onboarding]; [HIG Haptics][hig-haptics].

---

## 11. The dry run and the forecast run

**Follow:**

- **Weather's map timeline** along the bottom
  ([Weather maps][sup-weather-maps]).
- **HIG Going full screen:** "Prioritize content by temporarily hiding
  toolbars", and offer a reliable way back ([HIG Full screen][hig-fullscreen];
  [HIG Toolbars][hig-toolbars]).
- **Clock's running timer:** Pause and Resume on the timer itself
  ([Set timers][sup-clock-timer]).

**Structure:**

1. **The map, full**: the sheet drops to the pill, and the map buttons
   fade (`motion.fade`).
2. **Glass playback bar** at the foot (`safeAreaBar(edge: .bottom)`):
   - Play/Pause (the primary action)
   - the simulated Zulu time
   - a scrubber along the route, with the legs as ticks
   - a speed menu (1×, 4×, 16×), not a slider
3. **The figure strip** above it. The figures are as they would be at
   that point and time, from the engine.
4. **Forecast run only:** the forecast valid time is beside the clock,
   so the pilot never mistakes a forecast for an observation. Hazards
   along the leg light as the airplane reaches them.
5. **Exit:** Close (✕) at the top leading, back to the plan.

**Behaviour.** The dry run flies on from a stop at once, with no ground
wait (owner's rule). Under Reduce Motion it steps from leg to leg
instead of animating.

**Feel.** Reaching a hazard plays `haptic.warning`.

**Avoid:**

- auto-start
- hiding Close
- leaving the timeline with no time label

**Sources:** [Weather maps][sup-weather-maps];
[HIG Full screen][hig-fullscreen]; [HIG Toolbars][hig-toolbars];
[Set timers][sup-clock-timer]; [HIG Motion][hig-motion].

---

## 12. ATC and the clearance

**Follow:**

- **HIG Lists** ([HIG Lists][hig-lists]).
- **HIG Text fields:** "Show a hint" and "show the appropriate keyboard
  type" ([HIG Text fields][hig-textfields]).
- **HIG Generative AI** (updated 2026-06-08): let people refine results
  ([What's new][hig-whatsnew]).
- **The owner's split (2026-11-10):** the mic (Ask by voice, `VoiceInput`)
  and the radio (`ClearanceListener`) are two features with two looks.
  The mic is the system's `mic`, breathing while it listens, the field
  saying "Speak your question" and the words typed into it as said. The
  radio is `antenna.radiowaves.left.and.right` with the variable-colour
  effect, "Listening to the radio…" and "Heard: …", in its own places
  (the captions, the ATC card, this sheet, the Live Activity).

No Apple app shows a clearance. The structure is the HIG's and the
owner's (**[inference]**).

**The clearance, top to bottom (a sheet `[.medium, .large]`):**

1. **Title "Clearance".** Cancel at the leading edge; **Done** at the
   trailing edge saves it to the plan.
2. **The heard words**, live while listening, then kept as heard.
3. **CRAFT**, as `LabeledContent` rows, each value in `type.figure`
   digits:
   - Cleared to
   - Route
   - Altitude, said "four thousand five hundred feet" by VoiceOver
   - Frequency, which copies on hold
   - Transponder
   - Each value the reader is unsure of shows caution colour and a
     "Check" word, and it is editable in place.
4. **Read back:** the full read-back line, in a single tappable block.

**ATC frequencies** on any card: a hold copies the frequency
(`FrequencyActions`), with a context-menu preview. There is no Tune
action anywhere.

**Feel.** A clearance read plays a success notification. A field the
reader could not parse plays a warning notification once.

**Avoid:**

- a full-screen listening card
- tiny monospaced raw text as the only form
- auto-applying a clearance to the route without Done

**Sources:** [HIG Lists][hig-lists]; [HIG Text fields][hig-textfields];
[HIG Sheets][hig-sheets]; [HIG Haptics][hig-haptics];
[What's new][hig-whatsnew].

---

## 13. Account and settings (Setup)

**Follow:**

- **Settings:**
  - "Your name" first (Apple Account), then grouped sections.
  - The **search field at the bottom** of Settings: "Results appear
    above the search field" ([Find settings][sup-settings]).
  - Before sign-in the top row reads "Apple Account"
    ([Apple Account][sup-account]).
  - Coloured row icons: **unverified** on iOS 27's pages.
- **HIG Settings:** "Minimize the number of settings", and "prefer
  letting people modify task-specific options without going to your
  settings area" ([HIG Settings][hig-settings]).
- **HIG Managing accounts:** "Delay sign-in for as long as possible",
  prefer a passkey or Sign in with Apple, and "help them delete it, not
  just deactivate it" ([HIG Accounts][hig-accounts]).
- **HIG Dark Mode:** "Avoid offering an app-specific appearance setting"
  ([HIG Dark Mode][hig-darkmode]).
  - Wingtip's Look (Wingtip, Glass Cockpit, Chart ink, Native) and
    Sunlight are a cockpit need, not a light/dark switch, so they stay.
    Native is iOS out of the box (the owner, 2026-11-10): no tint of the
    app's, the system's labels and grouped grounds by name
    (design/tokens.json `color.system`), the text styles as SwiftUI sets
    them, no brand haptics, corners or shadows (`Look.isStock` gates each
    modifier). The app names no global accent colour (project.yml), so an
    untinted control in Native draws in the system's own, `systemBlue`.
    The chart, the course, airspace, flight categories and the caution,
    go and no-go colours stay as they are in every look.
  - Night follows the system.

**Opened from** the account button beside the one search, by its tap
alone: its card over the plan, no menu between (the owner, 2026-11-10:
"When tapping the avatar just open the settings"), its pages pushed in
the card. The map's switches and the alerts left it for the Map card
(`MapSettingsView`), the map's own Map button's, as Maps' Choose Map
card; Settings' Map row opens the same card. What the
menu held -- the account and signing in or out, the Flying and Pilot
pages, Minimums, Guide, Downloads and About -- are this page's rows.

**Structure, top to bottom (inset-grouped `List`):**

1. **The account row:** the photo or initials, the name, and "Account,
   Records, Sync". Before sign-in it reads "Sign In", with what signing
   in adds.
2. **Tiles** (owner's Setup): FPL, Theme, Layout, Appearance.
3. **Groups**, each row led by a `color.badge.*` square
   (`radius.badge`):
   - **Flying:** Personal Minimums, Your Airplanes, Home Base
   - **Map:** Downloads, Layers
   - **Alerts**
   - **Assistant**
   - **About**
4. **Delete Account**, at the end of Account, destructive, with a
   confirmation ([HIG Accounts][hig-accounts]).

**Search.** If Setup grows past what fits in two screens, add
`.searchable` at the bottom, as Settings does. Today it does not need
one.

**Primary action.** None. Each row saves as it changes ("avoid making
people take an explicit action to save", [HIG File management][hig-files]).

**Avoid:**

- settings that belong on the screen they affect
- sliders for discrete values
- sign-in before the first useful screen

**Sources:** [Find settings][sup-settings]; [Apple Account][sup-account];
[HIG Settings][hig-settings]; [HIG Accounts][hig-accounts];
[HIG Dark Mode][hig-darkmode].

---

## 14. The welcome / first run

**Follow:**

- **HIG Launching:** "Launch instantly", "Restore the previous state",
  and a launch screen "nearly identical to the first screen", with no
  text ([HIG Launching][hig-launching]).
- **HIG Onboarding:** "Postpone nonessential setup flows", "Teach
  through interactivity", tutorials optional ([HIG Onboarding][hig-onboarding]).
- **HIG Accounts:** "Delay sign-in" ([HIG Accounts][hig-accounts]).
- **HIG Alerts:** "Avoid showing an alert when your app starts"
  ([HIG Alerts][hig-alerts]).

**The one exception: the planning-aid notice.** The very first launch
puts up one stock alert, "A Planning Aid, Not for Navigation", with the
planning-aid words and the listing's not-for-navigation paragraph and
one button, I Understand (`Navigation/PlanningAidNotice`). It is the
pilot-safety position the terms take and what App Review 5.1.5 looks for
in a moving-map app, so it is said before anything else, once; the
welcome card comes after it, and About keeps the words.

**Structure.**

1. **The launch screen** is the brand's ground (`color.brand.launch`,
   or `launch-night`) with the mark only.
2. **The map** opens at once on the chart. The sheet is at medium, with
   one welcome card in place of the tab content:
   - the title "Plan your first flight"
   - one line
   - one filled button, **Search an Airport**, which focuses the one
     search
   - "Not Now" below, plain
3. **Asks come only when needed.**
   - Location is asked the first time the pilot taps the position
     button or a "Nearest" figure.
   - Notifications are asked when they first set an alert.
   - The airplane is asked when a figure first needs one: "Pick an
     Airplane" in place of the figure.
4. **Tips** (TipKit `popoverTip`): one at a time, on the control they
   explain, and only after the pilot has had a chance to find it.

**Avoid:**

- paged carousels before the map
- asking for the airplane or an account up front
- an assumed default airplane to make the figures appear

**Sources:** [HIG Launching][hig-launching];
[HIG Onboarding][hig-onboarding]; [HIG Accounts][hig-accounts];
[HIG Alerts][hig-alerts].

---

## 15. Widgets, Live Activities and Control Center

**Follow:**

- **Flighty** (2023 Apple Design Award, Interaction). Apple describes its
  Dynamic Island in two phases:
  - **Before pushback** it works "like a departure sign at a big
    airport".
  - **From pushback** "the Dynamic Island switches over to flight
    progress bars and counters; the minimal presentation is a simple
    circular chart that tracks your flight's duration"
    ([Spotlight on the Dynamic Island][dev-dynamicisland];
    [ADA 2023][ada-2023]).
  - Flighty 4.11 shows the departure countdown "even in the compact
    Dynamic Island", with "a new arc showing your in-flight progress"
    ([App Store: Flighty][appstore-flighty]).
- **Wallet's boarding pass Live Activity:** flight status that can be
  shared ([Newsroom iOS 26][news-ios26]; [Wallet what's new][wallet-new]).
  How it is laid out phase by phase is **unverified**.
- **HIG Live Activities** (updated 2026-10-13) and **HIG Widgets**
  (updated 2026-10-13).

### The flight's Live Activity (`FlightActivityWidget`)

Started by Start Flight (Ready to Fly), or from a Control.

**Phases** (Flighty's model):

1. **Before departure:** the countdown to the planned departure time
   (`Text(timerInterval:)`), the route "KFDK → KHGR", and the departure
   field's flight category.
2. **Airborne:**
   - a progress bar along the route
   - the ETE to the destination
   - the next waypoint, and the distance to it
   - fuel remaining, from the engine, when the airplane is known
3. **Arrived:** the landing time and the block time. It ends 15–30
   minutes after landing ("15 to 30 minutes is adequate",
   [HIG Live Activities][hig-live]).

**Presentations** ([HIG Live Activities][hig-live];
[ActivityKit][doc-activitykit]):

- **Compact:**
  - leading: the route's progress arc
  - trailing: the ETE ("1:25" when the island is narrow, iOS 27
    `isDynamicIslandLimitedInWidth`, already adopted)
  - both link to the same screen
- **Limited width** (landscape, iPhone Duo, two or more activities on
  iPhone 18 Pro): fit "inside a 28pt-diameter circle". Leading only.
- **Minimal:** the circular progress chart, as Flighty's.
- **Expanded:** destination and ETE on top, the progress bar with the
  next fix in the centre or bottom, and one button at most (Open Nav
  Log).
- **Lock Screen:**
  - 14 pt margins, 84–160 pt high
  - medium weight or heavier
  - checked on the Always-On display
  - `activityBackgroundTint` in the brand navy at night
- **StandBy:** 2× scale; check it in Night Mode's red tint.
- **Watch Smart Stack and CarPlay:**
  - Declare the `.small` activity family and branch on `activityFamily`
    ([WWDC26 223][wwdc-223]).
  - CarPlay turns off buttons ([HIG Live Activities][hig-live]).

**Limits** ([ActivityKit][doc-activitykit]; [ActivityKit push][doc-activitypush]):

- At most eight hours, then up to four more on the Lock Screen.
- 4 KB of data.
- Updates only when a figure changes. Push at priority 5 unless it is a
  warning.
- An alert only for an essential update, such as fuel or a TFR ahead.

**Avoid:**

- notification-like layouts on the Lock Screen
- more than one interactive element
- animations over 2 s
- private data (the N-number only where the pilot allows it)

### Widgets (`WingtipWidgets`)

Next Flight, Airport Weather and Currency Status.

- **Small and medium** on the Home Screen. **Accessory rectangular,
  circular and inline** on the Lock Screen: currency, and a field's
  category.
- **No real-time data.** Show "Updated 1450Z" ("consider displaying
  text that describes when the data was last updated",
  [HIG Widgets][hig-widgets]).
- **Layout:** 16 pt margins, text 11 pt and up, Dynamic Type from Large
  to AX5.
- **Tinted and clear appearances.** Put the category pip in a
  `widgetAccentable` group, and never rely on its colour alone.
- **StandBy:** mark the background removable (`containerBackground`).
  StandBy support covers CarPlay as well.
- **Tapping** opens the exact screen, through its `design/screens.json`
  link.
- **Extra large:** `systemExtraLargePortrait` is in iOS 27's WidgetKit,
  but the HIG's table still says it is not supported on iPhone (a
  conflict between Apple's sources; leave it out).

### Control Center, the Lock Screen and the Action button (`FlightControl`, `OpenControls`)

- **`ControlWidgetButton`:** Start Flight (it starts the Live Activity:
  "launching a Live Activity from a control", [HIG Controls][hig-controls]),
  Emergency, and Nearest.
- **`ControlWidgetToggle`:** only for a true on/off state, with a symbol
  for both states.
- **Text:** a symbol, a title and an optional value. Action-button hint
  text uses verbs. Nothing sensitive is shown while locked.

**Sources:** [HIG Live Activities][hig-live]; [HIG Widgets][hig-widgets];
[HIG Controls][hig-controls]; [ActivityKit][doc-activitykit];
[ActivityKit push][doc-activitypush]; [WWDC26 223][wwdc-223];
[WWDC26 277][wwdc-277]; [Spotlight on the Dynamic Island][dev-dynamicisland];
[ADA 2023][ada-2023]; [App Store: Flighty][appstore-flighty];
[flighty.com help][flighty-help]; [Newsroom iOS 26][news-ios26];
[Wallet what's new][wallet-new]; [Dynamic Island guide][sup-dynamicisland];
[ControlWidgetButton][doc-controlbutton].

---

## 16. iPad layouts (and resizable iPhone windows)

**Follow:**

- **HIG Layout** (updated 2026-09-09): "Determine layout based on size
  classes, not device type or orientation", and "Keep functionality the
  same as size classes change" ([HIG Layout][hig-layout]).
- **HIG Sidebars** (updated 2026-06-08) and **Split views:**
  - a sidebar floats on Liquid Glass
  - "show no more than two levels of hierarchy"
  - "Prefer using a split view in a regular — not a compact —
    environment"
  - "persistently highlight the current selection"

  ([HIG Sidebars][hig-sidebars]; [HIG Split views][hig-splitviews])
- **WWDC26:** iPhone apps are resizable in iPhone Mirroring and on iPad.
  iPad windows dim when inactive (`appearsActive`) ([WWDC26 102][wwdc-102];
  [WWDC26 269][wwdc-269]; [WWDC26 278][wwdc-278]).
- **HIG iPadOS:** "minimizing modal interfaces and full-screen
  transitions" ([HIG Designing for iPadOS][hig-ipados]).

**Structure** (`SplitLayout`, as built):

1. **The sidebar** (`NavigationSplitView`, 320–420 pt): the tabs and
   their content, with the title inline.
   - The selected row stays highlighted.
   - Search is at the sidebar's top, the one search.
2. **The map** as the detail, across the screen. The chart extends under
   the sidebar (`backgroundExtensionEffect()`).
3. **The inspector** (`.inspector`, 320–440 pt): the second-level card,
   such as an airport, an airplane or a leg. It opens beside the map
   instead of over it.
4. **The figure strip** floats in glass along the map's foot, at most
   520 pt wide.
5. **Brief, Nav Log and Logbook** open in the sidebar's stack. A large
   `Table` takes the detail column only when the pilot asks for it in
   full (the nav log).

**Compact width** (Slide Over, a narrow window, iPhone Duo's outer
display, a resized iPhone window): the iPhone's sheet with detents,
chosen by size class (`RootLayout.of`).

**Pointer and keyboard:** hover effects on rows and map buttons, and
`keyboardShortcut` for search (⌘F), Direct To and the tabs.

**Avoid:**

- branching on `userInterfaceIdiom` for layout
- a sheet over the map on regular width
- three levels in the sidebar

**Sources:** [HIG Layout][hig-layout]; [HIG Sidebars][hig-sidebars];
[HIG Split views][hig-splitviews]; [HIG Designing for iPadOS][hig-ipados];
[HIG iPhone Duo][hig-duo]; [WWDC26 102][wwdc-102];
[WWDC26 269][wwdc-269]; [WWDC26 278][wwdc-278].

---

## 17. Stock components, and what is left hand-built

The owner, 2026-11-10: "Do em all": every hand-built component replaced
by a stock one, or redesigned round one. Stock components keep their own
behaviour; only the content, its order and the brand tokens are ours.

**Replaced (2026-11-10).**

| Was hand-built | Now |
|---|---|
| Route-choice chips (`RouteChipButton`, its 2 s fold) | `Picker` with `.menu` (`RouteWayPicker`), on the plan and the strip's head. The menu has no fold, so the fold went |
| The strip's chips (`InkChipStyle`) | `.bordered`, `.buttonBorderShape(.capsule)`, `.controlSize(.small)`, a 44-point `contentShape` round each |
| `AskPill` | Deleted: nothing used it any more (the one search took its place) |
| Forecast mode's tinted disc | `Toggle` with `.toggleStyle(.button)` |
| `ProminentButtonStyle` (a dimmed Fly) | `.borderedProminent` that is never dimmed; what isn't an N-number is said under the field (warn, never limit) |
| Undo bar and Undo rows | The window's `UndoManager` for the route, the logbook, saved flights and Favorites (airports and airplanes), with `UndoToolbarItem` in the bar while an undo stands. A deleted logbook flight or saved flight is sent to the gateway when its list is left |
| `Skeleton` | `.redacted(reason: .placeholder)` over the rows' own layout (`loading(_:)`) |
| Status capsules (the strip's verdict tag, Active Leg) | A coloured `Label`: symbol and word in the finding's or the tint's colour, as Weather states a condition |
| `SectionTitle` and `Section(title:)` | `Section("…")`, with `.headerProminence(.increased)` set once at the root |
| The forecast run's hand-drawn bars | Swift Charts: `BarMark` per leg, `RuleMark` at the run's time now |
| `MapLoading`'s turning mark | `ProgressView`; the mark is kept only on the static launch screen (and as the launch image in About) |
| `PlanHistory`'s own past and future stacks | Each route change registered on the window's `UndoManager` with the route as it was (`levelsOfUndo` 50); an Undo puts it back and the system makes that the Redo |
| Glass's Reduce Transparency overrides and `glassScrollEdges` | Plain `glassEffect` and materials, and the system's default scroll-edge effect; the system adapts them to the accessibility settings |
| `closesBack` and the app-wide `UINavigationController` gesture override | The system's Back button and edge swipe on pushed pages; the close stays on sheets and cards presented over the map |
| The route's figures in a hand-backed inset | `safeAreaBar` (`glassFoot`) |
| Haptics off under Reduce Motion | The system's haptics switch alone decides; a tap is not motion |
| `SaveLabel`'s drawn-on checkmark | The button's own words ("Saving…"), the saved flight showing in the list |

The altitude is picked in the profile, ForeFlight's way (see
[The profile](#the-profile-foreflights-way)): the system `Slider` turned
upright beside the chart, the system `.popover` on a waypoint, and a
`List` of the Altitude Advisor's rows. The wheel and the menu `Picker`
are gone.

**Left hand-built, and why.**

| Component | Why there is no stock one |
|---|---|
| `RibbonLine` (the strip's route schematic) | A transit-map line of the route's points with the airplane riding it; no system control draws one |
| `DiagramOwnShip`, `HoldDiagram`, the runway sketch (`Canvas`) | Aviation diagrams: the airport diagram with own ship, a hold's entry sectors, the runways' layout. Swift Charts has no geometry for them |
| `DepartureWindowSection`'s hour tiles | An hourly strip of verdicts, as Weather's hourly forecast; SwiftUI has no hourly-forecast control |
| Checklist ticks (checklists, emergency, passenger briefing) | iOS has no checkbox (`ToggleStyle.checkbox` is macOS only); the circle-and-tick row is what Reminders draws by hand too |
| `FactsRow` | Maps' facts row (a caption over each value, four across) has no public SwiftUI view; it is a `Grid`/`HStack` of `Text` |
| `MapChip` and the captions over pictures | Stock `Label`/`Text` on the system's glass (`glassEffect`), which a line over a busy chart needs to be read; no capsule is drawn |
| The Reduce Motion branch of `Symbols.swift` | Kept for now: neither the SDK's interfaces nor Apple's pages read on 2026-11-10 say that `symbolEffect` changes under Reduce Motion by itself; remove it once that is shown |

---

## 18. Speed: Ask, the launch and the sheet (2026-11-10)

The iOS speed audit measured three things; what changed for each:

- **Ask on this iPhone** (8.3 s to an answer, then dropped as "resting on
  no figure").
  - The model is not asked when no tool could hand it a figure for the
    question (`EngineWords.holdsAny`): the engine's words, which say what
    is missing, come at once (`OnDeviceAsk.answer`).
  - Apple's model is warmed (`LanguageModelSession.prewarm()`, its name
    in the iOS 27.2 SDK) when the one search takes focus and when Ask
    opens, unless the planner will answer (`AskRouter.prewarm`).
  - The answer streams (`streamResponse`). A sentence is shown once it
    is finished and has passed the same id and number checks as the
    whole answer, so every figure is still the engine's from the first
    word (`StreamedWords`). Words a later failure replaces are withdrawn
    (`AssistantLine.retract`).
- **The launch** (3.09 s on the simulator, against the HIG's "launch
  instantly"; no device number yet).
  - The kept plan and the kept chart are read and decoded off the main
    actor (`Plan.restore`, `Charts.load`).
  - The engine is a static library with no initialisation of its own.
    The app embeds no dynamic framework, and all 131 linked libraries are
    the system's, so there is nothing to make static or merge
    (`MERGED_BINARY_TYPE`).
  - The 83 MB binary is both simulator slices, unstripped; a device
    build is one slice, stripped. Judge the launch on a device
    (MetricKit's `histogrammedTimeToFirstDraw`, `Metrics`).
- **The sheet's drag.** The sheet's height is kept in RootView's state
  only until the map shows, the only time the map's opening point and
  the loading mark read it. A drag after that runs neither the root's
  body nor the map's update.

---

## What could not be verified

- **The Maps sheet's detent heights**, and what Maps shows at each
  detent. Only the owner's own observation and screenshot
  (2026-11-09) back the photo-only-at-large behaviour. No Apple page
  states it.
- **The place card's full order** (photo, logo tile, title, action row
  with the travel time, facts row, cards, image tiles, floating
  toolbar). It comes from the owner's screenshot alone; Apple's guide
  lists the pieces but not their order.
- **Maps' search field at the bottom.** This is inferred: the guide
  puts the avatar "next to the search field" and the avatar "at the
  bottom of the screen". Settings' bottom search *is* stated.
- **Health's D and 6M chart periods** on iOS 27 (the guide names weekly,
  monthly and yearly), and **Settings' coloured row icons**.
- **Files' icon/list switch on iPhone**, and **a Clock timer shown as a
  Live Activity** in the iOS 27 guide.
- **Flighty's expanded, StandBy and Watch layouts**, the "starts 3 hours
  before departure" claim (press only), and **Wallet's boarding-pass
  Live Activity layout**.
- **Apple's Emergency SOS screens** were not checked. No Apple app
  presents notices (NOTAMs) or a clearance, so those sections follow the
  HIG alone.
- **The HIG itself:**
  - No HIG page names a "prominent tab role". The API
    (`TabRole.prominent`) is in the SDK and session 269.
  - No HIG page describes Liquid Glass sheets.
  - SF Symbols 8 is a beta with no HIG text.
  - There is no HIG Inspectors page.
- **Sources that conflict:**
  - `systemExtraLargePortrait` is listed for iOS 27 in WidgetKit's docs
    and SDK, but "Not supported" on iPhone in the HIG's widget table.
  - Controls on watchOS appear in the API docs (watchOS 26) but not in
    the HIG.
- **No iOS 27 change** to Weather, Clock, Fitness, boarding passes or
  Live Activities was announced. The descriptions above are the iOS 27
  guide's current text.

---

## Sources

The HIG pages were read on 2026-11-09. Dates are each page's latest
change-log entry.

**Owner**
- The owner's screenshot of Apple Maps' place card, iOS 27, 2026-11-09
  (session upload), and his observation that the photo shows only at
  the large detent.

**Human Interface Guidelines**
- `hig-whatsnew`: https://developer.apple.com/design/whats-new/
- `hig-sheets`: https://developer.apple.com/design/human-interface-guidelines/sheets (2026-03-24)
- `hig-toolbars`: https://developer.apple.com/design/human-interface-guidelines/toolbars (2025-12-16)
- `hig-searchfields`: https://developer.apple.com/design/human-interface-guidelines/search-fields (2026-06-08)
- `hig-searching`: https://developer.apple.com/design/human-interface-guidelines/searching (2026-06-08)
- `hig-sidebars`: https://developer.apple.com/design/human-interface-guidelines/sidebars (2026-06-08)
- `hig-splitviews`: https://developer.apple.com/design/human-interface-guidelines/split-views
- `hig-lists`: https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
- `hig-menus`: https://developer.apple.com/design/human-interface-guidelines/menus (2026-06-08)
- `hig-contextmenus`: https://developer.apple.com/design/human-interface-guidelines/context-menus
- `hig-buttons`: https://developer.apple.com/design/human-interface-guidelines/buttons (2025-12-16)
- `hig-segmented`: https://developer.apple.com/design/human-interface-guidelines/segmented-controls
- `hig-pickers`: https://developer.apple.com/design/human-interface-guidelines/pickers
- `hig-alerts`: https://developer.apple.com/design/human-interface-guidelines/alerts
- `hig-charts`: https://developer.apple.com/design/human-interface-guidelines/charts
- `hig-chartdata`: https://developer.apple.com/design/human-interface-guidelines/charting-data
- `hig-gauges`: https://developer.apple.com/design/human-interface-guidelines/gauges
- `hig-progress`: https://developer.apple.com/design/human-interface-guidelines/progress-indicators
- `hig-feedback`: https://developer.apple.com/design/human-interface-guidelines/feedback
- `hig-live`: https://developer.apple.com/design/human-interface-guidelines/live-activities (2026-10-13)
- `hig-widgets`: https://developer.apple.com/design/human-interface-guidelines/widgets (2026-10-13)
- `hig-controls`: https://developer.apple.com/design/human-interface-guidelines/controls
- `hig-haptics`: https://developer.apple.com/design/human-interface-guidelines/playing-haptics
- `hig-motion`: https://developer.apple.com/design/human-interface-guidelines/motion
- `hig-layout`: https://developer.apple.com/design/human-interface-guidelines/layout (2026-09-09)
- `hig-duo`: https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo (new 2026-09-09)
- `hig-type`: https://developer.apple.com/design/human-interface-guidelines/typography
- `hig-materials`: https://developer.apple.com/design/human-interface-guidelines/materials
- `hig-color`: https://developer.apple.com/design/human-interface-guidelines/color (2025-12-16)
- `hig-darkmode`: https://developer.apple.com/design/human-interface-guidelines/dark-mode
- `hig-a11y`: https://developer.apple.com/design/human-interface-guidelines/accessibility
- `hig-maps`: https://developer.apple.com/design/human-interface-guidelines/maps
- `hig-textfields`: https://developer.apple.com/design/human-interface-guidelines/text-fields
- `hig-modality`: https://developer.apple.com/design/human-interface-guidelines/modality
- `hig-fullscreen`: https://developer.apple.com/design/human-interface-guidelines/going-full-screen
- `hig-onboarding`: https://developer.apple.com/design/human-interface-guidelines/onboarding
- `hig-launching`: https://developer.apple.com/design/human-interface-guidelines/launching
- `hig-settings`: https://developer.apple.com/design/human-interface-guidelines/settings
- `hig-accounts`: https://developer.apple.com/design/human-interface-guidelines/managing-accounts
- `hig-files`: https://developer.apple.com/design/human-interface-guidelines/file-management
- `hig-ios`: https://developer.apple.com/design/human-interface-guidelines/designing-for-ios
- `hig-ipados`: https://developer.apple.com/design/human-interface-guidelines/designing-for-ipados

**iPhone User Guide (iOS 27)**
- `sup-maps-start`: https://support.apple.com/guide/iphone/get-started-with-maps-iph6ef6ef377/ios
- `sup-maps-nearby`: https://support.apple.com/guide/iphone/find-nearby-attractions-restaurants-services-iphbaf51b2c0/ios
- `sup-maps-places`: https://support.apple.com/guide/iphone/get-information-about-places-iph8c9c2528b/ios
- `sup-maps-add`: https://support.apple.com/guide/iphone/add-places-and-notes-to-your-places-iph6838243e8/ios
- `sup-maps-rate`: https://support.apple.com/guide/iphone/rate-places-and-add-photos-iphc3e29e15d/ios
- `sup-maps-use`: https://support.apple.com/guide/iphone/use-maps-iph02f94fc1c/ios
- `sup-maps-drive`: https://support.apple.com/guide/iphone/get-driving-directions-ipha84a94043/ios
- `sup-maps-stops`: https://support.apple.com/guide/iphone/change-or-add-stops-to-your-route-iph837d13d03/ios
- `sup-maps-overview`: https://support.apple.com/guide/iphone/view-a-route-overview-or-a-list-of-turns-iph1b3553719/ios
- `sup-weather`: https://support.apple.com/guide/iphone/check-the-weather-iph1ac0b35f/ios
- `sup-weather-maps`: https://support.apple.com/guide/iphone/view-weather-maps-iph0960651f5/ios
- `sup-health`: https://support.apple.com/guide/iphone/view-your-health-data-iphe3d379c32/ios
- `sup-fitness`: https://support.apple.com/guide/iphone/see-your-activity-summary-iph4c34a8a95/ios
- `sup-settings`: https://support.apple.com/guide/iphone/find-settings-iph079e1fe9d/ios
- `sup-account`: https://support.apple.com/guide/iphone/sign-in-and-manage-your-apple-account-iph76e54c61e/ios
- `sup-files-find`: https://support.apple.com/guide/iphone/find-and-view-files-and-folders-iphe4bff8827/ios
- `sup-wallet-manage`: https://support.apple.com/guide/iphone/manage-passes-cards-and-keys-iphbea35dbc4/ios
- `sup-wallet-use`: https://support.apple.com/guide/iphone/use-passes-cards-and-keys-iphe7aa3336/ios
- `sup-clock-timer`: https://support.apple.com/guide/iphone/set-timers-iph8241d6b2a/ios
- `sup-findmy-device`: https://support.apple.com/guide/iphone/locate-a-device-iph09b087eda/ios
- `sup-findmy-item`: https://support.apple.com/guide/iphone/locate-an-item-ipha779f0c10/ios
- `sup-dynamicisland`: https://support.apple.com/guide/iphone/view-live-activities-in-the-dynamic-island-iph28f50d10d/ios

**WWDC26, documentation and Newsroom**
- `wwdc-102`: https://developer.apple.com/videos/play/wwdc2026/102/ (Platforms State of the Union)
- `wwdc-269`: https://developer.apple.com/videos/play/wwdc2026/269/ (What's new in SwiftUI)
- `wwdc-278`: https://developer.apple.com/videos/play/wwdc2026/278/ (Modernize your UIKit app)
- `wwdc-223`: https://developer.apple.com/videos/play/wwdc2026/223/ (Live Activities essentials)
- `wwdc-277`: https://developer.apple.com/videos/play/wwdc2026/277/ (WidgetKit foundations)
- `wwdc-209`: https://developer.apple.com/videos/play/wwdc2026/209/ (What's new in Wallet)
- `relnotes`: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes
- `doc-activitykit`: https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities
- `doc-activitypush`: https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications
- `doc-controlbutton`: https://developer.apple.com/documentation/widgetkit/controlwidgetbutton
- `doc-reducedresource`: https://developer.apple.com/documentation/swiftui/environmentvalues/systemprefersreducedresourceusage
- `dev-dynamicisland`: https://developer.apple.com/news/?id=mis6swzt (Spotlight on: The Dynamic Island)
- `ada-2023`: https://developer.apple.com/design/awards/2023/
- `wallet-new`: https://developer.apple.com/wallet/whats-new/
- `news-wwdc26`: https://www.apple.com/newsroom/2026/06/apple-unveils-next-generation-of-apple-intelligence-siri-ai-and-more/
- `news-ios26`: https://www.apple.com/newsroom/2025/06/apple-elevates-the-iphone-experience-with-ios-26/
- `apple-maps`: https://www.apple.com/maps/

**Flighty (a third-party reference, from its own pages)**
- `appstore-flighty`: https://apps.apple.com/us/app/flighty-live-flight-tracker/id1358823008
- `flighty`: https://www.flighty.com/
- `flighty-help`: https://www.flighty.com/help/live-activities-widgets

**SDK.** The iOS 27.2 SDK in Xcode 27.2: the `SwiftUI`, `SwiftUICore`,
`WidgetKit`, `ActivityKit` and `AlarmKit` swiftinterfaces. Every API
named above was found there.

[hig-whatsnew]: https://developer.apple.com/design/whats-new/
[hig-sheets]: https://developer.apple.com/design/human-interface-guidelines/sheets
[hig-toolbars]: https://developer.apple.com/design/human-interface-guidelines/toolbars
[hig-searchfields]: https://developer.apple.com/design/human-interface-guidelines/search-fields
[hig-searching]: https://developer.apple.com/design/human-interface-guidelines/searching
[hig-sidebars]: https://developer.apple.com/design/human-interface-guidelines/sidebars
[hig-splitviews]: https://developer.apple.com/design/human-interface-guidelines/split-views
[hig-lists]: https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
[hig-menus]: https://developer.apple.com/design/human-interface-guidelines/menus
[hig-contextmenus]: https://developer.apple.com/design/human-interface-guidelines/context-menus
[hig-buttons]: https://developer.apple.com/design/human-interface-guidelines/buttons
[hig-segmented]: https://developer.apple.com/design/human-interface-guidelines/segmented-controls
[hig-pickers]: https://developer.apple.com/design/human-interface-guidelines/pickers
[hig-alerts]: https://developer.apple.com/design/human-interface-guidelines/alerts
[hig-charts]: https://developer.apple.com/design/human-interface-guidelines/charts
[hig-chartdata]: https://developer.apple.com/design/human-interface-guidelines/charting-data
[hig-gauges]: https://developer.apple.com/design/human-interface-guidelines/gauges
[hig-progress]: https://developer.apple.com/design/human-interface-guidelines/progress-indicators
[hig-feedback]: https://developer.apple.com/design/human-interface-guidelines/feedback
[hig-live]: https://developer.apple.com/design/human-interface-guidelines/live-activities
[hig-widgets]: https://developer.apple.com/design/human-interface-guidelines/widgets
[hig-controls]: https://developer.apple.com/design/human-interface-guidelines/controls
[hig-haptics]: https://developer.apple.com/design/human-interface-guidelines/playing-haptics
[hig-motion]: https://developer.apple.com/design/human-interface-guidelines/motion
[hig-layout]: https://developer.apple.com/design/human-interface-guidelines/layout
[hig-duo]: https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo
[hig-type]: https://developer.apple.com/design/human-interface-guidelines/typography
[hig-materials]: https://developer.apple.com/design/human-interface-guidelines/materials
[hig-color]: https://developer.apple.com/design/human-interface-guidelines/color
[hig-darkmode]: https://developer.apple.com/design/human-interface-guidelines/dark-mode
[hig-a11y]: https://developer.apple.com/design/human-interface-guidelines/accessibility
[hig-maps]: https://developer.apple.com/design/human-interface-guidelines/maps
[hig-textfields]: https://developer.apple.com/design/human-interface-guidelines/text-fields
[hig-modality]: https://developer.apple.com/design/human-interface-guidelines/modality
[hig-fullscreen]: https://developer.apple.com/design/human-interface-guidelines/going-full-screen
[hig-onboarding]: https://developer.apple.com/design/human-interface-guidelines/onboarding
[hig-launching]: https://developer.apple.com/design/human-interface-guidelines/launching
[hig-settings]: https://developer.apple.com/design/human-interface-guidelines/settings
[hig-accounts]: https://developer.apple.com/design/human-interface-guidelines/managing-accounts
[hig-files]: https://developer.apple.com/design/human-interface-guidelines/file-management
[hig-ios]: https://developer.apple.com/design/human-interface-guidelines/designing-for-ios
[hig-ipados]: https://developer.apple.com/design/human-interface-guidelines/designing-for-ipados
[sup-maps-start]: https://support.apple.com/guide/iphone/get-started-with-maps-iph6ef6ef377/ios
[sup-maps-nearby]: https://support.apple.com/guide/iphone/find-nearby-attractions-restaurants-services-iphbaf51b2c0/ios
[sup-maps-places]: https://support.apple.com/guide/iphone/get-information-about-places-iph8c9c2528b/ios
[sup-maps-add]: https://support.apple.com/guide/iphone/add-places-and-notes-to-your-places-iph6838243e8/ios
[sup-maps-rate]: https://support.apple.com/guide/iphone/rate-places-and-add-photos-iphc3e29e15d/ios
[sup-maps-use]: https://support.apple.com/guide/iphone/use-maps-iph02f94fc1c/ios
[sup-maps-drive]: https://support.apple.com/guide/iphone/get-driving-directions-ipha84a94043/ios
[sup-maps-stops]: https://support.apple.com/guide/iphone/change-or-add-stops-to-your-route-iph837d13d03/ios
[sup-maps-overview]: https://support.apple.com/guide/iphone/view-a-route-overview-or-a-list-of-turns-iph1b3553719/ios
[sup-weather]: https://support.apple.com/guide/iphone/check-the-weather-iph1ac0b35f/ios
[sup-weather-maps]: https://support.apple.com/guide/iphone/view-weather-maps-iph0960651f5/ios
[sup-health]: https://support.apple.com/guide/iphone/view-your-health-data-iphe3d379c32/ios
[sup-fitness]: https://support.apple.com/guide/iphone/see-your-activity-summary-iph4c34a8a95/ios
[sup-settings]: https://support.apple.com/guide/iphone/find-settings-iph079e1fe9d/ios
[sup-account]: https://support.apple.com/guide/iphone/sign-in-and-manage-your-apple-account-iph76e54c61e/ios
[sup-files-find]: https://support.apple.com/guide/iphone/find-and-view-files-and-folders-iphe4bff8827/ios
[sup-wallet-manage]: https://support.apple.com/guide/iphone/manage-passes-cards-and-keys-iphbea35dbc4/ios
[sup-wallet-use]: https://support.apple.com/guide/iphone/use-passes-cards-and-keys-iphe7aa3336/ios
[sup-clock-timer]: https://support.apple.com/guide/iphone/set-timers-iph8241d6b2a/ios
[sup-findmy-device]: https://support.apple.com/guide/iphone/locate-a-device-iph09b087eda/ios
[sup-findmy-item]: https://support.apple.com/guide/iphone/locate-an-item-ipha779f0c10/ios
[sup-dynamicisland]: https://support.apple.com/guide/iphone/view-live-activities-in-the-dynamic-island-iph28f50d10d/ios
[wwdc-102]: https://developer.apple.com/videos/play/wwdc2026/102/
[wwdc-269]: https://developer.apple.com/videos/play/wwdc2026/269/
[wwdc-278]: https://developer.apple.com/videos/play/wwdc2026/278/
[wwdc-223]: https://developer.apple.com/videos/play/wwdc2026/223/
[wwdc-277]: https://developer.apple.com/videos/play/wwdc2026/277/
[wwdc-209]: https://developer.apple.com/videos/play/wwdc2026/209/
[relnotes]: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes
[doc-activitykit]: https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities
[doc-activitypush]: https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications
[doc-controlbutton]: https://developer.apple.com/documentation/widgetkit/controlwidgetbutton
[doc-reducedresource]: https://developer.apple.com/documentation/swiftui/environmentvalues/systemprefersreducedresourceusage
[dev-dynamicisland]: https://developer.apple.com/news/?id=mis6swzt
[ada-2023]: https://developer.apple.com/design/awards/2023/
[wallet-new]: https://developer.apple.com/wallet/whats-new/
[news-wwdc26]: https://www.apple.com/newsroom/2026/06/apple-unveils-next-generation-of-apple-intelligence-siri-ai-and-more/
[news-ios26]: https://www.apple.com/newsroom/2025/06/apple-elevates-the-iphone-experience-with-ios-26/
[apple-maps]: https://www.apple.com/maps/
[appstore-flighty]: https://apps.apple.com/us/app/flighty-live-flight-tracker/id1358823008
[flighty]: https://www.flighty.com/
[flighty-help]: https://www.flighty.com/help/live-activities-widgets
