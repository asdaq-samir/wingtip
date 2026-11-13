# Privacy answers for the stores

App Store Connect's App Privacy ("nutrition label") and Google Play's
Data safety form, answered from the code on 2026-11-10.
[`docs/privacy-inventory.md`](../privacy-inventory.md) is the one source
of what is collected; this page is that list put into each store's
questions, with the file each answer rests on. When the inventory
changes, change this page and `apps/ios/Wingtip/PrivacyInfo.xcprivacy`
with it.

"Collected" is Apple's meaning: sent off the device and kept longer than
it takes to answer the request.

## No Claude features

The features Claude wrote on the server (Ask's planner answers, the
written briefing, the words beside the Brief's figures, checkpoint
descriptions, the mock oral, a photographed page read) were off from
2026-11-10 and taken out on 2026-11-12
(docs/decisions/0041-claude-taken-out.md): Anthropic receives nothing
from any app or the server, and no use is counted. The pilot's own Claude
or ChatGPT, where the pilot connects Wingtip to it (the MCP connector),
is that app's maker's collection, under its terms.

## The policy these answers point to

The policy, terms and support page are `docs/legal/privacy.md`,
`terms.md` and `support.md`, written to `apps/web/public/*.html` by
`scripts/build/legal_pages.py` (CI checks they are current,
`scripts/ci/guards.sh`) and served at `/privacy`, `/terms` and
`/support` (`WebMvcConfig`). Deleting an account without the app is at
`/delete-account` (`DeleteAccountController`), linked from the support
page and the policy. Check these answers against the policy whenever
either changes.

## App Store Connect: App Privacy

**Do you or your third-party partners collect data from this app?** Yes.

**Tracking:** none. No advertising, no analytics SDK, no data broker,
nothing joined with others' data: "Data Not Used to Track You".
`PrivacyInfo.xcprivacy` has `NSPrivacyTracking` false and no tracking
domains; `apps/ios` links no third-party SDK that reports (no Sentry,
Crashlytics, Firebase or analytics kit: a grep of `apps/ios` finds none).

### Data linked to you (all for App Functionality, none for tracking)

| Apple's type | What | Where in the code |
|---|---|---|
| Contact Info: Email Address | The address signed in with, Apple's or the emailed link's | `apps/ios/Wingtip/Session.swift`, `API/Gateway.swift`; the gateway's `pilots` |
| Contact Info: Phone Number | The telephone number the pilot adds, optional, for a flight plan's item 19 | `Session.swift` (`setContact`); the gateway's `pilots.phone` |
| Contact Info: Name | The name Apple gives at sign-in; the name as on a pilot certificate where given for endorsements | `Views/SignInView.swift`, `Views/InstructorView.swift` |
| Identifiers: User ID | The account's id, Apple's subject for the sign-in | `Session.swift` |
| User Content: Other User Content | Airplanes, saved flights and nav logs, the logbook, endorsements, currency dates, checkpoint notes | `Views/AircraftView.swift`, `Views/LogbookViews.swift`, `Logbook/AutoLogbook.swift`, `API/` |
| Location: Precise Location | A flight's track, when the pilot logs or saves it (the auto-drafted logbook entry sends the track to the planner, and the logged flight keeps it), linked to the account | `Logbook/FlightRecorder.swift`, `Logbook/AutoLogbook.swift`; the gateway's `flight_tracks` |

### Data not linked to you

| Apple's type | What | Where |
|---|---|---|
| Location: Precise Location | The airplane's position, sent to the planner to answer (Nearest, the copilot's look ahead, `/api/copilot/around`) and not kept | `OwnShip.swift`, `Copilot/Copilot.swift`; `PrivacyInfo.xcprivacy` has one Precise Location entry, linked for the saved track |
| Diagnostics: Crash Data | MetricKit's crash, hang, CPU and disk-write exception diagnostics (the call stack, the exception or signal), with the app's version, the iOS version and phone or tablet; no account, no cookie, no position or route; kept 30 days | `Diagnostics/DiagnosticsReporter.swift`, `DiagnosticsReport.swift`; the gateway's `diagnostics` |
| Diagnostics: Performance Data | MetricKit's daily launch and resume times, hang time, scroll hitches, peak memory and the exits the system forced for memory, the same way; kept 400 days | `Diagnostics/DiagnosticsReporter.swift`; the gateway's `speed_samples` |

