# The native Android app

Wingtip Maps, a flight planner for pilots, VFR and IFR, as a Jetpack
Compose app (`apps/android/`), with no web view: the same
planner and gateway as the website, the same Rust engine as the iOS app
([NATIVE.md](NATIVE.md)) and the web app, and only the screens on the phone. The
owner's decision of 3 November 2026 ("make android native as well"); the
phases and gates are the iOS plan's. Its package is `app.wingtipmaps.android.native`.

## What is here

- `apps/android/`: a Gradle project of one module, `app`, in the Kotlin DSL,
  every version in the catalog `gradle/libs.versions.toml`, on Gradle
  9.9.0 and AGP 9.5.1, whose built-in Kotlin compiles the app (no Kotlin
  Android plugin), for API 37 (compiled against 37.2, the newest minor SDK), on Java 25 (the gateway's LTS): Gradle
  runs on the Temurin 25 that `gradle/gradle-daemon-jvm.properties`
  names, fetched once into `~/.gradle/jdks` by the foojay resolver, and
  the app compiles to Java 25 bytecode, which AGP 9.5's D8 dexes. Every
  Kotlin and lint warning fails the build, as a Gradle deprecation does
  (`org.gradle.warning.mode=fail`).
- `app/src/main/cpp`: the JNI shim round the engine, in C
  (`wingtip_jni.c`), and the CMake file that links the engine's static
  library for each ABI. The engine itself is built by
  `engine/bindings/ffi/build-android.sh` into `app/engine/` (not committed; the
  twin of `build-xcframework.sh`). It finds the newest NDK in the SDK
  itself when `ANDROID_NDK_HOME` is unset, and rustup's cargo when the
  shell's PATH lacks it.
- `app/src/main/kotlin/app/wingtipmaps/android`:
  - `engine/Engine.kt`: the engine's one way in, `Engine.call(name,
    input)` (`wt_call`), with `EngineException` for the engine's own
    words when it refuses;
  - `api/`: the data layer. `Gateway` (the session's cookies, kept by
    `CookieStore`; the CSRF header; a cache the servers' Cache-Control
    fills), `Planner` (the planner through the gateway's proxy),
    `Models.kt` (the answers' shapes, in the document's names through
    `@SerialName`: most are typealiases of `api/generated`, which
    `scripts/build/api-models-apps.sh` writes from the planner's and the
    gateway's OpenAPI documents with quicktype, committed and checked by
    CI, so a renamed field fails the build; the pilot and AirportPin
    stay by hand), `NavLog.kt` (the nav log's streamed lines, by hand);
  - `Charts`, `Session`, `Plan`: the models of state, ViewModels with
    their state in flows (which chart, who is signed in, the route and
    what the planner said of it), and `Links` (the site's links the app
    opens);
  - `tiles/TileTemplate.kt`: the tile address, the web app's and the iOS
    app's;
  - `map/`: the map. `ChartMap` (the MapLibre view, its camera, the
    route, own ship and the path flown), `MapStyle` (the first style as
    JSON: the chart and the overlay tiles' layers, the web's
    `glStyle.ts` and `glOverlays.ts`), `OverlayPictures` (the symbols'
    pictures, drawn with Canvas) and `MapLoading` (Material's loading
    indicator until the map is drawn);
  - `ui/`: Material 3 screens, one composable and one ViewModel per
    screen. `RootScreen` (the map, `MapPane`, under the docked sheet, whose
    first row is the one search, Material's `SearchBar`, with its mic and
    the account button that opens Settings, and the figures' strip at the
    sheet's foot; the four tabs went on 2026-11-09), every thing and page
    a card on the sheet's own stack (`ui/SheetNav`, `ui/sheet/CardPage`:
    ← and its name, ✕ at the end, the owner's card and scrolling rules of
    2026-11-10, docs/design/android.md), `Theme` (the look picked in
    Settings, Wingtip by default, from the tokens; Native is Material as
    it comes, `design/Native.kt`), `Figures` (the strip and `ProblemLine`, the one error
    style), `SectionTitle`, `WingtipIcons` (the concept table of
    docs/design/icons.md), `CardActions` (each card kind's actions, the
    web's lib/cardActions.ts);
  - `ui/sheet/`: `MapSheet` (the panel on a phone: Material's standard
    bottom sheet, `BottomSheetScaffold`, at its peek or expanded, on the
    theme's expressive springs, since the owner on 2026-11-09 had stock
    components keep their stock behaviour; predictive back lowers it,
    then a card closes, then the app goes), `WingtipSheet` (every sheet
    over the map: Material's modal sheet with a start-aligned title and
    a Close at the end, decision 0015) and `FlexibleSheet` (a page over
    the map under Material 3 Expressive's flexible top app bar, which
    collapses as it scrolls); `ui/TabletopPanes` puts the map above a
    half-folded phone's fold and the panel below it, and
    `route/RouteToolbar` floats Undo, Redo and Add Point over the map on
    a wide window while the plan is open;
  - `format/Format.kt`: every figure written one way, tested against the
    shared `apps/web/src/lib/fixtures/formats.json` (FormatTest), which
    design/tokens.json generates: FL-045 on the cruise controls
    (decision 0009), 4,500 ft, 1h 5m, 0:18, 1432Z, 045° with north 360.
- `app/src/test`: JUnit, on the JVM. `app/src/androidTest`: on an
  emulator, with the web's shared fixtures as the test APK's assets.

## Rules

- A rule the pilot needs offline in flight is computed on the phone by
  the shared engine (`engine/facade`), the same Rust the web app, the
  planner and the iOS app run, asked by name through `Engine.call`
  (`engine/facade/src/call.rs` lists every name, and
  `engine/contract/engine.schema.json` types each input and answer). An
  answer the app decodes can use a class generated from that contract,
  `engine/EngineContract.kt` (`scripts/build/engine-contract-apps.sh`,
  committed), rather than an `@Serializable` written by hand; callers
  move over one name at a time. The Kotlin keeps the words and the
  formatting, not the rule. This app is one of the four layers
  engine/README.md describes: the planner works out the flight, the
  gateway (Spring Boot) holds the pilot's account and records, and the
  engine answers every rule. Every other
  figure comes from the planner; the app shows the server's answer and
  computes none of its own.
- The shared fixtures in `apps/web/src/lib/fixtures` are the test APK's
  assets by their path (`build.gradle.kts`'s `androidTest` source set),
  not a copy: `EngineTest` and `EngineFixturesTest` hold the engine on
  an Android phone to the same examples the web's vitest tests and the
  iOS tests read, through this app's own bridge (the second compares
  `Engine.callNative`'s raw JSON with every phone-called rule's
  fixture), so a bridge that mangles a key, a number, a null or a
  string fails CI. They are instrumented tests, run every night and on
  a dispatch, not on each pull request.
- Material 3 and Google's guide to app architecture: a UI layer of
  composables reading state from ViewModels, with changes flowing one
  way (a screen calls a model's function; the model changes its state;
  the screen draws it); a data layer (`Gateway`, `Planner`) that is the
  only thing talking to the servers; and the engine as the domain, the
  rules. Material's own components over hand-rolled ones -- the bottom
  sheet, the tab row, the exposed dropdown -- so touch targets, type and
  motion are the platform's. A discrete setting is a menu, not a slider.
- Material 3 Expressive is Google's own, from Material 3
  **1.5.0-rc01**, a release candidate taken off the Compose BOM (the
  owner, 2026-11-09: "Avoid building our own and let's use rc01"; the
  BOM's 1.4.0 keeps Expressive internal). Only `material3` leaves the
  BOM: it needs Compose 1.12.0, which the BOM's 1.12.1 already is.
  The theme is `MaterialExpressiveTheme` with `MotionScheme.expressive()`,
  so every stock component moves on its springs, and Remove animations
  stills them through Compose's animator duration scale; the choice
  rows are the connected button group's `ToggleButton`s, the map's
  buttons a `VerticalFloatingToolbar`, a spinner the `LoadingIndicator`
  (still `@ExperimentalMaterial3ExpressiveApi`, opted into in
  `design/Loading.kt` alone), a press the stock buttons' `shapes`, and
  the emphasized type roles the tokens' (scripts/build/design-tokens.sh).
  Bump to 1.5.0 stable when it is released.
  The brand looks take Wingtip's own colours, not the wallpaper's, and
  the brand's blue is the tint (design/tokens.json, the owner's
  2026-11-09 decision); the Native look (2026-11-10) is a plain
  `MaterialTheme` with Material You's scheme from the wallpaper on
  Android 12 and later, Material's default type, shapes and motion, and
  only the chart's inks and the caution, go and destructive states kept
  as aviation's meaning. In every look the type roles are Material 3's sizes
  (the tokens' `android` slots: 16 sp rows, 14 sp prose). User-visible
  words are string resources (res/values/strings.xml).
- The app's words are the web app's words ("airplane", the FAA's
  sentence-cased text with its codes kept); a problem is said where it
  happened, in the call's own words, not in a toast.

## Why MapLibre

The map is MapLibre Native (`org.maplibre.gl:android-sdk`): the open
native map, with no API key, no account and no vendor's usage terms,
which is why it draws the chart rather than Google Maps. No vendor's
base map lies under the chart: the FAA's chart is the whole picture, as
it is on the website. Its tiles go through the app's own OkHttp client,
so a tile through the gateway carries the session's cookie and every
tile is kept in the one cache.

The web's map is MapLibre GL JS, so the phone's style follows it
closely (`map/MapStyle.kt` beside `apps/web/src/lib/map/gl/glStyle.ts`
and `glOverlays.ts`):

- **The chart** is the base layer's tiles, the 512-pixel `@2x` tiles
  on any screen denser than 1x where the kind was drawn at them
  (`chart_layers[].scales`), with the raster source's `tileSize` kept at
  256 as the web's; the same chart at a region's level under it; a touch
  more contrast and colour by day, dimmed in the dark theme
  (`chartPaint`).
- **The overlays** -- Class B, C and D with their altitudes in a dark
  tab on each ring, the airports in the sectional's symbols (blue
  towered, magenta not; R, M and H for private, military and heliport),
  the VORs on their blue tags, the low enroute fixes, the VFR waypoints
  and, close in, the runways -- come from the planner's PMTiles archive
  of the cycle (`/api/overlay-tiles`, `wingtip.vector_tiles`), read in
  byte ranges by MapLibre Native's own `pmtiles://` source (11.7 and
  later). They are in the first style with the chart, so they draw per
  tile with it and follow a pinch; nothing is asked of the planner or the
  engine for the view. The archive's name is kept in the app's files
  (`Charts`), and the first style waits at most 1.5 s for it.
