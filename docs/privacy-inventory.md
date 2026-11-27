# What Wingtip Maps collects

This list is read from the code and is the one source for the privacy
policy (`docs/legal/privacy.md`, which `scripts/build/legal_pages.py` writes
to the site), App Store Connect's App Privacy answers,
Google Play's Data safety form and the iOS app's privacy manifest
(`PrivacyInfo.xcprivacy`). Change it
whenever the code changes what leaves a device or what the server keeps.
Checked against the code on 2026-11-10 (the privacy and store audit: the phone number, the third parties the apps call directly, the traffic view's region, the export, deletion from the web).
Last checked on 2026-11-21 (the prelaunch audit: the web's device storage and what sign-out clears, the backups' and snapshots' retention, the logs; then the vitals work: Help Improve Wingtip Maps, the web's sampled speed figures, the iPhone's energy and disk figures, the planner's route counters; and the documents library on the web and then the iPhone and iPad, its markup and notes). Checked again the same day for the feature review (`docs/store/feature-review.md`): the subscription and adsb.fi cut, Studio and the crash pipeline moved out of this repository, and the parked features (off to start behind each app's Settings › Extras, or the server's switch) marked so below.

"Collected" is App Store Connect's meaning: sent off the device and kept
longer than it takes to answer the request.

## Data the app collects

| App Store category | What exactly | Linked to the pilot | Why | Where it is kept |
|---|---|---|---|---|
| Contact Info, Email Address | The address a pilot signs in with | Yes | App Functionality (sign-in, the sign-in link; currency and airplane due-date reminders where the pilot turns them on) | `pilots`, `magic_links`, `reminders_sent` (Postgres) |
| Contact Info, Phone Number | The telephone number a pilot adds, optional: the contact a flight plan's item 19 asks for (`Session.setContact` on iOS, the web's account) | Yes | App Functionality | `pilots.phone` (V29) |
| Contact Info, Name | The name Google or Apple gives at sign-in (otherwise the address); the name as on their pilot certificate, where they give it for endorsements | Yes | App Functionality | `pilots` |
| Identifiers, User ID | The account's id; Google's and Apple's subject for that sign-in; Apple's refresh token (the web's, or the one the iPhone's authorization code is traded for, `AppleAppTokens`) and the Apple client it was issued to, kept only to revoke the Apple sign-in when the account is deleted (`AppleRevocation`) | Yes | App Functionality | `pilots` (`apple_refresh_token`, V18), the session |
| User Content, Other | The pilot's own record: home base (V29), the medical's, flight review's and instrument proficiency check's dates and the knowledge tests' codes (V12, V13, V20) | Yes | App Functionality (currency, reminders, a flight plan's item 18 and 19) | `pilots` |
| User Content, Other | Flight watch, for a saved flight the pilot asks to be watched: its departure time, the last briefing kept to compare the next with (the planner's JSON, never read in the gateway), when it was checked and the changes found; ends at departure | Yes | App Functionality (the changes emailed) | `flight_watch` (V31) |
| User Content, Other | Instructing: the address a student asks an instructor in by (`instructor_students.email`, V26), a solo cross-country put to an instructor (`cross_country_reviews`) and the approaches an instructor sets as lessons (`approach_lessons`, V30) | Yes | App Functionality | Postgres |
| User Content, Other | Aircraft (tail number, type, performance, the last VOR check, the inspections' and tests' dates and its hours, whether it is flown for hire, its ADs and other due items, and its squawks; its checklists stay on the device, `lib/checklists`, and are forgotten there on sign-out), saved flights and their nav logs, the logbook (its instrument approaches, holding and tracking among it), endorsements and currency dates (the instrument proficiency check's too), checkpoint notes a pilot writes for themselves; a flight instructor's certificate number and its date, the instructors a student asks in by address, the saved flights a student puts to them, and the endorsements signed in the app | Yes | App Functionality | Postgres; notes in the planner's `data/labels` |
| User Content, Other | A saved flight a pilot shares by link: the share's random token, whether its N-number goes with it (it does, where the flight has an airplane: the owner, 2026-11-11, on the web; the phones still ask), and when it was shared; whoever has the link reads the flight's route, stops, altitudes, departure time, airplane type, picks and nav log, never the pilot's name, address, notes, risk assessment or the flight's own name, and the airplane's N-number (`SharedFlightDto`). Read-only, until the pilot stops sharing it (Stop Sharing, which deletes the row) or deletes the flight | Yes | App Functionality (sending a plan to another pilot or an instructor) | `flight_shares` (Postgres) |
| Identifiers, User ID | Parked, off by default (`MCP_ENABLED=false` on production, so no app can register): the AI apps a pilot connects Wingtip to (the MCP connector, `docs/design/mcp-connector.md`): the app's registration (its name and callback, no pilot's), and for the pilot the consent given and the connection's tokens, under the account's id; no record of what was asked | Yes | App Functionality (answering the pilot's own AI app) | `oauth2_registered_client`, `oauth2_authorization`, `oauth2_authorization_consent` (Postgres, V40); the tokens last 15 minutes and refresh for 30 days |
| Location, Precise | A flight's track, when a pilot saves it to a flight (the phones' flight recorder, the logbook drafted from it): linked to the account, unlike the live position below | Yes | App Functionality | `flight_tracks` |
| Diagnostics, Crash Data | A fault on the device: the web's uncaught errors (message, stack, page path, browser; `lib/errorReports`), the iPhone's MetricKit crash, hang, CPU and disk-write diagnostics (`Diagnostics/`), Android's exit reasons, ANR traces and uncaught exceptions (`diagnostics/`); each with the app's version, the OS version and phone/tablet/desktop, scrubbed of queries, emails, home folders and UUIDs (`DiagnosticText`); sent only while Help Improve Wingtip Maps is on (Help & About, on unless the pilot turns it off, kept on the device: `lib/helpImprove`, `Diagnostics/HelpImprove.swift`, `diagnostics/HelpImprove.kt`) | No | App Functionality (finding faults) | `diagnostics` (Postgres), 30 days; a line in the server's log (30 days) |
| Diagnostics, Performance Data | How fast the app was on the device: the web's Core Web Vitals (LCP, INP, CLS, FCP, TTFB) and long tasks, from a quarter of page loads (`SPEED_SAMPLE`), the iPhone's launch, resume, hang and scroll-hitch figures, peak memory and memory exits, and the day's energy and disk use as MetricKit measures them (CPU and GPU time, time the GPS was held at its best accuracy, time in the foreground and background, megabytes written), Android's launch time and janky frames (JankStats); the page's name, phone, tablet or desktop, and the app's build; nothing of the pilot's; only while Help Improve Wingtip Maps is on, as above (`lib/speed`, `lib/longTasks`, SpeedController, DiagnosticsController) | No | App Functionality (keeping the app fast) | `speed_samples` (Postgres), 400 days |

## Data that leaves the device but is not collected

- **Position for Nearest, the map, traffic and the airspace at a point.**
  The device's position goes to the planner to answer and is not kept:
  the planner writes no access log in production
  (`infra/docker-compose.prod.yml`), no log line carries a point's
  coordinates (the airspace router's and the geocoder's failures name the
  error only), and the traffic view keeps only its half-degree region for
  a minute ("Kept without an account" below). The gateway's log of a
  planner outage names the path only. The request id on the gateway's and
  the planner's log lines is a random token the page makes, tied to no
  account. Postgres logs a statement slower than half a second by its
  text alone, never the values bound to it (`log_parameter_max_length=0`),
  so no address or position reaches the log that way. The position itself is read on the
  device, with the permission the browser, iOS or Android asks for.
- **What a pilot's own AI app asks the connector** (parked: off on production, `MCP_ENABLED=false`). A pilot who connects Wingtip to their own Claude or ChatGPT (the MCP connector, `services/planner/app/mcp`) has that app call Wingtip's tools: the airports, weather, NOTAMs, a route's nav log and briefing, and their own airplanes and saved flights. Each answer goes only to the app the pilot connected, only when the pilot's conversation asks for it, and is then under that app's own terms (Anthropic's or OpenAI's): Wingtip neither chooses nor pays for the model. Nothing of the call is kept beyond the rate limit's count of calls per pilot, in the planner's memory for a day (`app.mcp.calls`). The tools never return the pilot's name, address or logbook. Saving a flight from there (`save_flight`, `save_flight_plan`) is a saved flight as above, confirmed in the AI app first; replacing or deleting one (`update_saved_flight`, `delete_saved_flight`) is asked first too, and only where the pilot left "Save, change and delete your saved flights" ticked when connecting. The flight being planned with the app is not kept by Wingtip between calls: the app hands it back with each change (decision 0061). Its live view, drawn inside the AI app, shows the same answers and fetches only the FAA chart's tiles from Wingtip, which carry no pilot's data.
- **The Apple Watch** (`apps/ios/WingtipWatch`; parked: not embedded in
  the iPhone's build, so none of this happens in it): the paired iPhone
  sends it the airplane, its checklist and the position the watch app
  shows, over WatchConnectivity; it stays on the two devices.
- **A cockpit receiver's traffic and FIS-B weather** (the iOS and Android
  apps; parked, off unless Settings › Extras › ADS-B Receiver is on and
  the receiver on Auto): heard on the cockpit's Wi-Fi, read
  by the engine on the device and shown there; nothing of it is sent
  anywhere or kept past a few hours.
- **The radio, with the ATC copilot on (parked: off unless Settings ›
  Extras › ATC Copilot is on), and anything said to the app.**
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
- **Gemini Nano on Android** (docs/android-ai.md; parked: the store
  build leaves ML Kit GenAI out, `genai-prompt` only with
  `-Pwingtip.genai=true`, and Settings › Extras › Ask is off to start, so
  none of this happens in it, and Add from a Photo, which needs Nano, is
  not offered, so the scanner and text recognition are not called
  either). Where a build has it and the phone has
  it (ML Kit's Prompt API over AICore, `ai/Nano.kt`), Ask
  (`ai/OnPhoneAsk.kt`), In Plain Words (`ai/AiWords.kt`), a drafted
  logbook remark and a photographed page (ML Kit's on-device text
  recognition, then Nano, `ai/read/OnPhoneReader.kt`) are made on the
  phone and nothing of them goes to us or Google. ML Kit itself (the
  Prompt API, text recognition and the document scanner) sends Google
  its own diagnostics as it is used: the device's maker, model and
  Android version, the app's package and version, an identifier for the
  install (for the Prompt API a device or user identifier too), and the
  call's speed, settings, sizes and error codes, never the photo, the
  question or the words (ML Kit's "Data disclosure",
  developers.google.com/ml-kit/android-data-disclosure, read
  2026-11-21). Play counts what an SDK in the app sends as the app's
  collection, so the Data safety form declares it (below). Ask's tools
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
  (`Records/Records.swift`); Apple's, not ours. So are the pilot's own
  documents, only while Keep in iCloud is on (below).
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
- **A tester's feedback** (About, Send Feedback, on the iPhone and
  Android; docs/store/beta.md). The share sheet is handed the app's
  version and build, the system's version (what the fault reports
  already carry, above) and three questions. It goes only where the tester
  sends it, by their own mail or message, and the app sends nothing
  itself. TestFlight's own screenshot feedback is Apple's, kept in App
  Store Connect under Apple's terms. Play's internal testers write to the
  owner the same way.
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

