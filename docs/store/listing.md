# The store listings

What App Store Connect and the Google Play Console ask for, ready to
paste. Every claim here is one the app makes good today on that
platform, checked against the code on 2026-11-09; keep it so. The
privacy answers are in [privacy-labels.md](privacy-labels.md), the App
Preview's plan in [preview-video.md](preview-video.md), and how the app
gets to the stores in [../NATIVE.md](../NATIVE.md) and
[../NATIVE-ANDROID.md](../NATIVE-ANDROID.md).

Counts are characters as the stores count them (Unicode characters,
spaces and line breaks included), measured on the text without the
quote marks and with each bullet on one line.

## The planning-aid wording

The stores' text says what the app itself says, in its words: the web's
`apps/web/src/components/planningAid.ts` and the terms
(`docs/legal/terms.md`, "A planning aid, not for navigation", served at
`/terms`), and the native kneeboards' footer
(`apps/ios/Wingtip/Views/Kneeboard.swift`: "a planning aid: check the
charts, NOTAMs and an official briefing before flight"). Both
descriptions end with that sentence, word for word, and then the terms'
heading said for the moving map: not for navigation. Apple's guideline
5.1.5 says location services "shouldn't be used to provide emergency
services or autonomous control over vehicles, aircraft, and other
devices"; so the listing never sells the app as emergency help, and the
nearest-fields line says it is a reference and not an emergency service
(121.5 MHz is the aeronautical emergency frequency, AIM 6-3-1). The
paragraphs, as both listings use them:

> Wingtip Maps is a planning aid for VFR and IFR flight. It does not
> replace an official weather briefing (1800wxbrief.com or
> 1-800-WX-BRIEF), current FAA charts and publications, or the pilot in
> command's judgement and final authority (14 CFR 91.3, 91.103).
>
> Not for navigation: the map, your airplane on it, the traffic and the
> alerts are for awareness, not a replacement for the airplane's
> instruments and approved navigation equipment.

## URLs

| Field | URL | Served by |
|---|---|---|
| Marketing URL | `https://wingtipmaps.app/` | the site, `apps/site` |
| Support URL | `https://wingtipmaps.app/support` | the site |
| Privacy policy URL | `https://wingtipmaps.app/privacy` | the site |
| Terms (EULA, App Store's "License agreement" field, optional) | `https://wingtipmaps.app/terms` | the site |

Until the site is served, the web app's own pages say the same:
`/app/privacy.html`, `/app/terms.html`, `/app/support.html`
(`apps/web/public`). The domain itself is the owner's to register
(see "The owner's steps" below).

## App Store (iPhone, iPad; the Apple Watch app comes with it)

| Field | Text | Count / limit |
|---|---|---|
| Name | Wingtip Maps | 12 / 30 |
| Subtitle | VFR & IFR charts and nav logs | 29 / 30 |
| Primary category | Navigation | |
| Secondary category | Weather | |
| Price | Free (no in-app purchase: no StoreKit in `apps/ios`) | |
| Copyright | 2026 Wingtip Maps | |
| Bundle ID | `app.wingtipmaps.ios` (`apps/ios/project.yml`) | |

**Promotional text** (167 / 170, can change without a review):

> Plan a VFR or IFR flight on the FAA's charts: the route, checkpoints
> you can see from the air, a nav log from the winds aloft, and the
> weather and airspace on the way.

**Keywords** (96 / 100; the name and subtitle's words are indexed
already, so they are left out):

```
sectional,flight planner,pilot,METAR,TAF,airspace,TFR,ADS-B,logbook,EFB,student pilot,ATIS,NOTAM
```

Stores count keywords without the spaces after commas; there are none
here, and the spaces inside a phrase ("flight planner") count.

**Description** (2,481 / 4,000):

> Wingtip Maps is the FAA chart on a map that works like Maps on your
> iPhone, and everything a VFR or IFR flight needs on top of it.
>
> PLAN
> - The current FAA sectional, terminal area and IFR enroute charts,
>   with Class B, C and D airspace, special-use airspace and TFRs drawn
>   over them.
> - Type a route and see it drawn: the course, its stops, and
>   checkpoints picked off the chart that you can see from the air.
> - A nav log with headings, groundspeeds, times and fuel from the
>   winds aloft, and a cruising altitude picked for terrain, airspace
>   and the clouds.
> - The Brief: a verdict first, then the weather, NOTAMs, TFRs, icing
>   and the hazards on each leg, and the best hours to leave.
>
> AT THE AIRPORT
> - Every airport's card: runways, frequencies, lighting, the airspace,
>   and the weather there now, with the digital ATIS and runway visual
>   range where the field has them.
> - Departure and approach procedures, and the airport diagram with
>   your airplane on it.
>
> IN THE AIR
> - Your airplane on the chart, the next checkpoint, the time and fuel
>   to go, on the Lock Screen and in the Dynamic Island.
> - Traffic and FIS-B weather from a cockpit ADS-B receiver on the
>   same Wi-Fi (Stratux, SkyEcho, Sentry).
> - An ATC copilot, when you turn it on: it listens to the radio,
>   shows a call to you as a card, and checks your readback. The words
>   are heard on your iPhone where it can.
> - Charts, airports and terrain downloaded by sectional, state or a
>   box you draw, for flying with no signal.
> - Nearest fields: the airports within reach of where you are, as a
>   reference for planning a diversion. It is not an emergency service:
>   in an emergency, fly the airplane and talk to ATC (121.5 MHz).
>
> AFTER
> - The flight logged with no typing: when you land, the logbook entry
>   is drafted from your track for you to check and save.
> - Your airplanes, flights, logbook and currency, kept with Sign in
>   with Apple or an emailed link, and your favourites on all your
>   devices through iCloud.
>
> On Apple Watch: timers, your airplane's checklists and the nearest
> airports, on your wrist.
>
> Wingtip Maps is a planning aid for VFR and IFR flight. It does not
> replace an official weather briefing (1800wxbrief.com or
> 1-800-WX-BRIEF), current FAA charts and publications, or the pilot in
> command's judgement and final authority (14 CFR 91.3, 91.103).
>
> Not for navigation: the map, your airplane on it, the traffic and the
> alerts are for awareness, not a replacement for the airplane's
> instruments and approved navigation equipment.

Where each line comes from, for the next check:

| Line | Code |
|---|---|
| Charts, airspace, TFRs | `Views/ChartMap.swift`, `Views/ChartOverlays.swift` |
| Route, checkpoints | `Route/`, `Views/CheckpointMarks.swift` |
| Nav log, altitude | `Views/NavLogPage.swift`, `Views/FPLView.swift` |
| Brief, verdict, hours to leave, icing | `Views/BriefView.swift`, `Brief/DepartureWindow.swift`, `Brief/ForecastIcing.swift`, `Views/HazardLegsViews.swift` |
| D-ATIS, RVR | `Live/AirportLive.swift`, `Views/AirportLiveSections.swift`, `API/Atis.swift` |
| Procedures, diagram | `Views/ProceduresRow.swift`, `Views/DiagramOwnShip.swift` |
| Lock Screen, Dynamic Island | `WingtipWidgets/FlightActivityWidget.swift` |
| ADS-B receiver | `Receiver/Receiver.swift` |
| ATC copilot | `Atc/AtcCopilot.swift`, `ClearanceListener.swift` (on-device recognition where supported) |
| Downloads | `Offline/DownloadsView.swift` |
| Nearest fields (the emergency sheet) | `Emergency/`, `Views/EmergencySheet.swift` |
| Logbook auto-draft | `Logbook/AutoLogbook.swift`, `Views/FlightLoggedSheet.swift` |
| Sign-in, iCloud | `Session.swift`, `Records/Records.swift` |
| Watch | `apps/ios/WingtipWatch` |

**What's new** (first version): "The first version of Wingtip Maps on
the App Store."

### Age rating

Every question in App Store Connect's questionnaire is "None" or "No":
no violence, no sexual content or nudity, no profanity, no drugs,
alcohol or tobacco, no gambling or contests, no horror, no medical
information, no unrestricted web access (the app opens links in
Safari), and no user-to-user content (an instructor and a student see
each other's shared records only after the student asks the instructor
in by address; there is no public posting or chat). That gives **4+**.

### App Review information

**Sign-in required:** no. A route, its nav log, the Brief and the charts
need no account. The account features have a review account (see
"Review access" below): put its address in the demo account's user name
and its code in the password field, and the notes say how to use them.

**Notes for review** (keep them true to the code; inaccurate notes are a
2.1 and 2.3 risk):

> No account is needed to plan a flight: open FPL, type two airports
> (for example C81 and KDLH) in From and To, and tap Plan, or open the
> demo flight from About. The nav log is under the route's More (•••)
> menu, and the Brief is the glyph beside the altitude.
>
> Account features (saving an airplane, the logbook, Export My Data and
> Delete Account, in Setup under Account): use Sign in with Apple, or
> the review account, which needs no email. On this device, tap this
> link (paste it into Notes or Messages and tap it there; a link typed
> into Safari's address bar opens the website instead, which signs in
> the same way): https://wingtipmaps.app/api/auth/magic-link/verify?token=[the code in the password field].
> The app opens signed in as the review account.
>
> Location is asked for the first time you use something that needs it
> (the location button on the map, Nearest, the emergency assistant or
> Ready to Fly), never at launch; declined, the map works without your
> airplane on it. The microphone and speech recognition are asked for
> when you turn on the ATC copilot (Setup, Alerts) or tap a microphone
> in search or Ask; speech is recognised on the iPhone only
> (requiresOnDeviceRecognition) and never sent to a server, and the
> phone shows the orange microphone indicator while it listens. Local
> network is asked for only when Traffic looks for a cockpit ADS-B
> receiver.
>
> Background modes: audio keeps the ATC copilot listening to the radio
> while the phone is locked in flight (the orange indicator and the
> flight's Live Activity show it); location keeps the airplane's
> position, the alerts ahead and the path flown while flying, with the
> blue location indicator; remote-notification takes iCloud's silent
> pushes so another device's saved airplanes and routes sync; fetch is
> iOS's background refresh for the route's weather watched after the
> Brief.
>
> Widgets: Next Flight, Airport Weather and Currency Status (Currency
> needs the account); the flight's Live Activity on the Lock Screen and
> in the Dynamic Island. Apple Watch: timers, the airplane's checklists
> and the nearest airports.
>
> The first open needs a connection; after that, the charts already
> looked at and any downloaded in Setup under Downloads work offline.

The four background modes App Review will ask about are in
`apps/ios/project.yml` (`UIBackgroundModes: [audio, location,
remote-notification, fetch]`, with `BGTaskSchedulerPermittedIdentifiers:
[app.wingtipmaps.weather-watch]` for `fetch`), each with its reason
there. Attach a short screen recording of the copilot listening with the
phone locked (the orange indicator and the Live Activity) for the
`audio` mode (2.5.4).

Where each note comes from: the location ask, `OwnShip.swift`
(`askLocation`, "No question at launch"); the microphone, `VoiceInput`
and `ClearanceListener.swift`; the widgets, `apps/ios/WingtipWidgets`;
the Watch, `apps/ios/WingtipWatch`; the review link,
`MagicLinkController.verify` and `Session.open`.

### Review access

Both stores' reviewers need to reach the account features, and this
app's sign-in is an emailed link (Android has no other) whose inbox a
reviewer cannot read. The gateway has a review account for that
(`ReviewSignIn`): with `REVIEW_SIGN_IN=true`, the one address in
`REVIEW_SIGN_IN_EMAIL` may sign in with the fixed code in
`REVIEW_SIGN_IN_CODE` (at least 20 characters) wherever a sign-in
link's token goes, so the link
`https://wingtipmaps.app/api/auth/magic-link/verify?token=<code>` signs
that account in, in the apps (which open sign-in links themselves) and
on the web. Only that account, only that code, compared in constant
time and never logged; the gateway refuses to start with it on and no
address or a short code.

**It is off by default** (`application.yml`, `infra/docker-compose.prod.yml`
`REVIEW_SIGN_IN:-false`). The owner turns it on for a review and off
after:

1. Make the review account once: sign in with an address used for
   nothing else (review@ on the site's domain), and give it an airplane
   and a saved flight so the screens have something to show.
2. Before submitting, put `REVIEW_SIGN_IN` true, the address and a fresh
   random code (`openssl rand -base64 24`) in the AppSecret
   (`infra/server/env.example`) and run deploy.sh.
3. Give the reviewers the address and the code: App Store Connect's demo
   account fields, and Play Console's App access (below).
4. When the review is done, set `REVIEW_SIGN_IN` false and deploy again;
   change the code before the next review.

## Google Play

| Field | Text | Count / limit |
|---|---|---|
| App name | Wingtip Maps | 12 / 30 |
| Short description | VFR and IFR flight planning on FAA charts: route, nav log, weather, airspace. | 77 / 80 |
| Category | Maps & Navigation | |
| Tags | Navigation, Weather, Travel | |
| Price | Free, no in-app products (no Play Billing in `apps/android`) | |
| Package | `app.wingtipmaps.android.native` by default (`apps/android/app/build.gradle.kts`; `ANDROID_NATIVE_APP_ID` overrides it). Pick the one to keep for good before the first upload: Play never lets it change | |
| Contact email | the owner's support address (see "The owner's steps") | |
| Website | `https://wingtipmaps.app/` | |
| Privacy policy | `https://wingtipmaps.app/privacy` | |

**Full description** (2,129 / 4,000). The App Store's text with what the
Android app does not have taken out (Sign in with Apple, iCloud, the
Lock Screen activity, the watch) and the emailed link as the one way
in (`Session.kt`):

> Wingtip Maps is the FAA chart on a map, and everything a VFR or IFR
> flight needs on top of it.
>
> PLAN
> - The current FAA sectional, terminal area and IFR enroute charts,
>   with Class B, C and D airspace, special-use airspace and TFRs drawn
>   over them.
> - Type a route and see it drawn: the course, its stops, and
>   checkpoints picked off the chart that you can see from the air.
> - A nav log with headings, groundspeeds, times and fuel from the
>   winds aloft, and a cruising altitude picked for terrain, airspace
>   and the clouds.
> - The Brief: a verdict first, then the weather, NOTAMs, TFRs, icing
>   and the hazards on each leg, and the best hours to leave.
>
> AT THE AIRPORT
> - Every airport's card: runways, frequencies, lighting, the airspace,
>   and the weather there now, with the digital ATIS and runway visual
>   range where the field has them.
>
> IN THE AIR
> - Your airplane on the chart, with the next checkpoint and the time
>   and fuel to go.
> - Traffic and FIS-B weather from a cockpit ADS-B receiver on the
>   same Wi-Fi (Stratux, SkyEcho, Sentry).
> - An ATC copilot, when you turn it on: it listens to the radio,
>   shows a call to you as a card, and checks your readback.
> - Charts, airports and terrain downloaded by sectional, state or a
>   box you draw, for flying with no signal.
> - Nearest fields: the airports within reach of where you are, as a
>   reference for planning a diversion. It is not an emergency service:
>   in an emergency, fly the airplane and talk to ATC (121.5 MHz).
>
> AFTER
> - The flight logged with no typing: when you land, the logbook entry
>   is drafted from your track for you to check and save.
> - Your airplanes, flights, logbook and currency, kept with an
>   account you sign in to by an emailed link.
>
> Wingtip Maps is a planning aid for VFR and IFR flight. It does not
> replace an official weather briefing (1800wxbrief.com or
> 1-800-WX-BRIEF), current FAA charts and publications, or the pilot in
> command's judgement and final authority (14 CFR 91.3, 91.103).
>
> Not for navigation: the map, your airplane on it, the traffic and the
> alerts are for awareness, not a replacement for the airplane's
> instruments and approved navigation equipment.

Android sources for the lines that differ: `ui/AirportScreen.kt` and
`live/LiveAirportModel.kt` (D-ATIS, RVR), `atc/` (copilot,
`RadioListener.kt` on the system's recognizer), `offline/DownloadsScreen.kt`,
`logbook/FlightLoggedSheet.kt`, `receiver/Receiver.kt`, `emergency/`.

### Foreground services

The declarations for the three foreground-service types (location,
microphone, connected device), what starts each and what to paste in
the Play Console: [foreground-services.md](foreground-services.md). The
location service starts only on the pilot's Start Flight tap.

### Content rating (IARC questionnaire)

Category "Reference, News, or Educational" is the nearest; every content
question "No": no violence, sex, language, controlled substances,
gambling, no user-generated content shared publicly, no purchase of
digital goods. It shares the device's location with the server to answer
(Nearest, the copilot's look ahead) but not with other users. Expected
rating: Everyone / PEGI 3 / USK 0.

### App access (Play Console)

"All or some functionality is restricted": yes, the account features.
Instructions, with the review account's address and code from "Review
access" above:

> No account is needed to plan a flight: open FPL, type two airports
> (for example C81 and KDLH) and tap Plan. For the account features
> (airplanes, logbook, Export My Data, Delete Account in Setup), sign in
> without email: on the device, tap this link (paste it into a note or a
> message and tap it there; typed into Chrome's address bar it opens the
> website, which signs in the same way):
> https://wingtipmaps.app/api/auth/magic-link/verify?token=[code]. The app
> opens signed in as [review address]. No other sign-in is needed.

Android opens the link in the app through its verified App Link
(`AndroidManifest.xml`, `/api/auth/magic-link/verify`; `Links.kt`,
`Session.kt`), which needs `APP_ANDROID_CERT_SHA256` to hold Play's app
signing certificate (launch-checklist.md).

### Target audience and the rest of App content

- Target age group: 18 and over (pilots; a student pilot may be 16, but
  the app is not designed for children, so no "Designed for Families").
- Ads: none.
- News app: no. Government app: no (it reads FAA and NOAA data, and says
  so; it is not the FAA's).
- Account deletion URL (Play requires one for apps with accounts, where
  a user can ask "without reinstalling the app"):
  `https://wingtipmaps.app/delete-account` (`DeleteAccountController`):
  the address, an emailed link, Delete Account, deleting what Setup's
  Delete Account does. The app has its own too (Setup, Delete Account,
  `account/AccountActions.kt`), with Export My Data beside it, and the
  support page names both.

## Platform differences found

| | iOS | Android | Web |
|---|---|---|---|
| Sign-in | Apple, emailed link | emailed link | Apple, Google, emailed link |
| Delete account in the app | yes | yes | yes |
| Delete account without the app | `/delete-account` | `/delete-account` | `/delete-account` |
| Lock Screen / widgets | Live Activity, widgets | none | n/a |
| Watch | yes | no | n/a |
| Pilot's view / 3D terrain | no (`isPitchEnabled = false`) | no | yes (`features/plan/map/terrain`) |
| Records across devices | iCloud (SwiftData) | the account only | the account only |

So the listings never mention a 3D or pilot's view; the web's is the
only one, and the site may show it as the web's.

## The owner's steps

Every console and account step, as a checklist, is
[launch-checklist.md](launch-checklist.md); in short:

- Register `wingtipmaps.app` (and `wingtipmaps.com`) and serve the site
  there, so the URLs above answer before the first submission.
- An App Store Connect app record (bundle `app.wingtipmaps.ios`) and a
  Play Console app (`app.wingtipmaps.android`, $25 developer account),
  then paste this page's fields.
- A support address on that domain for both stores' contact fields.
- Upload the screenshots (`docs/store/screenshots/`), the 1024 and
  512 icons (`docs/brand/app-store-1024.png`, `docs/store/play-icon-512.png`)
  and Play's feature graphic (`docs/store/play-feature-graphic.png`), all
  drawn by `scripts/build/app-icons.sh` from `docs/brand`. The App Store
  takes its icon from the build; the 1024 is for anything else that asks.