Both go to Wingtip's own gateway (`POST /api/diagnostics`, a session
of its own with no cookie), not to any third party: there is no crash
or analytics kit in the app. `PrivacyInfo.xcprivacy` declares both,
unlinked, for App Functionality. Apple's own crash reports, from users
who share analytics with developers, are Apple's collection, not the
app's.

Purchases: **not collected.** The app is free and has no in-app
purchase (no StoreKit in `apps/ios`); the inventory's Purchases row is
for a subscription that is off (docs/decisions/0022).

Not collected, though the app uses them on the device:

- **Audio and speech.** The ATC copilot hears the radio with the
  microphone and turns it into words with Apple's recognizer on the
  iPhone only (`ClearanceListener.swift` always sets
  `requiresOnDeviceRecognition`); the words are read by the engine on
  the phone (`Atc/AtcCopilot.swift`). Asking by voice, the search's and
  Ask's mic, is a separate recognizer (`VoiceInput`, since 2026-11-10),
  also on the device only: its words are typed into the field and go
  only where a typed question would. No audio and no transcript is sent
  to Wingtip's servers or to Apple. Where the phone cannot recognise on
  the device (`supportsOnDeviceRecognition` false), voice is not
  offered at all: the microphone controls are hidden and neither
  permission is asked for.
- **Cockpit receiver traffic and FIS-B weather** (`Receiver/`): heard on
  the local Wi-Fi, read on the device, never sent.
- **Favourites, recents and routes in iCloud** (`Records/Records.swift`,
  SwiftData with CloudKit): in the pilot's own iCloud private database,
  which the developer cannot read; Apple does not count it as collected.
- **Siri, camera look-ups and Apple's on-device model** (`Intents/`,
  `OnDevice/`): what is on the screen is told to Siri as App Entities on
  the phone; a camera look-up's picture is read on the phone and only
  the airport idents in it go to the planner, unkept, as any airport
  lookup does; the on-device model's words are written on the phone; a
  photographed page is read on the phone where it can be (iOS 27,
  `Documents/OnDeviceDocumentReader.swift`), and is offered only where
  it can be. Nothing new is collected.
- **Apple's Private Cloud Compute** (`Words/AppleModels.swift`, iOS 27,
  off until the entitlement is assigned): where the on-device model
  cannot answer, the same words, figures or page go to Apple's Private
  Cloud Compute, which uses them for the request only and never stores
  them. Apple is the processor and nothing reaches the developer, so it
  is not "collected" in Apple's sense and no label changes; App Store
  Connect's answers stay as above.

### The privacy manifest

`apps/ios/Wingtip/PrivacyInfo.xcprivacy` declares the same rows:
Email Address, Name, Phone Number, User ID, Other User Content and
Precise Location, linked (one entry a type, as App Store Connect asks one
answer a type: the saved track makes it linked, the live position sent to
answer being kept nowhere); Crash Data and Performance Data, not linked;
all for App Functionality. Its required-reason APIs and the widget
extension's own manifest are in privacy-inventory.md, "The iOS app's
privacy manifest".

## Google Play: Data safety

**Does your app collect or share any of the required user data types?**
Yes. **Is all of the user data collected by your app encrypted in
transit?** Yes: every call is HTTPS, to the gateway (`Config.kt`) and,
straight from the phone, to Google's map tiles once the map is zoomed
close in (`Charts.kt`, `map/CloseMap.kt`) and to the weather loop's
tiles from Iowa State's IEM and NOAA's nowCOAST (`map/WeatherLoop.kt`);
`usesCleartextTraffic` is false.
**Do you provide a way for users to request that their data is
deleted?** Yes: Setup, Delete Account in the app
(`account/AccountActions.kt`, wired in `ui/SetupScreen.kt`), and, for
the form's web link, `https://wingtipmaps.app/delete-account`, where a
pilot without the app asks by email and confirms from the link
(`DeleteAccountController`); both delete the same
(`AccountService.delete`).