- **The documents library** (`features/documents`, decision 0057). The
  pilot's own PDFs (a POH, checklists, insurance, club rules) are kept in
  the browser's IndexedDB on the device and never leave it: no upload, no
  sync, no copy in an account's export; they go with the browser's site
  data. Their last pages, bookmarks, the reader's night setting and its
  palm rejection stay in the browser's storage too. The pilot's markup
  and notes on any document, their own or the FAA's (highlights with the
  words picked, drawings, notes), are kept in the same IndexedDB beside
  the PDFs and never leave the device either: no request carries them,
  and a marked-up page goes out only as a picture the pilot shares from
  the device's own share sheet (checked 2026-11-21: documents-markup.spec
  holds that no request carries a note). The FAA's documents are fetched from the
  planner like any of its answers (the shelf, a book's PDF or a CFR
  part's text by its edition), which tells the server which public
  document was opened; no account rides with it and nothing of it is
  kept, as the planner writes no access log in production.
- **The documents library on the iPhone and iPad** (`Library/`, the same
  decision). The pilot's own PDFs, taken in from Files, the share sheet or
  a drop, are copied into the app's Application Support and stay on the
  device: never sent to Wingtip's servers, in no account's export. They
  are in the device's own backup, as the pilot's files are; the library's
  documents kept for the air are not, since the planner has them again.
  Their markup (Apple Pencil), bookmarks, last pages and the Invert Colors
  choice stay on the device; the markup goes at sign-out with the plates'
  (`PlateMarkup`). **Keep in iCloud**, off by default and only when the
  pilot turns it on, puts each of their own PDFs and its name in their own
  private iCloud database through the records store's CloudKit sync
  (`OwnDocumentRecord`), Apple's and not ours, as the airplanes and routes
  are (above); turned off, those copies are deleted. Nothing of it is
  collected in App Store Connect's meaning, and the privacy manifest is
  unchanged.

  On Android (`library/`, android.md 3.20) the same holds on the phone:
  the pilot's own PDFs, picked from the system's picker or shared in from
  another app, are copied into the app's own files and never leave the
  phone (no upload, no sync, not in the export, and not in Android's
  backup, which is off for the app); their last pages,
  bookmarks, Invert Colors and the markup (Jetpack Ink's strokes and the
  highlights' notes) are files of the app's too. They stay through
  sign-out, as on the web, being no account's, and go when the app's
  storage is cleared or the app is removed. A book kept for the air is
  the FAA's public document in the app's files; one only read is in the
  cache.

## Who else receives what

| Recipient | What | Personal |
|---|---|---|
| The pilot's own AI app (Claude, ChatGPT), only where the pilot connects Wingtip to it | The connector's answers to what the pilot asks it: airports, weather, NOTAMs, a route's nav log and briefing, the pilot's airplanes (tail number, type, figures, inspections, squawks) and saved flights | Yes, the pilot's own, sent to the app they chose; Wingtip sends none of it otherwise |
| Amazon SES | The address a sign-in link is sent to, and the link; an instructor's address a student asks in, with the student's name and address; the endorsements and reviews between the two, to each | Yes, to deliver it |
| The student's instructor | Once they take the student on: the student's name and address, 61.109 experience from their logbook, knowledge test codes, endorsements, and the saved flights the student puts to them | Yes: the student asks them in, and either ends it |
| Google, Apple | Their own sign-in, when a pilot uses it | Their own |
| FAA, NOAA (aviationweather.gov) | Chart and data downloads, weather for airports | None: the server asks, not the device |
| eCFR (ecfr.gov, the Office of the Federal Register) | The documents library's CFR parts, fetched once a day (`wingtip/library.py`) | None: the server asks, not the device |
| adsb.lol | For the traffic on the map, the middle of a region: a 0.5 degree cell, 2 degrees zoomed out (`traffic/adsb_lol.py`); for an airplane a pilot opens, its transponder's address (its trace); for its route, its callsign (`traffic/routes.py`, `vrs-standing-data.adsb.lol`); the followed airplanes' addresses, asked by ingest every half minute (`traffic/watched.py`: its globe's recent trace first, then its API by the address, with the operator's `ADSBLOL_API_KEY`, which ingest is given); and a registration, callsign or address a pilot types in Find (`/api/traffic/find`; the FAA record's `/api/traffic/registered` asks no one, the registry being on the planner's disk), which may be their own N-number | None of the pilot's beyond what they type: the server asks, not the device; the device's position itself is not sent |
| ADS-B Exchange (adsbexchange.com, through RapidAPI) | The same asks where adsb.lol turns one away or is down: a region's middle (`traffic/view.py`), a searched registration, callsign or address (`traffic/lookup.py`), and the address of an airplane whose card is open (`traffic/watched.py`; the background rounds leave its paid month alone); the request carries the operator's RapidAPI key | As adsb.lol |
| Iowa State University's IEM (mesonet.agron.iastate.edu) | The radar loop's map tiles in view, asked by the device (web, iPhone, Android) from the address templates the planner gives (`wingtip/weather_loop.py`) | The device's internet address and the part of the map in view, as any map tile; no account |
| NOAA nowCOAST (nowcoast.noaa.gov) | The satellite loop's tiles in view, asked by the device the same way | As IEM |
| Planespotters (api.planespotters.net, t.plnspttrs.net) | The web app, when a traffic card opens: that airplane's transponder address, to show its photo (`features/traffic/planePhoto.ts`), from the browser | The browser's internet address and the address of the airplane looked at; no account |
| USGS (epqs.nationalmap.gov) | Sample points along a route, for the ground's height where the terrain tiles have none (`wingtip/elevation_sources.py`), from the server | None: points on a route, no account |
| USGS (basemap.nationalmap.gov) | On the web, with its imagery overlay on; on Android, by itself once the map is zoomed close in past the chart's own detail (`map/CloseMap.kt`, since b5b72427e): the map's tiles in view, asked by the device | None: the tiles' coordinates, as any web map's |
| Google (tile.googleapis.com) | On the web only, with a Google overlay on: a session and the map's tiles in view, asked by the browser with the planner's key. The Android app asks Google for no map tile (its close-in imagery is the USGS's since b5b72427e, and the store-review audit of 2026-11-21 took its unused Maps key out of the manifest) | None of the pilot's: the device's internet address, the tiles' coordinates and the view, as any Google map's; Google's own terms and privacy policy apply to the request |
| US Census Bureau (geocoding.geo.census.gov) | A street address typed in Nearest's field, to place it; its gazetteer of towns is downloaded once | The address typed, from the server, not the device; kept in the planner's memory for an hour so the same address is not asked twice (`geocode.py`), never written to disk or a log (a failure logs the error's kind only), and a place picked is in the page address (`nearName`, `nearAt`) |
| Amazon Web Services | Hosting all of the above (the stack's Region, us-east-2 on the owner's account; CloudFront's certificate in us-east-1, decision 0064) | As above |

## Not done

- **No tracking**, in Apple's sense: no advertising, no analytics SDK, no
  data broker, nothing joined with others' data. App Store Connect:
  "Data Not Used to Track You".
- **No analytics tied to anyone**: the only counts kept are counts per day
  of each kind of request, not tied to any pilot or device (below, "The
  planner counts its own calls"; the owner took the product audit's
  recommendation, 2026-11-23). No SDK sends them anywhere. The month's
  count of each Claude-written feature went with those features
  (2026-11-12, decision 0041).
- **No purchases**: the app is free and sells nothing (decision 0022);
  the subscription's leftovers were cut on 2026-11-21 (V46 dropped
  `paid_feature_uses`, V52 drops `subscriptions`).
- **The avatar's photo**, if the pilot chooses one in Pilot Details: a
  256-pixel square JPEG the app makes from the photo picked, kept in the
  gateway's Postgres (`pilot_avatars`, V45), served only to its own pilot
  (`GET /api/me/avatar`), in the account's export as a data: URL, and
  deleted with the account or by Remove Photo.
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
logbook, notes), **App info and performance** (crash logs and
diagnostics, not linked: not tied to the account; crash logs gone from
the log after 30 days, speed measurements after 400; sent only while
Help Improve Wingtip Maps is on). No **Device or
other IDs**: the store build makes no ML Kit call (Gemini Nano above);
should Ask or Add from a Photo be offered again, ML Kit's diagnostics
and its install and device identifiers to Google come back as a row,
optional, for analytics as ML Kit states its purpose
(docs/store/privacy-labels.md). Google Play's Android vitals (crash and
ANR rates, start-up, battery) come from the system for users who share
usage and diagnostics with Google, under Android's own setting: Google's
collection, not the app's, and nothing the app sends.
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
reads and `CA92.1` for its own standard defaults, which `Design/Ink.swift`
(compiled into the extension) reads for the look (the store-review audit
of 2026-11-21: the extension declared only the App Group's). The Watch
app's, `apps/ios/WingtipWatch/PrivacyInfo.xcprivacy`, declares nothing,
as it calls no required-reason API; the Watch app is parked and not
embedded in the iPhone's build, so its manifest is not submitted with
it until the Watch comes back. `WingtipTests/StorePrivacyTests` reads the app's bundled
manifest and the widgets' from the source tree, and fails where one of
these is missing. A source compiled into an extension
(`project.yml`'s `WingtipWidgets` sources) brings its required-reason APIs
with it: check the extension's manifest when one is added.
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
- **Followed airplanes** (`followed`): an airplane whose card a signed-in
  pilot opens is followed (another airplane's Follow, past flights and history
  are parked in the apps, off unless Settings › Extras › Other Airplanes
  is on; the pilot's own keep them), its ICAO address and when its card was last opened;
  dropped 30 days after that (`FOLLOW_KEEP_S`). Opening its card again
  starts the 30 days again. A card opened with nobody signed in follows
  nothing; one no source has heard a day after it was followed is dropped
  (`FOLLOW_UNHEARD_S`), and at most 20 by one pilot, their own oldest
  going first (`FOLLOW_EACH`), and at most 500 in all (`FOLLOW_MOST`), past
  which the largest share loses its oldest first, so neither one account
  nor a group of them can push out a pilot who follows fewer. Which pilot
  opened a card is not kept: each follow is counted in a share named by a
  short keyed hash of the pilot's id (`share_of`, HMAC-SHA-256 with
  `FOLLOW_SHARE_KEY`), never the id, and not one that can be worked out
  from a guessed id. The key is never kept in the live store beside the
  shares: production's comes from the stack's `FollowShareKeySecret` in
  Secrets Manager, and the planner does not start without it; the
  development stack makes one at random into the planner's own secrets
  volume (`FOLLOW_SHARE_KEY_FILE`).
- **Other airplanes' tracks** (`points`): a followed airplane's public
  ADS-B and radar positions, recorded from adsb.lol, ADS-B Exchange
  (while a card is open) and the FAA's radar, card open or not, so its card can show its
  recent flights; each point kept 30 days (`RECORD_KEEP_S`), whether or
  not the airplane is heard again. No pilot or account is stored with
  them; a pilot who opens their own airplane's card has its public
  flights recorded the same way.
- **Sources' answers about an airplane** (`answers`): Planespotters.net's
  photo of an airplane (by its address and registration) kept a day, the
  terms' most, and a flight number's route kept six hours, an absence
  too, so a restart asks again for none. Neither names who asked.

The planner counts its own calls, for the owner's status page
(`app.route_metrics`, Prometheus's client): for each route its template
(`/api/airport/{ident}`, never the address asked), the method, the
status, and how long it took, in memory from its start, gone when it
restarts; served at `/metrics` on its own port, which the gateway does
not forward. No point, ident, query or pilot is in them. The same counts,
without the times, are kept per UTC day on the planner's disk
(`app.usage_days`, `data/raw/usage/usage.sqlite`, 90 days): a day's row is
the day, the route's template, the method, the status and how many calls,
nothing else. Each finished day is served at `/api/usage/daily`, on the
stack's own network only, for the gateway's nightly rollup into Postgres
(`UsageRollup`, 04:20 UTC, into `usage_days`: the same five fields, kept
as the owner's totals), so the totals outlive a server replaced: counts per day of each kind of
request, not tied to any pilot or device. The status page
reads the apps' faults and speed figures by build from the rows above
(`AppHealthController`), keeping nothing more.

In the gateway, a connection an AI app holds (`oauth2_authorization`)
whose every code and token ran out over a day ago is let go each night,
with the spent refresh tokens' hashes past their 30 days, and a client
nobody connected through goes with its consents
(`ConnectorHousekeeping`, 03:45 UTC); a consent otherwise stays until
the pilot disconnects that app's last connection in You's Connected Apps
(its row and tokens go at once, `DELETE /api/me/connections/{id}`) or
deletes their account. Fault reports go after 30 days
(`DiagnosticsService`, 03:15 UTC). Each night at 03:30 UTC
(`Housekeeping`) speed figures go after 400 days, sign-in links a day
after they expire, a reminder's record of being sent once its day has
passed (it only stops the same reminder going twice), and a deletion's
note after 60 days (below); before 2026-11-21 the first two went only when
another sample or link came, and the reminders' records stayed until the
account went (the prelaunch audit's P8).

## Kept in backups

The nightly `pg_dump` and the planner's notes (`infra/server/backup.sh`)
go to the server bucket, whose `backups/` expire after 14 days and whose
overwritten or expired copies after 30 more (`ServerBucket`'s lifecycle,
`infra/cloudformation/template.yaml`); the data disk's daily snapshots
keep seven (`SnapshotPolicy`). So a deleted account's rows can stay in a
backup for up to 44 days, and in a snapshot for 7, until each ages out.
A backup is restored only to recover the service, never an account. A
restore from before a deletion would bring the account back, so each
deletion is noted by the pilot's id alone, with its time
(`deleted_accounts`, V47; no name, address or anything else), kept 60
days, longer than any backup, and copied to the bucket each night
(`backups/deleted-accounts.csv`). After a restore the list is put back
(`infra/server/restore-deletions.sh`) and the gateway deletes those
accounts again as it starts and each night, the planner's notes included
(`DeletionsReapplied`; the prelaunch audit's P3). Only an account deleted
in the day since the last copy, on a server whose database is itself
lost, is not caught. The privacy policy says so ("Your copy and deleting
it").

## The FAA's flight instructors

To say whether an endorsement's instructor is a flight instructor the FAA
knows (the engine's `instructor_verification`), ingest keeps from the FAA's
public Airmen Certification Releasable Database each active flight
instructor's FAA unique id, name and certificate expiry (`airmen.sqlite`,
`wingtip.airmen`), replaced each month; no address, medical or rating,
though the file has them. An airman who asked the FAA to withhold their
address is not in the file at all. A signed endorsement keeps the
verdict, the matched FAA id and its words with it (`signed_endorsements`,
V51), and goes as the endorsement does.

## Kept on the device (the web)

Nothing below leaves the browser unless a row above says so; it is the
browser's storage, cleared with the site's data.

- **localStorage, every key under `wingtip.`**: the preferences
  (`wingtip.preferences`: the map's look, Home, Favorites, recents,
  minimums, loads, the airplane flown and those followed), a flight's
  track opened from a file (`wingtip.track.<flight>`), the GPS track the
  phone recorded for a logbook draft (`wingtip.autolog.track`), own
  ship's trail (`wingtip.owntrail`, cleared by its own button, on sign-out,
  and once read past its flight, ten minutes after its last point), the
  checklists, the plan's undo history, the risk assessment, the routes
  and charts kept for the air, the coach's certificate, the drills.
- **The service worker's caches** (`vite.config.ts`): chart tiles,
  airport diagrams and pictures, and the planner's answers
  (`planner-now` a day, `planner-steady` 60 days, `planner-api` 30 days),
  whose addresses can carry a point asked about (Nearest, the airspace
  at a point); `pilot-own`, the pilot's account, airplanes and flights,
  30 days.
- **Signing out** (`useLogout`) forgets what was the pilot's: their part
  of the preferences, the checklists, the route kept for the air, the
  flights' tracks and the recorded GPS track (since the prelaunch audit,
  2026-11-21), own ship's trail, `pilot-own`, and the planner's answers
  whose addresses carry a point, `planner-now` and `planner-api`
  (`forgetPlannerAnswers`, the owner's word of 2026-11-21; they refill
  online). The map's look and the steady answers (`planner-steady`, the
  charts, the diagrams) stay, the device's. **Deleting the account**
  (`useDeleteAccount`) removes every `wingtip.` key and `pilot-own`.

## Kept after an account is deleted

The account's id and when it was deleted, 60 days, so a restore deletes
it again (`deleted_accounts`, "Kept in backups" above). The id names no
one once the account's row is gone.

An endorsement an instructor signed in the app stays with the other of the two when either deletes their account, with the student's name as signed and the deleted account left out: it is the student's endorsement, and 14 CFR 61.189(b) and (c) ask the instructor to keep a record of it for 3 years (`signed_endorsements`).
