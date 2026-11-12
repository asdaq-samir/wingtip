# iOS 27 on the iPhone app

The app builds with Xcode 27.2 and the iOS 27.2 SDK, and its oldest iOS is
27.0 (watchOS 26.0 for the Watch, decision 0040's amendment): each iOS 27 feature below is used as it
is, with no `#available` branch and no older fallback. The owner asked for
iOS 27's features and look on 2026-11-09 ("I want iOS 27 features and look
rather than 26"), and for the floor at 27 on 2026-11-12 ("Why did you move
to 26 and not 27?").

Every API named here was checked in the iOS 27.2 SDK's own interfaces
(`SwiftUI.swiftinterface`, `SwiftUICore.swiftinterface`, `WidgetKit`, `UIKit`
headers). iOS 27 marks many of them `@available(anyAppleOS 27.0, *)`, so a
grep for `iOS 27` alone misses them.

## What iOS 27 changes from iOS 26

- **Materials and Liquid Glass.** Apps get the refreshed Liquid Glass look
  with no code changes, and people can adjust its tint with a new slider in
  Settings. The SDK has no new `Glass` variants: `regular`, `clear`,
  `identity`, `tint` and `interactive` are still iOS 26's. Sources: WWDC26
  "What's new in SwiftUI" (session 269); the WWDC26 iOS guide ("refreshed
  materials, refined typography, and updated tab and navigation bars").
- **Scroll edge effects.** The HIG's Scroll views page was updated on
  2026-06-08. It now says to prefer the automatic style, and to test the soft
  style thoroughly for legibility if you use it. Source: HIG, What's new;
  HIG, Scroll views.
- **Navigation bars.** A new `toolbarMinimizationBehavior(_:for:)` folds the
  navigation bar away while content scrolls down. It comes with
  `toolbarMinimizationSafeAreaAdjustment` and `toolbarMinimizationRestoration`.
  UIKit's matching property is `UINavigationItem.navigationBarMinimization`.
  Sources: session 269; the iOS 27 release notes (UIKit); SDK.
- **Toolbars.**
  - `ToolbarItemPlacement.topBarPinnedTrailing` keeps an item such as Share
    in the bar instead of sending it to the overflow menu.
  - `visibilityPriority(_:)` and `ToolbarItemVisibilityPriority` set which
    items go to the overflow menu first.
  - `ToolbarOverflowMenu` and `toolbarOverflowMenu` group items in that menu.
  - `toolbarTitleAlignment(_:)` arrived in 27.2.
  - Vertical bars (`toolbarVerticalBehavior`, `axisBehavior`,
    `toolbarVerticalCompressionBehavior`) arrived in 27.1, for iPhone Duo.

  Sources: session 269; SDK; HIG, What's new (2026-09-09, "Designing for
  iPhone Duo").
- **Tab bars.**
  - `Tab(role: .prominent)` sets one tab apart at the bar's trailing end.
  - `TabSectionExpansion` sets whether a tab section starts expanded.
  - The HIG's Tab bars page has "updated terminology and art" (2026-06-08).
  - A `TabView` now traps if its selection is a hidden tab.

  Sources: session 269; SDK; HIG, What's new; the iOS 27 release notes.
- **Controls.**
  - `TabsPickerStyle` (`.tabs`) is for pickers that switch between content.
    It looks like `.segmented` on iPhone, but VoiceOver reads it as tabs.
  - `BorderedTextFieldStyle` (`.bordered`) draws the system's text field
    border, whose shape `textInputBorderShape(_:)` sets.
  - `swipeActionsContainer()` puts swipe actions on any scroll view.
  - `reorderable()` and `reorderContainer(for:)` reorder rows in lists,
    grids and sections.

  Sources: the iOS 27 release notes (SwiftUI); session 269; the Apple
  Developer documentation for `TabsPickerStyle` and `BorderedTextFieldStyle`.
- **Sheets.** `presentationPlacement(_:)` can set a sheet at the leading
  edge, the center or the trailing edge. UIKit's matching API is
  `UISheetPresentationController.preferredPlacement`. Sources: SDK; Apple
  Developer documentation.
- **Motion.** `NavigationTransition.crossFade` and `AnyNavigationTransition`
  are new. Source: SDK; Apple Developer documentation for `crossFade`.
- **Status bar.** `toolbarColorScheme(_:for: .statusBar)` and
  `toolbarVisibility(_:for: .statusBar)` set the status bar's style and
  visibility. Source: the iOS 27 release notes (SwiftUI).
- **Resource use.** `systemPrefersReducedResourceUsage` is a SwiftUI
  environment value, a `UITraitCollection` trait and a `UIApplication`
  property. It asks apps to scale back live effects and costly work. Source:
  Apple Developer documentation for `systemPrefersReducedResourceUsage`.
- **Widgets and Live Activities.**
  - The `isDynamicIslandLimitedInWidth` environment value tells a Live
    Activity when the island is drawn narrow. That happens in landscape, on
    iPhone Duo, and on an iPhone 18 Pro with two or more Live Activities.
  - The HIG's Live Activities page added limited-width layouts on
    2026-10-13.
  - `WidgetFamily.systemExtraLargePortrait` is new in iOS 27.

  Sources: the Apple Developer documentation for
  `isDynamicIslandLimitedInWidth`; HIG, What's new; WidgetKit's
  swiftinterface.
- **Resizable iPhone apps.** iPhone apps resize on iOS 27, both in iPhone
  Mirroring and on iPad. Apple asks apps to size by size class, not by
  idiom. Sources: session 269; the iOS 27 release notes (UIKit).
- **Documents.** The new `ReadableDocument`, `WritableDocument`,
  `DocumentReader` and `DocumentWriter` protocols back new `DocumentGroup`
  initializers, which give direct URL access and asynchronous reads and
  writes. `FileDocument` is deprecated. Sources: the iOS 27 release notes
  (SwiftUI); session 269.
- **Typography and SF Symbols.** There is no new SwiftUI API. The HIG's
  Typography page was last changed in December 2025. SF Symbols 8 is a
  download. Source: HIG, What's new.
- **Maps.** MapKit adds new point-of-interest categories, among them
  `MKPointOfInterestCategoryAirportTerminal`. Nothing else in MapKit changes
  for this app. Source: SDK headers.

## What the app adopted

| What | Where | iOS 27 |
|---|---|---|
| The navigation bar folds away while a long list scrolls down | Nav Log, Brief, Logbook (`navigationBarMinimizesOnScroll`, Design/Bars.swift) | `toolbarMinimizationBehavior(.onScrollDown, for: .navigationBar)` |
| Share and Favorite are pinned in the airport card's bar | AirportCard toolbar (`ToolbarItemPlacement.pinnedTrailing`) | `.topBarPinnedTrailing` |
| The airport card's Info / Weather / Runways / Charts switch is read as tabs | AirportCard (`tabsPicker()`) | `.pickerStyle(.tabs)` |
| The system's own text field border | FPL, Welcome, Trip planner, Ask, route box, Ask figures (`borderedField()`) | `.textFieldStyle(.bordered)` |
| Scroll edges use the HIG's preferred automatic style | `glassScrollEdges()`, Design/Glass.swift | `.automatic` |
| With Reduce Motion on, a card fades in from its row instead of zooming | CardZoom.swift | `.navigationTransition(.crossFade)` |
| The Dynamic Island's figure has a short form when the island is narrow | FlightActivityWidget `CompactFigure`; `FlightActivityLines.compactNarrow` ("1:25" for "1h 25m"), tested in FlightActivityTests | `isDynamicIslandLimitedInWidth` |
| The weather loop does not start by itself when the system asks apps to do less | WeatherLoop.loaded() | `UIApplication.systemPrefersReducedResourceUsage` |

## Flight files and configurable widgets

Both were owner-approved on 2026-11-09 and built on their own branch
(`claude/files-widgets-halo`).

- **Flight files.** A Wingtip flight is a file of the app's own type,
  `app.wingtipmaps.flight` (`.wingtip`, JSON, conforming to `public.json`),
  exported in project.yml's `UTExportedTypeDeclarations` and opened as
  its owner (`CFBundleDocumentTypes`). It holds the shared flight's plain
  link (`SharedPlan`, `?open=shared`: route, stops, altitude, departure
  time, airplane type, rules, the N-number only where ticked) and the nav
  log with its totals (`Route/FlightFile.swift`). The route's Share menu
  gains **Save as File**, with the flight and the kneeboard's PDF. They
  are saved through the system's file exporter,
  `fileExporter(isPresented:document:contentType:defaultFilename:onCompletion:onCancellation:)`
  with a `WritableDocument` written by the SDK's `FileWrapperDocumentWriter`
  (`Route/FileSaving.swift`). `FileDocument` is not used. A file opened
  from Files, AirDrop or Mail comes in through `onOpenURL`, as GPX and KML
  already do (`Links`), and shows the Shared Flight preview with Use This
  Plan and Not Now. It never replaces the plan without asking.
- **No `DocumentGroup` scene.** The SDK's new initializers,
  `DocumentGroup(viewer:makeReadableDocument:)` and
  `DocumentGroup(editor:makeDocument:)`, open each file in a document
  scene of its own. On the iPhone that scene takes the screen from the
  planner, and the owner's choice is that a file opens as the preview
  over the plan. A `DocumentGroup` is worth adding if Wingtip ever edits
  flight files in place, on the iPad or the Mac.
- **Configurable widgets** (`AppIntentConfiguration` with a
  `WidgetConfigurationIntent` each, `WingtipWidgets/WidgetIntents.swift`):
  - **Next Flight** picks the plan on the page, the app's snapshot as
    before, or a saved flight. The app lists the saved flights in the App
    Group (`Shared/WidgetStore.swift`). The widget asks the planner for a
    saved flight's departure weather itself.
  - **Airport Weather** picks a field: the home base and Favorites are
    offered first, and any ident can be typed. The widget asks the planner
    for its METAR and TAF every half hour (`WidgetFetch`).
  - **Currency Status** reads `/api/logbook/currency` with the pilot's own
    session. The app's cookie jar moved into the App Group's container for
    this. The widget shows the Logbook's words (`Shared/CurrencyWords.swift`):
    one currency, picked in its settings, on the small widget and the Lock
    Screen, and all of them on the medium.

  The App Group was already on both targets. Each widget keeps its last
  answer and says so when it shows it.

No panel or control moved. The tint and tokens are unchanged. Dynamic Type,
Reduce Motion and Reduce Transparency still go through the same modifiers.

## Covered elsewhere

The iOS 27 AI items belong to the `claude/ios27-ai` branch. They are View
Annotations (`appEntityIdentifier`, for Siri on screen content), Siri and App
Intents app schemas, the Foundation Models framework updates, the Evaluations
framework, and Core AI.

## Left out, and why

- **`Tab(role: .prominent)`.** It moves a tab to the bar's trailing end, and
  CLAUDE.md does not allow moving a control without the owner's word.
- **`toolbarTitleAlignment`, `presentationPlacement` and the status bar
  APIs.** Each changes where something sits, or it overrides what the system
  already resolves well. The planner's sheet is the app's own, at the bottom
  like Maps.
- **`ToolbarOverflowMenu` and `visibilityPriority`.** No toolbar in the app
  has more than two items. Pinning covers Share.
- **Reorderable lists (owner-approved).** Route stops (FPL) and Favorites
  (Airport) already reorder with `List`'s stock `onMove`, which works back to
  iOS 18. Checklists have no reordering. Nothing in the app is a hand-rolled
  reorder, so `reorderable()` would change nothing a pilot sees. It is
  worth using when a reorder outside a `List` is wanted, such as the
  Favorites strip.
- **Lazily loaded or prefetched subviews (owner-approved).** The 27.2 SDK
  has no new public prefetch API. The WWDC26 iOS guide's "lazily loaded
  subviews that prefetch content" is how `List`, `LazyVStack` and the other
  lazy containers behave on iOS 27, with no API to call. The nav log, the
  logbook, NOTAMs and the airport lists are already `List`s, so they get it
  as they are.
- **iPhone Mirroring layouts (owner-approved).** The layout already chooses
  by size class (`RootLayout.of`, tested in ReplayTests), and idiom is read
  only for metrics. `UIRequiresFullScreen` is not set, and the app has a
  launch screen, which the 27 SDK requires. Nothing needs to change. A check
  in iPhone Mirroring on the owner's Mac is still to do.
- **`swipeActionsContainer()`.** Every swipe action in the app is on a
  `List` row, where swipe actions already work.
- **`systemExtraLargePortrait`.** The app's widgets have no layout at that
  size.

## Sources

- What's new in SwiftUI, WWDC26 session 269: https://developer.apple.com/videos/play/wwdc2026/269/
- WWDC26 iOS guide: https://developer.apple.com/wwdc26/guides/ios/
- iOS and iPadOS 27 release notes: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes
- HIG, What's new: https://developer.apple.com/design/whats-new/
- HIG, Scroll views: https://developer.apple.com/design/human-interface-guidelines/scroll-views
- HIG, Tab bars: https://developer.apple.com/design/human-interface-guidelines/tab-bars
- HIG, Materials: https://developer.apple.com/design/human-interface-guidelines/materials
- Apple Developer documentation:
  - https://developer.apple.com/documentation/swiftui/tabspickerstyle
  - https://developer.apple.com/documentation/swiftui/borderedtextfieldstyle
  - https://developer.apple.com/documentation/swiftui/toolbaritemplacement/topbarpinnedtrailing
  - https://developer.apple.com/documentation/swiftui/view/toolbarminimizationbehavior(_:for:)
  - https://developer.apple.com/documentation/swiftui/navigationtransition/crossfade
  - https://developer.apple.com/documentation/swiftui/tabrole/prominent
  - https://developer.apple.com/documentation/swiftui/environmentvalues/systemprefersreducedresourceusage
  - https://developer.apple.com/documentation/swiftui/environmentvalues/isdynamicislandlimitedinwidth
- The iOS 27.2 SDK in Xcode 27.2 (27B52): SwiftUI, SwiftUICore and WidgetKit
  swiftinterfaces, and the UIKit and MapKit headers.
