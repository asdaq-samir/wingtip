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
(`apps/web/public/terms.html#planning-aid`), and the native kneeboards'
footer (`apps/ios/Wingtip/Views/Kneeboard.swift`: "a planning aid: check
the charts, NOTAMs and an official briefing before flight"). The
description's last paragraph is that sentence, word for word:

> Wingtip Maps is a planning aid for VFR and IFR flight. It does not
> replace an official weather briefing (1800wxbrief.com or
> 1-800-WX-BRIEF), current FAA charts and publications, or the pilot in
> command's judgement and final authority (14 CFR 91.3, 91.103).

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

**Description** (2,170 / 4,000):

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
> - Emergency help: the nearest fields you can reach, and what to do.
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
| Emergency | `Emergency/`, `Views/EmergencySheet.swift` |
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
need no account; leave the demo account fields empty.

**Notes for review:**

> No account is needed to plan a flight: open FPL, type two airports
> (for example C81 and KDLH) in From and To, and tap Plan. The nav log
> is under the route's More (•••) menu, and the Brief is the glyph
> beside the altitude. To try the account features (saving an
> airplane, the logbook, and Delete Account in Setup under Account),
> use Sign in with Apple. Location is asked for when the map first
> opens, to open the chart where you are and draw the airplane on it;
> declined, the map opens on the country. The microphone and speech
> recognition are asked for only when the pilot turns on the ATC
> copilot in Setup under Alerts, and speech is recognised on the
> iPhone only (requiresOnDeviceRecognition), never sent to a server; background audio keeps listening to
> the radio while the phone is locked in flight, and background
> location keeps the airplane's position and the path flown. Local
> network is asked for only when Traffic looks for a cockpit ADS-B
> receiver. The first open needs a connection; after that, the charts
> already looked at and any downloaded in Setup under Downloads work
> offline.

The background modes App Review will ask about are in
`apps/ios/project.yml` (`UIBackgroundModes: [audio, location,
remote-notification]`), each with its reason there.

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

**Full description** (1,818 / 4,000). The App Store's text with what the
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
> - Emergency help: the nearest fields you can reach, and what to do.
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

Android sources for the lines that differ: `ui/AirportScreen.kt` and
`live/LiveAirportModel.kt` (D-ATIS, RVR), `atc/` (copilot,
`RadioListener.kt` on the system's recognizer), `offline/DownloadsScreen.kt`,
`logbook/FlightLoggedSheet.kt`, `receiver/Receiver.kt`, `emergency/`.

### Content rating (IARC questionnaire)

Category "Reference, News, or Educational" is the nearest; every content
question "No": no violence, sex, language, controlled substances,
gambling, no user-generated content shared publicly, no purchase of
digital goods. It shares the device's location with the server to answer
(Nearest, the copilot's look ahead) but not with other users. Expected
rating: Everyone / PEGI 3 / USK 0.

### Target audience and the rest of App content

- Target age group: 18 and over (pilots; a student pilot may be 16, but
  the app is not designed for children, so no "Designed for Families").
- Ads: none.
- News app: no. Government app: no (it reads FAA and NOAA data, and says
  so; it is not the FAA's).
- Account deletion URL (Play requires one for apps with accounts): the
  Android app has no Delete Account of its own yet (only iOS and the web
  do: `apps/ios/Wingtip/Views/AccountViews.swift`, the web's Setup); give
  `https://wingtipmaps.app/support` until it has, and say there that the
  web app's Setup deletes the account. Adding the button to Android's
  Setup is the better answer before the first release.

## Platform differences found

| | iOS | Android | Web |
|---|---|---|---|
| Sign-in | Apple, emailed link | emailed link | Apple, Google, emailed link |
| Delete account in the app | yes | no (see above) | yes |
| Lock Screen / widgets | Live Activity, widgets | none | n/a |
| Watch | yes | no | n/a |
| Pilot's view / 3D terrain | no (`isPitchEnabled = false`) | no | yes (`features/plan/map/terrain`) |
| Records across devices | iCloud (SwiftData) | the account only | the account only |

So the listings never mention a 3D or pilot's view; the web's is the
only one, and the site may show it as the web's.

## The owner's steps

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
