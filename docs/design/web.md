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
- **One home per control**: You, Settings and the Map card
  ([rules.md](rules.md) §8; the owner, 2026-11-13), Settings one page
  and the one thing so named (decision 0014's no-second-home, kept).
- **Discrete settings are menus or segmented controls**, not sliders
  (decision 0017).
- **Errors show where they happen** (`lib/problems`), never in a toast.
  A confirmation with Undo is a Base UI Toast with its action (`lib/toast`
  `toast.undo`), the web's stock pattern, and a control's own
  confirmation ("Copied") an anchored Base UI Toast by that control
  (`lib/doneNote`), at the owner's word (2026-11-10).
- **The browser's defaults stay** (the overrides audit, approved
  2026-11-11): text is selectable, so a METAR, a NOTAM or a frequency is
  copied with a long press, and only buttons, tabs and the map take no
  selection (`index.css`).
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
  detents (pill, half, full), as decision 0018 sets. They are the stock
  Drawer's own snap points, fixed values in its own units, the same for
  the sheet and every card (`components/sheet/insets` `snapsOf`; the owner,
  2026-11-11, the detents felt buggy as px worked out from the window's
  height, which Safari's toolbar changes): the pill `"4.75rem"` (the one
  search's band with the grabber over it; a top sheet's `"5.25rem"`, the
  band and the grabber's row under it), half `"23rem"`, all the way up `1`.
  Nothing is computed from the window, the visual viewport, the safe areas
  or the content: the Drawer measures its viewport, which a bottom sheet's
  ends over the home indicator (its ground carried on under it), and the
  popup, kept clear of the status bar in CSS. `snapPoint` is set from the
  same constants by size and a drag maps back by identity. The pill is one
  row: on FPL the route's figures (and while flying), the route's row from
  half up (SheetParts' `figuresPill`, 3.25 rem under the grabber's room);
  on Search the search; the map's room is read from the Drawer's own
  `--drawer-snap-point-offset` (`useSheetCover`). The sheet is solid at
  every size (`GLASS_SHEET`, the look's `--sheet`), the desktop's side
  panel too (it was translucent until the 14 Nov audit's WEB-6), not glass; only the
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
- **No single-key shortcuts.** Wingtip's letters (`hooks/use-shortcuts.ts`:
  `/` the search, `B` the Brief, `N` Nearest, `D` Direct To; a card's `F`
  and `S`, `useCardKeys`) fire only with Alt held, Option on a Mac, read
  from the physical key (`event.code`, `lib/shortcutKeys`), never a bare
  letter (the owner, 2026-11-11: "I like the stock behavior"), so
  VoiceOver's quick nav, the browser's find-as-you-type and a speech
  user's words keep their keys; with a modifier always held WCAG 2.1.4
  (Level A, [WCAG 2.1.4][wcag-214]) asks for no switch, and Settings has
  none. Their hints and `aria-keyshortcuts` say "Alt+F".
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
  `cubic-bezier(0.32, 0.72, 0, 1)`, transform only: the Drawer's
  behaviour as it comes, nothing set over it (decision 0018; the owner,
  2026-11-10 and 2026-11-11, "Just let the drawer do what it does"), with
  one of its own options on: `snapToSequentialPoints`, so a swipe moves
  one size however fast (the owner, 2026-11-11).
- What the sheet shows follows its snap point the moment it is set: the
  grabber, the radio's and the map's buttons on its top, the body's layout
  for the size, the pill's row, the figures' compact form, the map's room
  (MapPanel). Nothing is held until the slide ends, nothing laid out ahead
  in a transition, nothing raises the sheet on a focus; the keyboard's
  inset and a focused field's scroll are `VirtualKeyboardProvider`'s.
  The one thing handed over at a slide's end is the map's buttons between
  the sheet and a card: they move onto a card once its drawer says it has
  come up (`onOpenChangeComplete`, `sheetTopSlot`'s `useRidingCard`) and
  back as it starts to close, so they never ride a card off the screen.
  MapLibre's corner controls move on the Drawer's time and curve too
  (`motion.drawer` and `motion.drawer-ease` in design/tokens.json, which
  every web class that runs the Drawer's figures reads).
- Cards over the sheet are the Drawer's own nested drawers (the owner,
  2026-11-11; `components/sheet/CardStack`), every card but the welcome
  (the owner, 2026-11-13: "For webapp, why don't we make everything a
  nested drawer except the welcome one?"): `SheetCard` for a thing's
  card, the Map card, an airplane's profile and Emergency; `CardLayer`
  for the route's Brief, Nav Log, Profile and Stops and for You
  (`features/shell/ConsoleLayer`, its one head row Settings' gear and
  the ✕, Settings and its pages inside it). Each with its own snap point
  among the sheet's three sizes, its grabber and its swipe, the sheet's
  swipe the card's while one is up, and its own Escape closing it. Each
  card sizes its own drawer (the owner, 2026-11-11): its snap point is its
  entry's `at` in `lib/sheetCards`, set as it opens -- half, every card,
  whatever it covers (`cardOpening`; the owner, 2026-11-11: "I thought
  stock was to open each card medium by default"), Emergency alone all the
  way up (`SheetCard`'s `fullScreen`) -- then where the pilot drags it or
  the card asks through
  `useCardSize()` (the stock controlled `snapPoint` and its change, from
  the card's context or by the `cardId` its own component gives it). The
  page's `setPanel` sizes the main sheet alone, its `data-panel` the
  sheet's own under a card too, each card's `data-panel` on its own
  drawer; what is in sight (the top card's, else the sheet's) is read for
  `<body>`'s `data-map-panel` and the map's room. No field's focus or
  typing sizes either. The page sizes the main sheet only by Apple Maps'
  one rule (the owner, 2026-11-11: "I like the stock behavior"):
  something new opened at the pill rises it to half (`riseToSee` in
  `features/plan/hooks/panelNow`); otherwise it keeps the size the pilot
  left it at, never lowered and never taken all the way up, a page put
  away leaving it where it is (`e2e/sheet-size.spec.ts`). They are put inside the sheet's popup
  (`Drawer.Portal`'s `container`), outside its corners' clip, placed from
  the sheet's snap offset to their own. A card comes up where the front
  sheet's top is (the sheet's, or the card's under it that the map's
  buttons ride), as Apple Maps' place card takes over its sheet, and
  eases to its own size: its popup placed at the front's snap offset
  under `[data-starting-style]` (`--card-from`, `sheetTopSlot`'s
  `frontOffset`), and faded out under `[data-ending-style]`. The map's
  buttons move onto its top in the commit it opens in, and glide (Web
  Animations, on the Drawer's time and curve) only when handed to a top
  at another height (Base UI writes the snap offset as 0 until it has
  measured, so without a starting place a card slid from full to half). What the sheet
  holds fades under a card as Base UI's nested drawers demo has it:
  opacity 0 under `[data-nested-drawer-open]`, back under
  `[data-nested-drawer-swiping]`, hidden once faded; its ground, edge and
  shadow the same on the Drawer's curve (`SheetDrawer`). A card's content stays drawn where
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
  anchored confirmations, on Base UI's own 5 seconds, held under a
  touch or the pointer and swiped away (2026-11-11).
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
   category chip and the METAR's age; Share at the bar's start, the name
   centred, and close (going back one level) at its end: two buttons at
   most (the owner, 2026-11-11).
2. Actions row, one row of equal tiles and no others (the owner,
   2026-11-11): Fly Here (filled, first), Add as Stop (where the field can
   be one; else the row holds three), Call, Favorite (the star, on or off,
   in Address's place: the address is the town link and the Info tab's
   row; the owner, 2026-11-11) (`lib/cardActions`;
   `docs/design/icons.md`). Refresh is at the right of the Weather tab's
   first row.
   Laid out after Apple Maps' place card since 2026-11-14 (the owner,
   with Maps' Teriyaki Madness card: "How can we make our airport card
   more similar to this? Can tabs be similar to that floating buttons
   group at the bottom?", then "fix it all"; option C1 on the canvas
   https://claude.ai/artifact/V1d9RDbmY1aczc4LfXed7a, board "Airport card
   after Apple Maps"; it replaces T4's tabs under the actions and their
   one-line report). The head's line says "Towered" or "Non-towered" after
   the name (`towered`, NASR's tower type). The tiles are 56 points tall,
   glyph over word, as Maps' are; Fly Here says the time there, "≈ 38m",
   where an airplane is picked and there is somewhere to measure from
   (own ship's fix, else the route's departure): the engine's
   `fuel_estimate` over its great-circle distance at the airplane's cruise
   TAS, no wind, so marked "≈" and said "about 38 minutes at 110 knots, no
   wind" (`place/flyHereTime`); "Fly Here" otherwise.
3. Facts, a sideways strip at the head of the Info tab alone (the owner,
   2026-11-14: "Info tab should start from the info strip and images and
   the rest. Switching tabs should not show those"; `place/PlaceFacts` on
   the shared `CardFacts`), each a small grey name over its value, as
   Maps' Hours, Yelp, Accepts and Distance, and a grey note under it where
   it has one. Always the same five, in this order, "—" where one is not
   known, so the strip never changes shape (the owner, 2026-11-14: "the
   info strip can have these fixed things: weather, airspace, elevation,
   pattern altitude and distance"); the words are `place/factWords`:
   - Weather: the flight category chip, "≈" where it is the model's or a
     near station's.
   - Airspace: "Class D", the class at the field's surface, the engine's
     `surface_airspace` (engine/crates/airspace/src/surface_class.rs; 14
     CFR 71.41, 71.51, 71.61, 71.71(b), AIM 3-3-1), which the planner asks
     of the NASR Class Airspace volumes holding the field and sends as the
     airport's `surface_airspace` (`airspace_class` too). Only a volume from
     the surface counts: a Class B or C shelf over the field is not its
     class. Part-time where NASR's WKHR_CODE is NOTAM or RMK, the note
     saying its other times as the Chart Supplement does (AIM 3-2-5a1):
     "Part-time, E other times", "Part-time, G other times", "Part-time,
     E or G other times".
   - Elevation: NASR's field elevation, feet MSL.
   - Pattern: the traffic pattern altitude, feet MSL, the engine's
     `pattern_altitude` the planner sends as `pattern`: NASR APT_BASE's TPA
     (feet above the field) over the field's elevation, the note its
     height ("807 ft AGL"); with none published, AIM 4-3-3a's 1,000 ft over
     the field for a propeller-driven airplane, the note "AIM, none
     published". APT_BASE gives one TPA; where NASR's remarks on it
     (APT_RMK, TPA: a large airplane's, a helicopter's, or the TPA itself)
     say more, the planner sends them in words (`pattern.remarks`), the
     note adds "others differ" ("AIM; FAA remarks differ" with none in
     APT_BASE), and the Runways tab's Pattern altitude row reads them.
   - Distance: from the pilot, else "From C81".
   The wind, the longest runway and the fuel are the Weather tab's, the
   Runways tab's and the Info tab's services, not the strip's.
4. The pictures (`place/PlacePictures`): large rounded tiles sliding
   sideways, from the air, the runways, from the ground, under the facts
   on the Info tab;
   a tap opens one full screen to pinch in on (ChartViewer's MapLibre
   map, its pages kept across the card's redraws so a pinch holds).
5. The tab's page (Info: the facts and the pictures, then its Details, the address alone since the facts have the rest (the owner, 2026-11-14: "Since the details are in the info strip, we can remove them except address"), the frequencies a pilot needs first,
   each copying on click, lights and services; Weather; Runways; Charts),
   then the tabs, Info, Weather, Runways, Charts (`place/PlaceTabBar` on
   the shared `CardTabBar`, the pages in `CardTabPages`; each tab an icon
   from lucide-react, required on `CardTab` (Info, CloudSun, PlaneLanding,
   FileText), the picked one with its word under it, the others icon alone, every tab the same 48 points tall, all named
   by aria-label, the dot and count over the icon's corner; a tab picked
   opens at its own top, just under the actions (`useTabScroll`'s
   `scrollOnPick`: the pages' top where the card was scrolled into the last
   page, else where it is), moving nothing above the pages and never the
   detent, `useTabScroll` keeping their room as the scroller resizes so no
   swap clamps the scroll), in
   a glass capsule floating at the card's foot like Maps' group of
   buttons: sticky at the foot of the card's scroller and moved up by the
   Drawer's own offset (`--sheet-offset`, `--sheet-swipe`) so it stays at
   the foot of the part in sight at every height, hidden at the pill with
   the rest of the body; its own room in the flow is the room the last row
   scrolls clear of it. Glass (`liquid-glass`) because it floats over the
   card, the one place glass stays (rules.md; the owner, 2026-11-10), at
   the denser bar fill and blur (`material.bar-fill` 0.92, `bar-blur` 30)
   so its words read on the frost over a photo, 4.5:1 or more. The
   stock Tabs' list in its `tint` variant, capsule triggers 40 points tall
   with a 44-point `::before` hit area, the picked one filled in the tint;
   Weather carries the dot of the field's own report's category (the
   FAA's colour), Charts the count of its charts, each named with its
   hint, "Weather, MVFR", "Charts, 9". A tab not yet seen opens at its
   page's top under the head, and each keeps its place (`useTabScroll`).
   The Weather page's D-ATIS (`DigitalAtisRows`, where the tower's data
   link sends one) is its figures, a row each, then its remarks as their
   own group, "Remarks": a left-aligned list, an item a line in the
   broadcast's order, in the FAA's words in sentence case with RWY, TWY
   and the codes kept, figures as figures ("9,725 ft", "121.67"), and the
   sentences that say the same of several runways folded into one item
   with every runway listed ("IM out of service: RWY 9L, 9C, …"): the
   engine's `datis_remarks`, never the spoken words the read is heard by
   (the owner, 2026-11-14, of KORD's: "Can we make these remarks read
   better?"). The words as sent fold away at the group's foot.

**Structure, airplane card.** Head (tail, type, operator where the
registry gives it; a picked airplane of the pilot's own shows its
figures), the actions `lib/cardActions` gives its kind, then the figures
the engine has for it. The airplane card (`features/airplane`, `AirplaneProfileSheet`) is
laid out as the airport card is, the owner's P1 of 2026-11-14 (canvas
<https://claude.ai/artifact/XFZoWyJWzov7RCwRRPH253>; docs/design/rules.md,
the airplane card), and after Apple Maps' place card as the airport
card's C1 is (the owner, 2026-11-14: "make sure the airplane card looks
similar to airport card"), top to bottom: the `CardAction` row Fly This,
Follow (`AircraftAlertMenu` labelled Follow), Favorite (`FavoriteTile`)
and Share (`shareOrCopy`, `?airplane=`); the status line
(`airplaneStatus`); then, at the head of the Info tab alone (the owner,
2026-11-14), the facts strip (`components/airplane/AirplaneFacts`
on `CardFacts`: Type, Year, Seats, Engines, Registration, its status in
the destructive ink where lapsed, and Owner, public as the FAA publishes
it); its Planespotters.net photo as the airport card's picture tiles
(`CardPictures`, the tile the link to its page, the photographer named on
it); the page of Flights · Info · Figures, the tabs in the same
floating glass bar (`CardTabBar`, icons History, Info and Gauge, Flights with its count over its icon). It reads its N-number two ways at once (`lib/airplane/lookup`,
`useTailLookup`, in `useAirplaneCard`): the FAA's record from the
planner's `/api/traffic/registered`, off its disk in milliseconds, for
the line, Info (`AirplaneInfo`) and the ICAO address, and the rest of
its public record from `/api/airplanes/{n_number}` and its `/photo`
(`lib/airplane/details`; the history groups in `AirplaneHistory`, the
photo in the pictures); and
`/api/traffic/find`, the live sources, seconds when adsb.lol's API is
busy, for whether it is in the air. Flights is `PastFlights` by that
address with a ▶ on each row (`play`), each opening `PastFlightCard`
(`?flight=&past=`) over the card. The one search's N-number row
(`useOneSearch`) reads the same two queries, its type at once and
whether it is in the air under it, so the card opens on answers already
in hand. The FPL's airplane field suggests from the same rows as it is typed
(`navlog/useAirplaneSuggestions` over `hooks/useAirplaneHits`, Base UI's
Autocomplete through `CommandRoot` and `CommandField` in `InlineField`,
the list in a Popover under the field), the record alone, no live find. No airplane picked shows "No airplane
picked" and Pick Airplane, never a default type (decision 0011).

**Structure, a tracked flight's card** (`FlightCard`), the same way (C1,
2026-11-14): the head (callsign, what it is and who flies it, Share, ✕);
Follow, Alert, Debrief and Favorite; the flight in its summary
(`FlightSummary`: its ends, the bar of the way flown, height, speed and
track, or where its last flight landed), the card's head; then Info,
starting with the facts strip (`AirplaneFacts`, from the FAA record, the
traffic's type and year where it has none) and the pictures (its
Planespotters photo, then the sketch of where it has flown), then
`FlightInfoTab` (Details -- registration
opening its N-number's card, type, squawk, registered to, model,
operator, ICAO address, callsign, the tower's departure event -- the
scheduled route and the FAA registration), or Flights (its earlier
flights, each replayed) in the floating glass bar, Info first, the tab
kept for the airplane while the page is open (`useCardTab`).

**Structure, VOR and TFR cards** (the owner's iPhone screenshots of OBK's
and TFR 6/4116's cards, 2026-11-14). Both heads are the shared one: Share
at the start sending the card's own link (`?navaid=OBK@42.2214,-87.9517`,
`?tfr=6/4116`), the name centred with its line under it, ✕ at the end,
and no mark before the name. The VOR's line is its name and frequency as
the dial shows it ("Northbrook · 113.0"); its action row is always the
full row of `CardAction` tiles, Direct To (the plan's), Add to Route
(the point a waypoint) and the frequency to copy, "Copied" in place,
the first two greyed while there is no route (Direct To also needs the
airplane's position); no Favorite, as the Favorites hold airports and
airplanes only. Its service volume is every band of AIM 1-1-8's TBL
1-1-1 for its class (the engine's `service_volume`). A TFR's line is its
kind and a badge, Active in force now and Later before it starts; the
badges are the stock Badge through `StatusBadge` (a local one in
`components/map/cards` until claude/badges lands). A navaid's "Out of
service" badge waits for the data: NASR's SHUTDOWN stations are left
out of the chart's tiles, so no card shows one.

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

### 2a. The sheet's two pages (the owner, 2026-11-11; one toggle button since 2026-11-13)

The phone's sheet and the desktop's side panel hold two peer pages,
Search and FPL ([rules.md](rules.md) §4a), turned by one round glass
button riding the sheet's top (the owner, 2026-11-13: "Why
not make the same tab on the right toggle between search and fpl"), on
a phone at the left under the 3D, in the radio's button's place (the
owner, 2026-11-13: "Let's replace the radio button on the left with the
fpl toggle but below 3d"),
where a tab bar under the sheet, and before it a sideways pager and a
split grabber, were. It is the app's shadcn Toggle on Base UI's, never
pressed (`aria-pressed="false"`: a tap goes somewhere, it turns nothing
on), its name where it goes: `components/PageToggle`. It shows the page a
tap goes to, as Apple Maps' 2D/3D button does -- lucide's Route on
Search ("Show flight plan"), the magnifier on FPL ("Show search") -- in
a glass circle of its own the size of the 3D and microphone circles (a
36-point button in 4 points of glass), its 44-point area its `::after`
out to the glass's edge, never grown. On a phone it is the last of the
left-hand column (`MapControls`), so on a bottom sheet it rides the
sheet's top through `OnSheetTop`, 8 under the 3D circle and level with
the map's buttons' group at the right; the radio's button, drawn only
while Comms Assist is on (a switch of Settings' ATC page, `comms-assist-toggle`,
off by default; the owner, 2026-11-13), is then a
circle of its own over that group, as from md up, its listening pill
widening to the left across the screen less its margins (in flight its
circle grown to 60 over NRST, D→ and the arrow). Beside the side panel
the toggle is the last of the right-hand column, under the map's
buttons at the bottom right. The pages
live in `MapPanel` and the button with the map's, apart in the tree, so
`MapPanel` tells it the page up and the way to turn it
(`sheet/pageToggle`), or nothing while they cannot be turned. The
sheet's sizes stand on the screen's foot again (the home indicator's
inset), the bar's 48 points and its 4-point floor given back. Each page
(`sheet/SheetPages`' `SheetPage`) is kept, inert and skipped by
`content-visibility` while the other is up (index.css's
`tab-page[data-hidden]`), so each keeps its scroller's place. The
grabber is the plain `SheetGrabber`, its box 16 points tall (the owner,
2026-11-13: "minimal space"), its 44-point hit area reaching off the
sheet's edge over the map. The toggle gives way with the map's buttons
all the way up and while a card slides (index.css), goes while flying,
and rides a card's top while one is up, any card (the owner,
2026-11-13: "airport card hides the fpl toggle"). The
first flight's tip (`FplTip`) points at it while it shows FPL. The page up is the
planner's place (`usePanelView`'s `view`: the plan is FPL, the search
and the traffic are Search); the toggle picks it as a place is picked
(`pickPage`), and tapped with cards up it closes them all first
(`lib/openCards`' `closeEveryCard`, and You), as Android's
`SheetNav.show` does, none of them kept to come back with its page. The pill is the page's one row (the
route's figures on FPL); the route's figures sit at the foot on FPL
alone. The Brief, the Nav Log, the Profile and the Stops are cards over
FPL (`PlanCards`, `CardLayer`), the last three kept between their
openings: built at the first, their drawers closed and skipped by
`content-visibility` after (index.css's kept cards), as a tab put away
is, so the Nav Log is not built again (0.6 s). They are mounted beside
the sheet's pages, not in FPL's (`PlanPage`): in flight the sheet draws no
pages, and the Profile card, with a dry run's controls and its figures
and Done flying at its foot, stays up while the airplane flies.

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
`onReorder`, a `<Button slot="drag">` handle per typed point, keyboard
drag and screen reader announcements built in ([React Aria
GridList][ra-gridlist], [React Aria DnD][ra-dnd]): FPL's list is
`procedures/RouteGrid` (the stock audit's W3, the owner 2026-11-11), as
Favorites' rows are `SortableRows`. Only the typed points are dragged and
only between them (`getDropOperation`), the move made by `onReorder`'s
keys; where it will go is the stock `DropIndicator`, a tint line between
the rows (the owner's pick of the line over a ring round the row). The
route box's pills are not dragged: a horizontal ListBox's options cannot
hold the pill's own picker and menu (nested interactive), so a pill is
moved by its menu's Move Up and Move Down, or by its row in FPL's list.
Each row's menu: Base UI
Menu (Direct To, Set Altitude…, Hold Here…, Add a Stop After, Move Up,
Move Down, Remove). The map's point menu: Base UI Context Menu on desktop
right-click, the point card on touch. The string: shadcn Input Group.

**Primary action.** Adding a point: the search field in the route box
("Add a point"), and Fly Here / Add Stop on any card. Done editing has no
button: every change is saved as it is made, with Undo in place.

**Keyboard and hover.** The rows are a grid with one tab stop; arrows
between rows, Tab through a row's own controls (`keyboardNavigationBehavior`
"tab", so its text boxes keep their keys); Enter on a handle starts a
keyboard drag, arrows move it, Enter drops, Escape cancels ([React Aria
DnD][ra-dnd]). Move Up and Move
Down in each row's menu are the single-pointer alternative WCAG 2.5.7
names ([WCAG 2.5.7][wcag-257]); the APG has no drag-and-drop pattern of its
own ([APG patterns][apg-patterns]). Delete or Backspace on a focused row
removes it, with Undo in place. On desktop: hovering a row outlines its
leg on the map; hovering the route line shows a grab cursor where a drag
will insert a point; right-click opens the point menu.

**Motion.** The browser's own drag image; the row dragged dimmed and the
drop line shown where it goes, as React Aria draws them, nothing of our
own.

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
2. The glance cards (weather, NOTAMs, TFRs, airplane, pilot currency).
3. The detail, folded under each card.
4. Ready to Fly: the checks left before departure, each with its source.

**Stock parts.** Base UI Accordion for the folded detail (its keyboard
follows the APG since 1.6, [Base UI releases][bui-releases]); shadcn Card,
Item and Badge; Base UI Checkbox for Ready to Fly's checks; `alert` role
only for a change that appears while the pilot reads (a new TFR), never
for the verdict at load ([APG alert][apg-alert]). On desktop the Brief
opens in the side panel at full height; a wider desktop window may show
the glance cards two columns wide by container query.

**Primary action.** The first of the three actions, as a filled button
under the verdict. Ready to Fly's primary is the next unchecked item.

**Keyboard and hover.** Alt+B opens the Brief (WCAG 2.1.4); Tab
through the actions, then the cards. A card's hover on desktop
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

**On the airport card** (the Info tab, `place/PlaceNotams`): the
engine's first three in its order (`notams_ranked`), as every list on
the card shows three, how many in all at the title's right, and the
title, "NOTAMs ›", the way to every one on a card over it with the same
rows. Each row is the engine's reading (`notam_read`, the owner
2026-11-11: "can we decipher them better?"): its keyword as a heading
(Runway, Obstacle, Instrument approach, Temporary flight restriction
...), its words with the FAA's contractions written out (FAA JO 7340.2;
JO 7930.2 TBL 3-3-1) and its codes kept ("Runway 27 PAPI out of
service."), heights MSL unless AGL is stated ("1,047 ft MSL (210 ft above
ground)", JO 7930.2 4-2-1); its window in UTC, as the NOTAM gives it,
with an estimated end or a permanent one said, and in the device's own
time with its zone named; and "As Sent" folded. A word the engine does
not know stays as written.

**The airport card's Lights** (the Info tab, `place/PlaceLights`) read
the same way, by the planner (the engine's `lighting_read`, the owner
2026-11-11: "Also decode the lights information"): a row a system its
Chart Supplement remark names, its name in AIM 2-1 with the legend's
code as the title ("Approach lights (MALSR)", "Runway edge lights, high
intensity (HIRL)"), its runways under it, and how it is turned on
("Key the mic on CTAF when the tower is closed", "Preset low, sunset to
sunrise; key the mic on CTAF for more", "On all the time"); a sentence
the engine could not read in full a row of its words, never a guess;
the first three, "Lights ›" opening the rest; the Keying row where the
remarks give no count of their own (7 high, 5 medium, 3 low, AIM
2-1-8); and the remarks "As Written" folded.

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

On the map, the owner's pick of 2026-11-10, and since 2026-11-14 (option I
of <https://claude.ai/artifact/V1d9RDbmY1aczc4LfXed7a>) every field wears
the planner's one airport mark (`airportMarkSvg`, rules.md §5): the ring
in its surface airspace's chart code, its flight category the disc in the
middle, sized by the engine's `field_mark_rank` step (O'Hare 1.5
times an ordinary towered field), one GL picture per variant
(`lib/map/gl/airportIcons`). From
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
at 18 gusting 26"). Settings' Airport Weather is one menu (`PullDown`,
`airport-weather-look`) of Flight Category, With Wind (the default) and
Station Model (`lib/map/marks/airportWeatherPrefs`); the getting-worse
badge is always drawn (the owner, 2026-11-13).

### 8. The emergency assistant

**Reference.** No reference app's emergency screen could be verified from
its own pages; the pattern comes from the standards. The APG's modal
dialog puts first focus on a static title (`tabindex="-1"`) for long
content and on the least destructive action for an irreversible step
([APG dialog][apg-dialog]); an `alertdialog` is only for an interruption
that needs an answer ([APG alertdialog][apg-alertdialog]).

**Structure, top to bottom.** Title (Emergency, the card's name as drawn; its screen is "Emergency Assistant" in design/screens.json, its short label "Emergency"); 7700 and 121.5
as large copyable figures; the nearest fields with bearing, distance and
the engine's glide reach, nearest first, each row with the engine's
reasons (its runway, its flight category) and the field's reported
visibility as the METAR gives it ("Visibility 3 sm", "10+ sm" for a
more-than report; nothing where the report has none, never a guess); the picked airplane's emergency
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
coach follows the Brief's verdict-first shape (decision 0012).

**Structure, top to bottom (proposed).** What to practise next (one line and Start);
the lessons assigned (by an instructor) and suggested; the drill in
progress; the debrief of the last.

**Stock parts.** shadcn Card and Item; Base UI Progress for a lesson's
steps; Base UI Radio Group for quiz answers.

**Primary action.** Start (or Continue), filled, at the top.

**Keyboard and hover.** Radio Group arrows for answers; Enter submits.
A status line announces each new step without taking focus (WCAG 4.1.3).

**Motion.** A new step appears with no animation.

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
at the search row's end, beside the field, as on iOS and Android) opens
You (`PilotPanel`, `lib/openSettings` `openYou`; the owner's option A,
2026-11-13, [rules.md](rules.md) §8), as Apple Maps' avatar opens yours:
a centred avatar, the name, Pilot Details and the account's menu
(signing in and out, the mode, a copy of the data, deleting the
account), then Airplanes (the checklists inside), Flights, Logbook,
Minimums, Training (Coach, Practice), the Emergency Assistant, Settings
and Subscription. Settings (`features/settings`) is one page pushed over
You (`ConsolePages`): Map, In Flight
(Alerts; ATC), Data and Help & About (Guide, Status, Log, About,
Sources, the legal links); `openSettings` is the one way in, and the Map
card's gear opens it at its Map group with the card raised. The map's
layers are the Map card's, which the map's own Map button opens over the
search (§15a). Sign-in by an emailed code or link.

**Stock parts.** Base UI Menu (the page's Account menu); Base UI OTP Field for an
emailed code (stable since 1.6, [Base UI releases][bui-releases]); shadcn
Field; Base UI Switch for on/off; Select or Toggle Group for discrete
choices (decision 0017).

**Primary action.** Per screen; Sign In in the Account menu when
signed out.

**Keyboard and hover.** The APG menu button and menu: Enter, Space or Down
open on the first item, typeahead, Home/End, Escape back to the button
([APG menu button][apg-menubutton], [APG menu][apg-menu]).

**Motion.** The menu's fade, 150 ms; none under reduced motion.

**Avoid.** A password-only sign-in; a code field that blocks paste; a
second home for a control that already has one.

**Sources.** [vercel-guidelines], [wcag22], [bui-releases],
[apg-menubutton], [apg-menu].

### 14. The welcome

A welcome sheet again, the owner's option A (2026-11-13: "highlight that
it's a simple app with search like Apple/Google and a plan page like an
EFB that can be easily accessed"), where the 2026-11-11 word had left none.
The first time the planner opens with no route on a device
(`features/plan/components/FirstFlight`, `useFirstFlight`, kept in
`lib/firstRunTips`), Apple's welcome layout in the app's modal sheet
(`WelcomeSheet`: the stock Drawer on a phone, the stock Dialog from `md`
up, solid): "Welcome to Wingtip Maps", three rows (Search, like Maps; FPL,
like your EFB; FAA charts that move like Maps), Theme and Appearance as
two tiles (`components/lookPicks`' `ThemeTile` and `AppearanceTile`, `MenuTile`; the Map card's Look draws the same picks as the layers' tiles, `ThemeLayerTile` and `AppearanceLayerTile`), applied
as they are picked, the sheet and the map changing behind it; the owner,
2026-11-13), and at its foot Apple's permission priming (the owner,
2026-11-13): with the browser's question still to come, Turn On Location
(asked at the tap, never on load) and Later, each going on to the map;
allowed already, Let's Go Flying alone; refused before, the same two,
Turn On Location asking again and, refused once more with no question,
how to allow it in the browser's settings under it, the welcome kept. Each, a swipe down or a tap beside
the sheet goes on to the map with the one search ready: Search up
at half (rule 11),
its field asking for the destination (`useSearchPick`, as the route's own
pickers ask) but not focused, so no keyboard jumps up until the pilot taps
it; no field of its own. The airport picked is planned to from own ship's
nearest field, else the last
departure or Home, else the search asks for the departure. FPL comes up
and one tip (`FplTip`, the stock Popover anchored to the FPL tab with its
arrow) says the flight plan lives there, once. Settings' Guide, Show First
Flight Again, brings both back. The airplane is picked when it is needed,
never assumed (decision 0011).

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
standalone`, `theme_color` (the launch token), the icons and maskable
icons. The page's own `theme-color` is two metas, the launch ground by
day and the night navy by the device's scheme (`vite-plugins/manifest`
`themeColor`, from the tokens), then the page's ground once the look and
the Map card's Theme are on (`lib/brand` `BrandLook`), so the browser's bar is
dark at night (2026-11-11). **Proposed,
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
  on this device" under the Direct strip, and its fuel check as the
  planner makes it (`navlog_fuel_plan`, night from `night_at_either_end`),
  so the strip's Fuel req has its figure offline too; where it cannot, the
  route is left as it was and "Not changed: no connection" is said.
- Keep for the Air keeps the route's own answers -- its course,
  checkpoints, nav log and briefing, by the addresses the page asked
  (`lib/map/route/routeAnswers`) -- asked again through the worker, as the
  page's first load asked them before the worker held it; a kept route
  opened again offline plans from them (flight-critical.spec).
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
| One rounded card at the top right: map button over location | `MapControls`: the map's settings, the location arrow, the flown track and full screen in one rounded glass card at the right just over a bottom sheet's search row, riding its top as the 3D and the page toggle do at the left, the radio's button a circle over it (`OnSheetTop`; the owner, 2026-11-11: "keep the top right map button to just above the search bar on the right"), not at the top right where Apple Maps on the web has it; bottom right under a top sheet or beside the side panel |
| One round button at the bottom left (Look Around) | The 3D button, and under it the page toggle (the owner, 2026-11-13) |
| Privacy \| Terms \| Legal \| Imagery at the map's bottom right, over the sheet | `MapCredits`: one MapLibre AttributionControl at the bottom right, riding the sheet's top, Privacy \| Terms \| Legal then each drawn source's credit (imagery, Google, the traffic, the overlay tiles' FAA cycle); gone all the way up, where the footer has them |
| A place picked: its card is the whole sheet, no search | Any card (a field, an airplane, a point, the Brief, the Map card) hides the search; its ✕ goes back to the search with the query kept |
| A place card scrolled: its title and ✕ stay in sight | `PinnedHead` (owner decision 2026-11-10: one pinned frosted head, no large title): the card's head is one row, its name, Share and ✕, pinned at the sheet's top under the grabber from the start, the content scrolling under it blurred through its frost (`frost-head`), solid where there is no backdrop-filter and under Reduce Transparency. It replaced a large title folding into a compact bar, which on an iPhone stuck partway down the sheet with the card scrolling above it. Every card with a head has it, one row for all (`CardHeadRow`, the card rule's 8): `SheetCard`'s own (Map card and the cards in the sheet), `CardTitle`'s (airport, airplane), `CardHead`'s (Brief, Nav Log, Profile, Nearest, airspace, past flight); the lists in full (`ListPageHead`), the Stops' row (its distance a filter at its list's top), Settings (`flush`, its scroller unpadded) and its pages (`ConsolePages`) draw the same row, its name and line centred across the card, Share at its start and ✕ alone at its end, two buttons at most (the Brief's Refresh in its ••• menu, the Profile's VFR/IFR in its content), as Apple Maps' place card (`HeadGrid`; the owner, 2026-11-11: "let's move the title in the middle"); what scrolls under the head (an airport's name and town line, `CardHead`'s `line`) stays left-aligned (owner-reported 2026-11-11: Settings' title was its own, at 17 points under its pages' 22; `scripts/ci/shared_parts_guard.py` now fails a head drawn by hand). The airport card's tabs float in a glass bar at its foot (C1, 2026-11-14), each tab opening at its own top under the actions (`useTabScroll`; the owner, 2026-11-14: the facts and pictures are Info's alone) |
| Place card: big title, "kind · place" with the place a link, Share and ✕, four action tiles, photos sliding | The airport card: the ident, "name · Towered", Share and ✕, Fly Here (filled, its time "≈ 38m"), Add as Stop, Call, Favorite; a sideways strip of facts, the pictures as a sliding row, the tab's page, and the tabs in a glass bar floating at the card's foot (C1, the owner, 2026-11-14) |
| Typing: top hit with inline action pills, suggestion rows, places | `OneSearchResults`: one white group, the top hit with Fly Here and Depart From pills, Search Nearby as a suggestion, the match in bold |
| One search field (the one card rule, 2026-11-10) | The one search finds airplanes as well as places (no traffic page or airplane field of its own since 2026-11-14: `useAirplaneHits`, `useHeardHits`), and the airplanes' Adds ask it (`askFor("mine" \| "airplane")`, kept by `pickAirplane`); Nearest's place is a field scoped to it at its card's top (`nearSearch`, as the card covers the sheet's first row); the route's points and the route box's arrow between two points (a stop there, `useStopAsked`) ask it for an airport (`askSearchPick`, AirportPicker), its placeholder what they ask for; the developer's page, with no one search, keeps the picker's own |
| Questions over the page | Ready to Fly's prompt and a source's report as sent are SheetDialog's: from the bottom on a phone with their ✕, centred from `md` up |
| Typing, scrolled: the title and the field go up with the list, nothing pinned, the keyboard up | `sheet/useScrollAway`: all the way up with the search in use, the head pulled up by as much as the list has scrolled, back at its top; the field never leaves the page, so it keeps its focus |
| A sent search: Cancel beside the field, chips, rows with thumbnails, Filters page, numbered map marks | The sent search's list, its chips and Filters page on one filter state (VFR now and VFR at a time, towered, public, an instrument approach, fuel, runway surface and length, distance: the planner's Nearest with `wingtip.field_facts` and `field_forecast`; no fuel price, which the app has no source for), each row its METAR wind and visibility and what the field has, and the results as their own clustered MapLibre layer over the chart (the chart's own airport symbols untouched) |
| Map-type button: "Choose Map" card in the sheet, picture tiles | The Map card in the sheet (`MapSettingsButton`): chart picture tiles from committed crops (`public/map-tiles/`), None first, the plain ground (the owner, 2026-11-14: "chart should also have none option"; no FAA chart drawn, the overlay picked over the `map-ground` token's plain colour, light and dark, the airports, airspace, navaids, route, weather and traffic over it) with each chart's terminal sheet always drawn, the base map's four pictures ("Overlay" until 2026-11-14; the preference is still `overlay`) with Strength under them while one is picked, and four layer tiles two by two, Aeronautical, Weather, Traffic and Private & Military (the owner, 2026-11-14: "I want to keep it simple though. can we just have four layers aeronautical, weather, traffic, private/military in the map settings?"; `lib/prefs/mapSlice`, the old eleven folded in by `layerGroups`, version 10), Weather's picks (AIRMETs and SIGMETs and PIREPs as checkbox items, Winds Aloft, Radar and Model Weather as submenus) in the stock menu of the ••• in the Weather tile's corner (`LayerToggleMenu`), the tile's own tap still Weather on or off, the public fields, the route, own ship and the TFRs always drawn, and the route's checkpoints and Class B chips the route's ••• menu's On the Map switches (`RouteMapChoices`), off by default; the rest of the old menu is Settings', the card's gear opening it at Map (the owner, 2026-11-13). Since the owner's "How can this be better?" and "every section should have 4 tiles like Layers one" (2026-11-14), every section is the one 2×2 grid of equal tiles (`grid-cols-2 auto-rows-fr gap-2`, `components/LayerTile`, 80 points at the least): Chart and Base map as `LayerPictureTile` (the picture the face, the name on one line on a strip at its foot, the picked one's strip in the tint and the tile ringed in it, both Nones an empty map, `bg-muted` under a faint grid of `--border`; `MapPictureChoices`, the stock `ToggleGroup`), the layers as `LayerToggle`, and Look as Theme, Appearance and Sunlight (`LayerMenuTile`, the stock `PullDown` with the tile as its trigger, its value under its name; `lookPicks`' `ThemeLayerTile`, `AppearanceLayerTile`, `SunlightLayerTile`) and Position (`LayerToggle` on `ownShip`'s `enabled`, on by `askPositionQuietly`); Strength and Heights as inset grouped-list rows (`ListGroup`, `ListRow`, `TEXT.row`); one section gap, `gap-6` (`space.xl`). The terminal sheet has no switch: ChartGl always draws it (the owner, 2026-11-14: "TAC switch is not needed, just have it on by default"; the `tac` preference is gone, a kept one not read) |

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

**The airspace in 3D (the owner, 2026-11-14: "the class B airspace
shelves are not differentiating altitudes").** The 3D button stands the
Class B, C and D, the special use areas and the TFRs up
(`features/plan/map/terrain/AirspaceVolumesGl`, deck.gl), at their
heights times the Map card's Heights, and four things tell the altitudes
apart (`terrain/airspaceShelves`):

- **Heights** (the owner, 2026-11-14: "In 3d, can you clearly see the
  upside-down birthday cake for Class B airspace?"): at true scale
  Chicago's Class B is some 55 km across and 3 km tall, its shelves
  slivers, so 3D stands every height up ×3 unless the pilot picks ×1 or
  ×5 (the Map card's Heights, a segmented control shown while 3D is on;
  the preference `heightStretch`, its one source `lib/prefs/mapSlice`'s
  `HeightStretch`). The ground (MapLibre's terrain `exaggeration`), the
  volumes' floors and ceilings, the names and shelves' tabs lifted to
  their tops, the route and the approach in the air with their curtains,
  the obstacles, the traffic and the dry run's and replay's cameras are
  all stood up by the one factor, so each keeps its true place over the
  ground (the heights are MSL; the ground's own is read back at true
  height for the engine's AGL floors). A display factor, not an
  aviation figure: the words on the map keep the true altitudes
  ("100" over "30"), and the ground's clearance colours read the
  terrain's true heights. The dry run's pilot's view and the replay's
  cameras always draw at true height, whatever Heights says: a view from
  the airplane is read for its clearance over the ground, and a stretched
  mountain there would mislead (`terrain/heightStretch`'s
  `drawnStretch`); the Heights picked come back as the view ends, and a
  line under the control says "True height in the pilot's view" (or
  while a replay camera follows) meanwhile, no toast. The map tilts to 85 degrees in 3D
  (`map.pitch-max`), low enough to see the shelves from the side.

- Each Class B, C and D shelf is labelled at its top, facing the screen,
  in up to eight places spread along its edge at least 8 km apart, the
  one nearest the viewer tried first and every shelf's first before any
  shelf's next, MapLibre's collision keeping whichever fit, as the
  sectional writes it: the ceiling over the floor in hundreds of feet MSL, "100" over "30", "100"
  over "SFC", a Class C's "T", a Class D's ceiling alone ("-30"), in the
  2D chart's airspace tab (the engine's `airspace_shelf_label`; the FAA's
  Chart User's Guide). Lifted with MapLibre's
  `symbol-height-offset`, kept apart by MapLibre's own collision and
  placed after the airports' and navaids' marks, which they never hide,
  and before the special use areas' names where they meet at a low tilt;
  the chart's own tabs on the ground are hidden meanwhile.
- Each volume is shaded by its floor within its class's ink, the lower
  the darker (the tokens' `chart.airspace-floor-low`/`-high` and
  `map.airspace-shade-*`), with a solid rim along its top and along its
  floor where that is off the ground.
- With a route planned, the volumes holding its altitudes (the cruise and
  each leg's own) are drawn stronger and the rest fainter
  (`map.airspace-held`, `map.airspace-faded`), their labels fainter but
  legible (`map.airspace-label-faded`); whether a volume holds an
  altitude is the engine's (`airspace_volume_span`'s `holds`). With no
  plan nothing is faded.

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

1. Done 2026-11-11: no single-key shortcuts; every letter takes Alt
   (WCAG 2.1.4, Level A; "Keyboard").
2. The manifest has no `id`, `shortcuts`, `screenshots` or
   `description` (section 15).
3. Done 2026-11-10: the toasts are Base UI's ("The stock parts").
4. Done 2026-11-11: FPL's route rows are React Aria's GridList with its
   drag and drop (section 3); the route box's pills are moved by their
   menu.
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
snap points in the Drawer's own units: the pill's rem, 23 rem, 1), its landing timer (the
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
- **The map's buttons, the radio's, the 3D and the page toggle on the sheet's top**
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
