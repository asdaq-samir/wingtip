# The native iOS app

Wingtip Maps as a pure SwiftUI app (`apps/ios/`), with no web view: the same
planner and gateway as the website, and only the screens on the phone.
The plan, its phases and gates are in the owner's doc "Native iOS
Transition Plan" (24 October 2026). The Android twin, the same engine
behind Compose and MapLibre, is [NATIVE-ANDROID.md](NATIVE-ANDROID.md).

## What is here

- `apps/ios/project.yml`: the Xcode project, made by XcodeGen on the runner.
  Nothing under `apps/ios/` is a generated file; the project is never
  committed.
- `apps/ios/Wingtip/API`: the planner's, the assistant's and the gateway's
  calls, generated from their OpenAPI documents as the web's types are:
  `scripts/build/api-models-apps.sh` runs Apple's swift-openapi-generator
  (its version in `.tool-versions`) into `apps/ios/WingtipAPI`, one module a
  document (`PlannerAPI`, `GatewayAPI`, `AssistantAPI`: each its `Client`,
  its operations and its schemas), and names each schema in the app in
  `API/Generated` (the planner's prefixed `API`, the gateway's `GW`, the
  assistant's `AS`). All committed; `--check` and CI fail when they are not
  what the documents give, so a field or a call a server renames fails the
  build rather than a screen. The clients go through the swift-openapi
  runtime's URLSession transport (`Servers.swift`): one session a wait
  (the usual, a read the pilot waits on, a call made in the air bound as a
  whole by `timeoutIntervalForResource`, an upload) over the one cookie
  jar and cache, and middlewares for the planner's paths behind the
  gateway's proxy, the CSRF token, the session's cookies and a refusal in
  the server's own words. `Planner`, `Gateway` and their neighbours keep
  the names the screens call, each a line over its generated operation,
  and the app's names of the types as typealiases, with what the app adds
  as extensions. The documents are fitted to the generator first
  (`api-models-apps.mjs`'s `openapi`): FastAPI's `anyOf` with null is a
  type that includes null (the generator skipped those properties when it
  was first tried, 24 October), enums are strings, and operations are named
  by their functions. Still by hand: Spring Security's `/logout` and the
  data export's download, which the documents do not describe as the app
  needs them, and the planner's pictures, which Nuke loads (`PictureViewer`,
  with Keep for the Air's pictures as its data loader's answer offline).
- `apps/ios/Wingtip`: the app. `Config` (the host), `Session` (who is signed
  in), `Charts` (which chart, from `/api/chart`, kept for offline),
  `Tiles` (the tile address, the store on disk, the MapKit overlay) and
  `Views` (the map under the system sheet with the plan under the one
  search, `Search`).
- `apps/ios/WingtipTests`: Swift Testing.

## Rules

- A rule the pilot needs offline in flight is computed on the phone by
  the shared engine (`engine/facade`), the same Rust the web app and the
  planner run, asked by name through `Engine.call` (`wt_call`;
  `engine/facade/src/call.rs` lists every name, and
  `engine/contract/engine.schema.json` types each input and answer). An
  answer the app decodes can use a type generated from that contract,
  `apps/ios/Wingtip/Engine/EngineContract.swift` (`scripts/build/engine-contract-apps.sh`,
  committed), rather than a Decodable written by hand; callers move over
  one name at a time. The Swift keeps the words and the formatting, not
  the rule, and each screen's state is one observable model the view
  draws. This app is one of the four layers engine/README.md describes:
  the planner works out the flight, the gateway (Spring Boot) holds the
  pilot's account and records, and the engine answers every rule. The shared fixtures
  in `apps/web/src/lib/fixtures` are read by the web's vitest tests and by
  `apps/ios/WingtipTests/SharedFixturesTests.swift` (project.yml bundles the
  folder into the test target by its path, not a copy), and
  `BridgeFixturesTests.swift` holds the engine's raw JSON answers to
  them through the phone's own bridge (`Engine.callText` over
  `wt_call`), so a bridge that changes a key, a number, a null or a
  character fails CI though the Rust and web tests pass. The few rules still
  in Swift are in the table below with their fixtures; issue #482 moves
  them into the engine. Every other figure
  comes from the planner; the app shows the server's answer, with its
  date when offline.
- The ACS table (`AcsTable`) is the web's own `apps/web/src/lib/acs.json`,
  bundled by project.yml as `acs.json`.
- Judge every screen on the phone against Apple's Human Interface
  Guidelines first, as CLAUDE.md says for the web app; here the system's
  own controls give the 44-point hit areas, the type scale and the glass.
- The app's words are the web app's words ("airplane", the FAA's
  sentence-cased text with its codes kept).

## The rules on the phone, and their fixtures

