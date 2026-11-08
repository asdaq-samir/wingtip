# The native Android app

Wingtip Maps, a flight planner for pilots, VFR and IFR, as a Jetpack
Compose app (`apps/android/`), with no web view and no Capacitor: the same
planner and gateway as the website, the same Rust engine as the iOS app
(docs/NATIVE.md) and the web app, and only the screens on the phone. The
owner's decision of 3 November 2026 ("make android native as well"); the
phases and gates are the iOS plan's. It is the Android app: the
Capacitor shell that wrapped the website went on 2026-11-06, at the
owner's word. Its package is `app.wingtipmaps.android.native`.

## What is here

- `apps/android/`: a Gradle project of one module, `app`, in the Kotlin DSL,
  every version in the catalog `gradle/libs.versions.toml`. The wrapper
  is the shell's (Gradle 8.14.3).
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
    pictures, drawn with Canvas) and `MapLoading` (the turning mark);
  - `ui/`: Material 3 screens. `RootScreen` (the map under a bottom
    sheet with the four tabs: FPL, Airport, Aircraft, Setup, and the
    figures' strip at the sheet's foot), one file per tab, `Theme` and
    `Figures` (the strip, the problem line, the figures' formatting).
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
  The phone's own colours on Android 12 and later (Material You).
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
- **The map is shown as one thing**: Wingtip's mark turns in the middle
  of what the sheet leaves (`MapLoading`, still with the system's
  animations off) until the map is first at rest with the chart and the
  overlays drawn, or 2.5 s after its style was set, then fades out over
  150 ms. The map opens on the airplane's last position (kept by
  `OwnShip`, at most once a minute) or the whole country, with the sheet's
  peek as its padding as it is when the map opens.

Not yet on the phone: the airports' weather pips (the METARs of the
view), the settings that hide layers, taps and cards on the overlays,
the terminal area chart, and the engine's in-view readers (`InView.kt`)
as the overlays' source in the air with no signal.

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
InView); the pilot's records in Room; and notification channels. The
map draws own ship as the blue dot and the path under the route, with
the location button over the map (`ui/MapButtons`) as Apple Maps has
it: a tap turns the reading on and follows, a drag lets go, a tap again
turns it off. The system's permission dialogs for location and for
notifications are asked from `RootScreen`, the one screen, since a
request needs an Activity. Setup's Map section has the Traffic switch
(`TrafficSwitch`, kept in the DataStore settings file under "traffic",
on until turned off), where the iOS app's Setup has it.

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
and says why. FIS-B weather from ADS-B In is still to come.

Still to come: the tile store and the route's tiles for the air, the
briefing, the checkpoints and the side view, the altitude wheel, the
airplane by N-number, widgets, and the brand's own launcher icon: the
launcher shows a plain airplane until `docs/brand/android-*.svg` are
made vector drawables.
