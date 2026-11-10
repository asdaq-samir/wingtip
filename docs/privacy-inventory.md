# What Wingtip Maps collects

This list is read from the code and is the one source for the privacy
policy (`docs/legal/privacy.md`, which `scripts/build/legal_pages.py` writes
to the site), App Store Connect's App Privacy answers,
Google Play's Data safety form and the iOS app's privacy manifest
(`PrivacyInfo.xcprivacy`). Change it
whenever the code changes what leaves a device or what the server keeps.
Last checked against the code on 2026-11-10 (the MCP connector to a pilot's own Claude or ChatGPT).

"Collected" is App Store Connect's meaning: sent off the device and kept
longer than it takes to answer the request.

## Data the app collects

| App Store category | What exactly | Linked to the pilot | Why | Where it is kept |
|---|---|---|---|---|
| Contact Info, Email Address | The address a pilot signs in with | Yes | App Functionality (sign-in, the sign-in link; currency and airplane due-date reminders where the pilot turns them on) | `pilots`, `magic_links`, `reminders_sent` (Postgres) |
| Contact Info, Name | The name Google or Apple gives at sign-in (otherwise the address); the name as on their pilot certificate, where they give it for endorsements | Yes | App Functionality | `pilots` |
| Identifiers, User ID | The account's id; Google's and Apple's subject for that sign-in | Yes | App Functionality | `pilots`, the session |
| User Content, Other | Aircraft (tail number, type, performance, the last VOR check, the inspections' and tests' dates and its hours, whether it is flown for hire, its ADs and other due items, and its squawks; its checklists stay on the device, `lib/checklists`, and are forgotten there on sign-out), saved flights and their nav logs, the logbook (its instrument approaches, holding and tracking among it), endorsements and currency dates (the instrument proficiency check's too), checkpoint notes a pilot writes for themselves; a flight instructor's certificate number and its date, the instructors a student asks in by address, the saved flights a student puts to them, and the endorsements signed in the app | Yes | App Functionality | Postgres; notes in the planner's `data/labels` |
| User Content, Other | A saved flight a pilot shares by link: the share's random token, whether its N-number goes with it, and when it was shared; whoever has the link reads the flight's route, stops, altitudes, departure time, airplane type, picks and nav log, never the pilot's name, address, notes, risk assessment or the flight's own name, and the N-number only where the pilot turned it on (`SharedFlightDto`). Read-only, until the pilot stops sharing it (Stop Sharing, which deletes the row) or deletes the flight | Yes | App Functionality (sending a plan to another pilot or an instructor) | `flight_shares` (Postgres) |
| Identifiers, User ID | The AI apps a pilot connects Wingtip to (the MCP connector, `docs/design/mcp-connector.md`): the app's registration (its name and callback, no pilot's), and for the pilot the consent given and the connection's tokens, under the account's id; no record of what was asked | Yes | App Functionality (answering the pilot's own AI app) | `oauth2_registered_client`, `oauth2_authorization`, `oauth2_authorization_consent` (Postgres, V40); the tokens last 15 minutes and refresh for 30 days |
| Location, Precise | A flight's track, when a pilot saves it to a flight | Yes | App Functionality | `flight_tracks` |
| Purchases, Purchase History | The subscription: when the free month started and ends, and a paid plan's term, its store and the store's own id for it | Yes | App Functionality (the paid features) | `subscriptions` |
| Usage Data, Product Interaction | How many of each Claude-written feature (the written briefing, checkpoint descriptions, the mock oral) a pilot used this month, a count, for its monthly cap | Yes | App Functionality (the cap) | `paid_feature_uses` |
| Diagnostics, Crash Data | A fault on the device: the web's uncaught errors (message, stack, page path, browser; `lib/errorReports`), the iPhone's MetricKit crash, hang, CPU and disk-write diagnostics (`Diagnostics/`), Android's exit reasons, ANR traces and uncaught exceptions (`diagnostics/`); each with the app's version, the OS version and phone/tablet/desktop, scrubbed of queries, emails, home folders and UUIDs (`DiagnosticText`) | No | App Functionality (finding faults) | `diagnostics` (Postgres), 30 days; a line in the server's log (30 days) |
| Diagnostics, Performance Data | How fast the app was on the device: the web's Core Web Vitals (LCP, INP, CLS, FCP, TTFB) and long tasks, the iPhone's launch, resume, hang and scroll-hitch figures, peak memory and memory exits (MetricKit), Android's launch time and janky frames (JankStats); the page's name, phone, tablet or desktop, and the app's build; nothing of the pilot's (`lib/speed`, `lib/longTasks`, SpeedController, DiagnosticsController) | No | App Functionality (keeping the app fast) | `speed_samples` (Postgres), 400 days |

## Data that leaves the device but is not collected

- **Position for Nearest, the map and the airspace at a point.** The
  device's position goes to the planner to answer and is not kept: the
  planner writes no access log in production (`infra/docker-compose.prod.yml`),
  and nothing stores it (the gateway's log of a planner outage names the path only). The position itself is read on the device, with
  the permission the browser, iOS or Android asks for.
- **What a pilot's own AI app asks the connector.** A pilot who connects Wingtip to their own Claude or ChatGPT (the MCP connector, `services/planner/app/mcp`) has that app call Wingtip's tools: the airports, weather, NOTAMs, a route's nav log and briefing, and their own airplanes and saved flights. Each answer goes only to the app the pilot connected, only when the pilot's conversation asks for it, and is then under that app's own terms (Anthropic's or OpenAI's): Wingtip neither chooses nor pays for the model. Nothing of the call is kept beyond the rate limit's count of calls per pilot, in the planner's memory for a day (`app.mcp.calls`). The tools never return the pilot's name, address or logbook. Saving a flight from there (`save_flight`) is a saved flight as above, confirmed in the AI app first.
- **A cockpit receiver's traffic and FIS-B weather** (the iOS and Android
  apps, with ADS-B Receiver on Auto): heard on the cockpit's Wi-Fi, read
  by the engine on the device and shown there; nothing of it is sent
  anywhere or kept past a few hours.
- **The radio, with the ATC copilot on, and anything said to the app.**
  On the phones speech is recognised on the device and never leaves it
  (the owner, 2026-11-09); no audio is recorded or sent to us. Apple's recognizer on the iPhone with
  `requiresOnDeviceRecognition` always (`ClearanceListener.swift`), only
  where `supportsOnDeviceRecognition`; Android's on-device recognizer
  (`createOnDeviceSpeechRecognizer`, API 31+, `atc/RadioListener.kt`);
  asking by voice (the search's mic) has its own recognizer apart from
  the radio's since 2026-11-10, on the device too (`VoiceInput` on the
  iPhone, `voice/VoiceInput.kt` on Android, `features/voice` on the
  web, under the same rules as below), and its words go only where a
  typed question goes;
  phones without one get no voice. On the web (the owner, 2026-11-09:
  other browsers are fine) the Web Speech API with `processLocally`
  where `SpeechRecognition.available({processLocally: true})` says so
  (Chrome), else the browser's own recognizer, which may send audio to
  its maker (Safari to Apple); no recognizer (Firefox), no voice
  (`lib/speechLocal.ts`). Of the text,
  only a clearance's place words go to the planner
  (`/api/clearance/places`).
- **Siri and camera look-ups (iPhone).** The app annotates what is on
  the screen with App Entities (`Intents/SiriSees.swift`: airports,
  waypoints, the flight, frequencies, NOTAMs, approaches, airplanes,
  logbook entries) so Siri can act on "this"; that is Apple's, on the
  phone. A camera look-up's picture (Visual Intelligence's
  `SemanticContentDescriptor`) is read on the phone by Vision
  (`Intents/VisualLookup.swift`); only the idents found in it go to the
  planner (`/api/airport/{ident}`), and are not kept. "What does this NOTAM
  mean for me" and the Brief's "NOTAMs in words" are written by Apple's
  on-device model from the NOTAMs and the engine's reasons
  (`Intents/AskIntents.swift`, `Words/NotamsInWords.swift`); nothing is
  sent to us or to Anthropic for them. The same model drafts a logbook
  remark from the entry (`Logbook/RemarkDraft.swift`), says a clearance in
  full for the engine to read (`Words/ClearanceInFull.swift`) and says why
  the plan flies its altitude (`Words/AltitudeWhy.swift`).
- **Apple's Private Cloud Compute on the iPhone** (`Words/AppleModels.swift`,
  iOS 27, the owner's "Yes to AI cloud", 2026-11-09; off until Apple
  assigns the account the entitlement, Info.plist
  `WingtipPrivateCloudCompute`). Where the on-device model cannot answer
  (still downloading, a page it cannot see, an answer it could not give
  or whose every sentence the guard dropped), the same ask goes to
  Apple's Private Cloud Compute before any Claude path: the NOTAMs and
  their engine reasons; a NOTAM asked about; the logbook entry's columns
  and, for a flight drawn from its track, the approaches, holds and
  landings found in it; a clearance's words as typed or heard; the
  altitude's reasons (the course, the floor, the ceiling, the clouds,
  Class B, the freezing level, the plans' winds and fuel); Ask's question
  with the figures its tools give on the phone; the Go / No-Go's findings
  for the glance; and a photographed page where the phone's model cannot
  read it. Apple's design keeps nothing: a request's data is used for that
  request only and never stored, needs no account or key of ours, and is
  checked by outside researchers (WWDC26 session 319). Apple counts it
  against the pilot's iCloud account's daily limit. Apple is the
  processor; we receive nothing more than with the on-device model.
  Claude is then asked only where a feature has a Claude path (the
  photographed page, through the assistant, where neither of Apple's
  models can see it; Ask under Automatic with a signal, whose planner
  tools Apple's models do not have; the Brief's weather and risk words),
  and only while the Claude features are on: off, the default
  (`API/ServerFeatures.swift`), the chain stops at the phone's models
  and the engine's own words.