- **The labels** are Inter at weight 700 as on the web, as signed
  distance field glyphs in the app's assets (`assets/glyphs/Inter-Bold`,
  written by `scripts/build/map-glyphs.py` from the web's Inter), so no
  glyph server is asked.
- **The map is shown as one thing**: Material's loading indicator in the
  middle of what the sheet leaves (`MapLoading`, still with the system's
  animations off) until the map is first at rest with the chart and the
  overlays drawn, or 2.5 s after its style was set, then fades out over
  150 ms. The map opens on the airplane's last position (kept by
  `OwnShip`, at most once a minute) or the whole country, with the sheet's
  peek as its padding as it is when the map opens.

- **Airport weather** (the owner's pick, 2026-11-10): each reporting
  field's METAR (`MapWeather`, the planner's reporting fields of a box
  round the view, `/api/airports/in-view?reporting`, asked again as the
  view leaves the box or every ten minutes; what was heard is kept). Its
  flight category, the engine's `flight_category` as the planner answers
  it, is a 4.5 dp ring in the category token's colour round the chart's
  own symbol, or ForeFlight's dot in its place (`AirportWeatherMarks`,
  part of the symbol's picture, so give-way hides it with the field).
  Over it, MapLibre symbol layers (`StationLayer`): the station model's
  barb (`wind_barb`) and its visibility and ceiling lines from Leaflet's
  zoom 10, the wind arrow at any zoom (`wind_arrow`, red past the picked
  airplane's demonstrated crosswind on the field's least-crosswind
  runway, the planner's `least_crosswind`), and the amber ↓ at the
  plan's fields whose TAF at the ETA is worse than the METAR now
  (`weather_worse` over `/api/briefing`'s forecast stations,
  `RouteWorse`). Settings' Map section sets it (`AirportWeatherStore`):
  Off, Halo, Dot or Station, and three switches.
- **Setup's Map switches** (`MapLayersStore`, in the DataStore settings
  file): Airspace, VORs and Fixes, Terminal Area Charts, Private Fields,
  Military Fields and Traffic, the web's "On the Map" rows with the
  web's defaults, applied as the overlay layers' visibility and the
  airports' filter (`MapStyle.visible`, `airportsFilter`, the web's
  `applyOverlayFilters`).