| Google's type | Collected | Shared | Optional | Why | Android code |
|---|---|---|---|---|---|
| Personal info: Email address | Yes | No | No (to sign in; planning needs no account) | App functionality, Account management | `Session.kt` |
| Personal info: Name | Yes, only where given for endorsements | No | Yes | App functionality | `pilot/` |
| Personal info: Phone number | Yes, only where the pilot adds it (a flight plan's item 19) | No | Yes | App functionality | the gateway's `pilots.phone` |
| Personal info: User IDs | Yes | No | No | Account management | `Session.kt` |
| Location: Precise location | Yes, a logged flight's track | No | Yes | App functionality | `logbook/FlightRecorder.kt`, `logbook/AutoLogbookHost.kt` |
| App activity: Other user-generated content | Yes (airplanes, flights, logbook, notes) | No | Yes | App functionality | `logbook/`, `records/` |
| App info and performance: Crash logs | Yes: the exits Android kept (`ApplicationExitInfo`: crashes, ANRs with their traces, low-memory kills) and an uncaught exception's stack, with the app's version, the Android version and phone or tablet; sent as the phone has it and scrubbed on receipt (queries, emails, home folders and UUIDs, `DiagnosticText`), no account; kept 30 days | No | No | App functionality (finding faults) | `diagnostics/ExitReasons.kt`, `CrashCatcher.kt`, `DiagnosticsReporter.kt` |
| App info and performance: Diagnostics | Yes: the start-up time and the share of slow frames (JankStats), the same way; kept 400 days | No | No | App functionality (keeping the app fast) | `diagnostics/FrameStats.kt` |
| Photos and videos: Photos | **No**: a page photographed for Add from a Photo is read on the phone with Gemini Nano (ML Kit text recognition, then Nano, `ai/read/OnPhoneReader.kt`) and sent nowhere; without Nano, Add from a Photo is not offered | | | | `documents/` |
| Audio: Voice or sound recordings | **No**: the radio is heard by the phone's on-device `SpeechRecognizer` only (`createOnDeviceSpeechRecognizer`, `atc/RadioListener.kt`) and read on the phone, and a question asked by voice by its own on-device recognizer (`voice/VoiceInput.kt`, since 2026-11-10), its words typed into the field as a typed question; nothing is sent by the app or to Google; without an on-device recognizer voice is not offered | | | | |

"Shared" is Google's meaning: the recipients in the inventory (AWS,
and Amazon SES)
process data for the app and are not sharing. The device's live
position, sent to answer Nearest and the copilot and not kept, is
"processed ephemerally" and not collected in Google's sense. The map
tiles the phone asks of Google (close in), IEM and nowCOAST carry the
device's internet address and the view, as any map's, and no account;
Google is the app's Maps Platform provider. Before answering, check each
Google SDK's own entry in Play's SDK Index (`play-services-location`,
ML Kit's document scanner and text recognition) against these rows.

AI on the phone (docs/android-ai.md) adds nothing to collect: where the
phone has Gemini Nano, Ask, In Plain Words, a drafted remark and a page
photographed are made on the phone (`ai/`), and without it they are
not offered. Gemini and the system's agents read what
the pilot asks them for through AppFunctions (`ai/functions/`), answered
on the phone; that is the agent's maker's collection, under its terms.

Permissions Play will see, each with what it is for
(`apps/android/app/src/main/AndroidManifest.xml`):
`ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` (the airplane on the
chart, asked in the foreground only; never `ACCESS_BACKGROUND_LOCATION`),
`FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION` (while flying, from
the pilot's Start Flight until the airplane slows, the position keeps
being read with the app in the background, for the flight recorder, the
alerts ahead and the live update, shown as a notification,
`flight/OwnShip.kt`, `flight/StartFlightAsk.kt`), `RECORD_AUDIO` and
`FOREGROUND_SERVICE_MICROPHONE` (the ATC copilot, only when turned on),
`CHANGE_WIFI_MULTICAST_STATE` and `FOREGROUND_SERVICE_CONNECTED_DEVICE`
(a cockpit ADS-B receiver), `POST_NOTIFICATIONS` and
`POST_PROMOTED_NOTIFICATIONS` (the flight's notification, promoted as a
live update while flying), `INTERNET` and `ACCESS_NETWORK_STATE`. Play's
foreground-service declaration form wants a description, the impact if
deferred, a use case and a short video for each of the three types
(`location`, `microphone`, `connectedDevice`): foreground-services.md has
the text for each, and preview-video.md the shots; the receiver's in-app
setup is still to film (launch-checklist.md).

## Account deletion

| Platform | In the app | Code |
|---|---|---|
| iOS | Setup, Account, Delete Account (asked first) | `apps/ios/Wingtip/Views/AccountViews.swift` |
| Web | Setup's account, Delete account | `DELETE /api/me` |
| Android | Setup, Delete Account (asked first) | `account/AccountActions.kt`, `ui/SetupScreen.kt` |
| Without the app | `https://wingtipmaps.app/delete-account`: the address, an emailed link, Delete Account | `DeleteAccountController` |

Deleting removes everything linked above; an endorsement an instructor
signed stays with the other party, as 14 CFR 61.189 asks
(privacy-inventory.md).
