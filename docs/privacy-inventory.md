# What Wingtip Maps collects

This list is read from the code and is the one source for the privacy
policy (`docs/legal/privacy.md`, which `scripts/build/legal_pages.py` writes
to the site), App Store Connect's App Privacy answers,
Google Play's Data safety form and the iOS app's privacy manifest
(`PrivacyInfo.xcprivacy`). Change it
whenever the code changes what leaves a device or what the server keeps.
Last checked against the code on 2026-11-10 (the privacy and store audit: the phone number, the third parties the apps call directly, the traffic view's region, the export, deletion from the web).

"Collected" is App Store Connect's meaning: sent off the device and kept
longer than it takes to answer the request.

## Data the app collects

| App Store category | What exactly | Linked to the pilot | Why | Where it is kept |
|---|---|---|---|---|
| Contact Info, Email Address | The address a pilot signs in with | Yes | App Functionality (sign-in, the sign-in link; currency and airplane due-date reminders where the pilot turns them on) | `pilots`, `magic_links`, `reminders_sent` (Postgres) |
| Contact Info, Phone Number | The telephone number a pilot adds, optional: the contact a flight plan's item 19 asks for (`Session.setContact` on iOS, the web's account) | Yes | App Functionality | `pilots.phone` (V29) |
| Contact Info, Name | The name Google or Apple gives at sign-in (otherwise the address); the name as on their pilot certificate, where they give it for endorsements | Yes | App Functionality | `pilots` |
| Identifiers, User ID | The account's id; Google's and Apple's subject for that sign-in; Apple's refresh token, kept only to revoke the Apple sign-in when the account is deleted (`AppleRevocation`) | Yes | App Functionality | `pilots` (`apple_refresh_token`, V18), the session |
| User Content, Other | The pilot's own record: home base (V29), the medical's, flight review's and instrument proficiency check's dates and the knowledge tests' codes (V12, V13, V20) | Yes | App Functionality (currency, reminders, a flight plan's item 18 and 19) | `pilots` |
| User Content, Other | Flight watch, for a saved flight the pilot asks to be watched: its departure time, the last briefing kept to compare the next with (the planner's JSON, never read in the gateway), when it was checked and the changes found; ends at departure | Yes | App Functionality (the changes emailed) | `flight_watch` (V31) |
| User Content, Other | Instructing: the address a student asks an instructor in by (`instructor_students.email`, V26), a solo cross-country put to an instructor (`cross_country_reviews`) and the approaches an instructor sets as lessons (`approach_lessons`, V30) | Yes | App Functionality | Postgres |
| User Content, Other | Aircraft (tail number, type, performance, the last VOR check, the inspections' and tests' dates and its hours, whether it is flown for hire, its ADs and other due items, and its squawks; its checklists stay on the device, `lib/checklists`, and are forgotten there on sign-out), saved flights and their nav logs, the logbook (its instrument approaches, holding and tracking among it), endorsements and currency dates (the instrument proficiency check's too), checkpoint notes a pilot writes for themselves; a flight instructor's certificate number and its date, the instructors a student asks in by address, the saved flights a student puts to them, and the endorsements signed in the app | Yes | App Functionality | Postgres; notes in the planner's `data/labels` |
| User Content, Other | A saved flight a pilot shares by link: the share's random token, whether its N-number goes with it (it does, where the flight has an airplane: the owner, 2026-11-11, on the web; the phones still ask), and when it was shared; whoever has the link reads the flight's route, stops, altitudes, departure time, airplane type, picks and nav log, never the pilot's name, address, notes, risk assessment or the flight's own name, and the airplane's N-number (`SharedFlightDto`). Read-only, until the pilot stops sharing it (Stop Sharing, which deletes the row) or deletes the flight | Yes | App Functionality (sending a plan to another pilot or an instructor) | `flight_shares` (Postgres) |
| Identifiers, User ID | The AI apps a pilot connects Wingtip to (the MCP connector, `docs/design/mcp-connector.md`): the app's registration (its name and callback, no pilot's), and for the pilot the consent given and the connection's tokens, under the account's id; no record of what was asked | Yes | App Functionality (answering the pilot's own AI app) | `oauth2_registered_client`, `oauth2_authorization`, `oauth2_authorization_consent` (Postgres, V40); the tokens last 15 minutes and refresh for 30 days |
| Location, Precise | A flight's track, when a pilot saves it to a flight (the phones' flight recorder, the logbook drafted from it): linked to the account, unlike the live position below | Yes | App Functionality | `flight_tracks` |
| Purchases, Purchase History | The subscription: when the free month started and ends, and a paid plan's term, its store and the store's own id for it | Yes | App Functionality (the paid features) | `subscriptions` |
| Diagnostics, Crash Data | A fault on the device: the web's uncaught errors (message, stack, page path, browser; `lib/errorReports`), the iPhone's MetricKit crash, hang, CPU and disk-write diagnostics (`Diagnostics/`), Android's exit reasons, ANR traces and uncaught exceptions (`diagnostics/`); each with the app's version, the OS version and phone/tablet/desktop, scrubbed of queries, emails, home folders and UUIDs (`DiagnosticText`) | No | App Functionality (finding faults) | `diagnostics` (Postgres), 30 days; a line in the server's log (30 days) |
| Diagnostics, Performance Data | How fast the app was on the device: the web's Core Web Vitals (LCP, INP, CLS, FCP, TTFB) and long tasks, the iPhone's launch, resume, hang and scroll-hitch figures, peak memory and memory exits (MetricKit), Android's launch time and janky frames (JankStats); the page's name, phone, tablet or desktop, and the app's build; nothing of the pilot's (`lib/speed`, `lib/longTasks`, SpeedController, DiagnosticsController) | No | App Functionality (keeping the app fast) | `speed_samples` (Postgres), 400 days |

## Data that leaves the device but is not collected

- **Position for Nearest, the map, traffic and the airspace at a point.**
  The device's position goes to the planner to answer and is not kept:
  the planner writes no access log in production
  (`infra/docker-compose.prod.yml`), no log line carries a point's
  coordinates (the airspace router's and the geocoder's failures name the
  error only), and the traffic view keeps only its half-degree region for
  a minute ("Kept without an account" below). The gateway's log of a
  planner outage names the path only. The position itself is read on the
  device, with the permission the browser, iOS or Android asks for.
- **What a pilot's own AI app asks the connector.** A pilot who connects Wingtip to their own Claude or ChatGPT (the MCP connector, `services/planner/app/mcp`) has that app call Wingtip's tools: the airports, weather, NOTAMs, a route's nav log and briefing, and their own airplanes and saved flights. Each answer goes only to the app the pilot connected, only when the pilot's conversation asks for it, and is then under that app's own terms (Anthropic's or OpenAI's): Wingtip neither chooses nor pays for the model. Nothing of the call is kept beyond the rate limit's count of calls per pilot, in the planner's memory for a day (`app.mcp.calls`). The tools never return the pilot's name, address or logbook. Saving a flight from there (`save_flight`) is a saved flight as above, confirmed in the AI app first.
- **The Apple Watch** (`apps/ios/WingtipWatch`): the paired iPhone sends
  it the airplane, its checklist and the position the watch app shows,
  over WatchConnectivity; it stays on the two devices.
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
  sent to us for them. The same model drafts a logbook
  remark from the entry (`Logbook/RemarkDraft.swift`), says a clearance in
  full for the engine to read (`Words/ClearanceInFull.swift`) and says why
  the plan flies its altitude (`Words/AltitudeWhy.swift`).
- **Apple's Private Cloud Compute on the iPhone** (`Words/AppleModels.swift`,
  iOS 27, the owner's "Yes to AI cloud", 2026-11-09; off until Apple
  assigns the account the entitlement, Info.plist
  `WingtipPrivateCloudCompute`). Where the on-device model cannot answer
  (still downloading, a page it cannot see, an answer it could not give
  or whose every sentence the guard dropped), the same ask goes to
  Apple's Private Cloud Compute: the NOTAMs and
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
  Nothing goes further: where neither of Apple's models can answer, the
  app shows the engine's own words or says why.
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
  phone and nothing of them goes to us or Google. Ask's tools
  fetch from the planner what the screens fetch (an airport, the route's
  NOTAMs); the question itself stays on the phone. Without Nano they are
  not offered.
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
  sheet to whoever they choose; on the web the airplane's N-number with
  it whenever there is one (the owner, 2026-11-11), on the phones only
  where they tick it. Nothing of it is stored on a server. Opened, the link's page is served
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
| The pilot's own AI app (Claude, ChatGPT), only where the pilot connects Wingtip to it | The connector's answers to what the pilot asks it: airports, weather, NOTAMs, a route's nav log and briefing, the pilot's airplanes (tail number, type, figures, inspections, squawks) and saved flights | Yes, the pilot's own, sent to the app they chose; Wingtip sends none of it otherwise |
| Amazon SES | The address a sign-in link is sent to, and the link; an instructor's address a student asks in, with the student's name and address; the endorsements and reviews between the two, to each | Yes, to deliver it |
| The student's instructor | Once they take the student on: the student's name and address, 61.109 experience from their logbook, knowledge test codes, endorsements, and the saved flights the student puts to them | Yes: the student asks them in, and either ends it |
| Google, Apple | Their own sign-in, when a pilot uses it | Their own |
| FAA, NOAA (aviationweather.gov) | Chart and data downloads, weather for airports | None: the server asks, not the device |
| adsb.lol | For the traffic on the map, the middle of a region: a 0.5 degree cell, 2 degrees zoomed out (`traffic/adsb_lol.py`); for an airplane a pilot opens, its transponder's address (its trace); for its route, its callsign (`traffic/routes.py`, `vrs-standing-data.adsb.lol`); and a registration, callsign or address a pilot types in Find (`/api/traffic/find`; the FAA record's `/api/traffic/registered` asks no one, the registry being on the planner's disk), which may be their own N-number | None of the pilot's beyond what they type: the server asks, not the device; the device's position itself is not sent |
| ADS-B Exchange (adsbexchange.com, through RapidAPI) | The same asks where adsb.lol turns one away or is down: a region's middle (`traffic/view.py`), a searched registration, callsign or address (`traffic/lookup.py`), and a followed airplane's address (`traffic/watched.py`); the request carries the operator's RapidAPI key | As adsb.lol |
| adsb.fi (opendata.adsb.fi) | The followed airplanes' transponder addresses, asked by ingest every half minute (`traffic/adsbfi.py`) | None of the pilot's: other airplanes' public addresses |
| Iowa State University's IEM (mesonet.agron.iastate.edu) | The radar loop's map tiles in view, asked by the device (web, iPhone, Android) from the address templates the planner gives (`wingtip/weather_loop.py`) | The device's internet address and the part of the map in view, as any map tile; no account |
| NOAA nowCOAST (nowcoast.noaa.gov) | The satellite loop's tiles in view, asked by the device the same way | As IEM |
| Planespotters (api.planespotters.net, t.plnspttrs.net) | The web app, when a traffic card opens: that airplane's transponder address, to show its photo (`features/plan/lib/planePhoto.ts`), from the browser | The browser's internet address and the address of the airplane looked at; no account |
| USGS (epqs.nationalmap.gov) | Sample points along a route, for the ground's height where the terrain tiles have none (`wingtip/elevation.py`), from the server | None: points on a route, no account |
| USGS (basemap.nationalmap.gov) | With its imagery overlay on, the map's tiles in view, asked by the device | None: the tiles' coordinates, as any web map's |
| Google (tile.googleapis.com) | On the web, with a Google overlay on; on Android, by itself once the map is zoomed close in (`Charts.kt`, `map/CloseMap.kt`): a session and the map's tiles in view, asked by the device with the app's key, Android's requests carrying the package name and signing certificate (`X-Android-Package`, `X-Android-Cert`) that the key is restricted to | None of the pilot's: the device's internet address, the tiles' coordinates and the view, as any Google map's; Google's own terms and privacy policy apply to the request |
| US Census Bureau (geocoding.geo.census.gov) | A street address typed in Nearest's field, to place it; its gazetteer of towns is downloaded once | The address typed, from the server, not the device; kept in the planner's memory for an hour so the same address is not asked twice (`geocode.py`), never written to disk or a log (a failure logs the error's kind only), and a place picked is in the page address (`nearName`, `nearAt`) |
| Amazon Web Services | Hosting all of the above (us-east-1) | As above |

## Not done

- **No tracking**, in Apple's sense: no advertising, no analytics SDK, no
  data broker, nothing joined with others' data. App Store Connect:
  "Data Not Used to Track You".
- **No analytics**: no count of what a pilot uses is kept. The month's
  count of each Claude-written feature went with those features
  (2026-11-12, decision 0041).
- **Purchases** are the stores' own: the app keeps only the plan's term
  and the store's id for it (above), never a card.
- Deleting an account (`DELETE /api/me` from Setup, or from the web
  without the app at `/delete-account`, an emailed link confirming it,
  `DeleteAccountController`) removes everything linked to it above, its
  sessions, its sign-in links, its connected AI apps and its checkpoint
  notes in the planner (`AccountService.delete`, both ways the same).
  What each phone keeps for itself is cleared by that phone's own Delete
  Account.
- **Logs.** No log line carries an email address, a position, a typed
  address or a tail number: the gateway logs a pilot's or a flight's id
  and an exception's kind on a failed send or a duplicate
  (`MagicLinkController`, `InstructorService`, `FlightWatchService`,
  `ReminderService`, `GlobalExceptionHandler`), and the planner the
  error alone. The logs (CloudWatch) age out in 30 days.

## Google Play's Data safety form

The same rows, in Google's words: **Personal info** (email address,
name, user IDs, phone number, optional), **Location** (precise, only a
saved flight's track, linked; the device's live position is not kept,
see above),
**App activity** (other user-generated content: aircraft, flights,
logbook, notes) and **App info and performance** (crash logs and
diagnostics, not linked: not tied to the account; crash logs gone from
the log after 30 days, speed measurements after 400).
All collected for app functionality and account management,
none shared with third parties as Google defines sharing (the
recipients above process data for the app), all encrypted in transit,
and all but the crash logs and speed measurements deleted with the
account (they carry no account, so a deletion request cannot reach
them; they expire on their own). The Android app asks for location in
the foreground only (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
never `ACCESS_BACKGROUND_LOCATION`); while flying it keeps reading the
position through a `location` foreground service with its notification
showing (`flight/OwnShip.kt`), for the flight recorder and the alerts
ahead, and the iPhone does the same with When In Use and background
location while flying (`OwnShip.swift`).

