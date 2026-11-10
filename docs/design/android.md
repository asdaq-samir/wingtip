# Android: every screen the Android way

The owner asked on 2026-11-09 for each app to look and feel like its own
platform: "Can you do research on everything and let's make it
consistent look and feel to its platform." On Android the reference is
Material 3 Expressive and Google's own current apps. This page says how
each Wingtip screen is built on Android, from the top of the screen to
the bottom.

The app's data, words, rules and order of content are the same on every
platform (decision 0031). Only the presentation differs here. The engine
works out every figure. The Kotlin draws what the engine and the planner
answer and keeps its own formatting (`format/Format.kt`).

Checked on 2026-11-09 against `material3` **1.5.0-rc01**, Compose BOM
**2026.09**, `targetSdk` **37** (Android 17). Every claim has its source
URL. Some facts could only be read from search-result excerpts of
m3.material.io, because its pages are drawn by JavaScript and a fetch
returns only the title. Those carry **[excerpt]**. Anything that could
not be checked against a primary source is in "Not verified" at the
end, and nothing on this page describes a Google app from memory.

## Contents

1. [Foundations](#1-foundations): versions, theme, colour, type, shape,
   motion, haptics, targets, insets, back, adaptive layouts
2. [What Google's apps show](#2-what-googles-apps-show-verified): only
   what Google's own pages confirm
3. [The screens](#3-the-screens), one section each
4. [Not verified](#4-not-verified)

---

## 1. Foundations

### 1.1 Versions and what is stable

- Every public API tagged `ExperimentalMaterial3ExpressiveApi` was taken
  out of material3 1.4.0-beta01 ("please switch to 1.5.0-alpha"). So the
  Expressive components exist only in 1.5. 1.5.0-rc01 came out on
  2026-11-04 and fixes bugs only (sliders, `ToggleButton`).
  https://developer.android.com/jetpack/androidx/releases/compose-material3
- These are stable in 1.5 (the alpha that promoted each is in the
  release notes above):
  - `ButtonGroup` and the connected button group
  - `SplitButton`
  - `FloatingActionButtonMenu`
  - `HorizontalFloatingToolbar` and `VerticalFloatingToolbar`
  - `MediumFlexibleTopAppBar`, `LargeFlexibleTopAppBar`,
    `TwoRowsTopAppBar`, `FlexibleBottomAppBar` and `BottomAppBar`
  - `LinearWavyProgressIndicator` and `CircularWavyProgressIndicator`
  - the slot-based `SearchBar` with `SearchBarState`
  - `ExpandedFullScreenSearchBar`, `ExpandedFullScreenContainedSearchBar`
    and `ExpandedDockedSearchBarWithGap`
  - Expressive list items, `SegmentedListItem` among them
  - Expressive menus: `DropdownMenuGroup`, `SelectableDropdownMenuItem`,
    `CheckableDropdownMenuItem` and submenus
  - toggle buttons
  - `MotionScheme` (read it as `MaterialTheme.motionScheme`;
    `LocalMotionScheme` was removed in alpha27)
  - the stateful `Slider(state)`
  - the carousels
  - `ShortNavigationBar` and `WideNavigationRail`
  - pull to refresh
  - `MaterialExpressiveTheme`
- These are **still experimental**:
  - `LoadingIndicator` and `ContainedLoadingIndicator`, and
    `MaterialShapes`. Their promotion was reverted in alpha19, and no
    later note promotes them again.
  - `AppBarWithSearch`
  - `Morph.toPath`
  - the Expressive `TimePicker` (no note says it was promoted)
  - Sources: the release notes above and
    https://developer.android.com/reference/kotlin/androidx/compose/material3/package-summary
- From alpha18 on, the `Material3ExpressiveApi` annotation needs no
  opt-in (release notes above). Keep `@OptIn` for the experimental ones
  confined to `design/` (today `design/Loading.kt`), as
  docs/NATIVE-ANDROID.md says.
- Bump to 1.5.0 stable when it is released. The owner's rule (memory,
  2026-11-09) is to use Google's components, even in an rc, rather than
  our own copies.

### 1.2 Theme and colour: the brand, not the wallpaper

- The theme is `MaterialExpressiveTheme` (`ui/Theme.kt`), with Wingtip's
  own colour scheme generated from `design/tokens.json`.
- **No dynamic colour.** Material's guidance gives a static brand
  colour scheme to products that want uniformity, and says not to
  harmonise brand colours **[excerpt]**:
  https://m3.material.io/styles/color/dynamic/choosing-a-source and
  https://m3.material.io/styles/color/choosing-a-scheme
- Compose's dynamic schemes (`dynamicLightColorScheme`) are an opt-in
  from Android 12, so leaving them out is the supported path:
  https://developer.android.com/develop/ui/compose/designsystems/material3
- The brand tint is Sectional Blue (#0066CC). Everything tappable is the
  tint, and the container roles are `color.material.*`. Two looks, Glass
  Cockpit (the default) and Chart ink, are the only themes.
- **The chart's colours never follow the theme.** These are the chart's
  own, so they stay the same at night (`color.chart.*`):
  - the course's magenta #E600E6
  - the airspace blue and magenta
  - the airport symbols
  - the NEXRAD scale
  - the flight categories (`color.category.*`)
- Never tone-map a chart colour into a Material role, and never let a
  surface tint wash over the chart.

### 1.3 Type

- The `Typography` class has 15 baseline roles and 15 `*Emphasized`
  roles, from `displayLargeEmphasized` to `labelSmallEmphasized`. A
  constructor takes a default `fontFamily`.
  https://developer.android.com/reference/kotlin/androidx/compose/material3/Typography
- Material points to Google Sans Flex for the Expressive type scale
  **[excerpt]**: https://m3.material.io/styles/typography/overview
  - Wingtip keeps **Inter**, its brand face (`font` in the tokens).
    Google Sans Flex is Google's own brand face, so do not use it.
- Use Material's slot sizes on Android, not iOS's (the tokens'
  `android` slots, from the 2026-11-09 UI audit):
  - a row at `bodyLarge` (16 on 24)
  - prose at `bodyMedium` (14 on 20)
  - a note at `bodySmall` (12 on 16)
- Use the emphasized roles only for the one figure or title a screen
  is about: the verdict, a card's title, the strip's figures, a big
  hero figure.
- Every size is in sp, so it grows with the phone's font scale. Check
  each screen at the system's largest font size.

### 1.4 Shape

- Material 3 Expressive adds 35 shapes and built-in shape morphing
  **[excerpt]**:
  - https://m3.material.io/styles/shape/overview-principles
  - https://m3.material.io/styles/shape/shape-morph
  - https://m3.material.io/blog/building-with-m3-expressive
- Use shape for **state**: the stock buttons' `shapes` morph on press,
  and a toggled button goes from round to square.
- Do not decorate with shape. `MaterialShapes` is still experimental
  (1.1), so keep it to the loading indicator, which uses it already.
- The corner radii stay the tokens' (`radius.*`). The 28 dp of an
  extra-large shape is Material's sheet and dialog corner, which
  `radius.dialog` already matches.

### 1.5 Motion

- Material 3 Expressive replaces easing curves and durations with
  springs **[excerpt]**:
  https://m3.material.io/styles/motion/overview/how-it-works and
  https://m3.material.io/blog/m3-expressive-motion-theming
  - **Spatial** springs move position, size, rotation and corners, and
    may overshoot.
  - **Effects** springs change colour and opacity, and never overshoot.
  - There are two schemes, expressive and standard, each with fast,
    default and slow springs.
- `MotionScheme.expressive()` is set on the theme, so every stock
  component uses it.
- **The docked sheet included.** The owner (2026-11-09) had stock
  components keep their stock behaviour: decision 0018's ease-out, half
  stop and one size per throw were rules for a hand-built sheet. The
  panel is Material's standard bottom sheet (`ui/sheet/MapSheet`,
  `BottomSheetScaffold`), at its peek or expanded, on the motion
  scheme's springs.
- Use the system's **Remove animations** setting through Compose's
  animator duration scale. It already stills the stock springs.
- Use the expressive scheme for a whole control and the standard scheme
  (`MotionScheme.standard()`) for a figure changing in place, such as
  `design/RollingFigure`. A figure that overshoots would read as a
  different number for a frame.

### 1.6 Haptics

- Android's haptics principles
  (https://developer.android.com/develop/ui/views/haptics/haptics-principles):
  - prefer clear, rich effects over buzzy ones
  - no haptic at all is better than a buzzy one
  - use the predefined `HapticFeedbackConstants`
  - scale strength to how important the event is
  - be consistent
  - avoid raw `createOneShot` vibrations
- The constants and when each arrived:
  https://developer.android.com/reference/android/view/HapticFeedbackConstants
  - API 30: `CONFIRM`, `REJECT`, `GESTURE_START`, `GESTURE_END`
  - API 34: `TOGGLE_ON`, `TOGGLE_OFF`, `SEGMENT_TICK`,
    `SEGMENT_FREQUENT_TICK`, `GESTURE_THRESHOLD_ACTIVATE` and
    `GESTURE_THRESHOLD_DEACTIVATE`
- Compose's `HapticFeedbackType` has `Confirm`, `Reject`, `ToggleOn`,
  `ToggleOff`, `SegmentTick`, `SegmentFrequentTick`,
  `GestureThresholdActivate`, `GestureEnd` and `ContextClick`
  (compose-ui 1.8):
  https://developer.android.com/reference/kotlin/androidx/compose/ui/hapticfeedback/HapticFeedbackType
- How the tokens' kinds (`haptic.*`, `design/Haptics.kt`) map on
  Android:

  | Kind | Tokens today | On Android | Note |
  |---|---|---|---|
  | `direct-to` (Direct To / Fly Here taken) | `CONFIRM` | `Confirm` | keep |
  | `warning` (a rule warns) | `REJECT` | `Reject` | keep; a warning never blocks (decision 0008) |
  | `detent` (the sheet settles a size) | `CONTEXT_CLICK` | none: the stock sheet has no haptic of its own, and the owner had stock behaviour win (2026-11-09) | not used on Android |
  | `altitude` (a wheel's step) | `SEGMENT_FREQUENT_TICK` (API 34+), `CLOCK_TICK` below | the same | the owner's pick, 2026-11-09 (`ui/AltitudeRow`) |
  | a switch | none | `ToggleOn` / `ToggleOff` | the stock `Switch` |

- No haptics for scrolling, loading or arriving data.

### 1.7 Touch targets

- Every target is at least **48 × 48 dp**:
  https://developer.android.com/guide/topics/ui/accessibility/apps
  - Density must not shrink it **[excerpt]**:
    https://m3.material.io/foundations/designing/structure
  - The tokens' `size.tap-target` is 48 on Android.
- Controls keep their stock sizes (decision 0030). Compose's
  `minimumInteractiveComponentSize()` and the stock components make the
  area, so a 32 dp chip still has a 48 dp target. Never pad a control
  up to get there.

### 1.8 Edge to edge, back and configuration

- **Edge to edge** is enforced from target 35. At target 36 the opt-out
  (`windowOptOutEdgeToEdgeEnforcement`) is deprecated and disabled.
  - https://developer.android.com/about/versions/16/behavior-changes-16
  - https://developer.android.com/develop/ui/compose/system/insets
  - Use `Scaffold` and `WindowInsets.safeDrawing`.
  - The map runs under the status bar and the gesture bar.
  - Every panel, toolbar and FAB is padded by the insets.
- **Predictive back** shows the system's animations by default from
  target 36. `onBackPressed` is not called and `KEYCODE_BACK` is not
  sent (behaviour-changes page above).
  - `ModalBottomSheet` and `SearchBar` animate with predictive back
    themselves.
  - Anything custom uses `PredictiveBackHandler`, or
    `NavigationBackHandler` from `androidx.navigationevent` 1.2.0.
  - https://developer.android.com/develop/ui/compose/system/predictive-back
  - https://developer.android.com/jetpack/androidx/releases/navigationevent
- **Close goes back one level** (decision 0015):
  - Every level has its title on top and a close at the end.
  - The system's back gesture is the other way out, with its
    predictive preview.
  - No back arrow is drawn in a top app bar's navigation slot. That is
    the one place Wingtip departs from Material's top app bar.
  - Back steps down the same ladder as close: card, then lower sheet
    size, then leave the app (`design/PredictiveBack`).
- **Android 17**: activities are no longer recreated for keyboard,
  navigation-mode or colour-mode changes unless they opt in
  (`android:recreateOnConfigChanges`). Dark mode switching must
  therefore come from Compose state, not from recreation.
  https://android-developers.googleblog.com/2026/06/Android-17.html

### 1.9 Adaptive layouts: tablets and foldables

- **Window size classes**:
  https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
  - Width:
    - compact: under 600 dp
    - medium: 600 to under 840 dp
    - expanded: 840 to under 1200 dp
    - large: 1200 to under 1600 dp
    - extra-large: 1600 dp and up
  - Height breaks at 480 dp and 900 dp.
  - Large and extra-large need
    `currentWindowAdaptiveInfo(supportLargeAndXLargeWidth = true)`.
- **Large screens ignore orientation and resizability locks.** From
  target 36, a display of sw600dp or more ignores them. At target 37
  the opt-out is gone. So every Wingtip screen must work in any window
  shape on a tablet.
  - https://developer.android.com/about/versions/16/behavior-changes-16
  - https://developer.android.com/about/versions/17/behavior-changes-17
- **Adaptive library**: `compose-material3-adaptive` 1.3.0 is stable
  (2026-08-12). It added `adaptive-navigation3` scene strategies, and
  its scaffolds handle margins and edge to edge.
  https://developer.android.com/jetpack/androidx/releases/compose-material3-adaptive
- `NavigableListDetailPaneScaffold` and
  `NavigableSupportingPaneScaffold` add navigation and predictive back to
  the list-detail and supporting-pane scaffolds:
  - https://developer.android.com/develop/ui/compose/layouts/adaptive/list-detail
  - https://developer.android.com/develop/ui/compose/layouts/adaptive/build-a-supporting-pane-layout
- How Wingtip uses them is in [§3.17](#317-tablets-and-foldables).

---

## 2. What Google's apps show (verified)

This section has only what Google's own pages confirm. A screen below
takes its layout from these facts and from Material's component
guidance, and nothing else. Most of the full-screen layout of Google's
apps is **not** described on any Google page ([§4](#4-not-verified)).

- **Material 3 Expressive in Google's apps.**
  https://blog.google/products/android/material-3-expressive-android-wearos-launch/
  - Announced 2025-05-13 with "springy" motion, emphasized type and Live
    Updates.
  - The post names Google Photos, Fitbit and Gmail.
  - A dismissed notification drags its neighbours and gives a haptic
    snap.
- **Google's research** (https://design.google/library/expressive-material-design-google-research):
  - 46 studies with more than 18,000 participants.
  - Key elements were found "up to four times faster".
  - Pilots aged 45 and over matched younger users. Most of our pilots
    are in that group.
  - A large Send button just above the keyboard was found 4× faster
    than a small one in the top bar.
  - Two warnings from the same page:
    - Taking the text labels off actions made them harder to use.
    - A scattered layout scored worse than a plain list.
  - What Wingtip takes from it: **big primary actions near the thumb,
    labels kept on actions, plain lists for lists.**
- **Google Maps** (Android):
  - Search box "at the top"; recent searches come back as suggestions.
    "More Filters" sits over the results, and a mini pin opens a place's
    address, hours, phone, website and reviews.
    https://support.google.com/maps/answer/3092445?hl=en&co=GENIE.Platform%3DAndroid
  - Tap the place's "name or address at the bottom", then **Save**:
    https://support.google.com/maps/answer/7280933?hl=en
  - Directions:
    https://support.google.com/maps/answer/144339?hl=en&co=GENIE.Platform%3DAndroid
    - "At the bottom left, tap Directions."
    - Pick a travel mode.
    - The best route is in blue and the others in grey, each with its
      time on the map. Tap a grey one on the map to choose it.
    - Navigation starts only from where you are; otherwise you get
      "Preview".
  - "To start navigation, tap Start." In navigation, Close is at the
    bottom left:
    https://support.google.com/maps/answer/3273406?hl=en&co=GENIE.Platform%3DAndroid
  - Bottom tabs Explore, You and Contribute:
    https://support.google.com/maps/answer/144349?hl=en&co=GENIE.Platform%3DAndroid
  - Ask Maps (2026-03-12):
    https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation/
    - It is a button that answers in conversation, with "a customized
      map".
    - From an answer you can save, share or get directions.
    - Navigation explains why an alternate route might be chosen (toll
      against time).
- **Pixel Weather**: https://support.google.com/pixelphone/answer/15266029?hl=en
  - The AI "Weather Brief" is at the top. An extreme-weather alert
    takes its place.
  - "Hourly Forecast" comes next, then a 10-day forecast.
  - Detail blocks (AQI, humidity, pollen and more) can be reordered by
    a long press and drag, but never above the brief or the hourly
    forecast.
  - The weather map shows 6 hours of precipitation, with a **timeline
    at the bottom**.
- **Fitbit, now Google Health**:
  https://support.google.com/googlehealth/answer/17068213?hl=en
  - It became Google Health on 2026-05-19, with four bottom tabs:
    Today, Fitness, Sleep and Health.
  - It has a Gemini-built coach.
  - The rebuild promised "more intuitive data visualization" and
    "easier layouts to find information":
    https://blog.google/products-and-platforms/devices/fitbit/fitbit-ai-personal-health-coach-preview/
- **Files by Google**: tapping a category lists its files. It offers a
  grid or a list view, and a top-right More menu with Sort by.
  https://support.google.com/files/answer/9765314?hl=en
- **Google Wallet**:
  - Passes are found by swiping up. "At the bottom, tap Add to Wallet."
    https://support.google.com/wallet/answer/12060038?hl=en
- **Live Updates**: https://developer.android.com/about/versions/16/features/progress-centric-notifications
  - Built on `Notification.ProgressStyle`, for rideshare, delivery and
    navigation.
  - Parts: a title and text giving the ETA, who is driving and the
    state of the journey; a progress bar of segments and points; a
    tracker icon; and actions.
- **Find Hub**: https://support.google.com/android/answer/6160491?hl=en
  - Pick a device "From the listed devices". The map shows where it is.
  - The actions are Get directions, Find nearby (a shape that narrows as
    you get closer), Play sound and Mark as lost.

---

## 3. The screens

Every screen keeps the owner's rules:

- Panels are never moved unasked (0013).
- The docked sheet has FPL, Airport, Airplane and Setup as its first
  row, at pill, half and full (0013, 0018).
- Close goes back (0015).
- Every control has one home (0014).
- No airplane is assumed (0011).
- Warn, never limit (0008).
- Verdict first (0012).
- Labels are Title Case, and the FAA's text is sentence case (0021).
- The word is "airplane" (0020).
- There are no footnotes (0019).

Where Material would put something somewhere else, the owner's
placement wins, and the difference is noted.

### 3.1 The one search and its results

- **Follow**: Google Maps' search box at the top, with recent searches
  as suggestions and filters over the results (§2), on Material's
  search component.
- **Structure, top to bottom**:
  1. A `SearchBar` at the top of the map, in the status bar's inset. It
     has the leading search glyph, the placeholder ("Airports, fixes,
     places"), and a trailing mic when the voice ask is on.
  2. Tapping it expands to `ExpandedFullScreenSearchBar`, driven by
     `rememberSearchBarState()`, the slot-based API that is stable in
     1.5. Inside, in order:
     - recent searches as `ListItem`s, each with a leading history
       glyph
     - one row of `FilterChip`s for the kinds: Airports, Navaids, Fixes,
       Places (Maps' filters over the results)
     - results as `ListItem`s, each with:
       - headline: the ident and name
       - supporting text: the city and its distance from the airplane,
         or from the map's centre when no position is known
       - leading: the sectional's symbol in the chart's colours
       - trailing: the flight category's pip for reporting fields
  3. Picking a result collapses the bar, flies the map to it, and opens
     its card ([§3.2](#32-the-airport-card-and-the-airplane-card)).
- **Primary action**: the result row itself. There is no Search button,
  and the keyboard's action key searches.
- **Motion**: the stock bar's expand and collapse, which runs on the
  motion scheme. Predictive back collapses it by itself.
- **Haptics**: none.
- **Type**:
  - the ident at `titleMedium`
  - the name and supporting text at `bodyMedium`
  - section headers ("Recent", "Airports") at `labelLarge`
- **Avoid**:
  - a second search field anywhere (one search)
  - `DockedSearchBar` on a phone; keep it for medium and wider windows,
    as `ExpandedDockedSearchBarWithGap`
  - `AppBarWithSearch`, which is still experimental
  - a hand-made suggestions popup
- **Sources**:
  - https://developer.android.com/jetpack/androidx/releases/compose-material3
  - https://developer.android.com/develop/ui/compose/system/predictive-back-setup
  - https://support.google.com/maps/answer/3092445?hl=en&co=GENIE.Platform%3DAndroid

### 3.2 The airport card and the airplane card

- **Follow**: Google Maps' place sheet. Its documented parts are the
  name and address at the bottom of the screen, Save, and Directions at
  the bottom left (§2). Use Material's standard bottom sheet for a card
  that lives with the map, and the modal sheet for a card over another
  card. The rest of Maps' current place sheet (the photo strip, the
  rating line, the exact button row) could **not** be confirmed from a
  Google page. Check it on a current phone before matching it closely
  ([§4](#4-not-verified)).
- **Structure, airport card** (inside the Airport tab, sheet raised;
  `ui/AirportScreen`):
  1. The drag handle, then the tabs row (owner's, unchanged).
  2. The title row:
     - the ident and name at `headlineSmallEmphasized`
     - beneath it: city, elevation, and the chart's towered or
       untowered symbol
     - at the end: Share, then Close (0015)
  3. The flight category and METAR age as an `AssistChip`-sized pip
     row: the category in `color.category.*`, never the theme's
     colours.
  4. **The action row**, the `CARD_ACTIONS` order: Fly Here, Add Stop,
     Call, Address.
     - It is a `ButtonGroup` of four labelled buttons. The first is
       filled (`Button`), with the engine's ETE in its label when an
       airplane is chosen and no ETE when none is (0011). The others
       are `FilledTonalButton`s.
     - The labels stay: Google's research found that taking text off
       actions hurt.
     - Overflow goes into the group's own overflow menu, never a fifth
       button.
  5. The detail tabs as `PrimaryTabRow` (Weather, Runways, Frequencies,
     Procedures, Services, NOTAMs): Maps-like tabs under the buttons
     (memory, A2 picks), with the airport diagram first in the body.
  6. The body is `ListItem` rows inside `SegmentedListItem` groups:
     - runways with their winds, which the engine works out
     - frequencies, each with a trailing copy `IconButton`
  7. Image tiles for the diagram and plates as a
     `HorizontalMultiBrowseCarousel`.
- **Structure, the airplane card** (a tracked airplane tapped on the
  map, `ui/MapCard`; and the Airplane tab):
  1. The title row: callsign or N-number at `headlineSmallEmphasized`,
     then the type, with Close at the end.
  2. The figures row: altitude, groundspeed and track, as the planner
     and engine answer them. These are `titleLargeEmphasized` numbers
     with `labelMedium` captions, the way Fitbit's top stats sit "at a
     glance".
  3. Actions as a `ButtonGroup`: Track first and filled, then the
     card's others from `CARD_ACTIONS`.
  4. Details in `ListItem`s.
- **Primary action**: the first, filled button of the row.
  - **Fly Here** on an airport.
  - **Direct To** on a point.
  - It is always in the same place, so it is reached without looking.
- **Motion**: the button group's neighbours make room for a pressed
  button (the stock behaviour), and a button's shape morphs on press.
- **Haptics**: `Confirm` when Fly Here or Direct To changes the route
  (`haptic.direct-to`).
- **Avoid**:
  - icon-only actions
  - more than four buttons in the row
  - a back arrow
  - inventing a "Directions"-style sheet the owner has not asked for
  - showing ETE or fuel on Fly Here without an airplane
- **Sources**:
  - https://support.google.com/maps/answer/7280933?hl=en
  - https://support.google.com/maps/answer/144339?hl=en&co=GENIE.Platform%3DAndroid
  - https://design.google/library/expressive-material-design-google-research
  - https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/BottomSheet.md
  - https://developer.android.com/jetpack/androidx/releases/compose-material3

### 3.3 The flight plan and route editing (FPL tab)

- **Follow**: Material's standard bottom sheet beside the map, and
  Google Maps' directions. Maps draws the chosen route in a strong
  colour and the others greyed, picks one by a tap on the map, and puts
  Start at the foot. Decision 0029 keeps the FPL sheet's own layout.
- **Structure** (unchanged in order, Material in idiom):
  1. The tabs row.
  2. The route box:
     - the route as `InputChip`s, one per point, removable with the
       chip's trailing close
     - on the pills' first line: Routes, Brief and •••, as 0029 and the
       route-box rule say. Routes and Brief are `FilledTonalButton`s,
       and ••• is an `IconButton` opening a `DropdownMenu` of grouped
       items (`DropdownMenuGroup`) with share, print, nav log and ✕.
  3. The altitude row: `[altitude | profile]`, with the wheel of legal
     altitudes. The legal altitudes are the engine's answer, and the
     cruise is written FL-045 (0009).
  4. Route options (the Routes button): cards in a
     `HorizontalMultiBrowseCarousel`, each a route with the engine's
     figures. On the map, the chosen route is in the course's magenta
     and the others are grey and tappable, as Maps shows alternates.
     **Use** is the card's filled button.
  5. Legs as `ListItem`s (`route/RouteLegs`). Each has a leading
     waypoint symbol, the leg's figures, and a trailing drag handle.
     Long press drags to reorder; a swipe removes the leg and shows an
     undo row (`route/RouteUndoRow`), not a snackbar toast (problems
     show where they happen).
  6. The figure strip at the sheet's foot: To, Dist, ETE and Fuel, with
     only To and Dist when there is no airplane (0011).
- **Primary action**:
  - Brief, on the route box's first line, where the owner put it.
  - On a medium or larger window, a `HorizontalFloatingToolbar` over
    the map carries Undo, Redo and Add Point while the plan is open
    (`route/RouteToolbar`; the owner, 2026-11-09).
- **Motion**: chips enter and leave with the motion scheme. A dragged
  row lifts by elevation and settles with the standard scheme.
- **Haptics**:
  - `GestureThresholdActivate` when a long press picks a row up
  - `SegmentFrequentTick` on the altitude wheel's steps
  - `Confirm` when the route changes from a card
- **Warn, never limit**: an altitude over the ceiling, into a
  restricted area or above oxygen altitude is accepted. A `Reject`
  haptic and a warning row in `color.chart.warning` give the reason and
  its source.
- **Avoid**:
  - a FAB on the FPL tab (the actions have their homes)
  - moving the nav log inline (0029)
  - sliders for discrete settings (0017)
- **Sources**:
  - https://support.google.com/maps/answer/144339?hl=en&co=GENIE.Platform%3DAndroid
  - https://developer.android.com/jetpack/androidx/releases/compose-material3
  - https://developer.android.com/develop/ui/views/haptics/haptics-principles

### 3.4 The nav log

- **Follow**: a dense data list with figures in rows, on Material's
  list items. Google's apps put the list first and the chart after it
  (Fitbit's "at a glance" top stats).
- **Structure** (opened from •••, a full-height `ModalBottomSheet`,
  `WingtipSheet`):
  1. A `MediumFlexibleTopAppBar`: title "Nav Log", the route as its
     subtitle, Share and Close at the end. It collapses to a small bar
     on scroll (`exitUntilCollapsedScrollBehavior`).
  2. A totals row: distance, ETE and fuel, from the engine.
  3. One `ListItem` per leg:
     - headline: from → to
     - supporting: course and heading, or magnetic course only when
       there is no airplane (0011)
     - trailing: distance, then ETE and fuel when an airplane is set
     - The selected leg expands to its shorthand leg grid ("compact",
       memory).
  4. The streamed lines fill in as they come
     (`api/NavLog.kt`), each with a `LoadingIndicator` until it is
     answered.
- **Primary action**: Share, in the top bar's actions. Nothing else
  is a primary on a read-only log.
- **Type**: the figures use `bodyLarge` with tabular figures
  (`fontFeatureSettings = "tnum"`), so columns line up.
- **Avoid**:
  - a table with horizontal scroll on a phone
  - smaller text to make it fit
  - a back arrow
- **Sources**:
  - https://developer.android.com/jetpack/androidx/releases/compose-material3
  - https://blog.google/products-and-platforms/devices/fitbit/introducing-the-all-new-fitbit-app/

### 3.5 Brief, Go / No-Go and Ready to Fly

- **Follow**: Pixel Weather. The AI brief is at the top, an alert takes
  its place when there is one, and detail blocks sit below that can
  never move above it. That matches decision 0012 exactly.
- **Structure** (Brief: `ui/BriefScreen`, BriefGlance first):
  1. A `LargeFlexibleTopAppBar` titled "Brief", with the route as its
     subtitle and Close at the end. It collapses on scroll.
  2. **The verdict**: Go, Go with Care, or No-Go, from the engine's Go
     / No-Go.
     - It is set at `displaySmallEmphasized` on a container in the
       verdict's colour.
     - At most three one-line actions follow, as `ListItem`s with
       trailing chevrons. Each opens the fix.
  3. The Ask field straight under the verdict, an `OutlinedTextField`
     with a mic.
  4. The risk in words, at `bodyLarge`.
  5. Glance cards, each a `Card` with a title, one figure and one
     line:
     - weather en route
     - winds aloft
     - icing (`brief/IcingRows`)
     - the departure window (`brief/DepartureWindowStrip`)
     - NOTAMs
     - TFRs
  6. Detail folded under a tap (a `ListItem` that expands).
- **Ready to Fly** (`ready/`): a checklist of what is still missing,
  each a `ListItem` with a leading state glyph and a trailing "Fix"
  `TextButton` (`ReadyFixer`), at the top of the Brief when the plan is
  not complete. Its rules are the engine's.
- **Primary action**: the verdict's first action. On a phone with the
  keyboard up, Ask's send sits above the keyboard (Google's 4× finding
  for a Send button near the keys).
- **Motion**:
  - The verdict comes in with the standard scheme's effects spring, a
    fade and no overshoot. A verdict must not bounce.
  - Cards stagger in with the expressive spatial spring.
- **Haptics**:
  - `Reject` once when the verdict turns to No-Go while the pilot is
    looking at it
  - nothing for Go
- **Avoid**:
  - pushing the verdict down with a new section (0012)
  - more than three actions
  - a red full-screen block, because No-Go warns and never stops the
    plan (0008)
  - a disclaimer footer (0019)
- **Sources**:
  - https://support.google.com/pixelphone/answer/15266029?hl=en
  - https://design.google/library/expressive-material-design-google-research

### 3.6 NOTAMs

- **Follow**: Files by Google's category list, filterable, with a sort
  in the top bar's menu (§2), on Material's lists and chips.
- **Structure**: these come from SWIM only (0023).
  1. A `MediumFlexibleTopAppBar` titled "NOTAMs", with the airport or
     route as subtitle, a sort menu and Close.
  2. One row of `FilterChip`s: Runways, Taxiways, Navaids, Airspace,
     Obstacles, Procedures, TFRs, and Active Now.
  3. Grouped `SegmentedListItem`s per airport or leg:
     - headline: the plain-words summary, in sentence case with the
       FAA's codes kept (0021)
     - supporting: the effective times in Z
     - leading: a badge in `color.badge.*`
     - The raw NOTAM is shown as sent (CLAUDE.md, Writing) on expanding
       the row.
- **Primary action**: none. This is a reading list, and its filter chips
  are the controls.
- **Avoid**:
  - reformatting the raw text
  - a toast for a fetch failure; use `ProblemLine` in place
- **Sources**:
  - https://support.google.com/files/answer/9765314?hl=en
  - https://developer.android.com/jetpack/androidx/releases/compose-material3

### 3.7 Weather and the radar loop

- **Follow**: Pixel Weather's map. The precipitation is over the map,
  with **a timeline at the bottom** you scroll (§2).
- **Structure**:
  1. The map, the chart under the NEXRAD in the chart's own scale
     (`color.chart.nexrad-*`).
  2. The map's buttons on the `VerticalFloatingToolbar`, unchanged in
     place.
  3. At the foot, over the sheet's pill, a `HorizontalFloatingToolbar`
     in the banner's capsule (`radius.banner`):
     - a Play/Pause `IconToggleButton`
     - the frame's time in Z and local
     - a `Slider` stepped to the frames (stateful `Slider(state)`,
       stable in 1.5), whose steps tick
  4. Weather layers (METAR pips, NEXRAD, satellite, AIRMETs, PIREPs)
     are chosen in the Map menu (one home, 0014). They are
     `CheckableDropdownMenuItem`s in a `DropdownMenuGroup`.
- **Primary action**: Play, at the left of the toolbar, under the
  thumb.
- **Motion**: frames cross-fade with the effects spring (no overshoot).
  The toolbar enters with the spatial spring.
- **Haptics**: `SegmentTick` on each frame while dragging.
- **The slider is right here** even under 0017, because time is a
  continuous scrub, not a discrete setting.
- **Avoid**:
  - restyling the NEXRAD into the theme
  - a full-screen weather page that hides the route
- **Sources**:
  - https://support.google.com/pixelphone/answer/15266029?hl=en
  - https://developer.android.com/jetpack/androidx/releases/compose-material3

### 3.8 The emergency assistant

- **Follow**: no Google consumer app is a fair model. Use Material's
  plainest pattern: a full-screen sheet with one large primary action
  near the thumb (Google's research on big, close actions).
- **Structure** (`emergency/`):
  - There is no map button (0010). It opens from the airplane's
    Emergency row and from Ask.
  - In order:
    1. A `ModalBottomSheet` at full height, titled "Emergency", with
       Close.
    2. The nearest suitable fields from the engine as `ListItem`s, each
       with distance, bearing and the runway, and the glide ring's
       answer (`GlideRingRow`). The first row is the engine's pick.
    3. The airplane's own emergency checklists
       (`EmergencyGuidance`).
    4. The frequencies (121.5, the nearest facility) with copy and
       call.
  - The bottom bar is a `FlexibleBottomAppBar` holding one
    full-width filled **Direct To** to the top field.
- **Primary action**: Direct To in the bottom bar, the same place every
  time.
- **Type**: `headlineMediumEmphasized` for the top field. Nothing
  smaller than `bodyLarge`.
- **Motion**: the standard scheme only, with no bounce.
- **Haptics**: `Confirm` on Direct To, and nothing else.
- **Avoid**:
  - a map button (0010)
  - more than one primary action
  - animations that delay content
- **Sources**:
  - https://design.google/library/expressive-material-design-google-research
  - https://developer.android.com/jetpack/androidx/releases/compose-material3

### 3.9 The logbook

- **Follow**: Material's list-detail. On a phone, a list then a detail.
  On a tablet, `NavigableListDetailPaneScaffold`.
- **Structure** (`logbook/`):
  1. A `LargeFlexibleTopAppBar` titled "Logbook", with the totals
     (hours, landings) as the subtitle, a search action, and Close. It
     collapses on scroll.
  2. Currency at the top as a `Card`: day, night and IFR, each "Current
     until …" or "Not current". These come from the server today
     (gateway) and from the engine after #482.
  3. Entries as `ListItem`s grouped by month (sticky headers):
     - headline: date and route
     - supporting: the airplane and remarks
     - trailing: the time
  4. A new entry (`LogbookForm`) opens as a full-height sheet with its
     fields.
  5. Flights recorded automatically arrive as drafts (`DraftEntry`) at
     the top, with Keep and Discard.
- **Primary action**: an `ExtendedFloatingActionButton` "Add Flight" at
  the bottom end. It shrinks to an icon FAB while the list scrolls
  (`expanded` from the list state).
- **Haptics**: `Confirm` when an entry is saved.
- **Avoid**:
  - a FAB over the map; it lives on this screen only
  - computing currency in Kotlin
- **Sources**:
  - https://developer.android.com/develop/ui/compose/layouts/adaptive/list-detail
  - https://developer.android.com/jetpack/androidx/releases/compose-material3

### 3.10 The coach

- **Follow**: the Google Health coach. The coach lives in the app, its
  messages come at the moments they matter, and its data is easier to
  read (§2). The exact layout of the coach screen could not be
  confirmed.
- **Structure** (`coach/`):
  1. A `MediumFlexibleTopAppBar` titled "Coach", with Close.
  2. Today's message: one card at `titleLarge` and a line of reasons.
  3. Approaches flown and debriefs (`CoachApproaches`,
     `CoachDebriefs`) as `ListItem`s, each opening its debrief.
  4. Lessons as a `HorizontalMultiBrowseCarousel` of cards.
  5. The Ask field at the foot, its send above the keyboard.
- **Primary action**: the message's own action ("Fly it in the dry
  run"), a filled button inside the card.
- **Avoid**:
  - chat bubbles for the whole screen
  - a coach figure the engine did not give
- **Sources**:
  - https://support.google.com/googlehealth/answer/17068213?hl=en
  - https://blog.google/products-and-platforms/devices/fitbit/fitbit-ai-personal-health-coach-preview/

### 3.11 The dry run and forecast run

- **Follow**: Google Maps' Preview, the route played before you go
  (§2), with a media-style floating toolbar.
- **Structure** (`dryrun/`):
  1. The map follows the simulated airplane along the route.
  2. At the foot, `DryRunBar` as a `HorizontalFloatingToolbar`:
     - Play/Pause
     - the speed as a connected button group of `ToggleButton`s (1×,
       4×, 16×), a discrete setting (0017)
     - the leg's name
     - Close at the end
  3. For the forecast run, `ForecastStrip` adds the hour and the
     weather the route meets at each point, all of it from the engine.
- **Primary action**: Play. The dry run starts at once, with no ground
  wait (memory).
- **Motion**: the camera eases with the standard scheme. The toolbar
  goes in and out with the spatial spring.
- **Haptics**: `SegmentTick` at each waypoint passed, and `Reject` on a
  rule's warning.
- **Avoid**:
  - a play time scrubber that blocks the map
  - Live Updates for a dry run, because it is not a real flight (§3.15)
- **Sources**:
  - https://support.google.com/maps/answer/144339?hl=en&co=GENIE.Platform%3DAndroid
  - https://developer.android.com/jetpack/androidx/releases/compose-material3

### 3.12 ATC and the clearance

- **Follow**: Material's cards with an always-visible primary action.
  No Google app is the model.
- **Structure**:
  - The ATC copilot (`atc/`) shows a floating capsule over the map
    while it listens. It has a "Listening…" pill with the live words and
    chips (memory), its `HorizontalFloatingToolbar` stop button, and
    cards (`AtcCardView`) for each instruction heard.
  - The clearance sheet (`clearance/ClearanceSheet`):
    1. a `ModalBottomSheet` titled "Clearance", with Close
    2. the CRAFT fields as `ListItem`s, each from the engine's reader
       and each editable
    3. the read-back line at `titleLargeEmphasized`
    4. a photo of a written clearance (`documents/ClearancePhotoRow`)
- **Primary action**: "Read Back" as the sheet's filled button at the
  foot, above the gesture inset.
- **Haptics**: `Confirm` when a field is understood.
- **Avoid**:
  - a toast for "didn't catch that"; the problem goes on the card
- **Sources**:
  - https://developer.android.com/jetpack/androidx/releases/compose-material3

### 3.13 Account and settings (Setup)

- **Follow**: Material's grouped settings lists with a large collapsing
  title. There is **no Settings page** (0014). Setup's tiles are FPL,
  Theme, Layout and Appearance; Alerts and the rest are in the Map
  menu.
- **Structure** (`ui/SetupScreen`, in the Setup tab):
  1. The tabs row.
  2. The account row: name and email, a leading avatar, and a trailing
     chevron to Account (sign out, export).
  3. The four tiles as `SegmentedListItem` groups: rounded containers
     with small gaps between the rows of one group, the Expressive
     list style.
  4. Each discrete choice is a menu (`ExposedDropdownMenuBox`) or a
     connected `ToggleButton` group, never a slider (0017).
  5. Downloads (`offline/`), Minimums, Checklists and About as rows
     with chevrons.
- **Primary action**: none. Settings save as they change.
- **Haptics**: `ToggleOn` and `ToggleOff` from the stock `Switch`.
- **Avoid**:
  - a second home for any control (0014)
  - a Material You toggle; dynamic colour stays off (§1.2)
- **Sources**:
  - https://developer.android.com/jetpack/androidx/releases/compose-material3
  - https://m3.material.io/styles/color/dynamic/choosing-a-source
    **[excerpt]**

### 3.14 The welcome

- **Follow**: plain onboarding pages with one big button at the foot.
- **Structure** (`welcome/`, `WelcomeSheet`):
  1. Pages with a picture of the map, a `headlineLargeEmphasized`
     title, and one `bodyLarge` line each.
  2. A page indicator.
  3. At the foot, one full-width filled button ("Continue", then "Start
     Planning"), with "Skip" as a `TextButton`.
  4. Location is asked for on the page that explains why, through the
     system dialog.
- **No airplane is picked by default** (0011). The last page offers
  "Add Your Airplane" as a tonal button.
- **Primary action**: the button at the foot.
- **Motion**: pages slide with the spatial spring.
- **Avoid**:
  - asking for every permission on the first page
  - a carousel that moves by itself
- **Sources**:
  - https://design.google/library/expressive-material-design-google-research

### 3.15 Widgets, Live Updates and shortcuts

#### Live Update: the flight in the air

- A promoted notification's requirements
  (https://developer.android.com/develop/ui/views/notifications/live-update):
  - Standard, BigText, Call, Progress or Metric style
  - the `POST_PROMOTED_NOTIFICATIONS` permission
  - `setRequestPromotedOngoing`
  - ongoing, with a title
  - no custom view, not a group summary, not colorized, not on a
    MIN-importance channel
- Only for ongoing, time-sensitive activity that the user started.
- **Wingtip's** (`notify/LiveFlight`): starts when the airplane is
  flying a plan, and ends on landing. It uses
  `Notification.ProgressStyle`
  (https://developer.android.com/develop/ui/views/notifications/progress-centric):
  - title: the next waypoint and its ETE
  - text: the destination and its ETA in Z
  - progress: one **segment** per leg and one **point** per waypoint
  - tracker icon: the ownship chevron
  - actions: Open Map and Nearest
  - The status chip's text comes from `setShortCriticalText`: ETE to
    the next point ("0:18"). Text of up to six characters shows in full.
  - Without an airplane (0011) there is no ETE. The chip and title
    show distance to the next point.
- `Notification.MetricStyle` (API 37) shows up to three metrics, and
  the critical one can go in the chip. It could carry altitude, GS and
  ETE as an alternative:
  https://developer.android.com/reference/android/app/Notification.MetricStyle
- No Live Update for a dry run, a forecast run or a planned flight
  before it moves. The page's own example only promotes a boarding
  pass once the user is at the airport.

#### Widgets (Glance)

- Glance 1.2.0 is stable, with `glance-material3` for theming:
  https://developer.android.com/jetpack/androidx/releases/glance
- The Tier 1 quality bar
  (https://developer.android.com/design/ui/mobile/guides/widgets/widget_quality_guide):
  - resizable to 2×1 and to two more of 1×1, 2×2, 4×2 and 4×4
  - the system's corner radius
  - light, dark and themed colour
  - errors shown on the widget itself
  - 48 dp targets
  - an accurate preview: generated previews with `providePreview`,
    Android 15 and later
    (https://developer.android.com/develop/ui/compose/glance/generated-previews)
- At target 37, a widget over the bitmap memory limit (6 × width ×
  height bytes) throws:
  https://developer.android.com/about/versions/17/behavior-changes-17
- **Wingtip's** (`widget/NextFlightWidget`): the canonical "Text with
  Image" or "Standard Toolbar" layout
  (https://developer.android.com/design/ui/mobile/guides/widgets/layouts):
  - the next flight's route
  - the departure's flight category in `color.category.*`
  - the departure time in Z
  - one action, Brief
  - The themed colour follows the wallpaper **only on the home screen
    widget**, as the quality guide asks. The flight category's colour
    stays the chart's.

#### Shortcuts

- Publish **four**; most launchers show four. Short labels are 10
  characters or fewer and long labels 25 or fewer:
  https://developer.android.com/develop/ui/views/launch/shortcuts/best-practices
- The order is `shortcut` in `design/screens.json`
  (`res/xml/shortcuts.xml`), which generates it.

### 3.16 Ask (the assistant)

Ask is not on the screen list, but it sits under every brief.

- **Follow**: Ask Maps, which answers in conversation with a map and
  offers save, share and directions from the answer (§2).
- **Structure**:
  1. The answer's verdict line.
  2. At most three actions as `AssistChip`s (0012).
  3. Sources cited as `SuggestionChip`s.
  4. The field at the foot, with its send above the keyboard.
- **Figures** in an answer come from the engine only
  (`ai/FigureGuard`).

### 3.17 Tablets and foldables

- **Follow**: Material's adaptive scaffolds (§1.9).
- **The map and its panel** (compact → medium and wider):
  - On a compact window: the docked sheet.
  - From medium width: the panel sits beside the map, 384 dp wide
    (`size.panel`), at the **left**, as on the web and the iPad. That
    placement is decision 0013's, not a new one.
  - Build it with `SupportingPaneScaffold`: the map is the main pane
    and the panel the supporting one. The scaffold's own placement of
    the supporting pane could not be confirmed from the page fetched.
    If it puts the panel at the right, place it at the left with the
    scaffold's directive. If the stock scaffold cannot do that, raise
    an `owner` issue rather than moving the panel.
- **Lists with a detail**: `NavigableListDetailPaneScaffold`, which
  gives predictive back between panes:
  - Logbook
  - NOTAMs
  - Coach debriefs
  - Downloads
  - the nav log, with the leg list and the leg
- **Navigation**: the four tabs stay the panel's first row (0013). Do
  not swap them for a `NavigationRail` or `NavigationSuiteScaffold`
  without the owner.
- **Foldables**: in the half-open (tabletop) posture the map is on the
  top half and the panel on the bottom, split at the fold
  (`ui/TabletopPanes`; the owner, 2026-11-09).
- **Every window shape works**: no orientation lock, because the
  system ignores it on large screens at 36 and 37 (§1.9).
- **Sources**:
  - https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
  - https://developer.android.com/develop/ui/compose/layouts/adaptive/build-a-supporting-pane-layout
  - https://developer.android.com/develop/ui/compose/layouts/adaptive/list-detail
  - https://developer.android.com/about/versions/16/behavior-changes-16

---

## 4. Not verified

These could not be confirmed from a primary source on 2026-11-09. Check
each on a current phone, or a Google page, before matching it.

- **m3.material.io page text.** It is drawn by JavaScript, so only
  search excerpts were read. That leaves these unconfirmed:
  - the exact 35-shape list
  - the spring token values
  - the number of new components
  - the split button, FAB menu, button group and toolbar guideline
    pages
  - Material's advice on segmented buttons against connected button
    groups
  - The page https://m3.material.io/blog/whats-new-at-io26 (Expressive
    layout and lists) would not load.
- **Unclear API status:**
  - Whether `MaterialExpressiveTheme`'s promotion is fully stable. The
    note spells it "materialExpressTheme".
  - Whether `LoadingIndicator` and `MaterialShapes` were promoted again
    after alpha19.
  - Whether the Expressive `TimePicker` is stable.
- **The BOM.** Compose BOM 2026.09.00 appears to map material3 to
  1.4.0, but the table is drawn by JavaScript. The repository pins
  1.5.0-rc01 outside the BOM either way (docs/NATIVE-ANDROID.md).
- **Google Maps:**
  - the full place sheet: photos, the rating and category line, the
    Directions/Start/Call/Save/Share row, and the order of its tabs
    (only a search summary of
    https://support.google.com/maps/answer/6230175 was seen)
  - the category chips under search
  - the route cards and where Start sits in directions
  - any Material 3 Expressive redesign on the phone
  - whether Maps posts a Live Update
- **Pixel Weather**: its Expressive redesign, a radar Play button, and
  the individual detail cards (wind, UV, pressure).
- **Google Health / Fitbit**: the chart styles, the big-number tiles,
  where the coach's Ask sits, and whether it uses Material 3
  Expressive.
- **Settings**: Google publishes no page on Android 16's Settings
  redesign (grouped cards, search at the top, large collapsing title).
  The advice in §3.13 rests on Material's lists, not on Settings
  itself.
- **Files, Wallet, Clock and Find Hub**: any redesign. Also unconfirmed:
  - Clock's stopwatch, its timer layout, and whether it posts a Live
    Update
  - Wallet's card stack
  - Find Hub's device list as a sheet over the map
- **`SupportingPaneScaffold`**: which side the supporting pane sits on,
  and whether it can be put at the start.
- **Android 17**: no predictive-back changes beyond Android 16's were
  found.

The owner settled the four recommendations that were left for him on
2026-11-09: the sheet is Material's stock sheet with its springs (§1.5),
the altitude menu ticks with `SEGMENT_FREQUENT_TICK` and the sheet has
no haptic of its own (§1.6), wide windows get the floating route
toolbar (§3.3), and a half-folded phone shows the map above the fold
(§3.17).

## 5. Since the one search

The owner's one search (2026-11-09) replaced the sheet's four tabs after
this page was written. Where §3 speaks of the FPL, Airport, Airplane and
Setup tabs, read: one search as the sheet's first row with its
microphone and the account button; the plan as the sheet's main
content; the airport and airplane cards opened from the search; and
Setup's settings on the account menu's Settings page.