- **The route's weather watched on the iPhone** (`WeatherWatch/`): the
  kept route's briefing is fetched again from the planner every quarter
  hour while the app runs and on iOS's background refresh, as the Brief
  fetches it; it is compared on the phone by the engine and nothing new
  is sent or kept on a server. The keys of the changes told stay on the
  phone (UserDefaults).
- **Gemini Nano on Android** (docs/android-ai.md). Where the phone has
  it (ML Kit's Prompt API over AICore, `ai/Nano.kt`), Ask
  (`ai/OnPhoneAsk.kt`), In Plain Words (`ai/AiWords.kt`), a drafted
  logbook remark and a photographed page (ML Kit's on-device text
  recognition, then Nano, `ai/read/OnPhoneReader.kt`) are made on the
  phone and nothing of them goes to Anthropic or Google. Ask's tools
  fetch from the planner what the screens fetch (an airport, the route's
  NOTAMs); the question itself stays on the phone. Without Nano they go
  to Claude as in the table below, signed in only, and only while the
  Claude features are on (`ai/ClaudeGate.kt`); off, the default, they
  are not offered.
- **Gemini and the system's agents on Android** (AppFunctions,
  `ai/functions/`, Android 16+). An agent the pilot asks may read the
  airport's card, frequencies, approaches, the nearest fields (from the
  last position), the route kept on the phone, its NOTAMs, the Brief's
  kept verdict, and, signed in, the pilot's airplanes and logbook; and
  open the app. Answered on the phone, only when called; the agent's
  maker's terms apply to what it does with it. The Assist API
  (`ai/ScreenContext.kt`) gives an assistant asked about the screen the
  route as the site's link and JSON-LD. App shortcuts
  (`res/xml/shortcuts.xml`) open screens and send nothing.
