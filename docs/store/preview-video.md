# The App Preview video

A 15 to 30 second film of the app itself, for the App Store's product
page (it plays muted and loops before the screenshots) and, as a YouTube
link, Google Play's. Only screens the app has today; no mock-ups, no
renders. Planned 2026-11-09; recorded against the same throwaway stack the store
screenshots are taken from, never the owner's live one.

## What the stores take

| | App Store (App Preview) | Google Play (promo video) |
|---|---|---|
| Length | 15 to 30 s | any; 30 s to 2 min suggested |
| Size | 6.9" and 6.5" iPhone: 886 × 1920 portrait (or 1920 × 886); iPad 13": 1200 × 1600 | a YouTube URL, landscape preferred, not monetised, ads off |
| Format | H.264, 30 fps, .mov or .mp4, up to 500 MB, with a stereo audio track (silent is fine: Connect rejects some files with none) | YouTube's |
| Content | captured on the device; text and transitions allowed, no hands, no device frame needed | same film works, letterboxed or re-cut wide |
| How many | up to 3 per size and language | 1 |

The poster frame (the still shown before it plays) is picked in App
Store Connect: take the map with the route (second 2).

## The film: C81 to KDLH, 27 s

C81 (Campbell, Round Lake Beach IL) to KDLH (Duluth) is the planner's own
test route and the one FlowTests plans, so every screen below answers
from the same data the tests use. Captions are set over the top of the
frame in the brand's type, white on the navy at 85%, one at a time, at
most five words, and stay at least 2 s.

| # | Time | Screen (iOS) | Reached by | Caption |
|---|---|---|---|---|
| 1 | 0:00–0:03 | The map on the sectional, Class B and D rings, the route drawn | launch with `-tab fpl`, From C81, To KDLH, Plan | Your route on the FAA chart |
| 2 | 0:03–0:07 | The route box filling as the planner streams the legs; the figure strip (To, Dist, ETE, Fuel) | the same, after Plan | Planned in seconds |
| 3 | 0:07–0:11 | The Brief, verdict first | the Brief glyph beside the altitude (`Views/BriefView.swift`) | The verdict first |
| 4 | 0:11–0:15 | The nav log, scrolled once | route box •••, Nav Log (`Views/NavLogPage.swift`) | A nav log from the winds |
| 5 | 0:15–0:19 | KDLH's card: the weather now, D-ATIS and RVR | Airport tab, search KDLH (`Views/AirportCard.swift`, `Views/AirportLiveSections.swift`) | Live ATIS at the field |
| 6 | 0:19–0:23 | A call to us as the ATC card | Setup, Alerts, ATC on; a recorded call played to the simulator's microphone (`Atc/AtcCopilot.swift`, `Views/AtcCardRows.swift`) | Hears ATC for you |
| 7 | 0:23–0:27 | Downloads: a state picked, its size, the progress | Setup, Downloads (`Offline/DownloadsView.swift`) | Flies with no signal |

Left out, and why:

- **Pilot's view / 3D terrain.** Not on iOS (the map's pitch is off,
  `Views/ChartMap.swift` `isPitchEnabled = false`; the 3D view is the
  web's, `apps/web/src/features/plan/map/terrain`). It cannot be in an
  App Preview, which must show the iOS app.
- **Logbook auto-draft** ("Flight Logged", `Views/FlightLoggedSheet.swift`).
  It appears only when the flight recorder sees the airplane land and
  stop (`Logbook/AutoLogbook.swift`), which a simulator gets only from a
  GPX route played through Features, Location; worth a still in the
  screenshots, too slow to wait for in a 30 s film. A 30 s cut can swap
  shot 7 for it if the GPX is set up.

Shot 6 needs the radio: play a short ATC call addressed to the
simulated tail number (from the copilot's own test fixtures, not a real
recording of a real pilot) through the Mac's output into the
simulator's microphone input. If that cannot be made reliable, cut it
and run shot 5 and 7 a second longer each; do not stage a card the
copilot did not read.

## Capturing it

The simulator records its own screen at the device's pixels:
`xcrun simctl io <udid> recordVideo --codec=h264 <file>.mov`, stopped by
SIGINT. Driving the screens by hand while it records works for a first
cut. For a repeatable one, the UI tests drive the app:

- `WingtipUITests/FlowTests.swift` already has the first four shots in
  its flows: `testTheBriefOpens` (plan C81 to KDLH, open the Brief),
  `testARouteIsPlannedAndItsNavLogShown` (plan, •••, Nav Log) and
  `testAnAirportsCardOpensFromTheSearch` (KDLH's card).
- They assert and move on with no pauses, so a film from them is too
  quick to read. A dedicated `PreviewTests` (to be added in
  `apps/ios/WingtipUITests`, not yet written) should run the seven
  shots in order with a `sleep` per shot from the table, and leave the
  Setup steps (ATC on, a Downloads region) to it as well.

`scripts/dev/record-preview.sh` does the recording around any one test:
it boots the named simulator, starts `recordVideo`, runs
`xcodebuild test -only-testing:WingtipUITests/<Class>/<test>`, stops the
recording, then trims and scales it with ffmpeg in Docker to 886 × 1920,
30 fps, H.264 with a silent stereo track. Until PreviewTests exists,
give it `FlowTests/testTheBriefOpens`, the longest of today's flows.

```sh
WINGTIP_HOST=localhost:18443 scripts/dev/record-preview.sh \
  "iPhone 18 Pro Max" FlowTests/testTheBriefOpens docs/store/preview
```

Run it through `scripts/dev/one-at-a-time.sh` (it builds and tests in
Xcode), never against the owner's live stack, and with the simulator's
status bar set to Apple's marketing look first (`xcrun simctl
status_bar <udid> override --time 9:41 --batteryState charged
--batteryLevel 100 --cellularBars 4 --wifiBars 3`; the script does
this).

The captions and the cuts between shots are the last step, in an
editor (iMovie's App Preview project exports Apple's sizes) or with
ffmpeg's `drawtext` over the script's output; the film itself is not
committed (it is large and made again each release), only this plan
and the script.

## Google Play

Upload the same 27 s film to YouTube (unlisted is fine), ads off, and
paste its URL in the Play Console's Promo video field. Play also asks,
in the foreground-service declaration, for a short video of each
foreground service in use: Start Flight and the flight's position with
the screen off (location), the ATC copilot (microphone) and the ADS-B
receiver (connected device) on the Android emulator, recorded with
`adb shell screenrecord`; the shot for each and the text to paste are in
[foreground-services.md](foreground-services.md).
