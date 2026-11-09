# Store screenshots

What the App Store and Google Play show before anyone installs the app.
Every picture is the app's own screen, captured from a simulator against
a throwaway stack and framed by a script; nothing is drawn into a
capture.

| Folder | Store slot | Size |
|---|---|---|
| `iphone-6.9/` | App Store, iPhone 6.9" | 1320 x 2868 |
| `iphone-6.5/` | App Store, iPhone 6.5" | 1284 x 2778 |
| `ipad-13/` | App Store, iPad 13" | 2064 x 2752 |
| `android-phone/` | Google Play, phone | 1080 x 1920 |
| `raw/<device>/` | the captures they are framed from | as taken |

The headline over each is in `captions.json`, set in Barlow (the
brand's face, `design/tokens.json` `font.brand`) on the chart's green
(`color.brand.chart-land`).

## Taking them again

1. A throwaway stack on its own ports, never the live one:
   `docker compose -p wtshots -f docker-compose.yml -f <override>` with
   the planner on 18084 and the gateway on 18080/18443, the images
   already built (`--no-build`), and the FAA data cache mounted. The
   gateway's local certificate (`infra/local-https`) covers `localhost`;
   add its `ca.pem` to the simulator with `xcrun simctl keychain <udid>
   add-root-cert`.
2. A simulator of its own (`xcrun simctl create "Shots iPhone"
   com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro-Max …`), the
   status bar set with `xcrun simctl status_bar <udid> override --time
   9:41 --batteryState charged --batteryLevel 100`.
3. The UI test that drives the screens and writes each PNG:
   `xcodebuild -scheme Wingtip -destination id=<udid>
   WINGTIP_HOST=localhost:18443 TEST_RUNNER_SHOTS_DIR=<raw/iphone>
   -only-testing:WingtipUITests/StoreShotsTests test`
   (`apps/ios/WingtipUITests/StoreShotsTests.swift`; skipped without
   `SHOTS_DIR`). The same on an iPad Pro 13-inch simulator for
   `raw/ipad`.
4. `scripts/build/store-frames.sh` frames every capture at every size.
5. `docker compose -p wtshots down -v`, and delete the simulators.

The route is C81 to KDLH, the planner's own test route, on the day's
real weather, flown by N3429J (the N-number AircraftView's preview uses,
its type read from the FAA's registry): with no airplane picked the app
assumes none (docs/decisions/0011), and the nav log and the Brief's
verdict wait for one. The airport is O'Hare's card as it opens.

## What is not here, and why

- **The pilot's view (3D terrain):** only the web app has it; neither
  phone app does (`ChartMap.swift` turns pitch off), so it is not shown
  on either store.
- **The in-flight ATC card:** it appears only once the radio has been
  heard calling the airplane; a simulator has no radio, and a staged
  call would show something the app did not hear.
- **D-ATIS and RVR on the airport card:** they come from the FAA's SWIM
  feeds through the ingest service, which needs the owner's SWIM
  account; the throwaway stack has none, so the card is shown as it
  opens, and its headline claims neither.
- **The logbook draft:** it appears only after the phone has recorded a
  real flight's takeoff, landing and stop. Not captured yet; a GPX
  played through `xcrun simctl location <udid> start` at flying speed
  is the way to try.
- **Android (`android-phone/`):** not captured. The emulator cannot
  trust the throwaway stack's certificate (the app allows only HTTPS
  and trusts no user CA), so its captures wait for a debug-only network
  security config or a deployed site; `store-frames.sh` frames
  `raw/android/` at 1080 x 1920 once the PNGs are there.
