---
name: ipad-iphone-review
description: Build or review a screen of the planner the way it will be judged as an iPad and iPhone app, the iPad first (portrait, landscape and split views), against Apple's Human Interface Guidelines and this app's own iOS rules, with measurements rather than impressions. Use for any change a pilot sees, for UI audits, and when the user reports something from their iPad or iPhone.
---

# iPad and iPhone review

Most pilots fly with an iPad, on a kneeboard or a yoke mount: it is the
primary device (decision 0058; the owner, 2026-11-21: "Primary app users
are on iPad, so make sure we pay special attention to iPad layout etc.").
Judge every screen, on the web in iPad Safari and in the native app, in
this order:
1. iPad portrait: the 11-inch iPad Pro, 834 × 1194 at 2x (`webkit-ipad`),
   and the 13-inch, 1032 × 1376 (`ipad-pro-13`).
2. iPad landscape: 1376 × 1032 (`ipad-pro-13-landscape`).
3. iPad split views and Slide Over: 320 wide (`ipad-slide-over`) up to
   two-thirds of the screen (section 2's widths).
4. iPhone portrait: 402 × 874 at 3x, the iPhone 16 Pro.
5. iPhone landscape.
6. Desktop, last.

The general craft is in two user-level skills in `~/.claude/skills`, so it
is not repeated here. Read them alongside this one:
- `apple-design`: the HIG's foundations, motion, materials and type.
- `mobile-native`: making the web feel native on a phone, such as sticky
  hover, tap highlights, the 100vh bug, inputs that zoom, safe areas and
  overscroll.

This skill keeps what is Wingtip's own: the tokens, the 44-pt pseudo hit
areas, the owner's layout decisions, the iPad widths and the measured
probes. Where those skills differ from it, this skill and CLAUDE.md win.
Examples: stock components with their own motion over a hand-built spring,
a token over a raw value, and a panel left where the owner put it.

## 1. Measure
- **Run the iOS audit** (`apps/web/e2e/ios`; how to run it is in the `checks` skill). Each rule there is a measurement on iOS's own geometries with a touch pointer. Every run takes four devices, the 13-inch iPad both ways up among them; `IOS_AUDIT=1` adds Slide Over and the iPad mini. A new screen or state gets an entry in `e2e/ios/screens.ts`.
- **The iPad in Safari's engine:** `--project=webkit-ipad` runs the smoke set on an 11-inch iPad Pro with touch, as main's push and a wave's validation do.
- **The native app on the iPad:** the newest iPad simulator (`scripts/dev/newest_simulator.py iPad`, a Pro where there is one), the change's own UI test class only (`-only-testing:`), through `scripts/dev/one-at-a-time.sh`. Main's push runs `CardSmokeTests` on it and the night the whole suite.
- **Take screenshots** on the iPad and the phone with a scratch script in the Playwright image (or `xcrun simctl io <id> screenshot`), and look at them before and after.
- **Report numbers:** sizes, contrast ratios, frames and overflow in points, not "looks fine".

## 2. The iPad's own checks

Each is a measurement with a pass mark. Where the app's iPad layout would
need a panel or a control moved to pass, that is a finding for the owner
(CLAUDE.md, "Never"), not a change.

1. **Size classes, not devices.** HIG Layout: "Determine layout based on
   size classes, not device type or orientation."
   - Native: the layout is chosen by the size classes alone
     (`RootLayout.of`, `Views/SplitLayout.swift`): regular both ways is
     `SplitLayout` (sidebar, map, inspector), anything else the iPhone's
     sheet. `git grep -n userInterfaceIdiom apps/ios/Wingtip` finds
     no layout branch (`Metrics.swift`'s tablet flag is a measurement, not
     a layout). Pass: on the iPad full screen, both ways up, the sidebar is
     there and no sheet grabber is; in Slide Over, the grabber is there.
   - Web: the layout is chosen by `use-desktop` (`(min-width: 1024px) and
     (pointer: fine)`), never by the user agent. Pass: at every iPad width
     with touch the page is the one docs/design/web.md, "Layout: two rooms,
     one content", gives that width and pointer, and nothing reads
     `navigator.userAgent` or `platform` for layout.
   - **Keep functionality the same as size classes change** (HIG Layout).
     Pass: with a card open, a rotation and a resize from full screen to a
     third and back keep the same card, its scroll position and any typed
     text; nothing closes or resets.
2. **Split view widths.** Run the audit's P11 (no sideways scroll), P1
   (hit areas) and P15 (contrast) at each width a window can take:
   - 320 (Slide Over); a third of the screen, about 375;
   - a half of an iPad on its side, about 590 on an 11-inch and 683 on a
     13-inch; two-thirds, about 800 and 990;
   - full screen: 834, 1032, 1194, 1376.

   The halves and thirds are **[inference]**, the screen's width less the
   divider; read the real width in the simulator before quoting it
   (`window.innerWidth` through Safari's Web Inspector, or the window's
   frame in an XCUITest). Apple's size classes there: only a 13-inch iPad
   on its side keeps regular width at a half; every third, Slide Over, and
   a portrait split are compact, and so take the sheet. iPadOS 26's free windows take any width
   between, so the check is the class, read from the trait, not the
   points. Pass: at each width the screen fits (P11 0 px), its controls
   keep 44 pt areas, and the layout is its size class's.
3. **The pointer and the keyboard.** iPads are flown with a Magic
   Keyboard or a trackpad as often as by touch.
   - Pointer, native: every tappable thing that is not a stock control
     (which gets one by itself) has `.hoverEffect` (map buttons, rows).
     Pass: `git grep -n onTapGesture apps/ios/Wingtip` lists none without a
     hover effect or a reason in a comment.
   - Pointer, web: hover styles only under `(hover: hover)`
     (`use-pointer-hover`), and nothing shown only on hover. Pass: every
     action reachable with touch alone at `hasTouch`.
   - Keyboard, native: the commands in `Views/KeyboardShortcuts.swift`
     (⌘F Search, ⌘B Brief, ⌘L Nav Log), ⌘Return on the route's ends and
     Escape on every close (`.cancelAction`). Pass: holding ⌘ on the iPad
     simulator with a hardware keyboard shows each, and each works.
   - Keyboard, web: Tab reaches every control in reading order, with a
     visible `:focus-visible` ring, Escape closes the top card or menu, and
     no focus trap but an open dialog's. Pass: a Tab walk through the
     screen visits every control once.
   - A field with the on-screen keyboard up, and with a hardware keyboard's
     bar alone, stays in sight above it (P19 names its return key).
4. **Sidebar and inspector** (native, regular width; docs/design/ios.md,
   section 16):
   - the sidebar 320–420 pt wide, the inspector 320–440 pt, the figure
     strip at most 520 pt, measured from their frames;
   - the sidebar's selected row stays highlighted, and it shows no more
     than two levels (HIG Sidebars);
   - a second-level card (an airport, an airplane, a leg) opens in the
     inspector beside the map, never as a sheet over it;
   - no map button or the own-ship arrow under the sidebar or inspector:
     their frames do not intersect;
   - the chart runs under the sidebar, as section 16 asks
     (`backgroundExtensionEffect()`).

   On the web the iPad keeps its sheet (web.md); measure the sheet's width
   and the map left in sight at each iPad width, and report against web.md.
5. **Popovers against sheets in a regular width.** HIG Popovers and Sheets:
   at regular width a menu, a picker or a small edit opens as a popover
   pointing at its control; a sheet is for a task that needs the pilot's
   whole attention. SwiftUI's `.popover` becomes a sheet at compact unless
   `presentationCompactAdaptation` says otherwise (`LegAltitudePopover`
   keeps its popover on purpose).
   - Pass, native: at regular width each such control's presentation is in
     `app.popovers`, not `app.sheets`, and its frame touches its source's;
     at compact it is what the iPhone shows.
   - Pass, web: menus and pickers are the stock `Popover` or `Menu`
     anchored to their trigger at every width; cards stay the nested
     drawers decision 0018 and the owner's 2026-11-13 word make them.

## 3. The rules on every device
1. **Hit areas are 44 pt, and controls never grow to get there.**
   - Stock sizes stay. An invisible pseudo-element (`after:absolute after:-inset-…`) makes the area.
   - Icon buttons in a row sit at `gap-2`, so 36 px buttons' areas meet. 32 px buttons need `gap-3`.
   - Verify with `document.elementFromPoint` at ±((44 − size) / 2 − 1) px outside the box, never by size alone.
   - The one exception is switches, drawn at iOS's 51 × 31 on a touch pointer.
2. **Everything tappable is the blue tint.** Filled buttons use `--primary`. The words and glyphs of every other tappable thing use `text-tint`: outline, ghost and link buttons, action rows, checkmarks, chevrons and select values. Destructive stays red. Plain text, field-like pickers and list choices stay in the text colour. The map's Map and Flown track buttons stay black, as Apple Maps draws its own map buttons: the owner's pick on 2026-10-20, so it isn't a finding.
3. **Type sizes come from `apps/web/src/lib/text.ts` (`TEXT`),** never raw `text-sm`/`text-xs`. On touch that's 17 for rows and titles, 15 for detail and prose, 13 for notes. Nothing goes below 11 pt, and text must survive Larger Text at 125%.
4. **Panels are the platform's stock sheet with detents, like Apple Maps** (decision 0018): a pill, half and full, solid on the web, glass only on what floats over the map. The map follows the sheet. **Never move a panel or a control to another part of the screen** unless the owner said so in the issue.
5. **Discrete settings are a menu or a segmented control,** never a slider.
6. **Errors show where they happen,** through `apps/web/src/lib/problems`, not in a toast.
7. **Use stock components first** (shadcn on Base UI and React Aria, SwiftUI), and delete a hand-rolled one once nothing uses it.
8. **Fit,** measured by the audit. The general phone-web fixes, such as safe areas, Reduce Motion and overscroll, are in `mobile-native`. This skill keeps the pass marks:
   - nothing scrolls sideways (P11: `scrollWidth > clientWidth` on any container fails);
   - text contrast is at least 4.5:1 (P15);
   - every icon-only button has a name VoiceOver can read.
9. **Words:** "airplane", the FAA's own word. FAA capitals go to sentence case with their codes kept (`faaWords` in `apps/web/src/lib/advisories`). Raw reports (METAR, TAF, NOTAM) stay exactly as sent.
10. **Safari:**
    - Anything that sends requests, stores data, asks for the position or uses the service worker gets a WebKit run (`webkit-ipad`, `webkit-iphone`, or a WebKit repro).
    - The phone is served the working tree as saved, but its service worker shows the previous build for one more load. Compare a device's screenshot with the code before acting on it.

## 4. The industry standards, and where each is checked

| Standard | What it asks | Checked |
|---|---|---|
| Apple HIG | Tap targets of at least 44 × 44 pt; text no smaller than 11 pt | P1 and P2 in the iOS audit, on its four devices every run |
| Apple HIG Layout, Sidebars, Popovers | Layout by size class; the sidebar and inspector in regular width; popovers, not sheets, for transient choices there | Section 2 here; Native iOS's suite on the iPad at night, `CardSmokeTests` on it after merge |
| WCAG 2.2 AA 1.4.3 / 1.4.11 | Contrast of 4.5:1 for text (3:1 for large text, controls and graphics) | P15 (light and dark), every run |
| WCAG 2.2 AA 1.4.10 | Reflow at 320 CSS px with no sideways scroll | P11 at 100% and 150% page zoom, every run; 320 is also Slide Over |
| WCAG 2.2 AA 2.1.1 / 2.4.7 | Everything works from a keyboard, with a visible focus | Section 2, check 3, by hand |
| WCAG 2.2 AA (all) | No serious or critical axe-core violation | a11y.spec on the main states every run; every audited screen nightly |
| WCAG 2.2 AA 2.5.8 | Targets of at least 24 × 24 CSS px | Covered by P1's stricter 44 pt; axe's own rule is off, as it can't see the `::after` hit areas |
| Core Web Vitals (web.dev) | LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms at the 75th percentile | Lighthouse nightly (TBT ≤ 200 ms stands in for INP); a miss opens a "standards" issue |
| Lighthouse | 90+ for performance, accessibility and best practices | Nightly, same issue route |
| Size | First-load JavaScript within 1.10 MB | `apps/web/scripts/first-load.mjs`, every run |

A change a pilot sees should keep every row green. A "standards" issue is fixed like any other: measure, change, measure again, with the numbers in the pull request.

**Style in the source** (the design audit runs these):
- Raw text sizes outside the type scale, which should be `TEXT.*`:
  `grep -rn -E '\btext-(xs|sm|base|lg|xl|2xl|3xl)\b' apps/web/src --include='*.tsx' --include='*.ts' | grep -v -E 'src/lib/text\.ts|src/components/ui/|\.test\.'`
  There were 29 on 2026-10-08. The allowed exceptions are SVG chart labels, print-only styles and the screen-reader skip link; say why in a comment.
- Controls grown to 44 px, which should use a pseudo-element hit area instead:
  `grep -rn -E 'min-(h|w)-(11|\[44px\])|\bh-11\b|\bsize-11\b' apps/web/src --include='*.tsx' | grep -v 'src/components/ui/'`
  There were 10 on 2026-10-08.

## 5. Report
For each screen and device, the iPad's orientations and widths first, give each rule and each of section 2's checks with its measurement, pass or fail. Fix the failures that are within the change. List the rest as findings with the owner's decision noted where one is needed, an iPad layout that would move a panel among them.