## The iOS app's privacy manifest

`apps/ios/Wingtip/PrivacyInfo.xcprivacy` declares, from the first
table:

- `NSPrivacyTracking`: false, with no tracking domains;
- `NSPrivacyCollectedDataTypes`, all for App Functionality and none for
  tracking: Email Address, Name, Phone Number, User ID, Other User
  Content and Precise Location, linked; Crash Data and Performance Data,
  not linked. Precise Location is declared once, linked: App Store
  Connect takes one answer a data type, and a track saved to a flight is
  linked, though the live position sent to answer (Nearest, what is
  ahead) is not kept;
- `NSPrivacyAccessedAPITypes`: UserDefaults (`CA92.1`, the app's own
  settings, and `1C8F.1`, the App Group the widgets read), File Timestamp
  (`C617.1`) and Disk Space (`85F4.1`, the free space Downloads shows,
  never sent off the phone). Each code checked against Apple's
  NSPrivacyAccessedAPITypeReasons list on 2026-11-10.

The widget extension has its own, `apps/ios/WingtipWidgets/PrivacyInfo.xcprivacy`:
nothing collected, UserDefaults under `1C8F.1` for the App Group it
reads. The Watch app's, `apps/ios/WingtipWatch/PrivacyInfo.xcprivacy`,
declares nothing, as it calls no required-reason API; it is there so a
reason added later has its place. `WingtipTests/StorePrivacyTests` reads
the app's bundled manifest and fails where one of these is missing.
Check the files against this list before each submission.