| Rule | Web (the reference) | On the phone | Fixture |
|---|---|---|---|
| A pilot's hold as the planner reads it, its legs' minutes by altitude (wingtip.holds; AIM 5-3-8 j.4(a)) | `features/plan/lib/routeHolds.ts`, `lib/holdEntry.ts` `legMinutes` | the engine: `hold_read`, `hold_write`, `holding_leg_minutes` (`Hold`) | `holds.json` |
| A hold's entry and wind, lost comms' altitudes (AIM 5-3-8; 14 CFR 91.185) | the planner's /api/holding, /api/lost-comms | the engine: `holding`, `lost_comms` (`Engine.holding`, `Engine.lostComms`) | the engine's own tests |
| The route's procedures, a fix off a point, a fix's charted altitudes | `lib/procedures.ts`, `lib/identSchema.ts` | the engine: `procedures_write`, `frd_read`, `frd_write`, `altitude_lines` | the engine's own tests |
| The airplane's checklist written as text | `lib/checklist.ts` | the engine: `checklist_read`, `checklist_write` (`ChecklistText`) | `checklist.json` |
| Flash-card drills: light gun signals (14 CFR 91.125), VFR weather minimums (91.155), Leitner's boxes | `features/pilot/drills.ts` | Swift: `Drills` in `PilotLogic.swift` | `drills.json` |
| Two-way radio failure, the route and when to leave the clearance limit (14 CFR 91.185(c)(1), (c)(3)) | `features/pilot/lostComms.ts` | Swift: `LostComms` in `PilotLogic.swift` | `lostComms.json` |
| Flight plan items 15 and 16 (AIM Appendix 4; 14 CFR 91.121(a)(2)) | `features/plan/lib/flightPlanForm.ts` | Swift: `FilingForm` in `Views/InFlightViews.swift` | `filingForm.json` |
| Traffic's label and the 1,000 ft "near" (14 CFR 91.159's spacing) | `features/plan/map/traffic.ts` | the engine: `traffic_marks` (`Traffic.marks`) | `traffic.json` |
| A watched airplane in the air, a takeoff or landing watch going off | `lib/aircraftAlerts.ts` | the engine: `airborne_now`, `alert_fires` (`Tracking`) | the engine's own tests |
| In flight: where the airplane is on its route, the next waypoint and the destination, the desired track, the fuel left; the vertical speed; the glide ring; own ship on an airport diagram (#218) | `navlog/dryRun.ts`, `lib/map/position/glide.ts` | the engine: `in_flight`, `vertical_speed`, `glide_ring`, `diagram_labels`, `diagram_graticule`, `diagram_point` (`InFlight`, `InstrumentsBar`, `DiagramPage`) | the engine's own tests, `InFlightTests` |
| The dry run, and a GPX or KML track read | `navlog/dryRun.ts`, `lib/track.ts` | the engine: `dry_run`, `read_track`, `thin_track` (`DryRun`, `GPXTrack`) | the engine's own tests |
| The logbook as CSV, out and in (ForeFlight Logbook Guide v14.0; 61.57(a), (b)) | `features/pilot/logbookCsv.ts` | the engine: `csv_rows`, `logbook_csv_read`, `logbook_csv_write` (`LogbookCSV`) | `logbookCsv.json` |
| Endorsements' words, the lapse warning (61.197), those in force, ACS codes; a handbook page's figures | `lib/endorsements.ts`, `lib/checkride.ts`, `features/plan/lib/handbookText.ts` | the engine: `endorsement_render`, `endorsement_lapse`, `endorsements_in_force`, `acs_codes`, `handbook_figures` | the engine's own tests |
| Runway numbers and calm winds (AIM 7-1-28); the FAA's words, airspace names, special-use limits, frequencies, fuel | `features/plan/lib/pattern.ts`, `features/plan/lib/wind.ts`, `lib/advisories.ts`, `lib/frequencies.ts`, `lib/airspace.ts`, `lib/stopServices.ts` | the engine: `gonogo_runway_number`, `runway_calm`, `wind_calm`, `faa_words`, `title_case`, `short_airspace_name`, `sua_altitudes`, `frequency_line`, `fuel_names` (`AirportWords`) | the engine's own tests |
| An ATC clearance heard, read into its items and the route it gives (AIM 4-4-3, 5-2-6; figures AIM 4-2-8, 4-2-9) | `lib/clearance.ts` | the engine: `read_clearance`, `cleared_route` (`Clearance`) | `clearances.json` |
| An ATIS or AWOS/ASOS broadcast heard, read into its figures (AIM 4-1-13, 7-1-11; JO 7110.65 2-6-6, 2-7-2) | `features/plan/lib/atis.ts` | the engine: `read_atis` (`Atis`) | `atis.json` |
| A transmission said to us by its call sign, and where its "direct" sends us (AIM 4-2-4) | `lib/heardCall.ts` | the engine: `our_call`, `direct_of` (`HeardCall`) | `heardCalls.json` |
| A clearance's places found with no signal, among the kept regions' airports, navaids and fixes (the planner's wingtip.spoken) | `wingtip/spoken.py` | the engine's `spoken.rs` (`Engine.hear` on `CyclePacks.keptPacks`) | the engine's own tests, test_spoken.py's cases |

Where the Swift copies still differ, the fixtures leave the case out:

- `FilingForm.hhmm` takes whole minutes, where the web's `hhmmForm`
  rounds a fraction first -- whole minutes are fine, the owner said
  (2026-10-28); the route item files no departure or arrival
  procedure from the phone yet.

## The words, with no signal

The Brief's "The weather in words" and the Go / No-Go's "The flight in
words" (`Wingtip/Words/`) are a few plain sentences over the figures,
each with the chips of the figures it rests on; a chip opens the report
as sent. Every figure is the engine's or the planner's; a model only
writes the sentences, and never a figure of its own:

- `WordsFor` asks the planner first while the Claude features are on
  (`PlannerWords`: `POST /api/words/{weather,risk}` through the gateway's
  proxy, Claude in the assistant service; off by default, decision 0035,
  when it asks only this iPhone), then this iPhone when the planner fails or
  cannot be reached (`OnDeviceWords`: Apple's on-device model,
  FoundationModels on iOS 26 with Apple Intelligence on), and says why
  in plain words when neither can (an older iOS, the model still
  downloading, no signal and no planner). The caption over the
  sentences says which wrote them ("From the planner", "On this
  iPhone").
- The figures go to the device's model as compact JSON of `{id, label,
  text}` (`WordsFigures`), with the planner's own ids (`metar:KMSN`,
  `taf:KMSN`, `hazard:0`, `tfr:<notam id>`, `finding:fuel`,
  `risk:<factor>`), so a chip means the same thing whichever model
  wrote the sentence. The instructions forbid any figure not in the
  input.
- Every sentence is checked on the phone (`Words.checked`, the
  planner's app.ai_words.checked again): one citing an id it was not
  given, or nothing, is dropped, since a model can cite wrongly, and
  at most ten are kept. `WingtipTests/WordsTests` holds the order of
  the providers and the guard.
- Every use of FoundationModels sits behind `#if
  canImport(FoundationModels)` and `#available(iOS 26, *)`, so the app
  builds on an older SDK and runs on iOS 18 without the words.

## Ask and the Brief's glance, with no signal

`Wingtip/OnDevice/` answers Ask in the air with nothing leaving the
phone, and gives the Brief its glance when the planner's words cannot be
had. The figures are the engine's on the phone or the planner's as last
fetched; a model only words them:

- **Where an answer comes from** (`AskRoute`): Ask's menu at its top left
  picks Automatic (the planner, else this iPhone), The Planner, or On
  This iPhone, kept as `wingtip.ask.where`. Under Automatic a phone with
  no path out (`NWPathMonitor`) asks the phone at once, and a planner
  that fails or errs before its first word is replaced by the phone's
  answer; one begun stays the planner's. The caption over each answer
  says who wrote it.
- **The tools** (`OnDeviceTools`, Foundation Models' `Tool`): the field's
  METAR, TAF and density altitude; the wind on its runways; the fuel; the
  glide; the nearest fields from the cycle packs. Each asks the engine
  (`FieldFigures`, `FlightFigures`: `wind_components`,
  `pressure_altitude_ft`, `gonogo_density_altitude`, `filed_endurance`,
  `glide_range`, `best_fields` over `airports_in_view`) or quotes the
  report as sent, and hands the model `[id] label: words`; each chip
  ends with its source line. There is no ADS-B (FIS-B) weather on the
  phone yet, so the reports are the briefing's, with the time they were
  fetched.
- **The guard** (`OnDeviceAsk`): a sentence citing an id no tool handed
  over is dropped (`Words.checked`), and so is one quoting a number not
  in the figures it cites (`NumberGuard`).
- **With no model** (an older iOS, Apple Intelligence off, the model
  still downloading, or nothing kept): `EngineWords` reads the question's
  words for its topic and says each figure as the engine's own sentence,
  captioned "The engine on this iPhone" with why.
- **The Brief's glance** (`BriefSummary`, `BriefSummarySection`): when
  the Go / No-Go's words are not the planner's, "At a Glance" over it
  gives the verdict and at most three actions (docs/decisions/0012),
  guided generation of `BriefGlanceAnswer` from the findings held. The
  finding must be the verdict's, each action must name a finding acted
  on and quote only its numbers, or the engine's `Glance` is shown. Say
  It reads it aloud.
- `WingtipTests/OnDeviceAskTests` and `OnDeviceRouteTests` hold the
  engine's figures through the bridge, the tools' calls through
  `GeneratedContent`, the guided glance parsed from JSON, the guard, the
  router's falls and the degrade with no model, with the model faked.

## Apple's guidance, and where the app stands

Apple names no architecture; for SwiftUI it asks for a declarative data
flow: views as values of state, state owned once in `@Observable`
models and handed down through the environment, the models asking the
rules (here the engine) for the rest. The app follows that, and these
pieces close the gaps a review against Apple's guidance found (the
owner, 2026-11-03):

- **App Intents** (`Wingtip/Intents/`): plan a trip to a place, brief a
  flight to one (the Brief opened through `BriefAsk`), the nearest
  airports, the weather at a field, direct to a place, and start or stop
  listening to the radio ("start recording"), as Siri, Shortcuts and
  Spotlight phrases (`WingtipShortcuts`). The fields Siri suggests are
  indexed in Spotlight (`AirportSpotlight`, an `IndexedEntity`) and open
  their card (`OpenAirportIntent`). The airport
  is an App Entity (`AirportEntity`: the kept route's, the Favorites and
  the Recents suggested, the planner's search behind them), so "Plan a
  trip to KLAS in Wingtip Maps" goes in one breath. An intent that needs
  the app sets `PendingCommand`, which `RootView` applies (`RootView+Commands.swift`).
- **Home Screen widgets** (`WingtipWidgets/FlightWidgets.swift`,
  `Wingtip/WidgetFeed.swift`, `Wingtip/Shared/WidgetSnapshot.swift`): the
  next flight's route, figures, Go / No-Go and departure weather on the
  Home Screen and the Lock Screen, from a snapshot the app writes to the
  App Group (`group.app.wingtipmaps`) only as it changes, so the widget
  never asks the planner and never spends its redraw budget idly.
- **Universal links and files** (`Wingtip/Intents/Links.swift`): a route,
  a field or an airplane shared from the site (`/app/plan?dep=…&dest=…`,
  `?place=`, `?flight=`) opens in the app as a `PendingCommand`, and a GPX
  or KML track from Files or Mail is flown again on the map (the document
  types in project.yml). The sign-in link stays `Session.open`'s.
- **A Live Activity** (`Wingtip/Activity/`, `WingtipWidgets/FlightActivityWidget.swift`,
  `Wingtip/Shared/FlightActivityAttributes` and `FlightActivityLines`):
  a flight in progress on the Lock Screen and in the Dynamic Island with
  the next fix and the time to it, the ETA, the planned fuel left (only
  with an airplane picked), the frequency ATC last handed us and the
  copilot's message, from the app's in-flight models (`InFlight`'s
  engine answer, `Copilot`, `AtcCopilot`: `FlightActivityContent`). It
  starts with the dry run or own ship under way with a routed plan, or
  from the Control Center control (iOS 18's Start Flight toggle,
  `WingtipWidgets/FlightControl.swift` with `Shared/FlightControlIntent.swift`,
  a LiveActivityIntent run in the app by `Activity/FlightSwitch.swift`
  from the route kept on the phone), and ends five minutes after landing.
  Every word is written by `Format`, compiled into the extension.
- **In flight** (#218, the owner's option A of 2026-11-08):
  `Wingtip/InFlight.swift` is the view model each fix (own ship's or the
  dry run's) is asked of the engine through once -- `in_flight`,
  `vertical_speed`, `glide_ring` -- and FiguresStrip, both strip layouts,
  the bar and the map read it. At flying speed `Views/InstrumentsBar.swift`
  sits over the map under the alerts and the radio: groundspeed, track
  (magnetic on a route, else marked T), GPS altitude, vertical speed; on
  the route the next waypoint's distance, time to go and desired track,
  the distance off course and the destination's arrival in Zulu with the
  fuel the plan leaves; Nearest (the Nearest list with Divert) one tap
  away; and "Planning aid · not for navigation". The glide ring is drawn
  dashed about the airplane (`FlightMapLayer`'s `GlidePolyline`) over the
  higher of the packs' ground under it (the packs' ahead answer's
  `ground_ft`, asked with the alerts network or none) and the nearest
  field. A field's Charts list has Diagram with your position
  (`Views/DiagramOwnShip.swift`): the FAA's PDF drawn by PDFKit, own ship
  placed by the diagram's own latitude and longitude marks (the free
  d-TPP's diagrams have no GeoPDF georeference; KORD's and a few others
  have no marks, and say so).
- **A cockpit ADS-B receiver** (`Wingtip/Receiver/`): a Stratux, Sentry,
  Garmin GDL 39/52 or uAvionix receiver on the Wi-Fi sends GDL 90 to UDP
  port 4000; `ReceiverListener` (Network.framework) gathers it and once a
  second the engine reads it (`receiver_read`, `engine/crates/receiver`).
  Its traffic is drawn ahead of the internet's, merged by ICAO address
  (`receiver_traffic`, through `Traffic`); a chip on the map says
  "Stratux · 12 targets · GPS"; a field's FIS-B METAR and TAF show on its
  card's Weather tab when the weather service has none
  (`receiver_reports`); FIS-B NEXRAD is drawn over the chart
  (`receiver_nexrad`, `NexradMapLayer`). Setup's Map section has ADS-B
  Receiver: Auto or Off. A receiver that only broadcasts to the network
  is heard once Apple grants the multicast entitlement.
- **The privacy manifest** (`Wingtip/PrivacyInfo.xcprivacy`): what is
  collected and the required-reason APIs used; the session is cookies in
  `HTTPCookieStorage`, and `UserDefaults` holds no secret.
- **Strict concurrency** (`SWIFT_STRICT_CONCURRENCY: complete` in
  project.yml): Swift 6's language mode (`SWIFT_VERSION: "6.0"`), so a
  data race is a compile error, and every warning is one too
  (`SWIFT_TREAT_WARNINGS_AS_ERRORS`).
- **A string catalog** (`Wingtip/Localizable.xcstrings`,
  `SWIFT_EMIT_LOC_STRINGS`): every `Text` gathered at build, so a second
  language is a column, not a rewrite. xcodebuild extracts the strings
  but, unlike Xcode's editor, never writes them back: after a build that
  adds or drops a string, `scripts/build/ios-strings.sh` syncs the catalog
  from the build's `.stringsdata` (`xcrun xcstringstool sync`), and CI's
  iOS job fails with `--check` when the committed one differs.
- **Scene restoration**: the pages a scene was on come back with it
  (`@SceneStorage` in `RootView`).
- **A UI smoke test** (`WingtipUITests/LaunchTests`): the app launched
  and its first screen shown, run by the runner with the unit tests.
- **Time-sensitive notifications** (`Wingtip/Notifications.swift`): a
  call to us on the radio, traffic near own ship and a watched
  airplane's takeoff or landing, told at Apple's time-sensitive level
  only while the app is not in front (on the screen the banner, the
  amber mark or the haptics say it), with permission asked in the
  moment the pilot first asks for one. The entitlement is in
  project.yml.

## Checklists and the passenger briefing

Each airplane's checklists (#220; the owner's decision of 2026-11-08:
free, kept on the device) are two plain texts, normal and emergency,
kept in UserDefaults by the N-number, else by the type's profile where
no N-number is picked (`Wingtip/Checklists.swift`, `LocalChecklists`),
and read by the engine's `checklist_read` (`ChecklistText`); the gateway's
checklist is no longer asked for. They start empty: "Start from the
Phases" puts in the headings only, the phases of a handbook's Normal
Procedures and the emergencies of its Emergency Procedures (GAMA
Specification No. 1, Sections 4 and 3; `ChecklistPhases`, the same lists
as the web's and Android's), never a manufacturer's words. Each is
edited as text and run with its items ticked, a section's "n of m" by its
title, and Start Over (`Views/ChecklistViews.swift`, `ChecklistModel`).
They open from the Aircraft tab and from each of the pilot's airplanes;
the map has no emergency button (the owner, 2026-11-08).
The watch is sent the normal list.

The Brief's Passenger Briefing (#223, `Wingtip/Passengers.swift`,
`Views/PassengerBriefingView.swift`) is the FAASTeam's SAFETY briefing
(FAA Safety Briefing, Jan/Feb 2007 and Jul/Aug 2014), each item with its
source under it -- 14 CFR 91.107(a)(1) the only one a regulation asks
for, (a)(2) and (3) the belts fastened, the ACS's PA.II.B.S2 for the
doors and the propeller -- ticked for the flight (its route and day) and
kept on the device. Under them, the flight in a few lines for the
passengers -- the fields by name, leaving on the phone's clock and in
UTC, about how long in the air, landing, and the destination's weather in
words where it reports -- sent with the share sheet. The live track for
passengers waits for the server on AWS.

## The Apple Watch app

`apps/ios/WingtipWatch/` (the owner's ask, 2026-11-03) is a companion of the
iOS app, bundle id `app.wingtipmaps.ios.watchkitapp`, watchOS 10 and
later, embedded in the phone's app and installed with it: three pages,
Timers (a flight timer and a hold/approach timer, each a `Stopwatch`
worked out from the clock at each draw under a `TimelineView`, so it is
right when the display wakes), Checklist (the picked airplane's sections
and items, ticked on the wrist, a section reset by a swipe) and Nearest
(the fields nearest the watch's own fix, or the phone's).

The watch links no engine (the XCFramework has no watchOS slice) and
calls no server. The phone (`Wingtip/WatchLink.swift`) sends the
airplane's normal checklist, as kept on the phone, and the pilot's fix as the
WatchConnectivity application context, and answers the watch's nearest
question from the planner (`Planner.nearest`; the cycle packs give the
airspace at a point only, so offline the watch is told the planner is
out of reach). Every message is a small Codable struct in
`Wingtip/Shared/WatchMessages.swift`, compiled into both apps and
round-tripped in `WingtipWatchTests`. No complication yet.

The workflow does not build the watch scheme yet: the `Wingtip` scheme
builds the watch app as the embedded companion, and `WingtipWatch`'s
tests need a watch simulator paired with the iPhone one, picked as a
pair (`xcrun simctl list pairs`) and given as `-destination
"platform=watchOS Simulator,id=…"`. In the developer account the watch
app needs its own app id (`app.wingtipmaps.ios.watchkitapp`) and a
provisioning profile beside the phone's for TestFlight.

Still open, as decisions rather than code: the app on the phone is the
web app in a web view until this one is the product; local records
(plan history, kept airplanes, watches) in SwiftData with iCloud sync
are the other session's batch.

## Speed, and how it is measured

The owner's ask (2026-11-03) for a fast app with no workarounds, done in
these places:

- **Tiles** (`Tiles/ChartTileOverlay`, `TileStore`, `KeepRoute`): the
  chart's renderer draws the pyramid's own tiles (below); a decoded tile
  is kept in memory (`TileCache`, 96 MB, about three screens) in front
  of the disk store and the network, concurrent loads of one tile are
  coalesced, the loads of tiles that leave the view are cancelled, and a
  kept route's tiles bring their parents one and two levels up, so a
  zoom out is answered from the phone. Decoding (with the day's lift)
  runs off the main thread, about 7 ms a tile, and drawing a decoded
  tile on MapKit's drawing threads about 1 ms (measured on the Mac mini,
  2026-11-08). Each load is a signpost (`app.wingtipmaps.ios`, `tiles`).
- **Marks** (`Views/ChartMap`, `Views/AirportMarks`): the airports'
  annotations carry display priorities by the field's size
  and airspace, so MapKit drops overlaps rather than drawing them; the
  checkpoints' annotations are diffed, not removed and re-added.
- **The map's data from the packs** (`PackMapData`, `Views/ChartOverlays`):
  the airports, airspace and navaids in view are asked of the engine's
  pack readers (the airports of the planner where no pack answers; the
  planner's airspace and navaid in-view answers are gone since the web
  draws them from the overlay tiles), so in flight the map draws with no
  signal. They are asked again during a
  pinch, not only once the fingers lift, whenever the view changes level
  or leaves the box already asked for (`ViewFetch`, as the web's
  useGlView), the packs answering at once.

## The map's look, beside the web's

The web map's look of 2026-11-07/08 (#510, #537, #539, #541-#544) is
brought over in MapKit's own way, the same result rather than the same
code:

- **The chart's tiles**: the 512-pixel @2x pyramid (#510) where the
  layer has it (`scales`), drawn by a renderer of the app's own
  (`ChartTileRenderer`): each tile's image goes into its own map rect
  with Core Graphics at full resolution. MapKit's tile overlay could
  not do it: it lays a tile's picture one pixel to a point whatever its
  size or density, so @2x tiles were drawn twice too large from each
  tile's corner (Beloit's under O'Hare, #549) and the 1x chart was a
  third of a 3x screen's pixels. The renderer picks the level whose
  tiles are stretched at most 1.5 times over the screen's pixels
  (`ChartTileMath`: from a whole level on a 3x screen), draws the last
  level enlarged past the pyramid's end, and covers a tile still loading
  with the part of the nearest level above it that is in memory. By day
  the web's lift of the chart (`ChartLift`: MapLibre's raster-contrast
  and -saturation 0.1); at night, dimmed, as printed.
- **ForeFlight-style overlays** (`Views/ChartOverlays`, `AirportMarks`):
  the sectional's airport symbols (towered blue, others magenta, R and M
  for private and military, the flight category a pip; `towered` from
  `/api/airports/in-view` and, from the packs, the engine's
  airports_in_view reading APT_BASE's TWR_TYPE_CODE), bold idents in the
  field's ink, the Class B, C and D rings in ForeFlight's brighter inks
  with their altitudes in a dark tab ("B: 100–30"), VORs with their
  frequency tag, and the web's colours from `chartColors.ts`,
  `airportMark.ts` and `glStyle.ts`.
- **Close in, Apple's map**: the chart lies over Apple's map and fades
  out from zoom 13 to 14 (`ChartFade`), and each field's runways are
  drawn from the FAA's data at their own width with their numbers turned
  to their true headings (`RunwaySurface`). The runways come from the
  planner's field (`/api/airport/{ident}`: NASR's surveyed ends and
  widths), since the phone packs hold no APT_RWY; the web reads them from
  the overlay archive. A soft runway (turf, grass, dirt, gravel) is
  drawn in the web's olive and the rest in its dark grey, the surface
  read by the engine's `gonogo_soft_surface`, the rule the short-field
  figures use. The web's colour follows the planner's HARD_SURFACES
  instead, so a runway of unknown or water surface is olive there and
  grey here.
- **One reveal**: a cover over the map, with Wingtip's mark turning in the
  middle of what the sheet leaves (`MapLoading`; still under Reduce
  Motion), until the chart's tiles and the first overlays are in, at most
  2.5 s; the map opens on the pilot's last position (`MapOpening`) at the
  web's opening zoom, re-centred under the mark as the sheet settles
  while it loads (the web's #543).
- **Before the engine**: nothing to wait for on the phone: the engine is
  linked into the app, so a GPS fix can never come before it (the web's
  #544 was its .wasm loading after the map).
- **Answers cached** (`API/Gateway`): the session keeps a URL cache
  sized for a flight, honouring the planner's and the gateway's
  Cache-Control, so a view come back to is answered from the phone.
- **Measured**: `WingtipTests/PerformanceTests` keeps clock and memory
  figures for the engine's readers and the map's decoding on the runner,
  and `Metrics` subscribes to MetricKit, so launch, hang, battery and
  crash reports come from real phones into the system log.

## 3D and the model weather, the MapKit way (2026-11-12)

The web's 3D (`features/plan/map/terrain`) and its model weather
(`features/weather-flow`) on the iPhone, built from MapKit's and
SwiftUI's own parts rather than a copy of the web's WebGL. What MapKit
can and cannot do here is from Apple's documentation (MKOverlayLevel,
MKMapConfiguration.ElevationStyle, MKMapCamera, "Displaying overlays on
a map") and the WWDC22 session "What's new in MapKit" (10035), whose
transcript states the overlay rules.

**3D** (`Map/MapTerrain.swift`, `Map/ApproachLines.swift`). The Map card
has Terrain, Flat | 3D, segmented as the web's Map menu has it.
`RaisedMapView` (the app's MKMapView) does the rest:

- The ground is MapKit's: `MKHybridMapConfiguration(elevationStyle:
  .realistic)`, Apple's imagery with its terrain and labels, and the map
  tilts (`isPitchEnabled`, the camera opened at the web's 50 degrees;
  flat and north up again after). The standard map's realistic style
  stands up only where Apple has its 3D City Experience and "will
  automatically fall back to ... a flat elevation" elsewhere (WWDC22),
  so the imagery is the 3D a pilot gets over the country.
- The FAA chart is taken off in 3D, with the USGS imagery under it.
  "When adding an overlay to a map with realistic terrain, MapKit will
  automatically transition the map to a flat representation" (WWDC22),
  and the chart is an `MKTileOverlay` drawn flat in map points: it
  cannot drape over Apple's ground. Apple's imagery is then the map,
  Apple's data on Apple's map (CloseImagery's note on its terms).
- Every other overlay is moved to `.aboveRoads`, which "will be shown on
  top of the terrain" under the labels (WWDC22, MKOverlayLevel), and
  back to the level it was asked for when the map is flat again; one
  added while in 3D goes there too. Whether a custom `MKPolyline` at
  that level lies on the 3D ground or still flattens the map is to be
  seen on the phone: WWDC22 says ordinary overlays flatten it and only
  the Directions API's route follows the terrain, while Apple's forums
  (thread 825523) say `.aboveRoads` overlays drape. Either way the
  lines are on the ground, never in the air.
- Lines are draped, not raised: an `MKPolyline`'s points are latitude
  and longitude, with no altitude, and MapKit has no way to stand a
  custom line or volume in the air. So the route and the procedures
  are on the ground; the way in to the destination is the engine's
  `approach_scene` drawn on the ground (each runway's extended
  centreline dashed white, the pattern's ring in teal), and its
  glidepath and the approach at their altitudes, the route's curtain,
  the obstacles stood up and the sky are not drawn.
- The airspace stays flat with its tabs, as MapKit cannot raise a
  custom volume.
- Traffic stays annotations: MapKit draws an annotation on the ground
  ("seamlessly displayed at the correct elevation", WWDC22) and has no
  altitude for one, so each airplane keeps the engine's TCAS tag
  (`traffic_marks`, "+12" against own ship) as its height.

**Model weather** (`ModelWeather/`). The Map card's Model Weather menu
(Off and the web's twelve fields) and, where the field has them, its
Level menu (Surface ... FL300, Max; the engine's `flow_levels`).
`ModelWeather` reads the planner's `GET /api/weather/flow` every ten
minutes and each hour's picture at its version; `FlowGrid` reads a PNG's
channels as the field's `unscale` range (alpha 0 is no value, the wind
its east and north parts), `FlowPaint` colours it by the field's ramp
into a Mercator picture, and a custom `MKOverlayRenderer`
(`ModelWeatherLayer`) draws it just over the chart and under the
airspace and the route, at the web's strength. The ramps and the
legend's words come from the engine's `model_weather_bands` and
`aviation_grid_bands` and the tokens' `color.weather.flow-*`
(`FlowLooks`, the web's flowLook and aviationLooks). An hour past on the
precipitation is the radar's mosaic, as on the web. The hour's
G-AIRMETs are the planner's weather map at its time, dashed in their
hazard's colour with AWC's short label (`gairmet_hazards`). A tap that
finds no mark puts the value's badge there (`FlowReading`: the engine's
`compass_point`, `precip_intensity`, `cape_category`, `icing_severity`,
`turbulence_category`). The timeline is a glass bar in the banners'
column: Play (once through, never under Reduce Motion, paused in the
background), the title, the day and the Zulu hour with how far ahead,
1h | 12h on the precipitation, and a stock `Slider` with the first and
last hours as its labels; under it the legend card: Close, the field's
and the level's menus, the ramp with its ticks and "AWC winds, 12Z".

Where it differs from the web: no streaks (the owner took the fields
and the AIRMETs without them, 2026-11-12), so no world wind beyond
AWC's box either; no hatch outside the box; no temperature pills at
the pilot's position and favourites; the precipitation's badge has no
sun, moon or cloud glyph; the legend and the timeline sit together at
the top, as the iPhone's sheet covers the foot. The web's Shaded
terrain is not offered, as MapKit draws no hillshade of the app's
own elevation tiles.

## Downloads: the chart with no signal

Setup → Chart → Downloads (`Wingtip/Offline/`) keeps a region's chart on
the phone, as ForeFlight's and Garmin Pilot's downloads do: a sectional
sheet's coverage ("Chicago", "Twin Cities"), a state, or the map's view,
picked on a list or on a map of the sheets. The planner cuts each one
from its cycle's archives (`/api/offline-charts`,
`wingtip.offline_charts`): one PMTiles file per chart kind and density
(Sectional, Terminal Area, IFR Low, High and Area; Sharp is the 512-pixel
@2x tiles, Smaller the 256), each sized before it is fetched (Chicago's
sectional 583 MB sharp, 206 MB smaller). `DownloadsModel` holds the
screen; `OfflineDownloads` fetches the files with a background
URLSession, so they come with the app closed (`OfflineAppDelegate` takes
iOS's hand-over); `OfflineStore` keeps them under Application Support,
out of the backup, with `manifest.json`. The region's cycle packs are
fetched with it (`CyclePacks.keep`), so its airspace and places answer
with no signal too.

The map reads a tile from a downloaded region first (`TileStore.read`
asks `OfflineStore.tile`), at the density asked for or else the other,
then from the tiles it fetched as it went, then the network.
`PMTilesReader` is the phone's own reader of the format (spec v3): the
header once, each directory once as it is needed, then the tile's own
bytes, by ranged reads of the file, never mapped whole (Alaska's
sectional at 2x is 7 GB). When the planner has the next cycle, a kept
region offers "Update to" it; on the day the old edition is replaced
(0901Z on the next one's date) it is said to be expired and kept until
its update is whole, then removed (`OfflineStore.sweep`; warn, never
limit). `WingtipTests/OfflineChartsTests` reads an archive the planner's
writer made, leaf directories and all.

The web app has no Downloads: a browser cannot be relied on to keep
gigabytes (Safari may clear a site's storage after seven days without a
visit, and every browser caps it and may evict it under pressure). The service worker keeps the tiles looked at and a route's corridor
(KeepRoute). A later path for an installed web app would be the same
archives in the Origin Private File System, with
`navigator.storage.persist()` asked first, read by the `pmtiles`
library the overlays already use.

## In the air with no signal (2026-11-10)

What keeps working on the iPhone once the network is lost, after the
offline audit of 2026-11-10:

- **Nearest and Emergency's best fields** ask the planner, and with no
  answer in five seconds (`Planner.inFlight`) take the fields from the
  cycle packs kept on the phone (`OnDevice/PackFields`: the engine's
  `airports_in_view`, ranked by its `best_fields`, the pilot's own glide
  ratio where an airplane is picked). The list says "From this iPhone,
  without weather": the packs hold no METAR, elevation or runway. The
  search's Nearest group and the Watch's take the same fallback
  (`Planner.nearestOrPacks`). With no GPS fix both say "Finding your
  position…" for ten seconds, then "No GPS position" and what to do, or
  with Location off a link to Settings.
- **Direct To and a diversion** need the planner for the new route's legs.
  The route before is held until the nav log is whole; with no connection
  it is put back and "Not changed: no connection" said under the route's
  Direct row and in Emergency (`Plan.directFrom`, `undoDirect`), so the
  route box, the line and the legs are always one route's.
- **Keep for the Air** also keeps each route field's NOTAMs under the key
  the airport card reads (`KeptForAir.fieldNotamsKey`), the newest radar
  frame's tiles 25 nm either side of the course at zooms 5 to 8, at most
  300 (`Offline/KeepRadar`, drawn by the loop where IEM can't be
  reached), each field's FAA diagram PDF for the own-ship diagram, and the
  route profile where the plan's own fetch had not brought it.
- **The corridor's chart tiles** are kept in Application Support
  (`kept-chart-tiles`, excluded from backup), which iOS does not purge;
  the tiles the map fetches as it pans stay under Caches (`TileStore`).
- **Ages.** The kept plan and briefing say their age from the launch
  (`KeptAgeLine`). An airport weather mark whose report was heard over an
  hour ago (a routine METAR is hourly, AC 00-45H ch. 3) is greyed, with its
  age by the ident (`FieldWeatherMarks.aged`).
- **Timeouts.** The plan's course, the nav log, chart tiles and the search
  give up after ten seconds with no byte (`Planner.read`), the in-air calls
  after five, and a body over 64 kB gets two minutes (`Planner.upload`).
- **Search** says "No connection" and matches the airports in the kept
  packs by ident or name (`PackSearch`); waypoints, towns and N-numbers
  need the planner.

Tests: `OfflineFieldsTests`, `FlightExtrasTests` (Direct To put back),
`KeptForAirTests`, `TilesTests`, `FieldWeatherMarksTests`.

## The App Store's privacy and first-launch rules (2026-11-10)

- **Privacy manifests.** `Wingtip/PrivacyInfo.xcprivacy` declares Email,
  Name, Phone Number, User ID, Other User Content and Precise Location
  (linked), Crash and Performance Data (not linked), and the
  required-reason APIs: UserDefaults `CA92.1` and `1C8F.1` (the App
  Group), File Timestamp `C617.1`, Disk Space `85F4.1` (Downloads' free
  space). The widget extension has its own (`WingtipWidgets/`,
  UserDefaults `1C8F.1`) and the Watch an empty one. The codes are
  Apple's NSPrivacyAccessedAPITypeReasons list's; `StorePrivacyTests`
  reads the bundled manifest. docs/privacy-inventory.md is the list.
- **Sign-out and Delete Account** erase the path flown and the flight
  recorder's track with their files, the session's answer cache and the
  gateway's cookies (`Session.forgetDevice`, `forgetCookies`).
- **Purpose strings** name the voice questions (microphone, speech) and
  the position read on in the background while flying (location).
- **The first launch** puts up one stock alert, "A Planning Aid, Not for
  Navigation", with About's planning-aid words and the listing's
  not-for-navigation paragraph, accepted once (`PlanningAidNotice`). The
  UI tests' launch arguments skip it (`-planningAid` asks for it).
- **Push in the App Store build.** `project.yml` keeps `aps-environment`
  development, which the archive's development signing needs; the App
  Store export re-signs with the distribution profile, whose value,
  production, the app then carries. To confirm: `codesign -d
  --entitlements - --xml Payload/Wingtip.app` in the exported `.ipa` shows
  `production` (`native-ios.yml` checks it wherever the export leaves an
  `.ipa`), or App Store Connect's build metadata lists the entitlement.

## Signing in from a link: whose account it is

An emailed sign-in link names no account, and anyone can mail a pilot a
link to their own (the security audit's M1 and L1, 2026-11-10). Before the
app spends a link's token, it asks the gateway whose it is and shows it on
its confirmation sheet ("Sign in as a•••@icloud.com?"):

- `POST /api/auth/magic-link/account`, form body `token=<the link's
  token>`, with the session's CSRF header as for `/verify`.
- `200 {"email": "a•••@icloud.com"}`: the link can still sign in, to that
  address (its first letter and its domain). Nothing is spent; the token
  still signs in once, by `POST /api/auth/magic-link/verify`.
- `404`, no body: used, expired or unknown, all alike. Say the link has
  expired and offer a new one; don't offer Sign in.
- `429`: 30 asks an hour from one address; say so and let the pilot try
  later.

## Sign in with Apple: the nonce

An identity token that leaks (a log, a proxy) could otherwise be replayed
until it expires (the security audit's L5). The gateway ties each token to
a nonce it issued to this session, used once:

1. `POST /api/auth/apple/native/nonce` (the session's CSRF header) answers
   `{"nonce": "<43 characters>"}`.
2. Set `ASAuthorizationAppleIDRequest.nonce` to the nonce's SHA-256 as
   lowercase hex (`SHA256.hash(data: Data(nonce.utf8))`, each byte `%02x`).
   Apple writes that into the token's `nonce` claim.
3. `POST /api/auth/apple/native` with `{"identityToken": ..., "nonce":
   "<the nonce itself, not its hash>"}`.

The gateway checks the nonce is the one this session was given and the
token's claim is its hash; a nonce is spent by the attempt, so a failed one
asks for a new nonce. The iPhone asks a nonce as the sign-in page opens
and after each attempt (`Session.prepareAppleNonce`, `hashedNonce`).
Today the nonce is optional, so an older build keeps signing in; once
the app that sends it has shipped, the owner sets
`APP_APPLE_REQUIRE_NONCE=true` on the gateway, and a token without one is
refused. A token that carries a nonce claim is always refused without it.

## Building

The Mac mini has Xcode (`.tool-versions`' `xcode`, 27.2 and the iOS 27.2
SDK), so a build or a test runs there through `scripts/dev/one-at-a-time.sh`
(CLAUDE.md's table). CI builds it on the Mac mini's runner or GitHub's
`xcode-27` image (docs/CI.md), through `.github/workflows/native-ios.yml`:

- a pull request that touches `apps/ios/`, the engine, the web files the
  app bundles (`apps/web/src/lib/fixtures`, `apps/web/src/lib/acs.json`)
  or the workflow: XcodeGen, then `xcodebuild test` on the newest iPhone
  simulator with `-only-testing` the unit tests (`WingtipTests`) and
  `CardSmokeTests` (an airport card opened from the search, scrolled with
  its close in sight, closed back to the search), about ten minutes;
  DerivedData is restored from main's last build, its inputs stamped by
  content (`scripts/ci/content-mtimes.py`) so only what changed compiles;
- every night (`native-ios.yml`, `full`): the whole suite (the launch,
  flow and accessibility tests, the store shots and the card rule's full
  suites, `CardRuleTests` and `CardScrollTests`) on the iPhone, the iPad
  (a Pro where there is one, for the iPad's own layout) and the iPhone
  Duo, with a picture of each device's first screen (`native-ios-screens`);
- on `main`, with the App Store Connect key the owner sets (below), the
  app is archived and uploaded to TestFlight.

`WINGTIP_HOST` is the build's host (the repo variable `WINGTIP_URL`'s);
it is the gateway's address and the app's associated domain.

## What only the owner can do, for TestFlight

1. **Join the Apple Developer Program** ($99 a year) and note the Team
   ID (Membership details).
2. **Choose the bundle id**, e.g. `app.wingtipmaps.ios`; it cannot change
   once the app is in App Store Connect.
3. **Create the app in App Store Connect** (My Apps → +): the name, the
   bundle id (register it under Identifiers first, with the Associated
   Domains and Sign in with Apple capabilities), a SKU.
4. **Create an App Store Connect API key** (Users and Access →
   Integrations → App Store Connect API, role App Manager) and download
   its `.p8` once.
5. **In GitHub** (Settings → Secrets and variables → Actions):
   - variables `APPLE_TEAM_ID`, `IOS_BUNDLE_ID`, `APP_STORE_KEY_ID`,
     `APP_STORE_ISSUER_ID`, and `WINGTIP_URL`
     (`https://<the domain>/app/plan`);
   - the secret `APP_STORE_KEY_P8`, the `.p8` file's contents.
6. **On the server**, add `APPLE_TEAM_ID` and `APP_IOS_BUNDLE_ID` to the
   stack's AppSecret (`infra/server/env.example`) and run `deploy.sh`,
   so the site names the app for its links and accepts its Apple
   sign-in.
7. **TestFlight:** add yourself as an internal tester. The next push to
   `main` that changes the app (or Run workflow on Native iOS) uploads a
   build; it appears in TestFlight after Apple processes it.
