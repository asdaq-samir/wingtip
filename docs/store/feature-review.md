# Feature review: keep, park or cut

For the owner to decide, before the store submission and after the pilot
beta ([beta.md](beta.md)). It lists every feature no pilot has asked for:
built from the roadmap, an audit or a market-gap survey, not from a
pilot's request. For each: who it is for, what it costs to keep, and a
recommendation, with the reason. The tables below are the review as
written; "Applied" says what the code now does.

- **Keep**: as it is.
- **Park**: the code stays, but the feature is off by default behind a
  setting (or the server's switch), and out of the store listing, the
  screenshots and the review notes. That takes it out of review and out
  of the beta's way, without losing it.
- **Cut**: deleted, with its tests, feeds and docs. "Break freely until
  launch" makes that cheap now.

## Applied (2026-11-21)

The owner took every recommendation on 2026-11-21 (decision
[0059](../decisions/0059-feature-review-keep-park-cut.md)), and the
branch `claude/feature-review` applied them.

**The parks.** Each parked feature is one stock switch, off to start, in
a new Settings group, **Extras**, right after In Flight on each app
([../navigation.md](../navigation.md), "Settings' Extras", lists what
each hides):

| Park | Its switch |
|---|---|
| ATC copilot and clearance listener | Extras › ATC Copilot (`atcCopilot`) on the web (`apps/web/src/lib/extras.ts`), the iPhone (`apps/ios/Wingtip/Extras.swift`) and Android (`apps/android/app/src/main/kotlin/app/wingtipmaps/android/Extras.kt`); the in-flight Copilot is not parked. Android also declares no microphone foreground service |
| Cockpit ADS-B receiver | Extras › ADS-B Receiver (`adsbReceiver`), iPhone and Android; Android declares no connected-device foreground service |
| Another airplane's flights, Follow and history | Extras › Other Airplanes (`otherAirplanes`), all three apps; the pilot's own airplane keeps all of it (web `lib/airplane/ownAirplane.ts`, iPhone `Extra.airplaneHistory`, Android `airplane/OtherAirplanes.kt`) |
| Model weather (the flow layer) | Extras › Model Weather (`modelWeather`), all three apps; the weather service fetches the layer only with `WEATHER_FLOW_ON` (`services/weather/app/settings.py`: off by default and on production, `infra/docker-compose.prod.yml`; on locally and on CI so its specs run) |
| 3D terrain and airspace | Extras › 3D (`threeD`), the web only |
| The Apple Watch app | No switch: `apps/ios/project.yml` no longer embeds `WingtipWatch` (its target, tests and scheme stay) |
| Ask on Android | Extras › Ask (`ask`), and ML Kit GenAI out of the build: `genai-prompt` only with `-Pwingtip.genai=true` (`apps/android/app/build.gradle.kts`, `src/genai` or `src/nogenai`'s `NanoClient`) |
| The MCP connector | No app switch: `MCP_ENABLED=false` on production (`infra/docker-compose.prod.yml`), so no client registers |
| Practice and drills | Extras › Training Tools (`trainingTools`), the web and the iPhone (Android has no Practice); the diversion drill stays Nearest's |

A test of a parked feature turns its switch on first (the web's
`e2e/extras.ts` `extrasOn`, the iPhone's launch argument
`-extras.<key>`; Android's tests pass the switch in), and the listing,
screenshots, review notes and privacy answers leave them out
([listing.md](listing.md), [privacy-labels.md](privacy-labels.md)).

**The cuts.** Studio and the crash videos (the web's `features/studio`
and the replay's export parts, the planner's studio routers,
`services/jobs/crash`, `tools/msfs-agent`, `tools/xplane-driver`,
`infra/sim-trial`, the `crash-leads` service, the `sim` and `xplane`
check areas) moved to a local repository of their own,
`~/Developer/wingtip-studio`, with a history of the commits that made
them. The subscription's leftovers are deleted (the gateway's V47 drops
`subscriptions` and `paid_feature_uses`). adsb.fi is gone as a source,
its credits with it.

**Where the code departs from this review:**

- **The iPhone keeps the `audio` background mode.** The review took it
  for the radio's alone; the alerts ahead said aloud with the phone
  locked (`SpokenAlerts`, `CopilotVoice`) need it too, a safety
  feature. The review notes now give the spoken alerts as its reason
  (listing.md).
- **Follow's background rounds go to adsb.lol**, not adsb.fi: its
  globe's recent trace first, then its API by the address, with
  `ADSBLOL_API_KEY` now given to ingest (`wingtip/traffic/watched.py`).
  ADS-B Exchange's paid month is left to an open card. What adsb.fi
  alone heard (some UAT rebroadcasts) is not followed in the background.
- Two smaller ones: model weather is off on production by the server's
  setting rather than fetched "only while someone has it on", and
  another airplane's history is parked on the web too, not only in the
  store apps, so the three apps agree.

## How the cost is counted

- Lines of source, tests left out, on `claude/beta-prep` on 2026-11-21:
  - web: `apps/web/src/features/<name>`;
  - iPhone: `apps/ios/Wingtip`;
  - Android: `apps/android/app/src/main`;
  - the engine: `engine/crates`;
  - the server: `services/`.
- Browser specs: `apps/web/e2e` files on the feature.
- Feeds: outside data the server or the phone fetches for it.
- Audits and reviews: the store or security reviews it brings.

The lines are rounded. A feature's share of a shared module (the map,
the sheet) is not counted.

## Not in question

These are what the app is: the chart map, the route and its
checkpoints, the nav log, the Brief, the airport card, search, Nearest,
procedures and plates, airplane figures, offline packs, the account,
saved flights, the logbook, export and delete. Also Emergency, the alerts
ahead and own ship. The beta tests them; this page does not weigh them.

## The summary

| Recommendation | Features |
|---|---|
| Keep (8, and the small ones each table marks) | Instructor and endorsements; the Coach's approach lessons and debrief; airplane paperwork; the dry run; Ready to Fly and the departure window; sharing, the ForeFlight pack and the kneeboard; the radar loop; widgets and the Live Activity |
| Park (9) | The ATC copilot and clearance listener; the cockpit ADS-B receiver; another airplane's flights, Follow and history; model weather (the flow layer); 3D terrain and airspace (web); the Apple Watch app; Ask on Android (Gemini Nano); the MCP connector; Practice and drills |
| Cut (3) | Studio and the crash videos, out of this repository; the subscription's leftovers; adsb.fi as a traffic source |

## Teaching and instructing

| Feature | Who it is for | Cost | Recommendation | Why |
|---|---|---|---|---|
| Instructor role: endorsements (AC 61-65K), the 61.93 solo cross-country review, the 61.109 checkride tracker | CFIs and their students | Web about 1,500 lines; the gateway's endorsements and V26; iPhone `InstructorView`; specs instructor, instructor-lesson, checkride | **Keep** | No rival ties an endorsement to the student's own plan (the 2026-10-13 survey). The beta's CFI is there to judge it. Park it if they would not use it. |
| The Coach: approach briefs, the coached dry run, the quiz, the debrief against the procedure, instructor lessons | Instrument students, CFIIs | Web 400 lines plus `lib/approachLesson` and `approachDebrief`; iPhone about 800; Android `coach` 700; the engine's lesson rules; specs coach, approach-lesson, approach-debrief | **Keep** | It is the market gap (ForeFlight shows a plate but does not teach it), and the IFR tester's job. Revisit after the beta. |
| Practice and drills: the 91.125 light-signal and 91.155 flash cards, the holding-entry visualiser, the 91.185 lost-comms calculator, the diversion drill | Students before a checkride | Web about 800 lines; iPhone `Drills` 240; spec practice | **Park** under a "Training tools" setting | Flash cards and calculators are what every study app has (the market check of 2026-10-05). Each cited figure is one more to keep right. The diversion drill stays, as Nearest's. |

## Owning an airplane

| Feature | Who it is for | Cost | Recommendation | Why |
|---|---|---|---|---|
| Airplane paperwork: inspections (91.409, 91.207, 91.413, 91.411), the VOR check (91.171), squawks, due items and reminders | Owners and clubs | Web part of `pilot` (about 600 lines); the gateway's records and the reminder mail; specs inspections | **Keep** | Small. It keeps a pilot legal, which the 2026-10-11 rule keeps free. The mail is already the gateway's. |
| Passenger briefing | Pilots flying friends | iPhone `Passengers`, Android `briefing` (300 lines); spec passengers | Keep (not counted above: small) | Cheap, and it shares the plan. |

## In flight

| Feature | Who it is for | Cost | Recommendation | Why |
|---|---|---|---|---|
| ATC copilot and clearance listener (Comms Assist): the radio heard on the device, calls to us read into cards, the readback checked | VFR pilots in busy airspace | The engine's `radio` 3,800 lines; iPhone about 2,200; Android `atc`, `clearance`, `copilot` 2,300; web `atc`, `copilot` and `lib/atcListening`; specs copilot, clearance, radio-input; the ATCO2 evaluation | **Park**, and leave it out of the first submission's build: no `audio` background mode, no microphone foreground service | Already off by default (the owner, 2026-11-13). It brings the hardest review questions: Apple's 2.5.4 background audio with a screen recording, and Play's microphone foreground-service declaration with a video. A wrong readback is a safety claim. The first review goes faster without it. |
| Cockpit ADS-B receiver (GDL 90 from a Stratux or SkyEcho) | Pilots who carry one | The engine's `receiver` 1,900 lines; iPhone 320; Android 390 | **Park** until Apple grants the multicast entitlement | Without the entitlement the iPhone hears nothing, and the listing may not promise it (2.3.1). Android's `connectedDevice` declaration needs its own video. |
| The dry run, the side view and the altitude advisor | Every pilot, before the flight | Web `flying` 1,300 lines; Android `dryrun` 740; specs dry-run (4), profile | **Keep** | It is how a pilot checks the plan, and the Coach builds on it. |
| Ready to Fly, Go/No-Go, the FRAT and the departure window | Every pilot | Web 900 lines; iPhone `Ready` 400; Android `ready` 820; specs ready-to-fly, risk, departure-window | **Keep** | The look-and-go brief (the owner, 2026-11-16). |
| Widgets and the Live Activity (iPhone), the Live Update and the Next Flight widget (Android) | Pilots on the day | iPhone widgets and Watch together 1,750 lines; Android `widget`, `live` 960 | **Keep** | Native, small and asked by the review notes already. |
| Apple Watch app: timers, checklists, the nearest airports | Pilots with a Watch | Part of the 1,750 above; its own privacy manifest, icon and three screenshots | **Park**: leave it out of the first submission's build | It adds a screenshot set, a 2.5.16 question and a target to every iOS build, for three screens nobody asked for. Bring it back when a tester asks. |

## Traffic and airplanes

| Feature | Who it is for | Cost | Recommendation | Why |
|---|---|---|---|---|
| Traffic on the map from adsb.lol | Every pilot, for awareness | Web `traffic` 1,200 lines; the planner's `wingtip/traffic` 2,700; iPhone 1,200 | Keep (not counted above) | adsb.lol is ODbL, credited. It is internet data, said so on the map. |
| adsb.fi as a source | -- | A source in `wingtip/traffic`; `ADSBFI_OPEN_DATA` | **Cut** | Its terms are personal and non-commercial (the store-review audit's 8). adsb.lol already covers what it adds, but for UAT rebroadcasts. |
| ADS-B Exchange (RapidAPI) | Traffic adsb.lol misses | A source; 10,000 calls a month on the plan | Keep only if its plan allows a published app (launch-checklist.md) | Else cut it with adsb.fi. |
| Another airplane's past flights and replay, Follow (its takeoff and landing alerts), its NTSB cases, ownership history, documents filed and "usually based at" | Curious pilots, buyers | The planner's history 1,000 lines; ingest's SWIM, NTSB and radar tracks 740; web `replay` 2,200 (shared with Studio and the debrief); SWIM's Solace connection (about 45% of a core while idle, 2026-10-20); watched tracks kept 30 days | **Park** in the store apps for airplanes not the pilot's own; keep on the pilot's own | With the owner's name gone (decision 0054), a private airplane's flights and home field are still a person's movements, and 5.1.1(viii) reads on them. The SWIM feed takes about 45% of a core even while no one looks. The pilot's own airplane keeps all of it. |

## Sharing

| Feature | Who it is for | Cost | Recommendation | Why |
|---|---|---|---|---|
| The route's link, the ForeFlight content pack and the printed kneeboard | Pilots who fly with ForeFlight or paper, and instructors | Web `share` 530 and `shared-flight` 230 lines; Android `share` 390; the planner's `foreflight.py`; specs shared-flight, kneeboard | **Keep** | The pack is how the checkpoints, the one thing no rival has, reach the app a pilot flies with (the market check of 2026-10-05). |

## Weather and the map

| Feature | Who it is for | Cost | Recommendation | Why |
|---|---|---|---|---|
| The radar and satellite loop | Every pilot | Web 500 lines; iPhone 440; tiles from IEM and nowCOAST, fetched by the device | **Keep** | Cheap: the tiles never touch our server. |
| Model weather, the flow layer (wind and weather like Windy's) | Pilots who like Windy | Web `weather-flow` 1,700 lines plus deck.gl; iPhone `ModelWeather` 1,400; the weather service's flow 2,300 lines; GFS, NOMADS and DAFS fetched all day; the weather service's 768 MB; specs weather-flow, forecast-run, forecast-wind | **Park** behind the Map card's setting, and the weather service fetches it only while someone has it on | The biggest feed and memory for a layer pilots get free in Windy and ForeFlight. The prelaunch audit's server sizing turns on that memory. |
| 3D terrain and airspace (web only) | The web's pilots | Web `plan-map` terrain 2,300 lines; specs airspace-3d, terrain; the software-renderer fixes (f6687b100: 17 to 20 s frames on CI) | **Park** behind a setting on the web | No phone has it. Its specs are among CI's slowest (airspace-3d ran out its 120 s on PR #589), and no pilot has asked. |

## AI

| Feature | Who it is for | Cost | Recommendation | Why |
|---|---|---|---|---|
| Ask on the iPhone (Apple's on-device model; Private Cloud Compute optional) | Every pilot | iPhone `OnDevice` and Ask 1,600 lines; the AI evaluations' tests | Keep | On the device, nothing sent (decision 0041). The age rating asks its AI questions once. |
| Ask on Android (Gemini Nano through ML Kit GenAI) | Pixel and Galaxy owners | Android `ai` 1,700 lines; `mlkit-genai-prompt` | **Park**, and drop the GenAI library from the first build | ML Kit sends Google device identifiers and diagnostics (the store-review audit's 5). That is the Data safety form's only "Device or other IDs" row, for a model few phones have. The scanner and text recognition stay. |
| The MCP connector (a pilot's own Claude or ChatGPT) | Pilots who use those apps | The planner's `app/mcp` 980 lines; the gateway's OAuth connector 800 lines (open client registration, consent, tokens) | **Park** behind the server's switch until after launch | An OAuth server with open registration is the largest security surface the launch carries, for a use no tester will try in the beta. |

## The owner's tools

| Feature | Who it is for | Cost | Recommendation | Why |
|---|---|---|---|---|
| Studio and the crash videos: replays, accident reconstruction, the MSFS and X-Plane drivers, the crash pipeline | The owner's videos (developer role only) | Web `studio` 1,200 lines; the planner's studio routers 200; `services/jobs/crash` 1,400; `tools/msfs-agent` 1,350 (C#) and `tools/xplane-driver` 1,340; `infra/sim-trial`; the `sim` and `xplane` check areas; a cloud gaming subscription | **Cut** from this repository into its own, sharing the replay through a package | It is not for pilots, and every check, audit and wave reads it. Its own repository keeps the work and the subscription and takes it out of the app's CI. |
| The chart-labels workspace and the chart model's retraining | The owner, rating chart points | Web `chart-labels` 3,400 lines (developer only, its own chunk); `ml/`; the planner's `devml` | Keep, developer only | The checkpoints rank by that model, and the checkpoints are the product's lead. It costs a pilot nothing. |
| The subscription's leftovers: the web's SubscriptionPanel and `lib/subscription`, spec subscription, the gateway's subscriptions and `paid_feature_uses` (V19) | Nobody now | Web about 150 lines; the gateway 480; one migration's tables | **Cut** | The subscription is off at the owner's word (d0850f96) and the paid server features went with decision 0041 (the prelaunch audit's P9). The paywall, when it comes, is built new from the pricing decision. |

## What the beta should answer

- The CFI: would they use the instructor pages and the Coach with a
  student? If not, park them, and the training half of the listing goes.
- The IFR pilot: do the procedures, alternates and plates hold up?
  That is the IFR half of the listing.
- Everyone: which of the kept features did they never open? Each is a
  candidate for the next review.
