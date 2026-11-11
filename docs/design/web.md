# The web app's look and feel: every screen, the web's way

The owner, 2026-11-09: "Can you do research on everything and let's make it
consistent look and feel to its platform." On the web the platform is the
modern web app: a phone's browser, the same page installed to the Home
Screen as a web app, and a desktop's browser or installed window. This
reference says, screen by screen, how a leading web app presents that kind
of screen today, and how Wingtip's should be built from the stock parts it
already ships. iOS and Android have their own references; the content, the
words and their order are the same on all three, and only the presentation
is each platform's (decision 0031, `docs/decisions/0031-platform-looks.md`).

Every claim about a standard, a library or another app links to the page it
was read from on 2026-11-09. Where a page could not be read, or a detail
could not be confirmed from the app's own site, this document says so
rather than describing the app from memory (see "Not verified" at the end).

The card rule, the scrolling rule and their tests, the one search and the
airport weather marks hold on all three apps: [rules.md](rules.md).

## What does not change

These hold on every screen below and win over any reference app.

- **The engine decides every figure.** A screen shows what the engine
  returns (`callEngine`, CLAUDE.md "Architecture"); no component, hook or
  table cell works out a course, a time, a fuel figure or a verdict.
- **No assumed airplane** (decision 0011). With no airplane picked, a
  screen shows what it can without one (To and Dist, magnetic course) and
  never fills one in.
- **Warn, never limit.** A pilot can always plan and fly what they choose;
  the screen shows the warning beside it, and nothing is greyed out for
  being outside a limit.
- **44-point hit areas, controls that do not grow** (decision 0030). The
  area is a pseudo-element (`after:absolute after:-inset-…`), rows sit at
  `gap-2`. This is above WCAG 2.2's AA minimum of 24 by 24 CSS pixels and
  meets its AAA 44 by 44 ([WCAG 2.5.8][wcag-258], [2.5.5][wcag-255]);
  Vercel's interface guidelines ask the same, 24 px at least and 44 px on
  mobile ([Vercel guidelines][vercel-guidelines]).