- **iCloud (iPhone).** Kept and watched airplanes and planned routes are
  in the pilot's own iCloud through SwiftData's CloudKit sync
  (`Records/Records.swift`); Apple's, not ours.
- **A route's airports and stops**, to plan it. Kept only as a pilot's
  saved flight (above).
- **A plan shared as a plain link** (Share link on the route, a saved
  flight's swipe): the route, stops, altitude, departure time, airplane
  type and rules are in the link itself (`lib/sharedFlight`, the phones'
  `SharedFlightLink` and `SharedPlan`), sent by the pilot's own share
  sheet to whoever they choose; the N-number only where they tick it.
  Nothing of it is stored on a server. Opened, the link's page is served
  with the route in its preview's title (`SharePreviewController`), and
  the receiver's app plans nothing until they choose Use This Plan.
- **A flight saved as a file (iPhone)** (Share, Save as File: `Route/FlightFile.swift`,
  a `.wingtip` file, `app.wingtipmaps.flight`): the same plain link's
  plan, with the nav log and its totals where the plan has them, written
  where the pilot saves it (Files) or sent by their own share sheet
  (AirDrop, Mail); the N-number only where they tick it. Nothing of it
  goes to a server. Opened, it shows the Shared Flight preview and plans
  nothing until Use This Plan. The kneeboard's PDF saved the same way
  stays as the pilot sends it.
- **The iPhone's widgets** (`WingtipWidgets`). Next Flight reads the plan
  on the page and the saved flights' routes and totals from the App Group
  the app writes (`Shared/WidgetStore.swift`), on the phone. Airport
  Weather asks the planner for the field the pilot picked
  (`/api/airport/{ident}`, public, as the airport card does), and Next
  Flight for a saved flight's departure; the ident is all that is sent,
  and nothing is kept. Currency Status reads the pilot's currency from
  the gateway (`/api/logbook/currency`) with the app's own session: the
  app's cookie jar is kept in the App Group's container
  (`WidgetStore.cookies`) so the widget can, still on the phone. Each
  widget keeps its last answer in the App Group, and the currency is
  dropped there when the gateway says no one is signed in.

## Who else receives what

| Recipient | What | Personal |
|---|---|---|
| Anthropic (Claude) | **Nothing while the Claude features are off**, the default since 2026-11-10 (docs/decisions/0035-claude-off-until-subscription.md): the gateway's `app.claude-features` (`APP_CLAUDE_FEATURES=OFF`) refuses every assistant route before the assistant is asked, the flight watch uses the planner's own lines (`ChangeLines`), the assistant service is not started, and the web, iPhone and Android apps read the switch from `/api/auth/capabilities` and do not ask. **With them on**, through the assistant service only (`services/assistant`): Ask: the conversation (typed or spoken), the route, stops, airplane, altitude, departure time, the pilot's minimums, currency lines and home base, and the live position (3 decimals), altitude, track and groundspeed where known (`services/assistant/app/assistant.py`). The trip planner (`/api/trip-plan`): the pilot's request in words and the same plan context as Ask. The written briefing (`narrative.py`): the route, the nav log, the weather and NOTAM text on it and the airplane's type. The Brief's words (`words.py`): the NOTAMs on the route as sent and their ranking (`notam_rank.py`), the weather reports and forecasts on it, and for the risk words the Go / No-Go's findings with the pilot's minimums and currency. The debrief's words: a flown flight's debrief figures (time in the air, each leg's altitude and course held, checkpoint times, pattern entries, the pilot's notes on it). The Coach's words (`coach.py`): the proficiency plan the engine made from the logbook (currency dates and what is due). A checkpoint note (`notes.py`): the checkpoint and the route around it. The mock oral (`oral.py`): the plan as text and the typed answers. Flight watch: what changed on the route (the METARs, TAFs, SIGMETs, AIRMETs, TFRs before and after). A photographed page (handbook, logbook, clearance) and today's date, to read it (`services/assistant/app/documents/`), only where the phone cannot read it itself (Android with Gemini Nano, and an iPhone on iOS 27 with Apple Intelligence that can see images, `Documents/OnDeviceDocumentReader.swift`, read it on the phone). Nothing kept: the conversation is the client's | No name, address, account; a tail number only where the pilot typed it into a question |
| The pilot's own AI app (Claude, ChatGPT), only where the pilot connects Wingtip to it | The connector's answers to what the pilot asks it: airports, weather, NOTAMs, a route's nav log and briefing, the pilot's airplanes (tail number, type, figures, inspections, squawks) and saved flights | Yes, the pilot's own, sent to the app they chose; Wingtip sends none of it otherwise |
| Amazon SES | The address a sign-in link is sent to, and the link; an instructor's address a student asks in, with the student's name and address; the endorsements and reviews between the two, to each | Yes, to deliver it |
| The student's instructor | Once they take the student on: the student's name and address, 61.109 experience from their logbook, knowledge test codes, endorsements, and the saved flights the student puts to them | Yes: the student asks them in, and either ends it |
| Google, Apple | Their own sign-in, when a pilot uses it | Their own |
| FAA, NOAA (aviationweather.gov) | Chart and data downloads, weather for airports | None: the server asks, not the device |
| adsb.lol | For the traffic on the map, the middle of the area asked about (rounded to a half-degree cell) and, for an airplane a pilot tracks, its transponder's address | None: the server asks, not the device; the device's position itself is not sent |
| USGS (basemap.nationalmap.gov) | With its imagery overlay on, the map's tiles in view, asked by the device | None: the tiles' coordinates, as any web map's |
| Google (tile.googleapis.com) | With a Google overlay on, a session and the map's tiles in view, asked by the device with the site's key | None of the pilot's: the tiles' coordinates and the view, as any Google map's; Google's own terms and privacy policy apply to the request |
| US Census Bureau (geocoding.geo.census.gov) | A street address typed in Nearest's field, to place it; its gazetteer of towns is downloaded once | The address typed, from the server, not the device; not stored, but the text typed is in request logs, and a place picked is in the page address (`nearName`, `nearAt`) |
| Amazon Web Services | Hosting all of the above (us-east-1) | As above |

## Not done

- **No tracking**, in Apple's sense: no advertising, no analytics SDK, no
  data broker, nothing joined with others' data. App Store Connect:
  "Data Not Used to Track You".
- **No analytics**: the only usage kept is the month's count of each
  Claude-written feature, for its cap (above).
- **Purchases** are the stores' own: the app keeps only the plan's term
  and the store's id for it (above), never a card.
- Deleting an account (`DELETE /api/me`) removes everything linked to it
  above, its sessions and its sign-in links, and the device's own copies.
  The unlinked error lines age out of CloudWatch in 30 days.

## Google Play's Data safety form

The same rows, in Google's words: **Personal info** (email address,
name, user IDs), **Location** (precise, only a saved flight's track; the
device's live position is not kept, see above),
**App activity** (other user-generated content: aircraft, flights,
logbook, notes) and **App info and performance** (crash logs and
diagnostics, not linked: not tied to the account; crash logs gone from
the log after 30 days, speed measurements after 400).
All collected for app functionality and account management,
none shared with third parties as Google defines sharing (the
recipients above process data for the app), all encrypted in transit,
and all but the crash logs and speed measurements deleted with the
account (they carry no account, so a deletion request cannot reach
them; they expire on their own). The Android app asks for location
while it is open only, never in the background.

## The iOS app's privacy manifest

When the iOS project exists (#102), `PrivacyInfo.xcprivacy` declares:

- `NSPrivacyTracking`: false, with no tracking domains;
- `NSPrivacyCollectedDataTypes`: the seven rows of the first table, with
  their linkage and purposes as above;
- `NSPrivacyAccessedAPITypes`: the required-reason APIs the native shell
  and its plugins use, at least `NSPrivacyAccessedAPICategoryUserDefaults`
  (reason `CA92.1`, the app's own settings).

## Kept after an account is deleted

An endorsement an instructor signed in the app stays with the other of the two when either deletes their account, with the student's name as signed and the deleted account left out: it is the student's endorsement, and 14 CFR 61.189(b) and (c) ask the instructor to keep a record of it for 3 years (`signed_endorsements`).