- **The terminal area chart** pinned over the sectional at every zoom it
  exists at (`Charts.terminal`, the web's `chart-terminal`).
- **Taps and cards**: a tap picks, in the web's order, an airplane, a
  field, a VOR, a fix or a VFR waypoint within 22 dp, or an airspace ring
  within 10 dp (`MapPick`, from the tapped feature's own fields as the
  web's `volumeOfTile` and `vorOfTile` read them). A field opens in the
  Airport tab, the sheet raised, its card asked of the planner as it
  opens; under the strip, and for everything else, its card shows in a
  modal sheet over the map (`ui/MapCard`), its rules the engine's
  (`engine/MapRules`: `radial_of`, `fix_radial_distance`, `morse`,
  `service_volume`, `navaid_hours`, `airspace_entry_rules`, `faa_words`,
  `place_name`). The cards' Direct To and Add to Route are not here yet.
- **Overlays with no signal**: OkHttp keeps no 206, so `OverlayCache`
  (an interceptor on the one client) keeps each range of the archive the
  map reads (64 MB, the oldest dropped first) and answers it from the
  phone thereafter; on an unmetered network `Charts` fetches the whole
  archive (about 120 MB a cycle, carrying on where a fetch stopped), and
  every range is answered from it. The archive's name changes with each
  build, so nothing kept goes stale; another name's files are dropped.
- **Close in, the street map**: from MapLibre zoom 12 to 13 Google's road
  map (the Map Tiles API) fades in over the chart under the runways, and
  the map may go to 17 (`CloseMap`, the web's `CloseBase`), with the
  deployment's key from `/api/map/google`. No key is set today
  (`GOOGLE_MAPS_API_KEY` is empty), so, as on the web, the chart stays,
  enlarged. The key is a browser key; for the phone it must also allow
  this app (an Android restriction by package and signing certificate,
  which `CloseMap.signer` sends as `X-Android-Package` and `X-Android-Cert`).
- **Traffic** is drawn as on the web (`TrafficDrawing`, the traffic
  layers in the first style): the chevron turned to its track, amber
  where the engine's `traffic_marks` says it is near and cyan otherwise,
  its height and callsign on a dark tag from the web's zooms, a trend
  line to where it will be in a minute, each carried on along its track
  a step a second between answers; own ship's own transponder left off
  (the engine's `own_ship_hex`). A tap opens its card, with Track, which
  rings it on the map.

## Downloads: the chart with no signal

Setup → Downloads (`offline/`) keeps a region's chart on the phone, as
the iPhone's does (docs/NATIVE.md): a sectional sheet's coverage, a
state, or the map's view, picked on a list or a map of the sheets, the
chart kinds and Sharp (@2x) or Smaller, each sized before it is fetched
(`/api/offline-charts`, cut by the planner's `wingtip.offline_charts`).
`DownloadsModel` holds the screen; each archive is a WorkManager job
(`OfflineWorker`) that fetches into a `.part` file and resumes from its
length with a Range when WorkManager stops it at ten minutes or the
signal goes; `OfflineStore` keeps the files in the app's files with a
manifest. A region brings its cycle packs (`CyclePacks.keep`) and the
whole overlays' archive (`OverlayStore.download`, on any network once
the pilot asked for a region).

MapLibre reads the archives itself: `OfflineLayers` puts a raster
source of each into the first style (`pmtiles://file://…`) with a layer
straight over the network's chart in the chart's paint, so a kept
region draws from the file with or without signal and the rest of the
map from the network as before; the TAC and IFR area archives follow
the terminal switch as the style is built. The style is built again as
a download lands. The cycle's update, its expiry at 0901Z on the next
one's date and the sweep once the update is whole are the iPhone's.

## Building

The owner's Mac has no Java, Gradle, Android SDK or cargo, so everything
happens in `.github/workflows/native-android.yml` on GitHub's Linux
runner:

- a pull request, a push to `main` or to a `claude/native-*` branch that
  touches `apps/android/`, the engine (`engine/facade`, `engine/bindings/ffi`), the
  shared fixtures or the workflow: the engine is built for the three
  ABIs (`engine/bindings/ffi/build-android.sh`), then
  `testDebugUnitTest lintDebug assembleDebug`, with the debug APK kept
  with the run (`wingtip-native-debug-apk`: it installs on any Android
  phone with "Install unknown apps" allowed), then
  `connectedDebugAndroidTest` on an API 35 x86_64 emulator
  (reactivecircus/android-emulator-runner).
- No Google Play lane yet: the shell's (android.yml) stays until the
  gates.

`WINGTIP_HOST` is the build's host (the repo variable `WINGTIP_URL`'s);
it is the gateway's address and the App Links domain in the manifest.
`ANDROID_NATIVE_APP_ID` would be the package name, once there is a Play
lane for it.

## The flight pieces, and what is still to come

The other session's batch the same evening brought the flight pieces
under `flight/`, `engine/`, `records/` and `notify/`: own ship from the
fused location provider, kept going in the air by a foreground service
of the location type with Android's persistent notification; the path
flown (OwnTrail); the airplane tracked and its watches (Tracking,
Traffic); the cycle packs on the device and the engine's in-view readers
through JNI entries appended to the shim (Packs.kt, CyclePacks,
InView); the pilot's records in Room 3 (androidx.room3, over the
framework's SQLite driver); and notification channels. The
map draws own ship as the blue dot and the path under the route, with
the location button over the map (`ui/MapButtons`) as Apple Maps has
it: a tap turns the reading on and follows, a drag lets go, a tap again
turns it off. The system's permission dialogs for location and for
notifications are asked from `RootScreen`, the one screen, since a
request needs an Activity. Setup's Map section has the Traffic switch
(`TrafficSwitch`, kept in the DataStore settings file under "traffic",
on until turned off), where the iOS app's Setup has it.

Checklists (#220, `checklist/`): each airplane, by the plan's airplane
key, keeps two plain texts on the phone, its normal and its emergency
checklists, in SharedPreferences ("checklists"). They are the engine's
checklist text (a "#" line a section, "Challenge -- Response" an item),
read by `checklist_read` as the web and the iPhone read it. Each starts
empty, and "Start from the phases" fills an empty editor with the
headings alone, in the order of GAMA Specification No. 1's Sections 4
and 3 (`ChecklistPhases`); the app ships no handbook's items. The run
view ticks rows, counts each section's "n of m" and starts over; the
ticks last while the app runs, and signing out forgets the lists
(`ChecklistStore.forgetAll`). The Aircraft screen has Checklist and
Emergency rows; the map has no emergency button (the owner, 2026-11-08).

Passenger briefing (#223, `briefing/`): Setup's Flight section opens
the SAFETY briefing's seven items for the planned flight, each with its
source under it (14 CFR 91.107(a) for the belts, the FAASTeam's
"Passenger SAFETY briefing" and the Private Pilot ACS PA.II.B.S2 for the
rest), ticked and kept for that flight. Under them, the flight in a few
lines as the web's features/plan/components/briefing/passengers writes it -- the route, leaving now in
local time and Z, about how long in the air, the landing time, the
destination's weather in words from the planner's airport card -- and
Share, Android's share sheet (ACTION_SEND). The live shareable track
waits for the AWS launch.
In flight (#218, the owner's option A of 2026-11-08), as the iPhone:
`flight/InFlight.kt` asks the engine once a fix for `in_flight`,
`vertical_speed` and `glide_ring`; with own ship on and at flying speed
the top of the map, left of the buttons, shows what is ahead
(`ui/InFlightViews.kt`'s AlertsBanner, the planner's or the packs'
alerts, which were worked out and never shown before) over the
instruments bar -- groundspeed, track, GPS altitude, vertical speed; on
the route the next field's distance, time to go and desired track, the
distance off course and the destination's arrival with the fuel the
plan leaves; Nearest one tap away (a sheet of the nearest fields, which
are within a still-air glide by `glide_reaches`); and "Planning aid ·
not for navigation". The glide ring is a dashed line under the route
(`ChartMap`'s `glide`), over the higher of the packs' ground (ahead's
`ground_ft`) and the nearest field. FiguresStrip counts down from the
airplane on the route. Setup's Map section has Speak Alerts Ahead
(`flight/SpokenAlerts.kt`, Android's TextToSpeech, the iPhone's words).
A field's card has Diagram with Your Position (`ui/DiagramOwnShip.kt`):
the FAA's PDF drawn by PdfRenderer, own ship placed by the diagram's own
latitude and longitude marks, read with Android 15's PDF text (SDK
extension 13); an older Android shows the diagram without the airplane
and says why.

A cockpit ADS-B receiver (`receiver/`): a Stratux, Sentry, Garmin GDL
39/52 or uAvionix receiver's GDL 90 on UDP port 4000, gathered by a
`DatagramSocket` with the Wi-Fi's multicast lock (`ReceiverSocket`) and
read by the engine once a second (`receiver_read`); a foreground service
of the connected-device type (`ReceiverService`) keeps it going with the
screen off while a receiver is heard. Its traffic is drawn ahead of the
internet's (`receiver_traffic`, through `Traffic`), a chip on the map
names it, a field's FIS-B METAR and TAF show on its card with no report
from the weather service (`receiver_reports`), and FIS-B NEXRAD is drawn
over the chart (`receiver_nexrad`, `map/NexradLayer.kt`). Setup's Map
section has ADS-B Receiver: Auto or Off.

Still to come: the tile store and the route's tiles for the air, the
briefing, the checkpoints and the side view, the altitude wheel, the
airplane by N-number and widgets. The launcher icon is the brand's own
adaptive icon (`docs/brand/android-*.svg`, drawn to PNG per density by
`scripts/build/app-icons.sh`, with the themed monochrome layer), and
the splash screen is the mark on the launch ground on every Android from
8 on, through AndroidX's SplashScreen (`res/values/themes.xml`'s
`Theme.WingtipMaps.Starting`, `installSplashScreen` in `MainActivity`).