## Kept without an account, and for how long

The planner's live store (`wingtip.traffic.store`, a SQLite file the
planner and ingest share) holds nothing that names a pilot or an account,
and the planner prunes it every minute (`wingtip.traffic.prune`, a job
on `wingtip.schedule` started in `app.main`), whether or not ingest runs:

- **Where the map asks for traffic** (`looked`): the region adsb.lol is
  asked about for the view, the 0.5 degree cell (2 degrees zoomed out)
  with a radius that holds the view, never the view's own middle, which is
  the pilot's position while the map follows the airplane. Dropped a
  minute after the last ask (`LOOKED_S`), so ingest reads the FAA's radar
  only where someone is looking.
- **Followed airplanes** (`followed`): an airplane whose card any pilot
  opens is followed, its ICAO address and when its card was last opened;
  dropped 30 days after that (`FOLLOW_KEEP_S`). Opening its card again
  starts the 30 days again.
- **Other airplanes' tracks** (`points`): a followed airplane's public
  ADS-B and radar positions, recorded from adsb.lol, ADS-B Exchange,
  adsb.fi and the FAA's radar card open or not, so its card can show its
  recent flights; each point kept 30 days (`RECORD_KEEP_S`), whether or
  not the airplane is heard again. No pilot or account is stored with
  them; a pilot who opens their own airplane's card has its public
  flights recorded the same way.

In the gateway, a connection an AI app holds (`oauth2_authorization`)
whose every code and token ran out over a day ago is let go each night,
with the spent refresh tokens' hashes past their 30 days, and a client
nobody connected through goes with its consents
(`ConnectorHousekeeping`, 03:45 UTC); a consent otherwise stays until
the pilot deletes their account. Fault reports go after 30 days, speed
figures after 400, sign-in links a day after they expire.

## Kept after an account is deleted

An endorsement an instructor signed in the app stays with the other of the two when either deletes their account, with the student's name as signed and the deleted account left out: it is the student's endorsement, and 14 CFR 61.189(b) and (c) ask the instructor to keep a record of it for 3 years (`signed_endorsements`).
