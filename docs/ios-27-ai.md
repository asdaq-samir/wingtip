# iOS 27 AI in Wingtip Maps

The owner, 2026-11-09: "iOS 27 AI is what I wanted to leverage in the
first place", then "make our app fully AI powered leveraging iOS 27
cutting edge features", with Siri AI first. This page is the plan
(screen by screen), what is built, what was left out and why, and the
Apple sources for each. The app builds with Xcode 27.2 and the iOS 27.2
SDK and still runs on iOS 18; every iOS 27 API is behind
`if #available`, and an older iPhone keeps what it had.

The rules over all of it:

- **The engine decides every figure and rule.** The AI explains and acts;
  a sentence quoting a figure no engine or planner call gave is dropped
  (`Words.checked`, `NumberGuard`), and where nothing is left the
  engine's own words are shown, saying why.
- **Warn, never limit.** Siri confirms a route change ("Go direct?") the
  way a delete is confirmed; nothing refuses.
- **On-device first.** Apple's on-device model and Vision on the phone;
  the planner's Claude only where the phone cannot and the pilot is
  online; no AI at all is a working state.

## What iOS 27 has (read from the 27.2 SDK, Xcode 27.2, 27B52)

Each item was found in the SDK's `.swiftinterface` files; nothing here is
from memory. Apple's WWDC26 pages are the descriptions.

