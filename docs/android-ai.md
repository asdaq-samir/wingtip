# AI on Android in Wingtip Maps

The owner, 2026-11-09: "I want all the AI features", meaning the app fully
AI-powered on every platform. The iPhone's plan is
[ios-27-ai.md](ios-27-ai.md) (Siri AI, Apple's on-device model). This page
is Android's: what Google offers today, read from Google's own pages and
Google Maven on 2026-11-09, what is built on `claude/android-ai`, what
was left out and why, and what needs a real phone to try.

The rules over all of it, as on the iPhone:

- **The engine decides every figure and rule.** AI explains and acts. Every
  sentence a model writes passes `FigureGuard` (`ai/FigureGuard.kt`): a
  sentence with a number the sources did not give (the engine's, the
  planner's, the FAA's report, the pilot's own words) is dropped, and the
  screen says how many were.
- **Warn, never limit.** The words and the agents never refuse a plan;
  the instructions every model is under say to warn, and the pilot decides.
- **On the phone only.** Gemini Nano where the phone has it. The
  server's Claude, once the fallback, was taken out on 2026-11-12
  ([decision 0041](decisions/0041-claude-taken-out.md)): a feature with
  no Nano on the phone is hidden (`ai/AiOffered.kt`).
  No AI at all is a working state, and every screen keeps its figures.
- **No assumed airplane.** With none chosen, Nano is told to give no
  airplane figure (`OnPhoneAsk.contextWords`).

## What Android offers (November 2026)

| Area | What it is | Version on 2026-11-09 | Source |
|---|---|---|---|
| AppFunctions ("Android MCP") | The app's actions and entities as tools Gemini and the system's agents discover and run on the phone; Android 16+; Gemini's use is a private preview with an early-access programme | `androidx.appfunctions:appfunctions` and `-compiler` **1.0.0-rc01** (4 Nov 2026) | [AppFunctions](https://developer.android.com/ai/appfunctions), [release notes](https://developer.android.com/jetpack/androidx/releases/appfunctions), [Google Maven](https://dl.google.com/android/maven2/androidx/appfunctions/group-index.xml) |
| Android intelligence system | AppFunctions, remote MCP, and Computer Control (an upcoming API for the OEM's assistant to drive any app's UI, no app code) | Preview | [Intelligence system](https://developer.android.com/ai/intelligence-system), [Android Developer Summit, 5 Nov 2026](https://developer.android.com/blog/posts/android-intelligence-system-in-app-agents-ads) |
| Connected Apps Platform | Reaching Gemini and Search with AppFunctions plus a remote MCP server; preview waitlist | Preview | same post, [Connected Apps](https://developers.google.com/connected-apps) |
| ML Kit Prompt API (Gemini Nano) | Text and image prompts, system instructions, typed (structured) output, tool declarations, multi-turn, thinking mode, prefix caching; checks and downloads the model through AICore | `com.google.mlkit:genai-prompt` **1.0.0-beta5** (26 Oct 2026); minSdk 26 | [Prompt API](https://developers.google.com/ml-kit/genai/prompt/android), [ML Kit GenAI](https://developers.google.com/ml-kit/genai), [Google Maven](https://dl.google.com/android/maven2/com/google/mlkit/group-index.xml) |
| ML Kit Agent API | `AgentRunner`: the tool-calling loop, sessions and guardrails over the Prompt API, discovering the app's AppFunctions | `genai-agent` **1.0.0-alpha1**; Android 14+, AICore Developer Preview | [Agent](https://developers.google.com/ml-kit/genai/agent/android), [get started](https://developers.google.com/ml-kit/genai/agent/android/get-started), [define tools](https://developers.google.com/ml-kit/genai/agent/android/define-tools) |
| ML Kit Summarization, Proofreading, Rewriting, Image Description | Task APIs over Nano | **1.0.0-beta1** (May 2025, on genai-common beta1) | [ML Kit GenAI](https://developers.google.com/ml-kit/genai) |
| ML Kit Speech Recognition, Speech Translation, Text to Speech, Embeddings | On-device speech and embeddings (EmbeddingGemma 2) | alpha | same |
| Gemini Nano 4 | Built on Gemma 4; function calling; Pixel 11 and Galaxy Z Fold8/Flip8 for now (nano-v4); nano-v2/v3 on Pixel 9–10, Galaxy S25–S26 and others | — | [ML Kit GenAI devices](https://developers.google.com/ml-kit/genai), [I/O '26 post](https://android-developers.googleblog.com/2026/05/android-ai-intelligence-system.html) |
| ML Kit text recognition | On-device OCR, through Play services (no model in the APK) | `play-services-mlkit-text-recognition` **19.0.2** (26 Oct 2026) | [Google Maven](https://dl.google.com/android/maven2/com/google/android/gms/play-services-mlkit-text-recognition/maven-metadata.xml) |
| App Actions | Google Assistant opening an app's feature by voice (`shortcuts.xml` capabilities, built-in intents such as `OPEN_APP_FEATURE`) | — | [App Actions](https://developer.android.com/develop/devices/assistant/overview) |
| On-screen context | No new Android API: the Assist API's `Activity.onProvideAssistContent` (a web link and schema.org JSON-LD) is what an assistant asked "about this screen" reads; Computer Control is the OEM assistant's, not the app's | platform | [AssistContent](https://developer.android.com/reference/android/app/assist/AssistContent) |
| Firebase AI Logic | Gemini in the cloud, with hybrid on-device/cloud routing | `firebase-ai` 18.1.0 | [Android AI](https://developer.android.com/ai/gemini) |

Firebase AI Logic is **not used**: it is Gemini in Google's cloud, paid
per call, and the app's AI stays on the phone (the server's Claude was
taken out on 2026-11-12, decision 0041).

## What is built

### Gemini and the system's agents (AppFunctions)

`ai/functions/WingtipFunctions.kt` declares fourteen functions; the
AppFunctions compiler (KSP) writes the service the manifest binds
(`WingtipFunctionService`, `BIND_APP_FUNCTION_SERVICE`) and the schema
the system indexes (`assets/wingtip_functions.xml`). The answers are
`WingtipActions`'; the descriptions are `FunctionWords`' constants; the
app-wide instructions are `res/xml/app_functions_metadata.xml`.

| Function | What an agent gets | Entity |
|---|---|---|
| `findAirport` | Name, place, elevation, METAR and TAF as sent, flight category, runways, towered | `AirportEntity` |
| `searchAirports` | Fields matching words | `AirportEntity` |
| `nearestAirports` | Nearest fields from the last position, distance and bearing | `NearestEntity` |
| `airportFrequencies` | NASR's frequencies | `FrequencyEntity` |
| `airportApproaches` | d-TPP charts | `ApproachEntity` |
| `plannedRoute` | Waypoints, airplane, altitude, distance, ETE, fuel | `RouteEntity`, `WaypointEntity` |
| `routeNotams` | The route's NOTAMs, ranked by the engine | `NotamEntity` |
| `briefVerdict` | The Brief's last Go / No-Go and findings | `BriefEntity` |
| `myAirplanes` | The pilot's airplanes (signed in) | `AirplaneEntity` |
| `logbookFlights` | The latest logbook flights (signed in) | `LogbookEntryEntity` |
| `openScreen` | Any screen by its id (design/screens.json) | `OpenedEntity` (PendingIntent) |
| `planRoute` | The app opened on a route the planner then works out | `OpenedEntity` |
| `showAirport` | The app opened on a field's card | `OpenedEntity` |
| `openEmergency` | The Emergency Assistant at once | `OpenedEntity` |

The app also answers the **Assist API** (`ai/ScreenContext.kt`): asked
about the screen, an assistant gets the planned route as the site's link
and as schema.org JSON-LD (a Trip by way of its airports), Android's
counterpart to the iPhone's View Annotations. And **App Actions**:
`scripts/build/screens.py` generates `res/xml/shortcuts.xml` from
design/screens.json's `shortcut` ranks, fifteen shortcuts (Brief,
Nearest, Emergency Assistant and Ask first on the launcher's long press),
each bound to `OPEN_APP_FEATURE`.

### Gemini Nano in the app

| Screen | Capability | Where it runs | Code |
|---|---|---|---|
| Ask | The question answered by Nano with the app's AppFunctions as its tools ("plan KPAO to KSQL", "what's the weather at my destination", "open the emergency assistant"), "Answered on this phone" under it, the tools' answers as source chips | Phone; tools ask the planner as the screens do. No Nano: "Ask needs Gemini Nano on this phone" | `ai/OnPhoneAsk.kt`, `ai/functions/AgentTools.kt`, `api/Assistant.kt` |
| Brief / Go-No-Go | In Plain Words: the verdict and findings | Phone | `ui/BriefScreen.kt` |
| Airport card | In Plain Words: the METAR (with the planner's decoded wind, ceiling, visibility) and TAF | Phone | `ui/AirportScreen.kt` |
| NOTAMs (Ready to Fly) | In Plain Words: which matter and why, each by its number | Phone | `ready/ReadyToFlyRow.kt` |
| Route / nav log | In Plain Words: legs, altitude, time, fuel | Phone | `ui/FPLScreen.kt` |
| Coach | In Plain Words: the debriefs' weak areas | Phone | `coach/CoachScreen.kt` |
| Logbook | Draft a Remark from the entry's facts, into the field to edit | Phone | `logbook/LogbookEntryRow.kt`, `ai/AiDraftButton.kt` |
| Documents: clearance, logbook page, handbook page (Airplane profile) | The photo read on the phone: ML Kit text recognition, then Nano into the read (`LogbookPageRead` and `HandbookRead`, the engine contract's own types, and `ClearanceNote`, its JSON shape sketched from the class), checked by the engine on the phone (`logbook_read_check`, `handbook_read_check`); "Read on this phone" in its notes | Phone only; a page Nano cannot read is said so, and nothing is sent | `ai/read/OnPhoneReader.kt`, `documents/Documents.kt` |
| Setup | On-Phone AI: whether Nano is here, Add Gemini Nano where Android can fetch it | Phone | `ai/OnPhoneAiRow.kt` |
| Map | Assist API's route context | Phone | `MainActivity.kt` |

### Choices, and the current alternative

- **AppFunctions 1.0.0-rc01 over the Agent API's AppFunctions path.**
  `genai-agent` 1.0.0-alpha1 is built against AppFunctions alpha13: it
  references `androidx.appfunctions.metadata.AppFunctionName`, which
  beta01 moved to `androidx.appfunctions`, so with rc01 its discovery
  would fail at run time. Ask therefore runs the Prompt API's own tool
  calls (`Nano.converse`, at most four rounds), with the tools read from
  the AppFunctions schema itself (`FunctionSchemaXml`), so Gemini and
  Nano are given the same tools from one source. Swap to `AgentRunner`
  when a genai-agent built on AppFunctions 1.0 ships.
- **The Prompt API over the task APIs.** Summarization, Proofreading and
  Rewriting are still 1.0.0-beta1 from May 2025 on genai-common beta1,
  beside the Prompt API's beta5; one model client does every task here.
- **JSON sketched from the read's class over `@Generable`.** The Prompt
  API's typed output needs a hand-written `@Generable` copy of each read;
  the read's own classes, the engine contract's generated types where it
  has them, are the source instead (`SchemaSketch`), and a read that does
  not decode is said so on the phone.

## Left out, and why

- **Generated words in the Emergency Assistant and the ATC readback.**
  In an emergency the engine's guidance is shown as it is; a model's
  words would add time and a second voice. A readback must be the
  clearance's own words, which the engine's `readback_check` holds; a
  model's draft is not one. Gemini can open the Emergency Assistant at
  once (`openEmergency`).
- **The weather loop.** Its frames are radar pictures; Nano can describe
  an image, but no figure in such words would come from the engine.
- **Voice in Ask.** Speech stays the phone's on-device recognizer
  (`createOnDeviceSpeechRecognizer`), the owner's rule; ML Kit's GenAI
  speech recognition is alpha.
- **iPhone intents with no Android function yet:** Direct To, Am I ready
  to fly, weather on arrival at the ETA, brief an approach, start the
  flight, keep for the air, log this flight, fly an airplane. Each needs
  either a link the app does not have (Direct To) or facts gathered by a
  screen's model (Ready to Fly, the approach brief); they are next, as
  AppFunctions opening the screen with its action.
- **Firebase AI Logic**: above.

## What needs a real phone

The checks here compile, lint and unit-test; none runs a model.

1. **A phone with Gemini Nano** (Pixel 9, 10 or 11; Galaxy S25 or S26;
   Galaxy Z Fold8 or Flip8; ML Kit's list is the authority), with AICore
   up to date (the Agent API asks Android 14 or later). Setup › On-Phone AI should say Nano is
   here (or offer Add Gemini Nano).
2. **Ask on the phone:** "What's the weather at KPAO?", "Plan KPAO to
   KSQL", "Open the emergency assistant"; the answer says "Answered on
   this phone", with the tools' answers as chips, and a sentence with a
   figure no tool gave is left out.
3. **In Plain Words** on the Brief, an airport card, Ready to Fly's
   NOTAMs, the FPL tab and the Coach; and Draft a Remark in a logbook
   entry.
4. **A photo read on the phone:** a clearance in shorthand, a logbook
   page, a handbook page, with the phone in airplane mode once Nano is
   there: "Read on this phone" in the notes.
5. **AppFunctions** (Android 16+): `adb shell cmd app_function
   list-app-functions --package app.wingtipmaps.android.native` lists
   the fourteen; `adb shell cmd app_function execute-app-function ...`
   runs one. Gemini itself calls them only for apps in Google's early
   access programme (the [EAP form](https://forms.gle/GN5ybjQFhzHRCguM7)
   is the owner's to send).
6. **Assist:** with a route planned, "ask about this screen" in Gemini
   should know the route.
7. **App Actions:** a long press on the icon shows Brief, Nearest,
   Emergency Assistant and Ask; "Hey Google, open Nav Log in Wingtip
   Maps" needs the app on Google Play with the capabilities registered.

## Privacy

On the phone first; see docs/privacy-inventory.md, docs/legal/privacy.md
("Assistants on your phone") and
docs/store/privacy-labels.md.