- **Brand tokens from `design/tokens.json` only**: the tint for what is
  tapped, the chart's own colours on the map, `lib/text` for type sizes.
  The looks are Wingtip (the default), Glass Cockpit, Chart ink and
  Native. Native is the components as they come out of the box (the
  owner, 2026-11-10): shadcn's stock theme for base-vega on neutral, its
  own Inter and radius, Tailwind's stock shadows and type steps, the stock
  hover, press and focus states, no frost, no press give, no touch sizes
  of ours (the `pointer-coarse` variant is off there) and no page slide.
  The 44-point hit areas stay, as pseudo-elements that change nothing
  seen. The chart, the course, airspace, flight categories and the
  caution, go and destructive states keep Wingtip's colours in every look.
  Where a stock default is under WCAG's line it is reported, not
  recoloured (`looksContrast.test.ts`'s `STOCK_SHORTFALLS`).
- **The first load stays under 1.10 MB** (CI's `first-load.mjs --budget
  1100000`). Every screen below except the map, its sheet and the search
  field loads on its own chunk when first opened. A new library for a
  screen is weighed against that budget before it is added
  (`docs` memory: web bundle budget; the measure-speed skill).
- **A drag up below full moves the sheet**, wherever it starts: on a
  button, a chip or a sideways row as on the body; a tap stays a tap. It
  is Base UI's Drawer's own arbitration; in the sheet a sideways row
  never scrolls up and down (index.css), so the Drawer does not hand it
  the drag (docs/design/rules.md §2).
- **The engine never holds the page** (2026-11-10). The search, the
  sheet and the map's chart draw at once while the engine's `.wasm`
  comes (`main.tsx` preloads it). Each part that asks the engine while it
  draws waits in its place: a card or a list opened from the address shows
  "Working out…" (`lib/engine/engineGate` `WorkingOut`), and the map's
  marks, buttons and banners, Ready to Fly and the airplane, emergency and
  shared-flight sheets come once it is there. A route named in the address
  is read by the engine, so that page waits on the boot map (the chart
  alone, `GlBootMap`); a fresh open has none (`features/shell/freshLoad`).
  `features/shell/firstDraw.test.tsx` draws the page without the engine
  and fails when a part drawn at once starts asking it.
- **Panels and controls stay where they are** unless the owner says so in
  the issue (decision 0013). Where this reference differs from today's
  placement it is a proposal for the owner, not an instruction.
- **Close goes back one level**; there are no Back buttons (decision 0015).
- **One home per control**; there is no Settings page (decision 0014).
- **Discrete settings are menus or segmented controls**, not sliders
  (decision 0017).
- **Errors show where they happen** (`lib/problems`), never in a toast.
  A confirmation with Undo is a Base UI Toast with its action (`lib/toast`
  `toast.undo`), the web's stock pattern, and a control's own
  confirmation ("Copied") an anchored Base UI Toast by that control
  (`lib/doneNote`), at the owner's word (2026-11-10).
- **Words:** "airplane" (decision 0020), Title Case labels (0021), no
  explanatory footnotes (0019), FAA text in sentence case with its codes
  kept, raw reports as sent.

## The web platform, today

### Layout: two rooms, one content

- **Desktop** is a window at least 1024 px wide with a fine pointer
  (`hooks/use-desktop.ts`: `(min-width: 1024px) and (pointer: fine)`). The
  panel is a side panel the window's height, beside the map. An iPad held
  wide, all touch, keeps the phone's layout.
- **Phone** (and touch tablets) is the map with one sheet over it, at three
  detents (pill, half, full), as decision 0018 sets. The sheet is solid at
  every size (`GLASS_SHEET`, the look's `--sheet`), not glass; only the
  map's floating buttons are frosted (owner decision 2026-11-10
  (decisions page), the sheet audit's F-L1).
- Inside the panel, lay content out by the panel's width, not the
  window's: size container queries are Baseline widely available since
  February 2023 ([MDN @container][mdn-container]). The same card then reads
  right in the phone's sheet, the desktop's side panel and a popover.
- The hover and pointer media features report only the primary input;
  `any-hover` and `any-pointer` see every input, so a touch screen with a
  mouse can match both coarse and fine. web.dev's advice: do not shrink
  targets for fine pointers, pair `:hover` with `:focus`, and "Don't use
  hover to hide important information" ([web.dev interaction][webdev-interaction]).

### A URL for every card

Vercel's guidelines put filters, tabs, pagination and open panels in the
URL so sharing, refresh and Back/Forward work, and bring scroll position
back on Back/Forward ([Vercel guidelines][vercel-guidelines]). Google Maps
has one link format for a place and for directions on every platform
(`/maps/search/?api=1&query=…`, `/maps/dir/?api=1&origin=…&destination=…`)
([Google Maps URLs][gmaps-urls]). Wingtip already has one link per screen
(`design/screens.json`, `?open=<id>`, with `place`, `dep`, `dest`, `stops`,
`flight` beside it; `docs/navigation.md`). Keep every card and screen
reachable that way, and make the browser's Back go back one level, as the
close does.

### Keyboard

- Each composite widget follows the ARIA Authoring Practices Guide's
  pattern (named in each screen below). Focus is always visible and
  distinct from selection; it never drops to `body`
  ([APG keyboard interface][apg-keyboard]).
- Shortcuts are a second way in, never the only one: "Do not use keyboard
  shortcuts as a substitute for access via navigation." Avoid the OS's,
  assistive technology's and the browser's own keys (address bar, reload,
  find) unless the app's use is frequent and the browser's rare
  ([APG keyboard interface][apg-keyboard]).
- **Single-key shortcuts** (Wingtip's `/`, `1`–`4`, `B`, `N`, `D` in
  `hooks/use-shortcuts.ts`) must be possible to turn off or remap to
  include a modifier, or be active only while their component has focus:
  WCAG 2.1.4, Level A ([WCAG 2.1.4][wcag-214]). Today they cannot be turned
  off; a switch in the Map menu (one home per control) is needed.
- Show shortcuts where the action is, as Raycast's Action Panel shows each
  action's shortcut at its right so people learn them
  ([Raycast Action Panel][raycast-actions]); shadcn ships a `Kbd` for it
  ([shadcn components][shadcn-components]). Show them only on desktop.
- Figma's shortcut panel opens along the bottom and work goes on while it
  is open ([Figma shortcuts][figma-shortcuts]); Google Maps lists its
  shortcuts with Ctrl+/ ([Google Maps accessibility][gmaps-a11y]). Wingtip's
  list belongs in the search (type "shortcuts") and the Guide, not a new
  button.
- Content opened by hover or focus must be dismissible without moving the
  pointer, hoverable, and persistent (WCAG 1.4.13, [WCAG 2.2][wcag22]).

### Hover (desktop only)

- Base UI's Tooltip is disabled on touch devices and opens after 600 ms;
  its docs point to a Popover with `openOnHover` for touch
  ([Base UI Tooltip][bui-tooltip]). Use a tooltip only to name an icon
  button; Vercel prefers inline help to tooltips
  ([Vercel guidelines][vercel-guidelines]), and the APG's tooltip pattern
  still has no task-force consensus ([APG tooltip][apg-tooltip]).
- A hover preview of a place or an airplane is Base UI's Preview Card
  (600 ms in, 300 ms out). Its popup is not reachable by keyboard, touch or
  screen reader ([Base UI Preview Card][bui-preview]), so it may only
  repeat what the card itself shows.
- The native `interestfor` hover invoker is Chrome and Edge 142 only
  ([web.dev October 2025][webdev-2025-10]); do not build on it yet.

### Motion

- Sheets and side panels: the stock Drawer's own slide, 0.45 s on
  `cubic-bezier(0.32, 0.72, 0, 1)`, transform only, and its own velocity
  snap (a hard flick may go from the pill all the way up): the Drawer's
  behaviour as it comes, nothing set over it (decision 0018; the owner,
  2026-11-10 and 2026-11-11, "Just let the drawer do what it does").
- What the sheet shows follows its snap point the moment it is set: the
  grabber, the radio's and the map's buttons on its top, the body's layout
  for the size, the pill's row, the figures' compact form, the map's room
  (MapPanel). Nothing is held until the slide ends, nothing laid out ahead
  in a transition, nothing raises the sheet on a focus; the keyboard's
  inset and a focused field's scroll are `VirtualKeyboardProvider`'s.
- Cards over the sheet are the Drawer's own nested drawers (the owner,
  2026-11-11; `components/sheet/CardStack`): each with its own snap point
  among the sheet's three sizes, its grabber and its swipe, the sheet's
  swipe the card's while one is up, and its own Escape closing it. A card
  opens at half at the least (all the way up for a search) or as high as
  what it covers, then is where the pilot puts it; the sheet under it
  stays where it was, and the page's size is the frontmost sheet's
  (MapPanel's `useSheetLayers`). They are put inside the sheet's popup
  (`Drawer.Portal`'s `container`), outside its corners' clip, placed from
  the sheet's snap offset to their own. A card's content stays drawn where
  its caller is (its providers) and is put in its drawer's scroller
  (`useCardFrame`); touches on it are handed to its drawer's viewport
  (`SheetViewport`): Base UI 1.9 gives the viewport its touchstart,
  touchend and pointerdown as React props, and React sends a portal's
  events to its React parents, not to the viewport it sits in on the page.
- The keyboard: `Drawer.VirtualKeyboardProvider` on the sheet, each card
  and each question (`PhoneSheet`), its `--drawer-keyboard-inset` the
  viewport's bottom, in place of a `visualViewport` reading.
- Base UI animates with CSS transitions on `[data-starting-style]` and
  `[data-ending-style]`, which can reverse mid-way; `onOpenChangeComplete`
  fires once the animation ends ([Base UI animation][bui-animation]).
- Moving between a list and a card: React 19.3 made `<ViewTransition>`
  stable; it animates only updates inside `startTransition`, a
  `<Suspense>` reveal or `useDeferredValue`, and `addTransitionType` tags
  one for CSS ([React 19.3][react-193], [ViewTransition][react-vt]).
  Same-document view transitions are Baseline newly available since
  2025-10-14 (Chrome 125, Safari 18, Firefox 144)
  ([web.dev][webdev-vt-baseline]); cross-document ones are not Baseline
  ([Chrome cross-document][chrome-vt-cross]), and Wingtip is one page
  anyway. The app's `package.json` asks for React `^19.3.1`.
- `prefers-reduced-motion`: animate only inside `(prefers-reduced-motion:
  no-preference)`, keep normal scrolling, drop zooms and autoplay
  ([web.dev reduced motion][webdev-reduced-motion]). Vercel adds: CSS
  first, transform and opacity only, never `transition: all`, animations
  interruptible and never autoplaying ([Vercel guidelines][vercel-guidelines]).
- `prefers-contrast` and `forced-colors` are Baseline widely available
  ([MDN prefers-contrast][mdn-prefers-contrast],
  [MDN forced-colors][mdn-forced-colors]): the glass falls back to a solid
  fill under either. `prefers-reduced-transparency` is experimental
  ([MDN][mdn-reduced-transparency]); honour it where it exists.

### Overlays and positioning

- The Popover API is Baseline 2025 ([MDN Popover API][mdn-popover]), invoker
  commands (`command`/`commandfor`) Baseline since December 2025
  ([MDN invoker commands][mdn-invokers]), and anchor positioning's
  `position-area` and `position-try` Baseline 2026
  ([MDN position-area][mdn-position-area]). Base UI's own pages do not say
  which positioning it uses underneath (see "Not verified"); keep using its
  Positioner rather than mixing in native anchors.
- `<dialog closedby>` is not in a stable Safari yet
  ([Safari TP 249][safari-tp-249]); Base UI's Dialog covers light dismiss.
- Customizable `<select>` (`appearance: base-select`) shipped in Chrome 135
  and Safari 27 ([Chrome][chrome-select], [Safari 27][safari-27]) but is
  behind a flag in Firefox; the stock Base UI Select stays.

### The stock parts

- **Base UI 1.9.0** (9 October 2026) has 37 components, Drawer, Toast,
  Autocomplete, Combobox, Preview Card, Toolbar and OTP Field among them
  ([Base UI releases][bui-releases], [catalogue][bui-drawer]).
- **shadcn/ui** made Base UI the default for new projects in July 2026,
  added React Aria as a third choice, rebuilt its Drawer on Base UI instead
  of vaul, and its `/sonner` page now opens a Base UI Toast
  ([shadcn Base UI default][shadcn-base-default],
  [shadcn React Aria][shadcn-aria], [shadcn Drawer][shadcn-drawer],
  [shadcn Toast][shadcn-toast]). Wingtip's toasts are Base UI's
  (`components/ui/toast.tsx`, `lib/toast.ts`): progress, Undo, and the
  anchored confirmations.
- **React Aria Components 1.22** adds a swipeable Sheet and positions
  overlays round the virtual keyboard ([React Aria 1.22][ra-122]). Its drag
  and drop works by keyboard (Enter to start, Tab between targets, arrows,
  Enter to drop, Escape to cancel) with screen reader announcements
  ([React Aria DnD][ra-dnd]).

### Accessibility floor

WCAG 2.2 is the Recommendation to meet; WCAG 3.0 is a Working Draft of
10 September 2026 with "several years of work" ahead
([WCAG 2.2][wcag22], [WCAG 3.0][wcag3]). The criteria that bear on most
screens:

- Focus Not Obscured, AA: a focused control is never entirely hidden by
  author content. A sticky header or a sheet must not cover it; CSS
  `scroll-padding` is a sufficient technique, and a persistent non-modal
  panel that covers focus can fail ([WCAG 2.4.11][wcag-2411]). The map's
  sheet is such a panel.
- Dragging Movements, AA: everything done by dragging can also be done
  with a single pointer without dragging. Its own examples are a map with
  pan buttons and a sortable list with move up and move down controls
  ([WCAG 2.5.7][wcag-257]).
- Pause, Stop, Hide, A: anything moving by itself for more than 5 s needs
  pause or stop ([WCAG 2.2.2][wcag-222]).
- Status Messages, AA: a status is announced without taking focus
  (WCAG 4.1.3, [WCAG 2.2][wcag22]).
- Reflow, AA: content works at 320 CSS px wide without two-way scrolling,
  except what needs two dimensions, such as the map and a data table
  (WCAG 1.4.10, [WCAG 2.2][wcag22]).

---

## Screens

Each screen gives the reference, the structure top to bottom, the stock
components, where the primary action sits, keyboard and hover, motion,
what to avoid, and the sources. "Desktop" is the side panel, "phone" the
sheet.

### 1. The one search (⌘K merged)

**Reference.** Raycast's Root Search: results under one search bar, Enter
runs the primary action, ⌘Enter the secondary, ⌘K the Action Panel with
every action and its shortcut ([Raycast search bar][raycast-search],
[Action Panel][raycast-actions]). Linear's `/` searches the workspace and
its command menu narrows by a prefix ("i"+space for issues)
([Linear search][linear-search]); Notion opens search with ⌘P or ⌘K
([Notion shortcuts][notion-shortcuts]); Vercel's ⌘K jumps to any area and
starts actions ([Vercel ⌘K][vercel-cmdk]); Figma's ⌘K actions menu holds
actions, assets and AI tools ([Figma actions][figma-actions]). On a map,
Google Maps shows results as pins on the map and numbers them so a number
key opens one ([Google Maps search][gmaps-search],
[Google Maps accessibility][gmaps-a11y]); Apple Maps on the web opens its
search with Shift-F ([Apple Maps shortcuts][amaps-shortcuts]).

**Structure, top to bottom.**
1. One search field (the panel's own on both rooms; on desktop ⌘K also
   opens it as a dialog over the map when the panel is closed).
2. While empty: Recents, then Favorites, then the screens most opened
   (Brief, Nearest, Nav Log), each row with its shortcut on desktop.
3. While typing: groups in a fixed order, Airports, Navaids and Fixes,
   Airplanes (traffic by tail or ICAO address), Screens and Actions
   ("Direct To KSQL", "Brief", "Shortcuts"). A row's subtitle is what
   tells two apart (city, distance from the airplane or the map's centre).
4. (Numbered map marks for the results were built, then dropped on
   2026-11-10 for the stock Autocomplete as it is.)

**Stock parts.** Base UI Autocomplete (free text, `mode="list"`,
`Autocomplete.Status` for the async count, `virtualized` for long lists)
([Base UI Autocomplete][bui-autocomplete]); Wingtip's `components/ui/command.tsx`
is already that Autocomplete inside a Dialog, rather than shadcn's
cmdk-based Command ([shadcn Command][shadcn-command]). React Aria's
Autocomplete has a command palette example (SearchField plus Menu in a
modal, on ⌘J) if a menu of actions is wanted
([React Aria Autocomplete][ra-autocomplete]). One hook holds the query and
the results for both the field and the dialog.

**Primary action.** Enter opens the highlighted row's card (Raycast's
primary action), the first row highlighted as the results come
(`autoHighlight="always"`). A second action on ⌘Enter was dropped on
2026-11-10 with the stock component's own keys kept.

**Keyboard and hover.** The APG combobox: focus stays in the field and
`aria-activedescendant` moves through the options; Down opens and moves
in, Escape closes, Enter accepts, Home and End in the list, each as Base
UI's Autocomplete does it ([APG combobox][apg-combobox]); the clear is
the search field's own. `/` and ⌘K/Ctrl K focus it (overriding a browser
key is acceptable only for a frequent app action,
[APG keyboard interface][apg-keyboard]).

**Motion.** The dialog fades and scales from 0.98 in 150–200 ms; no motion
under reduced motion. Results do not animate in.

**Avoid.** Two searches with different results (the panel's and ⌘K's);
a spinner that flickers (Vercel: show it after a short delay and keep it a
minimum time, [Vercel guidelines][vercel-guidelines]); disabling paste; an
input font under 16 px on phones, which makes iOS zoom (Vercel: 16 px or
more); a results list that hides the map's marks on desktop.

**Sources.** [raycast-search], [raycast-actions], [linear-search],
[notion-shortcuts], [vercel-cmdk], [figma-actions], [gmaps-search],
[gmaps-a11y], [amaps-shortcuts], [bui-autocomplete], [shadcn-command],
[ra-autocomplete], [apg-combobox], [apg-keyboard], [vercel-guidelines].

### 2. The airport card and the airplane card

**Reference.** On the desktop, a card opened beside a list without
leaving it: Notion's side peek opens a page "on the right side of the
database" and centre peek in a focused modal ([Notion views][notion-views]);
Linear's peek opens on Space and closes on Space, or stays only while
Space is held ([Linear views][linear-views]). Google Maps' choosing a
result shows the place on the map with its details
([Google Maps search][gmaps-search]); its desktop panel's layout and tabs
could not be confirmed from Google's own pages (see "Not verified"). Apple
Maps on the web has place cards with photos, hours and ratings
([Apple newsroom][amaps-newsroom]) and a Sidebar toggled by Shift-S
([Apple Maps shortcuts][amaps-shortcuts]); the card's web layout could not
be confirmed. Windy's v49 airport points show the flight category, nearby
airports with METARs, runway winds, webcams, meteograms and NOTAMs raw and
decoded ([Windy v49][windy-v49]); SkyVector gives each airport its own
address (`/airport/<ID>/<Name>`) ([SkyVector airport][skyvector-airport]).

**Structure, airport card, top to bottom.**
1. Head (sticky in the panel): ident tile, name, city, the flight
   category chip and the METAR's age; Share, the star (Favorite) and close
   (going back one level) at the bar's right.
2. Actions row, one row of equal tiles and no others (the owner,
   2026-11-11): Fly Here (filled, first), Add as Stop (where the field can
   be one; else the row holds three), Call, Address (`lib/cardActions`;
   `docs/design/icons.md`). Refresh is at the right of the Weather tab's
   first row.
3. Facts row: elevation, longest runway, the frequencies a pilot needs
   first (each copies on click), fuel.
4. Tabs: the card's sections as today (`CardTabs`), the airport diagram
   first.
5. Each section's content; long ones fold.

**Structure, airplane card.** Head (tail, type, operator where the
registry gives it; a picked airplane of the pilot's own shows its
figures), the actions `lib/cardActions` gives its kind, then the figures
the engine has for it. No airplane picked shows "No airplane
picked" and Pick Airplane, never a default type (decision 0011).

**Stock parts.** Desktop: the panel's own side panel (`MapPanel` wide).
Phone: the sheet (Base UI Drawer: `snapPoints`, swipe, nested drawers,
`Drawer.VirtualKeyboardProvider`) ([Base UI Drawer][bui-drawer],
[Base UI releases][bui-releases]). Tabs: Base UI Tabs; it defaults to
manual activation (`activateOnFocus` false), and the APG recommends
automatic activation when panels show with no noticeable delay, so turn
`activateOnFocus` on for sections already loaded
([Base UI Tabs][bui-tabs], [APG tabs][apg-tabs]). Actions: shadcn Button
and Button Group; frequencies: `FrequencyButton`. Hover preview of a map
mark: Base UI Preview Card, desktop only.

**Primary action.** Fly Here, first and filled, in the actions row under
the head; it stays in sight while the card scrolls on desktop (the head
is sticky). As the card opens, the route Fly Here would make is asked
for ahead: its course, and from a field its checkpoints and nav log as
the planner's reads ahead (`?ahead=true`, behind any read the pilot waits
on), so the tap finds the planner already on them; closing the card
without Fly Here stops those requests (`useFlyHere`).

**Keyboard and hover.** Tab reaches the actions, then the tabs (one tab
stop, arrows between tabs, Home/End), then the panel
([APG tabs][apg-tabs]). Escape goes back one level. On desktop, a map
mark's hover shows its preview card after 600 ms; a list row's hover
outlines its mark.

**Motion.** Desktop: the side panel's content changes in place, with a
short cross-fade (`<ViewTransition>` on the card) and no slide of the
panel. Phone: the sheet keeps its detent; the card arrives with the
sheet's own 0.45 s slide if the sheet must rise.

**Avoid.** A modal over the map on desktop (the map must stay usable
beside the card); a card without its own URL (`?place=`); assuming an
airplane for ETE or fuel; hiding the frequencies behind hover; a header
photo that pushes the actions below the half detent.

**Sources.** [notion-views], [linear-views], [gmaps-search],
[amaps-newsroom], [amaps-shortcuts], [windy-v49], [skyvector-airport],
[bui-drawer], [bui-releases], [bui-tabs], [apg-tabs], [bui-preview].

### 2a. The sheet's two pages (the owner, 2026-11-11)

The phone's sheet and the desktop's side panel hold two pages side by
side, Search and FPL ([rules.md](rules.md) §4a): shadcn's Carousel on
Embla, already the app's for a card's pictures, inside the Drawer's popup
(`components/sheet/SheetPager`, laid out by `SheetParts`). Its
`data-base-ui-swipe-ignore="x"` gives a sideways drag to the pager and
leaves an up or down one to the Drawer, as the app's sideways rows do.
Each page is its own scroller with its own sticky head (the search's row,
or the route's row and the controls), so each keeps its place; the page
out of sight has an inert body. Its viewport is `overflow: clip`, so a
field focused on the page out of sight never scrolls it under Embla. The
grabber is the page control, split in two (`SheetGrabber` with `pages`,
the owner 2026-11-11): Base UI's Tabs, one Tab a bar, Left and Right
picking pages as they are focused, a tap on the page up's bar and Up and
Down sizing the sheet as the plain grabber does. It sits in the Drawer's
popup outside the clip of its corners (`SheetDrawer`'s `grabber`), so
each bar's 44-point hit area reaches over the sheet's edge rather than
over the field; the first row keeps its room from before the pages. A
card's grabber stays the plain one. A page change opens the grabber's
capsule (`useCapsule`, the owner 2026-11-11): its two bars give way to a
pill with the page's name in it, grown on `--motion-sheet` by CSS
transitions of its width and height, held a second and folded back;
while the pages move it names the page they are heading to, from
Embla's own `scroll` progress and `settle` event (`SheetPager`, into the
small `usePageHeading` store), nothing measured of our own. It is
`aria-hidden` and `pointer-events: none`; a swipe's page is said by a
polite live region, a bar's by its own focus. Under Reduce Motion it
keeps its size and fades on `--motion-fade`. The page up
is the planner's place (`usePanelView`'s `view`: the plan is FPL, the
search and the traffic are Search); a swipe or a bar picks it as a
place is picked, so what each kept open comes back with it. The pill is
the page's first row; the route's figures sit at the foot on FPL alone.

### 3. The flight plan and route editing

**Reference.** ForeFlight Web: "Rubberbanding is fully supported on the
web", a right-click lists nearby airports and waypoints, items are added
and rearranged with performance figures updating live, and a toggle
switches between Route Editor and Navlog ([ForeFlight Web][ff-web]); a
drag of the route line ends in a pop-up offering a lat/long, a nearby
waypoint, navaid or airport ([ForeFlight rubber-band][ff-rubberband]).
SkyVector: build a route by rubber-banding with the mouse, typing in the
route field, or both, and press Enter to compute what was typed; a Routes
button lists generated, recently cleared and ATC-preferred routes
([SkyVector guide][skyvector-guide]). Google Maps' directions take places
by clicking the map, typing an address or a name, up to 9 stops in all
([Google Maps directions][gmaps-directions]).

**Structure, top to bottom.**
1. The route box: departure and destination, the Routes, Brief and •••
   buttons on the pills' first line (memory: route box buttons).
2. The route as rows: each point with its kind's mark and a drag handle;
   between rows, the leg's figures the engine returns.
3. The route string field (typed, Enter to compute), as SkyVector's.
4. The altitude (`FL045` style, decision 0009) and the figure strip at
   the foot: To, Dist, ETE, Fuel (ETE and Fuel only with an airplane).
   The Profile card sets the altitude on the side view
   ([rules.md](rules.md) section 6): the upright Slider previews the
   clearance (red within 100 ft, yellow within 1,000 ft, the engine's
   `profile_clearance`) until Set, Auto in flight; a waypoint's mark opens
   its altitude, Start At or Cross At (a Popover, a sheet on a phone); the
   Altitude Advisor list under it chooses the cruise, the plan's menu gone.
5. A toast with Undo after a change that takes something away
   (`toast.undo`).

**Stock parts.** The rows: React Aria GridList with `useDragAndDrop` and
`onReorder`, a `<Button slot="drag">` handle per row, keyboard drag and
screen reader announcements built in ([React Aria GridList][ra-gridlist],
[React Aria DnD][ra-dnd]). Wingtip's `SortableRows` uses dnd-kit today;
**a choice for the owner:** keep dnd-kit or move to the GridList already
installed with react-aria-components, which would also drop dnd-kit's
roughly 48 KB (`SortableRows.tsx`'s own note). Each row's menu: Base UI
Menu (Direct To, Set Altitude…, Hold Here…, Add a Stop After, Move Up,
Move Down, Remove). The map's point menu: Base UI Context Menu on desktop
right-click, the point card on touch. The string: shadcn Input Group.

**Primary action.** Adding a point: the search field in the route box
("Add a point"), and Fly Here / Add Stop on any card. Done editing has no
button: every change is saved as it is made, with Undo in place.

**Keyboard and hover.** The rows are a grid with one tab stop; arrows
between rows; Enter on a handle starts a keyboard drag, arrows move it,
Enter drops, Escape cancels ([React Aria DnD][ra-dnd]). Move Up and Move
Down in each row's menu are the single-pointer alternative WCAG 2.5.7
names ([WCAG 2.5.7][wcag-257]); the APG has no drag-and-drop pattern of its
own ([APG patterns][apg-patterns]). Delete or Backspace on a focused row
removes it, with Undo in place. On desktop: hovering a row outlines its
leg on the map; hovering the route line shows a grab cursor where a drag
will insert a point; right-click opens the point menu.

**Motion.** A dragged row lifts with a shadow; the others move with a
150 ms transform; a dropped rubber-band line settles with no bounce. None
under reduced motion.

**Avoid.** Dragging as the only way to add or reorder (2.5.7); a figure
worked out in the row component instead of from the engine; blocking an
edit that breaks a limit (warn, never limit); a confirm dialog for
removing a point (Undo instead, Vercel: confirm or Undo for destructive
actions, [Vercel guidelines][vercel-guidelines]).

**Sources.** [ff-web], [ff-rubberband], [skyvector-guide],
[gmaps-directions], [ra-gridlist], [ra-dnd], [wcag-257], [apg-patterns],
[vercel-guidelines].

### 4. The nav log (dense tables on desktop)

**Reference.** ForeFlight Web toggles between the Route Editor and the
Navlog ([ForeFlight Web][ff-web]); its winds-aloft figures in the navlog
need a route, a true airspeed from the airplane's profile, an altitude and
a departure time ([ForeFlight navlog winds][ff-navlog-winds]). SkyVector's
nav log is a printable PDF with winds and temperatures at every point,
top of climb and top of descent, and blank fields to write in
([SkyVector guide][skyvector-guide]). Linear's 2026 refresh kept its
information density while softening separators and dimming the sidebar
so content stands out ([Linear refresh][linear-refresh-why]).

**Structure, top to bottom.** Desktop: a sticky header row (Point, Alt,
TC/MC, Wind, MH, Dist, GS, ETE, Fuel, with the airplane-dependent columns
present only with an airplane, decision 0011); one row per leg; a totals
row at the foot; the workings of a leg open beneath it. Phone: a list of
legs, the selected row's leg grid in shorthand (memory: nav log
"compact"), the rest one line each.

**Stock parts.** Wingtip's `NavLogView` is TanStack Table v9 over
shadcn's Table, which is what shadcn's Data Table guide uses
([shadcn Data Table][shadcn-datatable]); keep it. A native `<table>` is
what the APG recommends for a static table, with `aria-sort` on a sorted
header ([APG table][apg-table]). Make it a grid only if cells become
editable ([APG grid][apg-grid]). Column resizing on desktop, if wanted:
React Aria's `ResizableTableContainer` ([React Aria Table][ra-table]), or
TanStack's own sizing; one, not both.

**Primary action.** Print / Share in the screen's ••• (Share at the bar's
left); the nav log stays behind the route's ••• (decision 0029).

**Keyboard and hover.** A static table needs no keys of its own
([APG table][apg-table]); a leg's Workings is a disclosure (Enter or Space,
[APG disclosure][apg-disclosure]). On desktop, a row's hover outlines its
leg on the map and shows the point's mark. Sticky headers use
`scroll-padding-top` so a focused row is never under them
([WCAG 2.4.11][wcag-2411]).

**Motion.** None but the disclosure's height (CSS `interpolate-size` is
experimental, [MDN][mdn-interpolate-size]; use Base UI's
`data-starting-style` / `data-ending-style` transitions instead,
[Base UI animation][bui-animation]).

**Avoid.** Tabular figures in a proportional font (use `tabular-nums`);
a horizontally scrolling table on desktop; columns filled with assumed
airplane figures; a nav log that computes anything itself.

**Sources.** [ff-web], [ff-navlog-winds], [skyvector-guide],
[linear-refresh-why], [shadcn-datatable], [apg-table], [apg-grid],
[ra-table], [apg-disclosure], [wcag-2411], [mdn-interpolate-size].

### 5. Brief, Go / No-Go and Ready to Fly

**Reference.** ForeFlight's Graphical Briefing turns the standard text
briefing into a visual one and is said to suit a full desktop view
([ForeFlight Web][ff-web]); only a briefing started from Flights' Briefing
button is kept as the record for 14 CFR 91.103, for 120 days
([ForeFlight briefing record][ff-brief-record]). Vercel's guidelines: every
screen offers a next step, and the empty, sparse, dense and error states
are designed ([Vercel guidelines][vercel-guidelines]).

**Structure, top to bottom** (decision 0012, verdict first).
1. The verdict, as the engine words it, and at most three one-line
   actions.
2. The Ask field.
3. The risk in words, then the glance cards (weather, NOTAMs, TFRs,
   airplane, pilot currency).
4. The detail, folded under each card.
5. Ready to Fly: the checks left before departure, each with its source.

**Stock parts.** Base UI Accordion for the folded detail (its keyboard
follows the APG since 1.6, [Base UI releases][bui-releases]); shadcn Card,
Item and Badge; Base UI Checkbox for Ready to Fly's checks; `alert` role
only for a change that appears while the pilot reads (a new TFR), never
for the verdict at load ([APG alert][apg-alert]). On desktop the Brief
opens in the side panel at full height; a wider desktop window may show
the glance cards two columns wide by container query.

**Primary action.** The first of the three actions, as a filled button
under the verdict. Ready to Fly's primary is the next unchecked item.

**Keyboard and hover.** `B` opens the Brief (switchable, WCAG 2.1.4); Tab
through the actions, then Ask, then the cards. A card's hover on desktop
outlines what it refers to on the map (a TFR, a field).

**Motion.** The verdict appears with no animation; folded detail opens
with its height.

**Avoid.** A verdict that blocks planning (warn, never limit); auto
dismissing an alert (the APG warns against it, [APG alert][apg-alert]);
footnotes explaining the verdict (decision 0019); a figure the engine did
not give; "no NOTAMs" (decision 0023: "none heard since").

**Sources.** [ff-web], [ff-brief-record], [vercel-guidelines],
[bui-releases], [apg-alert].

### 6. NOTAMs

**Reference.** ForeFlight 18.6 (July 2026) filters NOTAMs by category,
source and activation time, sorts by category, recency and effective
time, pins NOTAMs to the top and collapses less important ones (described
for the mobile Airports view); its translated NOTAMs appear in ForeFlight
Web too ([ForeFlight 18.6][ff-186]). Windy v49 shows NOTAMs raw and
decoded and lets them be marked read ([Windy v49][windy-v49]).

**Structure, top to bottom.** The coverage line ("none heard since …"
when empty, decision 0023); a filter row (category, active now / later,
read); the ranked list (`features/notamRanking`), each NOTAM's plain
words first and its raw text as sent beneath, folded; pinned first.

**Stock parts.** Filters: Base UI Toggle Group or a Menu with checkbox
items (menus, not sliders); the list: shadcn Item rows; the raw text:
Base UI Collapsible; Pin and Mark Read in each row's Menu.

**Primary action.** None per screen; per NOTAM, its row's menu.

**Keyboard and hover.** Filters are a toolbar (one tab stop, arrows,
[APG toolbar][apg-toolbar]); the list a plain list of disclosures. On
desktop, a NOTAM's hover outlines its area or runway on the map.

**Motion.** None beyond the disclosure.

**Avoid.** Rewriting the raw text (raw reports stay as sent); hiding a
NOTAM because it ranks low (collapse, never drop); a red banner for every
NOTAM.

**Sources.** [ff-186], [windy-v49], [apg-toolbar].

### 7. Weather and the radar loop

**Reference.** The FAA's GFA puts the time slider along the bottom with
the valid time in UTC above it, moved by click, drag, arrow buttons and
keys, with a Now button at its end; its radar loop is the latest image
and the previous four, toggled by the middle button; overlays are chosen
from a layer button at the top right ([GFA help][gfa-help]). Windy's staff
document ← and → stepping the timeline and ↑ and ↓ switching layers
([Windy shortcuts][windy-keys]); its radar timeline runs observed frames,
then about an hour of extrapolated nowcast shown in red, as two loops
([Windy radar][windy-radar]). Windy's own layout (layers on the right, the
bar's look) could not be confirmed from windy.com.

**Structure, top to bottom.** The map's layers in the Map menu (one home);
on the map, the loop bar at the foot above the sheet's pill: play/pause,
the scrubber with the frame's time (UTC and local), Now. Observed frames
and forecast frames look different on the bar, as Windy's red nowcast
does.

**Stock parts.** Play/Pause: shadcn Toggle (`aria-pressed`); the
scrubber: Base UI Slider (a playback position, not a setting, so decision
0017 does not apply); speed: a Menu or segmented control (decision 0017);
the bar: Base UI Toolbar. Wingtip's `features/weather-loop/LoopBar.tsx` is
the place.

**Primary action.** Play/Pause, at the bar's left.

**Keyboard and hover.** ← and → step a frame (Windy, GFA), Home goes to
the first frame, End and the Now button to now; Space toggles play while
the bar has focus. The slider follows the APG slider keys
([APG slider][apg-slider]); tapping the track sets the frame (WCAG 2.5.7).
On desktop, hovering the scrubber shows that frame's time.

**Motion.** The loop never autoplays under reduced motion, and it stops
by itself after one pass otherwise; any loop longer than 5 s has a pause,
and resuming goes to the newest frame ([WCAG 2.2.2][wcag-222]).

**Avoid.** A loop that plays on open with reduced motion on; a scrubber
that hides which frames are forecast; times without a zone; the slider as
the speed control.

**Sources.** [gfa-help], [windy-keys], [windy-radar], [apg-slider],
[wcag-222], [wcag-257].

#### Airport weather marks on the map (2026-11-10)

On the map, the owner's pick of 2026-11-10. Each reporting field wears its flight
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
than its METAR now (`weather_worse`). The weather comes on the map's own
`/api/airports/in-view` answer (`weather`), the same for every app; the
shared fixture is `apps/web/src/lib/fixtures/airportWeatherMarks.json`. A
screen reader says each field's category and wind ("KJVL, IFR, wind 220
at 18 gusting 26"). The Map card's Airport Weather is a segmented control (Off,
Halo, Dot, Station; `Segmented`, shadcn's ToggleGroup) with three switches: the station model when zoomed
in, the wind arrows, and getting worse by arrival, all on to begin with.

### 8. The emergency assistant

**Reference.** No reference app's emergency screen could be verified from
its own pages; the pattern comes from the standards. The APG's modal
dialog puts first focus on a static title (`tabindex="-1"`) for long
content and on the least destructive action for an irreversible step
([APG dialog][apg-dialog]); an `alertdialog` is only for an interruption
that needs an answer ([APG alertdialog][apg-alertdialog]).

**Structure, top to bottom.** Title (Emergency Assistant); 7700 and 121.5
as large copyable figures; the nearest fields with bearing, distance and
the engine's glide reach, nearest first; the picked airplane's emergency
checklist (or "No airplane picked", with the generic actions the engine
gives); the guidance list.

**Stock parts.** The one full-screen card of the one card rule (the
owner, 2026-11-10): a `SheetCard` in the map's sheet all the way up, the
side panel's full height on a desktop, over the search, its ✕ at the top
right. shadcn Item rows for fields, `FrequencyButton`,
`EmergencyChecklist`. No modal and nothing dimmed: the line to the field
picked is on the map, beside it on a desktop and under the sheet let
down on a phone (it was a dimmed sheet on a phone before).

**Primary action.** Direct To on the nearest field's row, first and
filled.

**Keyboard and hover.** Opens from the search ("emergency") and the
Airplane screen's Emergency row; no map button (decision 0010). Focus goes
to the title; Tab reaches Direct To next.

**Motion.** None: it opens at once, whatever the motion setting.

**Avoid.** A confirm step before Direct To; a toast; a spinner where the
nearest fields could already be shown from what is held.

**Sources.** [apg-dialog], [apg-alertdialog].

### 9. The logbook

**Reference.** ForeFlight Web opens its Logbook from the left-hand menu;
it has a Reports tab with a time filter at the upper right and an Export
tab for CSV ([ForeFlight logbook reports][ff-logbook-reports],
[ForeFlight logbook export][ff-logbook-export]). Notion opens a database
row in a side peek on the right ([Notion views][notion-views]).

**Structure, top to bottom.** Currency at the top (as the engine words it,
once #482 lands); Add Entry; the entries (desktop: a table with sticky
header, date, route, airplane, total, landings, remarks; phone: a list);
an entry opens as a card (side panel on desktop, sheet card on phone);
Export in the screen's •••.

**Stock parts.** shadcn Data Table (TanStack Table) on desktop, Item rows
on phone; React Aria DatePicker for dates (`components/ui/date-field.tsx`);
Base UI Number Field for times; shadcn Field for labels and errors.

**Primary action.** Add Entry, at the top right of the screen's head.

**Keyboard and hover.** The table follows the APG table; sorting by a
header sets `aria-sort` ([APG table][apg-table]). Linear's Space-to-peek
([Linear views][linear-views]) fits a focused row on desktop. Errors sit
by their field and focus moves to the first on save; fields the pilot
already gave are filled in (WCAG 3.3.7, [WCAG 2.2][wcag22]).

**Motion.** None beyond the card's arrival.

**Avoid.** Currency worked out in the component; disabling Save in
advance (Vercel: submit is not disabled in advance,
[Vercel guidelines][vercel-guidelines]); losing an unsaved entry without
a warning.

**Sources.** [ff-logbook-reports], [ff-logbook-export], [notion-views],
[linear-views], [apg-table], [wcag22], [vercel-guidelines].

### 10. The coach

**Reference.** No leading app's training coach could be verified; the
coach is the assistant with a lesson around it, so it follows the Brief's
verdict-first shape (decision 0012) and the Ask field.

**Structure, top to bottom (proposed).** What to practise next (one line and Start);
the lessons assigned (by an instructor) and suggested; the drill in
progress; the debrief of the last.

**Stock parts.** shadcn Card and Item; Base UI Progress for a lesson's
steps; Base UI Radio Group for quiz answers; the assistant's NDJSON
stream into `WordsSection`.

**Primary action.** Start (or Continue), filled, at the top.

**Keyboard and hover.** Radio Group arrows for answers; Enter submits.
A status line announces each new step without taking focus (WCAG 4.1.3).

**Motion.** Streamed words appear with no animation.

**Avoid.** A chat-bubble layout for teaching; a score that blocks the next
lesson.

**Sources.** [wcag22].

### 11. The dry run and the forecast run

**Reference.** The same playback as the radar loop: Windy steps time with
← and → ([Windy shortcuts][windy-keys]); the GFA's slider runs along the
bottom with a Now button ([GFA help][gfa-help]).

**Structure, top to bottom.** On the map, the airplane on the route; at
the foot, the run's bar (play/pause, the scrubber over the flight's time,
the speed menu); in the panel, the point flying to and the figures the
engine gives for that moment (`DryRunPanel`, `ForecastStrip`). The dry run
flies on from a stop at once (memory: dry run, no ground wait).

**Stock parts.** As the radar loop's bar: Toggle, Base UI Slider, Menu
for speed, Toolbar.

**Primary action.** Play/Pause, at the bar's left.

**Keyboard and hover.** ←/→ step, Home/End to the start and the end,
Space while the bar has focus. On desktop, hovering the route shows the
time over that point.

**Motion.** The airplane moves by transform; under reduced motion it
steps leg by leg instead of gliding. It never starts by itself
([WCAG 2.2.2][wcag-222]).

**Avoid.** Two playback bars of different shapes for the loop and the
runs; figures for a run computed in the view.

**Sources.** [windy-keys], [gfa-help], [wcag-222].

### 12. ATC and the clearance

**Reference.** No reference app's clearance reader could be verified.
The pattern is a form that reads what is spoken or typed, with the
standards' status messages (WCAG 4.1.3) and the APG's dialog only where a
step must be confirmed.

**Structure, top to bottom.** Comms assist's pill (the radio's mark,
"Listening to the radio…", then "Heard: " with the words and the chips)
when the radio is heard once; never the mic's look, which is Ask by
voice's (features/voice: a Base UI Toggle pressed while it listens, the
words typed into its field; the owner's split, 2026-11-10); the clearance as
the engine reads it, element by element (limit, route, altitude,
frequency, transponder code); the read-back text; Use This Route.

**Stock parts.** `ClearanceCard`, shadcn Textarea and Field for typed
input, `FrequencyButton`.

**Primary action.** Use This Route, filled, under the clearance.

**Keyboard and hover.** Typing works as well as speaking; Enter in the
field reads it (⌘Enter for a new line is not needed: it is one line).
New words are a polite live region.

**Motion.** None.

**Avoid.** A toast for a misread element (show it on the element); the
mic as the only way in.

**Sources.** [wcag22].

### 13. Account and settings

**Reference.** Vercel's guidelines: never block paste, inputs at 16 px or
more on phones, warn before leaving unsaved changes
([Vercel guidelines][vercel-guidelines]). WCAG 3.3.8: no sign-in step
may need a cognitive test such as remembering a password unless there is
an alternative or help ([WCAG 2.2][wcag22]).

**Structure, top to bottom.** A tap on the account button (the avatar
at the search row's end, beside the field, as on iOS and Android) opens the account and settings
page itself, with no menu between (the owner, 2026-11-10: "When tapping
the avatar just open the settings"; `AccountButton`, still named
"Account and settings"). Its rows are the pilot's own screens (Airplanes,
Checklists, Flights, Logbook, Coach, Practice, Minimums, Status, Guide,
About, from `design/screens.json`) and the look (Wingtip, Glass Cockpit,
Chart ink, Native); signing in and out, the mode, a copy of the data and
deleting the account are in the page's own Account menu. The map's
switches are the Map card's, which the map's own Map button opens over
the search (§15a). Sign-in by an emailed code or link.

**Stock parts.** Base UI Menu (the page's Account menu); Base UI OTP Field for an
emailed code (stable since 1.6, [Base UI releases][bui-releases]); shadcn
Field; Base UI Switch for on/off; Select or Toggle Group for discrete
choices (decision 0017).

**Primary action.** Per screen; Sign In in the welcome and in the
Account menu when signed out.

**Keyboard and hover.** The APG menu button and menu: Enter, Space or Down
open on the first item, typeahead, Home/End, Escape back to the button
([APG menu button][apg-menubutton], [APG menu][apg-menu]).

**Motion.** The menu's fade, 150 ms; none under reduced motion.

**Avoid.** A password-only sign-in; a code field that blocks paste; a
second home for a control that already has one.

**Sources.** [vercel-guidelines], [wcag22], [bui-releases],
[apg-menubutton], [apg-menu].

### 14. The welcome

**Reference.** Chrome's richer install dialog shows the app's description
and screenshots ([web.dev richer install UI][webdev-richer-install]), so a
welcome need not explain installing. Vercel: every screen offers a next
step ([Vercel guidelines][vercel-guidelines]).

**Structure, top to bottom.** The map behind; a short card: what Wingtip
is (one line), Pick Your Airplane (optional, with Skip: no airplane is
assumed), Plan a Flight (focuses the search), Sign In.

**Stock parts.** A `SheetCard` in the map's sheet over the search, with
its ✕, on a phone as on a desktop (the one card rule, 2026-11-10; on a
phone it was a dimmed sheet): non-modal, the map usable, the sheet at half.

**Primary action.** Plan a Flight, filled.

**Keyboard and hover.** Focus on the dialog's title; Escape closes it and
leaves the map ready ([APG dialog][apg-dialog]).

**Motion.** Fade in once; none under reduced motion.

**Avoid.** A tour of several pages; a welcome that must be finished before
the map works; weight on the first load (on a signed-out first visit the
"Before you fly" dialog is open as the page first paints, measured
2026-10-10).

**Sources.** [webdev-richer-install], [vercel-guidelines], [apg-dialog].

### 15. Installable web app specifics

**What the platforms ask today.**
- Chrome installs with a `name` or `short_name`, 192 and 512 px icons, a
  `start_url`, a `display` of standalone (or fullscreen, minimal-ui,
  window-controls-overlay), HTTPS, and some use of the page
  ([web.dev install criteria][webdev-install]).
- `screenshots` (with `form_factor` wide or narrow) and a `description`
  give Chrome's richer install dialog ([web.dev richer install
  UI][webdev-richer-install]).
- Safari 26: every site added to the Home Screen opens as a web app by
  default, with "zero requirements for installability"; a manifest's icons
  are used where there is one ([Safari 26][safari-26]).
- Web Push and badges on iOS work for Home Screen web apps only (iOS
  16.4); permission must follow a tap ([WebKit web push][webkit-push]).
- `id` identifies the app (falls back to `start_url`), limited
  availability ([MDN id][mdn-id]).
- `display_override: ["window-controls-overlay"]` puts the app's own bar
  in a desktop window's title bar area, via `env(titlebar-area-*)`;
  experimental and limited ([MDN WCO][mdn-wco]).
- `launch_handler` (`focus-existing`), `share_target` and `file_handlers`
  are experimental ([MDN launch_handler][mdn-launch-handler],
  [MDN share_target][mdn-share-target], [MDN file_handlers][mdn-file-handlers]).

**What Wingtip's manifest has** (`apps/web/vite.config.ts`): `display:
standalone`, `theme_color`, the icons and maskable icons. **Proposed,
generated rather than hand-written:**
1. `id` set to the app's path, so a later `start_url` change does not
   make a second app.
2. `shortcuts` generated from `design/screens.json` (the screens with a
   `shortcut` place, as Android's app shortcuts already are).
3. `screenshots` (one wide, one narrow) and a `description`.
4. `launch_handler: { client_mode: "focus-existing" }`, so a link opens
   the running app.
5. `display_override: ["window-controls-overlay", "standalone"]` for
   desktop, with the search in the title bar area; only once the panel's
   head is checked against `env(titlebar-area-*)`.

**Safe areas and the keyboard.** `viewport-fit=cover` with
`env(safe-area-inset-*)` (Baseline widely available, [MDN env][mdn-env]);
`dvh` follows the browser's bars but does not update at 60 fps
([web.dev viewport units][webdev-viewport]); `interactive-widget` is
Chrome only and Safari resizes only the visual viewport
([Chrome viewport resize][chrome-viewport-resize]). Base UI's
`Drawer.VirtualKeyboardProvider` and React Aria 1.22's overlays handle the
keyboard over sheets ([Base UI releases][bui-releases], [React Aria
1.22][ra-122]). Wingtip keeps pinch zoom; Apple Maps' web page sets
`user-scalable=no` (read from its HTML), and Vercel says never disable
zoom ([Vercel guidelines][vercel-guidelines]).

**Standalone look.** In `display-mode: standalone` there is no browser
bar: the panel's head carries Share, and the browser's Back is the close.

**Avoid.** An install banner of Wingtip's own over the map; asking for
notifications before a tap; a different app per `start_url`.

**In the air, with no connection (the offline audit, 2026-11-10).** The
service worker (Workbox, `vite.config.ts`) holds the app, the engine's
WebAssembly and what Keep for the Air fetched; the page asks it first.
- Every query is asked with no connection (TanStack Query's `networkMode:
  "offlineFirst"`, `lib/queryClient`), so the worker's kept answer
  reaches the page; one it did not keep says "No connection" in place
  (`QueryState`, `lib/problems`), never a blank or a skeleton for good.
- Emergency's best fields and Nearest rank the fields round the airplane
  on the device when the planner cannot be had: the airport index the
  browser keeps, the engine's `best_fields` (`lib/fieldsOnDevice`), said
  "From this device, without weather".
- Direct To works its leg out on the device (the engine's `navlog_leg`
  and `navlog_totals`, `features/plan/hooks/directOnDevice`), "Worked out
  on this device" under the Direct strip; where it cannot, the route is
  left as it was and "Not changed: no connection" is said.
- Keep for the Air keeps the map's overlay archive whole once a cycle,
  where the browser has room (`overlay-archive`, answered in ranges by
  Workbox's range-requests plugin), the route's side view, and the
  newest radar frame over the corridor (`radar-frames`, capped).
- The glide ring keeps the last field elevation it was given (within 20
  nm of that field).
- Ages: the airport weather marks say "Field weather 45m old" in the
  map's credits past half an hour; the briefing's age is the network's,
  after a reload too.
- In flying mode a read waits 4 s on the network before the kept answer
  (15 s on the ground), and a request that sends data fails "No answer in
  time" after 10 s.
- Safari's captions offline say "Speech needs a connection in this
  browser".

**Sources.** [webdev-install], [webdev-richer-install], [safari-26],
[webkit-push], [mdn-id], [mdn-wco], [mdn-launch-handler],
[mdn-share-target], [mdn-file-handlers], [mdn-env], [webdev-viewport],
[chrome-viewport-resize], [bui-releases], [ra-122], [vercel-guidelines].

### 15a. The map and its sheet: Apple Maps on the web (verified)

**Reference, verified.** The research of 2026-11-09 could not render
maps.apple.com (a script shell, see "Not verified"). On 2026-11-10 the
owner sent screenshots of Apple Maps on the web (beta) in iPhone Safari,
and these are the verified reference for the phone's map and sheet: the
sheet at rest ([apple-maps-web-rest.jpg](reference/apple-maps-web-rest.jpg)),
all the way up ([apple-maps-web-full.jpg](reference/apple-maps-web-full.jpg)),
a place card at the medium detent
([apple-maps-web-place-card.jpg](reference/apple-maps-web-place-card.jpg)),
the suggestions while typing
([apple-maps-web-typing.jpg](reference/apple-maps-web-typing.jpg)) and
scrolled with the keyboard up
([apple-maps-web-typing-scrolled.jpg](reference/apple-maps-web-typing-scrolled.jpg)),
a sent search's results
([apple-maps-web-results.jpg](reference/apple-maps-web-results.jpg)),
the same with a filter chip on and the results on the map
([apple-maps-web-results-map-filter-on.jpg](reference/apple-maps-web-results-map-filter-on.jpg)),
its Filters page
([apple-maps-web-filters.jpg](reference/apple-maps-web-filters.jpg)) and
the map-type card
([apple-maps-web-choose-map.jpg](reference/apple-maps-web-choose-map.jpg)).
The owner's rule: a screenshot of another app means ours should show this.

**What Wingtip shows, and where (built on `claude/web-applemaps`).**

| Apple Maps on the web | Wingtip |
|---|---|
| Sheet at rest: grabber, "Maps BETA" title row, full-width white search field on a light grey sheet | Grabber and the one search with the microphone as its trailing button and the account button at the row's end. No title row: the mark and "Wingtip Maps" were taken out for more map (owner decision 2026-11-10: "delete the logo from webapp to have more space"), so the pill is the search row alone; the mark stays the tab's and Home Screen's icon and About's, and "Wingtip Maps" the page's heading for a screen reader. The phone's sheet is `GLASS_SHEET` (the look's `--sheet`: `#f2f2f7` in Wingtip, the paper in Chart ink, Canvas in Native) and the field `bg-card` |
| All the way up: the title gone, the field pinned with a hairline under it | The field pinned with a hairline under it |
| Large bold section titles, picture cards sliding sideways, a white card with a question and art | The search's page (`SearchHome`): Favorites, Recents and Nearest titled as every section is, 20 points medium in the text's colour with the chevron in the tint (`PillSection`, decision 0021; owner decision 2026-11-10 (decisions page): one heading style, not Apple's bold); the Recents as picture cards of the sectional round each field (`RecentCards`, the chart's own tile, shadcn Carousel); Plan a Flight, "Where do you want to fly?", the mark as its art (`FlightSummary`) |
| Sheet's foot: Privacy \| Terms \| Legal \| Imagery, the copyright | `SheetFooter`: Privacy \| Terms \| Legal (About, every data source and licence), "© year Wingtip Maps". No "manage your business" line: no page for schools or clubs exists |
| One rounded card at the top right: map button over location | `MapControls`: the map's settings, the location arrow, the flown track and full screen in one rounded glass card at the right just over a bottom sheet's search row, riding its top as the radio's button does at the left (`OnSheetTop`; the owner, 2026-11-11: "keep the top right map button to just above the search bar on the right"), not at the top right where Apple Maps on the web has it; bottom right under a top sheet or beside the side panel |
| One round button at the bottom left (Look Around) | The radio's microphone, where it already was |
| Privacy \| Terms \| Legal \| Imagery at the map's bottom right, over the sheet | `MapCredits`: one MapLibre AttributionControl at the bottom right, riding the sheet's top, Privacy \| Terms \| Legal then each drawn source's credit (imagery, Google, the traffic, the overlay tiles' FAA cycle); gone all the way up, where the footer has them |
| A place picked: its card is the whole sheet, no search | Any card (a field, an airplane, a point, the Brief, the Map card) hides the search; its ✕ goes back to the search with the query kept |
| A place card scrolled: its title and ✕ stay in sight | `PinnedHead` (owner decision 2026-11-10: one pinned frosted head, no large title): the card's head is one row, its name, Share and ✕, pinned at the sheet's top under the grabber from the start, the content scrolling under it blurred through its frost (`frost-head`), solid where there is no backdrop-filter and under Reduce Transparency. It replaced a large title folding into a compact bar, which on an iPhone stuck partway down the sheet with the card scrolling above it. Every card with a head has it: `CardTitle` (airport, airplane, Stops), `CardHead` (Brief, Nav Log, Profile, Nearest, airspace, past flight), `SheetCard` (Map card and the cards in the sheet) and the lists in full (`ListPageHead`). The airport card's tabs pin under it, each tab keeping its own place in the scroll (`useTabScroll`) |
| Place card: big title, "kind · place" with the place a link, Share and ✕, four action tiles, photos sliding | The airport card: the ident, "name · town" with the town a link, Share, the star and ✕, Fly Here (filled), Add as Stop, Call, Address; the pictures as a sliding row |
| Typing: top hit with inline action pills, suggestion rows, places | `OneSearchResults`: one white group, the top hit with Fly Here and Depart From pills, Search Nearby and Ask as suggestions, the match in bold |
| One search field (the one card rule, 2026-11-10) | The traffic's airplane and Nearest's place are the one search's field scoped to them (`listSearchOf`, OneSearchField's `list`); the route's points, the route box's arrow between two points (a stop there, `useStopAsked`) and the traffic's airport ask it for an airport (`askSearchPick`, AirportPicker), its placeholder what they ask for; the developer's page, with no one search, keeps the picker's own |
| Questions over the page | Ready to Fly's prompt and a source's report as sent are SheetDialog's: from the bottom on a phone with their ✕, centred from `md` up |
| Typing, scrolled: the title and the field go up with the list, nothing pinned, the keyboard up | `sheet/useScrollAway`: all the way up with the search in use, the head pulled up by as much as the list has scrolled, back at its top; the field never leaves the page, so it keeps its focus |
| A sent search: Cancel beside the field, chips, rows with thumbnails, Filters page, numbered map marks | The sent search's list, its chips and Filters page on one filter state (VFR now and VFR at a time, towered, public, an instrument approach, fuel, runway surface and length, distance: the planner's Nearest with `wingtip.field_facts` and `field_forecast`; no fuel price, which the app has no source for), each row its METAR wind and visibility and what the field has, and the results as their own clustered MapLibre layer over the chart (the chart's own airport symbols untouched) |
| Map-type button: "Choose Map" card in the sheet, picture tiles | The Map card in the sheet (`MapSettingsButton`), chart picture tiles from committed crops (`public/map-tiles/`), every setting of the old menu under it |

**The one scrolling rule (the owner, 2026-11-10).** Every card, page and
sheet scrolls one way on a phone:

- The title and ✕ always in view: one pinned frosted head, no large
  title (owner decision 2026-11-10, above).
- At the pill and half way a drag up on the body raises the sheet; the
  body scrolls only all the way up, a drag down from its top lowering it.
  Base UI's Drawer hands a drag to any scroller under the finger that can
  scroll, and lets the sheet have it only toward its closing edge, so
  below full the body's scrollers are made no scrollers (`overflow-y:
  hidden`, which its arbitration skips; index.css). A script, the keyboard
  and a row brought into view still scroll them; the sheet stays at the
  size the pilot left it. Nothing sits below the screen to be scrolled to
  at half.
- Sideways rows scroll sideways only: the Embla carousels (`CardPictures`,
  `RecentCards`) and the route's pills carry `data-base-ui-swipe-ignore="x"`
  (an up or down drag the sheet's), and every native sideways row
  `overscroll-x-contain`. The upright altitude Slider and the sortable
  rows' grips keep `""`: their own drag is up and down.
- Back is where you were, new starts at the top: the airport card's tabs
  each keep their place, Settings' list its place after a page
  (`useScrollPlace`), and the suggestions, a sent search's results and its
  Filters page each their own scroll box.
- A form with something typed asks before a swipe, Cancel, Escape or a tap
  beside it throws it away (`useDiscardGuard`: Set Altitude, A Fix From).
- The search row stays while the keyboard is up, as it is typed in (it
  went with the keyboard, the field and the keyboard with it).

**Desktop.** Apple Maps on the web uses a left side panel there; Wingtip
keeps its side panel, with the same search row at its top.

### 16. Desktop versus phone

| | Desktop (≥ 1024 px, fine pointer) | Phone and touch tablet |
|---|---|---|
| Panel | Side panel the window's height, beside the map; hideable | Sheet with pill, half and full detents |
| Cards | Replace the panel's content; map stays usable | Cards in the one sheet (`ResponsivePopover`, `SheetCard`) |
| Small pickers | Popover anchored to the button | Card in the sheet |
| Search | The panel's field, and ⌘K as a dialog | The sheet's field |
| Hover | Preview cards, row ↔ mark highlight, tooltips naming icons | None; the same content on tap |
| Keys | Shortcuts shown with `Kbd`; switchable | None shown |
| Tables | Dense tables with sticky headers (nav log, logbook) | Lists, the selected row expanded |
| Context menu | Right-click (Base UI Context Menu) | The point card's actions; long press only as a shortcut |

**References.** Vercel's dashboard moved its tabs into a "resizable
sidebar that can be hidden", with a floating bottom bar on mobile for
one-handed use ([Vercel navigation][vercel-nav]). Figma hides both
sidebars with ⌘⇧\ and the whole interface with ⌘\
([Figma hide UI][figma-hide]). Apple Maps on the web toggles its Sidebar
with Shift-S ([Apple Maps shortcuts][amaps-shortcuts]). shadcn's Sidebar
collapses offcanvas or to icons and toggles with ⌘B/Ctrl B
([shadcn Sidebar][shadcn-sidebar]); its Dialog on desktop and Drawer on
mobile is the stated responsive pattern ([shadcn Drawer][shadcn-drawer]).
Linear's mobile app moved to a frosted glass material and a bottom
toolbar ([Linear mobile][linear-mobile]).

**For Wingtip.** Hiding the side panel is the close at its top (Escape on
desktop) and the pill's tap to bring it back; a dedicated toggle key is
the owner's call (decision 0013). Never let the hidden panel take focus
(WCAG 2.4.11).

**Sources.** [vercel-nav], [figma-hide], [amaps-shortcuts],
[shadcn-sidebar], [shadcn-drawer], [linear-mobile], [wcag-2411].

---

## Gaps found in today's web app

Read from the code on `claude/integration`, 2026-11-09; each is a
proposal, not done here.

1. Single-key shortcuts cannot be turned off (WCAG 2.1.4, Level A).
2. The manifest has no `id`, `shortcuts`, `screenshots` or
   `description` (section 15).
3. Done 2026-11-10: the toasts are Base UI's ("The stock parts").
4. Route rows use dnd-kit; React Aria's GridList, already installed, does
   keyboard drag with announcements (owner's choice, section 3).
5. Base UI Tabs default to manual activation; the APG prefers automatic
   for panels already loaded (section 2).

## What is still built by hand, and why

The owner's "Do em all" (2026-11-10) replaced every hand-built component
that had a stock one: the departure hours (ToggleGroup), the spinners and
the map's loading mark (Spinner), the fuel stop chip (Button), the route
pill's long press (ContextMenu's own), pull to refresh (a Refresh button
in each live card's head, and TanStack Query's focus manager and stale
times for the rest), swipe to delete (the row menu, RowMenu), the Undo
rows (Toast with its action), the status chips (Badge), the profile's
altitude (Slider, upright; a waypoint's altitude a Popover; the Altitude
Advisor Item rows), "Copied" (an anchored Toast), the flight's
progress (Progress), the dry run's on-or-off buttons (Toggle) and the
caution boxes (Alert). Code that re-implemented what a stock part does
went with them: the sheet's frame loop following the Drawer (its parts
now follow the Drawer's own CSS variables), its measured heights (fixed
snap points: the pill's parts, 23 rem, the room), its landing timer (the
Drawer's own transition end), its own Escape listener (the Drawer's
`escape-key`), the head's frosting, the input's own clear and Done on
Enter, the search's hidden native clear, its first-row and ⌘Enter
fallbacks (`autoHighlight="always"`), its numbered map marks and Alt+Down
override, the toasts' sonner-shaped calls (Base UI's `add` and `close`
directly) and their switched-off swipe, `joinProps` (Base UI's
`mergeProps`), and the route rows' drag image. What is left, each with
its reason:

- **`PhoneSheet` (components/PhoneSheet.tsx):** a phone's sheet for the
  app's questions and pages (SheetDialog), shadcn's Sheet with a swipe to
  put it away written by hand. Its stock replacement is Base UI's Drawer
  with `swipeDirection`, as the map's own sheet (MapPanel) already is; it
  carries every confirmation (an alertdialog) and the specs that drive
  them, so it moves in a pass of its own.
- **`IconTip` (components/popups/IconTip.tsx):** a long press that shows
  an icon button's tooltip on touch. Base UI's Tooltip opens on hover and
  focus only, and React Aria's `useLongPress` is in `react-aria`, which
  the app does not install (only `react-aria-components`); a new package
  for one gesture was not added.
- **The profile's chart (navlog MiniProfile):** a drawing, not a control;
  no stock chart draws the ground, the airspace and the altitude line
  together. It is read-only now, the Slider beside it the control.
- **The "Fetching…" lines** in the Brief's sections, the account pages
  and the coach: words, not a component; `QueryState` and `SkeletonLines`
  are the stock way, and each moves as its section is next changed.
- **Map gestures** (the ruler's two-finger hold, the zoom banner): on
  MapLibre's canvas, where no stock component reaches.
- **The radio's button, the map's buttons and the first flight's card on the sheet's top**
  (`sheet/sheetTop`, `OnSheetTop`): a portal into a slot in the Drawer's
  popup just over its top edge (`bottom: 100%`), so they move with the
  sheet under a finger and on its curve; the popup's corners are clipped
  on an inner box, not the popup, which they stand outside of. Base UI has
  no prop for parts riding a drawer; this uses only its popup's own box.
- **The side panel's Escape** (MapPanel, from `md` up): a plain region,
  not a Drawer, so no stock component hears the key for it. On a phone
  each card's own drawer closes it on Escape, and the sheet's own
  `escape-key`, with no card up, lowers it to the pill.
- **The departure hours' semantics:** Base UI's ToggleGroup gives pressed
  buttons in a group with arrow-key focus, not `role="radio"`; the stock
  behaviour is kept rather than overriding its ARIA.

## Not verified

- **Google Maps on the web:** the desktop side panel's layout, its
  Overview / Reviews / About tabs (documented only in Android help), the
  place panel's buttons and their order, and hover highlighting of pins
  from results. None is on Google's help pages read.
- **Apple Maps on the web:** the page is a script shell with no card in
  its HTML and no web app manifest. Its phone layout is now verified from
  the owner's screenshots (section 15a); its desktop layout is not. When
  Look Around arrived on the web is not stated; only its shortcut is.
- **Linear:** no full shortcut list page (`/docs/keyboard-shortcuts` is
  404), nothing on list density or how menus show shortcut hints.
- **Vercel:** the Geist component pages load but were not read.
- **Notion:** no single shortcut for opening a side peek.
- **Figma:** whether ⌘/ opens quick actions; the name "UI3"; resizing the
  right panel.
- **Raycast:** the action bar at the window's foot.
- **Windy:** windy.com renders its pages only in a browser, so its own
  layout (layers on the right, the bottom bar's look, the loop's length
  and step, mobile versus desktop) is unconfirmed; keyboard Space and `0`
  come from users, not staff.
- **ForeFlight Web:** the current Flights view, whether an airplane is
  required, the Navlog's layout and the web Standard briefing's NOTAM
  grouping; the 18.6 NOTAM filters are described for mobile. The left
  menu is confirmed only for Aircraft and Logbook. The track log export
  page answered 403.
- **SkyVector:** how charts are chosen, any shortcuts, where the plan box
  sits.
- **Base UI:** which positioning engine its popups use, and the behaviour
  of Dialog, Alert Dialog, Context Menu, Menubar, Toolbar, Slider, Scroll
  Area and Field, which were in the catalogue but not read one by one.
- **shadcn:** Kbd, Item, Field, Empty, Spinner, Button Group, Input Group,
  Combobox and Native Select pages were not opened; whether sonner is
  deprecated is not stated.
- **Web platform:** `popover="hint"` and `closedby` in stable Safari;
  Safari's scroll-state container queries; whether iOS 26 still requires
  `standalone` for Web Push; MDN's banner calling `transition-behavior`
  not Baseline (check its table before relying on it).
- **WCAG Understanding pages** for 3.2.6, 3.3.7, 3.3.8, 1.4.10, 1.4.13,
  2.3.3, 1.4.11, 4.1.3 and 2.1.4 were not read; this document uses their
  normative text from the Recommendation.

## Sources

Read on 2026-11-09.

[wcag22]: https://www.w3.org/TR/WCAG22/
[wcag3]: https://www.w3.org/TR/wcag-3.0/
[wcag-258]: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
[wcag-255]: https://www.w3.org/TR/WCAG22/#target-size-enhanced
[wcag-2411]: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
[wcag-257]: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
[wcag-222]: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
[wcag-214]: https://www.w3.org/TR/WCAG22/#character-key-shortcuts
[apg-patterns]: https://www.w3.org/WAI/ARIA/apg/patterns/
[apg-keyboard]: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
[apg-tabs]: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
[apg-combobox]: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
[apg-dialog]: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
[apg-alertdialog]: https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/
[apg-alert]: https://www.w3.org/WAI/ARIA/apg/patterns/alert/
[apg-menubutton]: https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/
[apg-menu]: https://www.w3.org/WAI/ARIA/apg/patterns/menubar/
[apg-disclosure]: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
[apg-grid]: https://www.w3.org/WAI/ARIA/apg/patterns/grid/
[apg-table]: https://www.w3.org/WAI/ARIA/apg/patterns/table/
[apg-toolbar]: https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/
[apg-slider]: https://www.w3.org/WAI/ARIA/apg/patterns/slider/
[apg-tooltip]: https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/
[webdev-install]: https://web.dev/articles/install-criteria
[webdev-richer-install]: https://web.dev/articles/web-apps/richer-install-ui
[webdev-viewport]: https://web.dev/blog/viewport-units
[webdev-vt-baseline]: https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available
[webdev-reduced-motion]: https://web.dev/articles/prefers-reduced-motion
[webdev-interaction]: https://web.dev/learn/design/interaction
[webdev-2025-10]: https://web.dev/blog/web-platform-10-2025
[chrome-vt-cross]: https://developer.chrome.com/docs/web-platform/view-transitions/cross-document
[chrome-viewport-resize]: https://developer.chrome.com/blog/viewport-resize-behavior
[chrome-select]: https://developer.chrome.com/blog/a-customizable-select
[safari-26]: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
[safari-27]: https://webkit.org/blog/18325/webkit-features-for-safari-27-0/
[safari-tp-249]: https://webkit.org/blog/18182/release-notes-for-safari-technology-preview-249/
[webkit-push]: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
[mdn-container]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@container
[mdn-env]: https://developer.mozilla.org/en-US/docs/Web/CSS/env
[mdn-popover]: https://developer.mozilla.org/en-US/docs/Web/API/Popover_API
[mdn-invokers]: https://developer.mozilla.org/en-US/docs/Web/API/Invoker_Commands_API
[mdn-position-area]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position-area
[mdn-interpolate-size]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/interpolate-size
[mdn-prefers-contrast]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-contrast
[mdn-forced-colors]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/forced-colors
[mdn-reduced-transparency]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-transparency
[mdn-id]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id
[mdn-wco]: https://developer.mozilla.org/en-US/docs/Web/API/Window_Controls_Overlay_API
[mdn-launch-handler]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/launch_handler
[mdn-share-target]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target
[mdn-file-handlers]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/file_handlers
[react-193]: https://react.dev/blog/2026/09/09/react-19-3
[react-vt]: https://react.dev/reference/react/ViewTransition
[bui-releases]: https://base-ui.com/react/overview/releases
[bui-drawer]: https://base-ui.com/react/components/drawer
[bui-tooltip]: https://base-ui.com/react/components/tooltip
[bui-preview]: https://base-ui.com/react/components/preview-card
[bui-tabs]: https://base-ui.com/react/components/tabs
[bui-autocomplete]: https://base-ui.com/react/components/autocomplete
[bui-animation]: https://base-ui.com/react/handbook/animation
[shadcn-components]: https://ui.shadcn.com/docs/components
[shadcn-base-default]: https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default
[shadcn-aria]: https://ui.shadcn.com/docs/changelog/2026-07-react-aria
[shadcn-drawer]: https://ui.shadcn.com/docs/components/base/drawer
[shadcn-toast]: https://ui.shadcn.com/docs/changelog/2026-07-toast
[shadcn-command]: https://ui.shadcn.com/docs/components/base/command
[shadcn-sidebar]: https://ui.shadcn.com/docs/components/base/sidebar
[shadcn-datatable]: https://ui.shadcn.com/docs/components/base/data-table
[ra-122]: https://react-aria.adobe.com/releases/v1-22-0
[ra-dnd]: https://react-aria.adobe.com/dnd
[ra-gridlist]: https://react-aria.adobe.com/GridList
[ra-table]: https://react-aria.adobe.com/Table
[ra-autocomplete]: https://react-aria.adobe.com/Autocomplete
[gmaps-a11y]: https://support.google.com/maps/answer/6396990
[gmaps-search]: https://support.google.com/maps/answer/3092445?hl=en&co=GENIE.Platform%3DDesktop
[gmaps-directions]: https://support.google.com/maps/answer/144339?hl=en&co=GENIE.Platform%3DDesktop
[gmaps-urls]: https://developers.google.com/maps/documentation/urls/get-started
[amaps-newsroom]: https://www.apple.com/newsroom/2024/07/apple-maps-on-the-web-launches-in-beta/
[amaps-shortcuts]: https://support.apple.com/en-us/126616
[linear-search]: https://linear.app/docs/search
[linear-views]: https://linear.app/docs/custom-views
[linear-refresh-why]: https://linear.app/now/behind-the-latest-design-refresh
[linear-mobile]: https://linear.app/changelog/2025-10-16-mobile-app-redesign
[vercel-guidelines]: https://vercel.com/design/guidelines
[vercel-cmdk]: https://vercel.com/changelog/quickly-navigate-the-dashboard-with-shortcuts
[vercel-nav]: https://vercel.com/changelog/dashboard-navigation-redesign-rollout
[notion-views]: https://www.notion.com/help/views-filters-and-sorts
[notion-shortcuts]: https://www.notion.com/help/keyboard-shortcuts
[figma-actions]: https://help.figma.com/hc/en-us/articles/23570416033943-Use-the-actions-menu-in-Figma-Design
[figma-shortcuts]: https://help.figma.com/hc/en-us/articles/360040328653-Use-shortcuts-and-quick-actions
[figma-hide]: https://help.figma.com/hc/en-us/articles/41414918021271-Hide-or-minimize-the-UI
[raycast-search]: https://manual.raycast.com/search-bar
[raycast-actions]: https://manual.raycast.com/action-panel
[windy-keys]: https://community.windy.com/topic/13/keyboard-shortcuts
[windy-radar]: https://community.windy.com/topic/31862/radar-animation-not-working-in-red-forecast-region-of-timeline
[windy-v49]: https://community.windy.com/topic/43511/what-s-new-in-v49-faster-smarter-and-made-to-fly
[ff-web]: https://foreflight.com/products/foreflight-web/
[ff-rubberband]: https://support.foreflight.com/hc/en-us/articles/215453597-How-can-a-waypoint-be-added-to-an-existing-route-in-ForeFlight-on-the-Web
[ff-navlog-winds]: https://support.foreflight.com/hc/en-us/articles/203313429-What-criteria-are-required-to-get-winds-aloft-calculations-in-the-Maps-page-NavLog
[ff-brief-record]: https://support.foreflight.com/hc/en-us/articles/13175606540951-Does-ForeFlight-keep-a-record-of-preflight-briefings
[ff-186]: https://foreflight.com/releases/18-6
[ff-logbook-reports]: https://support.foreflight.com/hc/en-us/articles/215562547-How-can-Logbook-Experience-Reports-be-viewed
[ff-logbook-export]: https://support.foreflight.com/hc/en-us/articles/215600817-Is-it-possible-to-export-ForeFlight-Logbook-data
[skyvector-guide]: https://skyvector.com/Flight-Planning-and-Filing-Pilots-Guide
[skyvector-airport]: https://skyvector.com/airport/MEM/Memphis-International-Airport
[gfa-help]: https://aviationweather.gov/gfa/help/

| Key | URL |
|---|---|
| wcag22 | https://www.w3.org/TR/WCAG22/ |
| wcag3 | https://www.w3.org/TR/wcag-3.0/ |
| wcag-258 | https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html |
| wcag-255 | https://www.w3.org/TR/WCAG22/#target-size-enhanced |
| wcag-2411 | https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html |
| wcag-257 | https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html |
| wcag-222 | https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html |
| wcag-214 | https://www.w3.org/TR/WCAG22/#character-key-shortcuts |
| apg-patterns | https://www.w3.org/WAI/ARIA/apg/patterns/ |
| apg-keyboard | https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/ |
| apg-tabs | https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ |
| apg-combobox | https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ |
| apg-dialog | https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ |
| apg-alertdialog | https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/ |
| apg-alert | https://www.w3.org/WAI/ARIA/apg/patterns/alert/ |
| apg-menubutton | https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/ |
| apg-menu | https://www.w3.org/WAI/ARIA/apg/patterns/menubar/ |
| apg-disclosure | https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ |
| apg-grid | https://www.w3.org/WAI/ARIA/apg/patterns/grid/ |
| apg-table | https://www.w3.org/WAI/ARIA/apg/patterns/table/ |
| apg-toolbar | https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/ |
| apg-slider | https://www.w3.org/WAI/ARIA/apg/patterns/slider/ |
| apg-tooltip | https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/ |
| webdev-install | https://web.dev/articles/install-criteria |
| webdev-richer-install | https://web.dev/articles/web-apps/richer-install-ui |
| webdev-viewport | https://web.dev/blog/viewport-units |
| webdev-vt-baseline | https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available |
| webdev-reduced-motion | https://web.dev/articles/prefers-reduced-motion |
| webdev-interaction | https://web.dev/learn/design/interaction |
| webdev-2025-10 | https://web.dev/blog/web-platform-10-2025 |
| chrome-vt-cross | https://developer.chrome.com/docs/web-platform/view-transitions/cross-document |
| chrome-viewport-resize | https://developer.chrome.com/blog/viewport-resize-behavior |
| chrome-select | https://developer.chrome.com/blog/a-customizable-select |
| safari-26 | https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ |
| safari-27 | https://webkit.org/blog/18325/webkit-features-for-safari-27-0/ |
| safari-tp-249 | https://webkit.org/blog/18182/release-notes-for-safari-technology-preview-249/ |
| webkit-push | https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ |
| mdn-container | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@container |
| mdn-env | https://developer.mozilla.org/en-US/docs/Web/CSS/env |
| mdn-popover | https://developer.mozilla.org/en-US/docs/Web/API/Popover_API |
| mdn-invokers | https://developer.mozilla.org/en-US/docs/Web/API/Invoker_Commands_API |
| mdn-position-area | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position-area |
| mdn-interpolate-size | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/interpolate-size |
| mdn-prefers-contrast | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-contrast |
| mdn-forced-colors | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/forced-colors |
| mdn-reduced-transparency | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-transparency |
| mdn-id | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id |
| mdn-wco | https://developer.mozilla.org/en-US/docs/Web/API/Window_Controls_Overlay_API |
| mdn-launch-handler | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/launch_handler |
| mdn-share-target | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target |
| mdn-file-handlers | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/file_handlers |
| react-193 | https://react.dev/blog/2026/09/09/react-19-3 |
| react-vt | https://react.dev/reference/react/ViewTransition |
| bui-releases | https://base-ui.com/react/overview/releases |
| bui-drawer | https://base-ui.com/react/components/drawer |
| bui-tooltip | https://base-ui.com/react/components/tooltip |
| bui-preview | https://base-ui.com/react/components/preview-card |
| bui-tabs | https://base-ui.com/react/components/tabs |
| bui-autocomplete | https://base-ui.com/react/components/autocomplete |
| bui-animation | https://base-ui.com/react/handbook/animation |
| shadcn-components | https://ui.shadcn.com/docs/components |
| shadcn-base-default | https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default |
| shadcn-aria | https://ui.shadcn.com/docs/changelog/2026-07-react-aria |
| shadcn-drawer | https://ui.shadcn.com/docs/components/base/drawer |
| shadcn-toast | https://ui.shadcn.com/docs/changelog/2026-07-toast |
| shadcn-command | https://ui.shadcn.com/docs/components/base/command |
| shadcn-sidebar | https://ui.shadcn.com/docs/components/base/sidebar |
| shadcn-datatable | https://ui.shadcn.com/docs/components/base/data-table |
| ra-122 | https://react-aria.adobe.com/releases/v1-22-0 |
| ra-dnd | https://react-aria.adobe.com/dnd |
| ra-gridlist | https://react-aria.adobe.com/GridList |
| ra-table | https://react-aria.adobe.com/Table |
| ra-autocomplete | https://react-aria.adobe.com/Autocomplete |
| gmaps-a11y | https://support.google.com/maps/answer/6396990 |
| gmaps-search | https://support.google.com/maps/answer/3092445?hl=en&co=GENIE.Platform%3DDesktop |
| gmaps-directions | https://support.google.com/maps/answer/144339?hl=en&co=GENIE.Platform%3DDesktop |
| gmaps-urls | https://developers.google.com/maps/documentation/urls/get-started |
| amaps-newsroom | https://www.apple.com/newsroom/2024/07/apple-maps-on-the-web-launches-in-beta/ |
| amaps-shortcuts | https://support.apple.com/en-us/126616 |
| linear-search | https://linear.app/docs/search |
| linear-views | https://linear.app/docs/custom-views |
| linear-refresh-why | https://linear.app/now/behind-the-latest-design-refresh |
| linear-mobile | https://linear.app/changelog/2025-10-16-mobile-app-redesign |
| vercel-guidelines | https://vercel.com/design/guidelines |
| vercel-cmdk | https://vercel.com/changelog/quickly-navigate-the-dashboard-with-shortcuts |
| vercel-nav | https://vercel.com/changelog/dashboard-navigation-redesign-rollout |
| notion-views | https://www.notion.com/help/views-filters-and-sorts |
| notion-shortcuts | https://www.notion.com/help/keyboard-shortcuts |
| figma-actions | https://help.figma.com/hc/en-us/articles/23570416033943-Use-the-actions-menu-in-Figma-Design |
| figma-shortcuts | https://help.figma.com/hc/en-us/articles/360040328653-Use-shortcuts-and-quick-actions |
| figma-hide | https://help.figma.com/hc/en-us/articles/41414918021271-Hide-or-minimize-the-UI |
| raycast-search | https://manual.raycast.com/search-bar |
| raycast-actions | https://manual.raycast.com/action-panel |
| windy-keys | https://community.windy.com/topic/13/keyboard-shortcuts |
| windy-radar | https://community.windy.com/topic/31862/radar-animation-not-working-in-red-forecast-region-of-timeline |
| windy-v49 | https://community.windy.com/topic/43511/what-s-new-in-v49-faster-smarter-and-made-to-fly |
| ff-web | https://foreflight.com/products/foreflight-web/ |
| ff-rubberband | https://support.foreflight.com/hc/en-us/articles/215453597-How-can-a-waypoint-be-added-to-an-existing-route-in-ForeFlight-on-the-Web |
| ff-navlog-winds | https://support.foreflight.com/hc/en-us/articles/203313429-What-criteria-are-required-to-get-winds-aloft-calculations-in-the-Maps-page-NavLog |
| ff-brief-record | https://support.foreflight.com/hc/en-us/articles/13175606540951-Does-ForeFlight-keep-a-record-of-preflight-briefings |
| ff-186 | https://foreflight.com/releases/18-6 |
| ff-logbook-reports | https://support.foreflight.com/hc/en-us/articles/215562547-How-can-Logbook-Experience-Reports-be-viewed |
| ff-logbook-export | https://support.foreflight.com/hc/en-us/articles/215600817-Is-it-possible-to-export-ForeFlight-Logbook-data |
| skyvector-guide | https://skyvector.com/Flight-Planning-and-Filing-Pilots-Guide |
| skyvector-airport | https://skyvector.com/airport/MEM/Memphis-International-Airport |
| gfa-help | https://aviationweather.gov/gfa/help/ |

The table repeats every source in plain text, since a reference link's
definition does not show when the page is rendered.