| Area | API in the SDK | Since | Source |
|---|---|---|---|
| View Annotations (Siri sees the screen) | `View.appEntityIdentifier(_:)`, `appEntityIdentifier(forSelectionType:identifier:)`, `appEntityUIElements(_:)` (`_AppIntents_SwiftUI`); `UIView.appEntityUIElementProvider`, `AppEntityUIElement`, `AppEntityUIElementsContext` (`_AppIntents_UIKit`, AppIntents) | iOS 18.4 (used by Siri on iOS 27) | [Explore advanced App Intents features for Siri and Apple Intelligence (wwdc2026/343)](https://developer.apple.com/videos/play/wwdc2026/343/), [WWDC26 iOS guide](https://developer.apple.com/wwdc26/guides/ios/) |
| Notifications Siri understands | `UNMutableNotificationContent.appEntityIdentifiers` (`_UserNotifications_AppIntents`) | iOS 27 | wwdc2026/343 |
| App Schemas | `@AppIntent(schema:)`, `@AppEntity(schema:)`; new in 27: `.maps` (`startNavigation`, `updateNavigationWaypoints`, `shareETA`, `place`, `navigationSession`…) | iOS 27 for `.maps` | [Build intelligent Siri experiences with App Schemas (wwdc2026/240)](https://developer.apple.com/videos/play/wwdc2026/240/) |
| Long-running intents | `LongRunningIntent`, `performBackgroundTask(options:operation:)` | iOS 27 | AppIntents.swiftinterface |
| Follow-up questions | `requestConfirmation(conditions:actionName:dialog:)`, `$param.requestValue`, `needsValueError` | iOS 18 / 26 | wwdc2026/343 |
| Camera look-ups (Siri's camera, formerly Visual Intelligence) | `IntentValueQuery` taking `SemanticContentDescriptor` (`labels`, `pixelBuffer`) | iOS 26; `IntentValueConvertible` iOS 27 | VisualIntelligence.swiftinterface |
| Testing intents | `AppIntentsTesting` (`IntentDefinitions`, `AppEntityDefinition`, `viewAnnotations()` in the session) | Xcode 27 | [Validate your App Intents adoption with AppIntentsTesting (wwdc2026/295)](https://developer.apple.com/videos/play/wwdc2026/295/) |
| Foundation Models | `SystemLanguageModel` now a `LanguageModel` with `capabilities` (`.vision`, `.guidedGeneration`, `.toolCalling`, `.reasoning`); image prompts (`Attachment(CGImage)`, `ImageAttachmentContent`); `ContextOptions(reasoningLevel:)`; `PrivateCloudComputeLanguageModel`; dynamic profiles; `contextSize`, `usage` | iOS 27 | [What's new in the Foundation Models framework (wwdc2026/241)](https://developer.apple.com/videos/play/wwdc2026/241/), [Build with the new Apple Foundation Model on Private Cloud Compute (wwdc2026/319)](https://developer.apple.com/videos/play/wwdc2026/319/) |
| Vision as model tools | `OCRTool`, `BarcodeReaderTool` (`_Vision_FoundationModels`) | iOS 27 | wwdc2026/241 |
| Evaluations | `Evaluation`, `ModelSample`, `Evaluator`, `ToolCallEvaluator`, `TrajectoryExpectation`, `ModelJudgeEvaluator`, `.evaluates(_:)` Swift Testing trait (Xcode's `Evaluations.framework`) | Xcode 27, iOS 27 | [Meet the Evaluations framework (wwdc2026/298)](https://developer.apple.com/videos/play/wwdc2026/298/), [Create robust evaluations for agentic apps (wwdc2026/299)](https://developer.apple.com/videos/play/wwdc2026/299/) |
| Core AI | `AIModel`, `InferenceFunction`, `AIModelCache`, `SpecializationOptions` (CoreAIRuntime, CoreAIDelegates) | iOS 27 | [Meet Core AI (wwdc2026/324)](https://developer.apple.com/videos/play/wwdc2026/324/) |

## The plan, screen by screen

Each row: the capability, the API, where it runs, and its state on this
branch (`claude/ios27-ai`). Built in order of value to a pilot.

| Screen | Capability for the pilot | API | Runs | State |
|---|---|---|---|---|
| **Siri, everywhere** | Siri knows airports, waypoints, flights, frequencies, NOTAMs, approaches, airplanes and logbook entries, and acts on them by voice | App Entities, App Intents, App Shortcuts | Phone; planner only to look a field up | Built (part 1) |
| Map | "Fly direct to that airport", "what's this checkpoint" about the marks in view | `UIView.appEntityUIElementProvider` on the MKMapView (`ChartMapSiri`) | Phone | Built |
| Route / FPL | "Plan this flight", "brief my flight", "add this approach to my route" | `appEntityIdentifier` on the plan; `FlightEntity`, `AddApproachIntent` | Phone | Built |
| Nav log | Each leg's fix is a waypoint Siri can fly direct to | `appEntityIdentifier` on each leg | Phone | Built |
| Brief / Go-No-Go | "Plan a flight to Oshkosh tomorrow at 9" opens the Brief on that hour of the departure window | `PlanTripIntent(departure: Date?)`, `BriefAsk`, `DepartureWindow.pick(nearest:)` | Phone + planner's window | Built |
| Ready to Fly | "Am I ready to fly?" said and shown | `ReadyToFlyIntent`, snippet | Engine on the phone | Built |
| Airport card | "What's the ATIS here", "that frequency" | `AtisIntent`, `FrequencyEntity`, annotations | Planner's D-ATIS / METAR | Built |
| NOTAMs | "What does this NOTAM mean for me" in plain words | `ExplainNotamIntent`: on-device model over the NOTAM, the engine's rank reasons and the route | **On-device**; the engine's reasons where the model can't run | Built |
| Weather | "What's the weather at my destination when I land" | `WeatherOnArrivalIntent`: the briefing's TAF at the ETA | Planner's figures | Built |
| Approaches | "Brief the ILS 27 at Madison", "brief this approach" | `ApproachEntity` (heard as pilots say it), `BriefApproachIntent` → engine `approach_brief` | Engine on the phone | Built |
| Emergency | "Direct to the nearest airport", with a spoken confirm | `DirectToNearestIntent`, `requestConfirmation`, follow-on `DirectToIntent` | Planner's nearest | Built |
| In flight | "Start my flight" (Live Activity), "keep for the air" | `StartFlightIntent: LiveActivityIntent`, `KeepForAirIntent` | Phone | Built |
| Logbook | "Log this flight": the engine's draft from the track, for the pilot to confirm | `LogFlightIntent`, `LogbookEntryEntity` | Planner/engine draft | Built |
| Airplane | "Fly N123AB" | `AirplaneEntity`, `FlyAirplaneIntent` | Phone | Built |
| Camera | Point at a sectional, a plate, a METAR printout or a sign: the fields in it, opened in Wingtip | `IntentValueQuery` over `SemanticContentDescriptor`, Vision text recognition | **On-device** read; idents looked up | Built |
| Notifications | A notification's field or flight is what Siri's "what does this mean" is about | `appEntityIdentifiers` | Phone | Built (API in `Notifications.tell`) |
| Brief | The ranked NOTAMs in plain words ("The NOTAMs in words" under the Brief's NOTAMs), each sentence citing its NOTAM | Foundation Models guided generation (`WordsAnswer`) over the engine's `notams_ranked` and its reasons (`Words/NotamsInWords.swift`) | **On-device only**; hidden where the model can't run | Built (part 2) |
| Brief | The briefing at a glance and the weather in words | `BriefSummary` (on-device glance from the Go / No-Go), `WordsFor` (planner's Claude, then on-device) | Both | Already there before iOS 27; unchanged |
| Documents | Handbook performance and weight-and-balance pages, logbook pages and clearance notes read on the phone; the engine on the phone checks the figures (`handbook_read_check`, `logbook_read_check`) as the server's reader has them checked; the assistant reads only where the phone can't | iOS 27 image prompts (`Attachment(CGImage)`), `capabilities.contains(.vision)`, `OCRTool` as the model's tool (device SDK only; the simulator SDK has no `_Vision_FoundationModels`), `@Generable` drafts member for member the assistant's (`Documents/DocumentDrafts.swift`, `OnDeviceDocumentReader.swift`) | **On-device first**, Claude fallback | Built (part 2) |
| ATC / clearance | A typed or heard clearance said back as the controller would say it, for the engine's `read_clearance` to read; the engine stays the reader | `OnDeviceDocumentReader.said(clearance:)`, guided `ClearanceTextDraft` | On-device | Built and evaluated; not yet on the clearance sheet, which is at its size cap (422 lines) and needs splitting first |
| Logbook | Remarks drafted from the flown track | Foundation Models over the engine's `logbook_from_track` figures | On-device | Not yet: the planner's draft already fills every figure; remarks are the pilot's |
| Nav log | "Why this altitude" | Foundation Models over the engine's altitude reasons | On-device | Not yet |
| In flight | Weather on the route worse than at the Brief, told as a notification | Background refresh + the engine's `weather_along` against the kept briefing, `appEntityIdentifiers` | On-device | Not yet: the gateway's flight watch mails it today; the notification side is ready (`Notifications.tell(about:)`) |
| Evaluations | The NOTAMs in words (no figure of the model's own; the matter named) on `notamsRanked.json`; a clearance said back read the same by the engine on `clearances.json` | Evaluations framework: `Evaluation`, `Evaluator`, `Metric`, `ArrayLoader` (`WingtipTests/AIEvaluations.swift`) | Simulator where the model is present, else skipped; the fixtures' known answers always | Built (part 2). First run on the iOS 27.2 simulator: no invented figure in 6 of 6; the NOTAM named in 2 of 6, then 4 of 6 after the prompt asked for it (hill-climbing, wwdc2026/335); the clearance read the same in every sample |

## What was left out, and why

- **App Schemas' `.maps` domain.** iOS 27's maps schema is road
  navigation (start navigation, share an ETA, report an incident); its
  parameter shapes are Apple's and checked by the macro, and a schema
  type is iOS 27 only while the app runs from iOS 18. Direct To and the
  route stay the app's own intents; revisit if Apple adds a flight
  domain.
- **Radio and fix phrases.** Apple allows ten App Shortcuts. The ten are
  the owner's main actions (plan, brief, Direct To, nearest, emergency,
  weather, start, log, ready, keep). Start/Stop Listening and Direct to a
  Fix lost their phrases; they remain intents in Siri, Shortcuts, the
  Action button and Control Center.
- **AppIntentsTesting.** It drives an installed app through real system
  paths from a UI test target; the app's UI test target is not run on
  the compile-only checks. The entity and intent logic is unit-tested
  (`SiriEntitiesTests`, `IntentsTests`).
- **Core AI for the chart scorer.** The planner's chart-label scorer is a
  scikit-learn Ridge (or forest) over features the planner's chart
  reader extracts from the FAA raster (`services/planner/app/chart_scorer.py`,
  `detection.py`); the phone has neither the reader nor its features,
  and a Ridge is a dot product, not a network Core AI's specialised
  runtime would speed up. Core AI takes models authored for it (WWDC26
  "Dive into Core AI model authoring and optimization", wwdc2026/325),
  not scikit-learn's. Not used; revisit if the chart reader moves on
  device.
- **Vision's OCR tool in the simulator.** `OCRTool` lives in the
  `_Vision_FoundationModels` overlay, which the iOS 27.2 device SDK has
  and the simulator SDK does not; the simulator build reads a photo with
  the model alone, and a phone gives it the tool.
- **Private Cloud Compute (`PrivateCloudComputeLanguageModel`).** Apple's
  bigger model off the phone, free for small developers (WWDC26 guide).
  It is a second server path beside the planner's Claude; the owner's
  rule is on-device first, so it is not added without his word.

## What only a real iPhone can show

Apple Intelligence runs on an iPhone 15 Pro or later (and the iPhone 16
and 17 families) with it turned on in Settings. On such a phone, and not
in the simulator:

- Siri acting on what is on the screen ("fly direct to that airport",
  "what does this NOTAM mean for me") and the spoken follow-ups;
- a camera look-up of a chart, plate or printout;
- the on-device model's words (NOTAMs, the NOTAM explained), and a
  photographed page read on the phone with Vision's OCR tool;
- the evaluations' model runs, where the simulator has no model.

## Privacy

Siri's entities are named on the phone; Siri sees only what the app
annotates. A camera look-up's picture is read on the phone (Vision) and
only the idents found in it are looked up on the planner. The NOTAM's
words are written by Apple's on-device model. See
`docs/privacy-inventory.md`.
