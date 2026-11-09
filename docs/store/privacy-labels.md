# Privacy answers for the stores

App Store Connect's App Privacy ("nutrition label") and Google Play's
Data safety form, answered from the code on 2026-11-09.
[`docs/privacy-inventory.md`](../privacy-inventory.md) is the one source
of what is collected; this page is that list put into each store's
questions, with the file each answer rests on. When the inventory
changes, change this page and `apps/ios/Wingtip/PrivacyInfo.xcprivacy`
with it.

"Collected" is Apple's meaning: sent off the device and kept longer than
it takes to answer the request.

## The policy these answers point to

No `docs/legal` drafts have landed (no trust or legal branch on origin,
and nothing under `docs/legal` on `claude/integration` as of 2026-11-09).
Today's policy and terms are the web app's pages,
`apps/web/public/privacy.html` and `apps/web/public/terms.html` (served
at `/app/privacy.html` and `/app/terms.html`), which the site will serve
at `/privacy` and `/terms`. When the drafts land, link them here and
check these answers against them.

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
| Contact Info: Name | The name Apple gives at sign-in; the name as on a pilot certificate where given for endorsements | `Views/SignInView.swift`, `Views/InstructorView.swift` |
| Identifiers: User ID | The account's id, Apple's subject for the sign-in | `Session.swift` |
| User Content: Other User Content | Airplanes, saved flights and nav logs, the logbook, endorsements, currency dates, checkpoint notes | `Views/AircraftView.swift`, `Views/LogbookViews.swift`, `Logbook/AutoLogbook.swift`, `API/` |
| Location: Precise Location | A flight's track, when the pilot logs or saves it (the auto-drafted logbook entry sends the track to the planner, and the logged flight keeps it) | `Logbook/FlightRecorder.swift`, `Logbook/AutoLogbook.swift`; the gateway's `flight_tracks` |
| Usage Data: Product Interaction | The month's count of each Claude-written feature used, for its cap | the gateway's `paid_feature_uses` (privacy-inventory.md) |

### Data not linked to you

| Apple's type | What | Where |
|---|---|---|
| Location: Precise Location | The airplane's position, sent to the planner to answer (Nearest, the copilot's look ahead, `/api/copilot/around`) and not kept | `OwnShip.swift`, `Copilot/Copilot.swift`; `PrivacyInfo.xcprivacy` declares it unlinked |

Diagnostics: **not collected by the iOS app.** Its crashes and hangs
come through MetricKit and are written to the phone's own log
(`apps/ios/Wingtip/Metrics.swift`, `Log.swift`); nothing is sent to the
server. Apple's own crash reports reach the developer only from users
who share analytics with developers, which Apple does not count as the
app's collection. (The web app does send its errors and speed figures,
`lib/errorReports` and `lib/speed`; those are the web's, not on the App
Store.)

Purchases: **not collected.** The app is free and has no in-app
purchase (no StoreKit in `apps/ios`); the inventory's Purchases row is
for a subscription that is off (docs/decisions/0022).

Not collected, though the app uses them on the device:

- **Audio and speech.** The ATC copilot hears the radio with the
  microphone and turns it into words with Apple's recognizer on the
  iPhone only (`ClearanceListener.swift` always sets
  `requiresOnDeviceRecognition`); the words are read by the engine on
  the phone (`Atc/AtcCopilot.swift`). No audio and no transcript is sent
  to Wingtip's servers or to Apple. Where the phone cannot recognise on
  the device (`supportsOnDeviceRecognition` false), voice is not
  offered at all: the microphone controls are hidden and neither
  permission is asked for.
- **Cockpit receiver traffic and FIS-B weather** (`Receiver/`): heard on
  the local Wi-Fi, read on the device, never sent.
- **Favourites, recents and routes in iCloud** (`Records/Records.swift`,
  SwiftData with CloudKit): in the pilot's own iCloud private database,
  which the developer cannot read; Apple does not count it as collected.

### The privacy manifest

`apps/ios/Wingtip/PrivacyInfo.xcprivacy` declares email (linked),
precise location (unlinked) and other user content (linked). To match
the answers above it should also declare Name, User ID and the linked
precise location of a saved track (and Product Interaction if the
Claude caps ever count on iOS); that is a code change for the iOS app's
owner, noted here, not made by this page.

## Google Play: Data safety

**Does your app collect or share any of the required user data types?**
Yes. **Is all of the user data collected by your app encrypted in
transit?** Yes (every call is HTTPS to the gateway, `Config.kt`).
**Do you provide a way for users to request that their data is
deleted?** Yes: the web app's Setup deletes the account (`DELETE
/api/me`), and the support page says how; the Android app has no Delete
Account button of its own yet (see listing.md).

| Google's type | Collected | Shared | Optional | Why | Android code |
|---|---|---|---|---|---|
| Personal info: Email address | Yes | No | No (to sign in; planning needs no account) | App functionality, Account management | `Session.kt` |
| Personal info: Name | Yes, only where given for endorsements | No | Yes | App functionality | `pilot/` |
| Personal info: User IDs | Yes | No | No | Account management | `Session.kt` |
| Location: Precise location | Yes, a logged flight's track | No | Yes | App functionality | `logbook/FlightRecorder.kt`, `logbook/AutoLogbookHost.kt` |
| App activity: Other user-generated content | Yes (airplanes, flights, logbook, notes) | No | Yes | App functionality | `logbook/`, `records/` |
| App activity: Other actions | Yes, the count of Claude-written features for their cap | No | Yes | App functionality | the gateway |
| App info and performance | **No** from the Android app: no crash reporter (no Crashlytics, Firebase or Sentry in `apps/android/app/build.gradle.kts`) | | | | |
| Audio: Voice or sound recordings | **No**: the radio is heard by the phone's on-device `SpeechRecognizer` only (`createOnDeviceSpeechRecognizer`, `atc/RadioListener.kt`) and read on the phone; nothing is sent by the app or to Google; without an on-device recognizer voice is not offered | | | | |

"Shared" is Google's meaning: the recipients in the inventory (AWS,
Amazon SES, Anthropic for a written briefing with no personal data)
process data for the app and are not sharing. The device's live
position, sent to answer Nearest and the copilot and not kept, is
"processed ephemerally" and not collected in Google's sense.

Permissions Play will see, each with what it is for
(`apps/android/app/src/main/AndroidManifest.xml`): location (the
airplane on the chart; `FOREGROUND_SERVICE_LOCATION` for the flight
recorder while flying, shown as a notification, never background
location), `RECORD_AUDIO` and `FOREGROUND_SERVICE_MICROPHONE` (the ATC
copilot, only when turned on), `CHANGE_WIFI_MULTICAST_STATE` and
`FOREGROUND_SERVICE_CONNECTED_DEVICE` (a cockpit ADS-B receiver),
`POST_NOTIFICATIONS`. Play's foreground-service declaration form wants
a short video of each; the shot list in preview-video.md covers the
copilot and the recorder.

## Account deletion

| Platform | In the app | Code |
|---|---|---|
| iOS | Setup, Account, Delete Account (asked first) | `apps/ios/Wingtip/Views/AccountViews.swift` |
| Web | Setup's account, Delete account | `DELETE /api/me` |
| Android | none yet; the web's, from support | add before the first release |

Deleting removes everything linked above; an endorsement an instructor
signed stays with the other party, as 14 CFR 61.189 asks
(privacy-inventory.md).
