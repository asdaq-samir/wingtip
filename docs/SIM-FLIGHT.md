# The scripted test flight

A simulator flies a whole flight, and the apps follow it as they would
follow a real one. The default flight is KBFI to KPAE, which the free
X-Plane 12 demo can fly, as its scenery is only the Seattle area's: off
Boeing Field's runway 32L, a climb to 3,000 ft, the RNAV (GPS) RWY 34L at
Paine Field from RARYO, a full-stop landing and a stop on the runway. It
takes about 20 minutes. The other kept flight, KMSN to KOSH (the RNAV
(GPS) RWY 36 at Oshkosh from WIGIH, about 40 minutes), needs the full
X-Plane 12 (`SIM_FLIGHT=tools/sim-flight/flights/kmsn-kosh-r36.json`).

On the way, a browser test checks that the in-flight features work
together, end to end, as no unit test or spec can. It is not part of CI,
because no runner has a simulator.

**When to run it:** weekly, and before a release (the App Store or Play
build, or a wave that touches own ship, flying mode, alerts, traffic or
the logbook).

## What it checks

The browser test is `apps/web/e2e/sim/flight.sim.ts`. Each check is soft,
so one flight reports all of them:

| Check                  | How                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The nav log's progress | FlyingHead's next checkpoint is shown in the air (90% of fixes), only moves on, takes the script's checkpoints in order (RARYO, USDAW, ZEREN, KPAE; KMSN's: WIGIH, DOCEN, WIVLI, JUMVO, KOSH), and its distance comes down                                                                                                                                                                                                                                              |
| The alerts ahead       | Every answer of the planner's `/airspace/ahead` is recorded, as the real planner gives it. The script's expected airspace is found in its phases: the Seattle Class B on departure and Everett's (Paine Field's) Class D on the arrival; Madison's Class C and Oshkosh's Class D for KMSN. What the planner finds is said over the map within 3 s (AlertsBanner). TFRs, terrain and obstacles are reported as the FAA's data has them that day: the planner's own tests (`test_alerts.py`) cover the rules. |
| The traffic            | The script's crossing airplane, N4SIM in both flights (500 ft above, crossing ahead); own ship is N1SIM is drawn about the map (TrafficGl's `traffic-marks` probe). `/traffic` is answered with the script's traffic, since adsb.lol's sky has no simulator in it.                                                                                                                                                                                                                |
| The wake lock          | A Screen Wake Lock is held while flying (95% of fixes) and let go a minute after landing. A stand-in for `navigator.wakeLock` records it. This needs `useScreenAwake` (claude/owner-recs).                                                                                                                                                                                                                                           |
| The auto-logbook       | "Flight Logged" is offered after the stop, with the script's landings (one, day or night) and a route that names MSN and OSH. Nothing is logged.                                                                                                                                                                                                                                                                                     |
| The work a fix         | The waste audit's measures (2026-11-21), counted for every fix: the engine's calls by rule at the WebAssembly boundary every `callEngine` crosses, and the page's DOM mutations. The p95 of each is held to the script's budgets once the page has settled (after 30 fixes), and so is `magnetic_variation` per fix (about one a mile).                                                                                              |
| The GDL 90 stream      | Every datagram sent to the phones is read back by the engine's `receiver_read`, in the planner's container, and held to the simulator's state: position to 0.0001°, altitude to 25 ft, speed to 1 kt, track to 1.5°, and the traffic heard.                                                                                                                                                                                          |

The report (`report.md`) lists each check, the work per fix (p50, p95,
max), the engine's 15 busiest rules per fix, and the checkpoints shown.

## How it fits together

```
X-Plane 12 ── plugin (tools/xplane-driver: flight.py, route.py) ── state line, UDP :49010 ──┐
MSFS 2024 ── agent --feed (tools/msfs-agent) ─────────────────────────────────────────────────┤
                                                                                              ▼
                                       feed (tools/sim-flight, on the Mac)
                       │ GDL 90, UDP :4000 broadcast                    │ GET /state, /scenario
                       ▼                                                ▼
          iPhone / Android receiver                      browser test (Playwright, in Docker)
          (a Stratux's port)                             → the web app's GPS (a fake geolocation)
```

- **The flight script** (`tools/sim-flight/flights/*.json`) holds the
  plan's address, where X-Plane's flight starts and about how long it
  takes, the points in order, the speeds and rates, own ship's and the
  scripted traffic's address and call sign (each airplane one of its own,
  named only there), the simulator's scenery tiles where it has few (the
  demo's, which every point is checked to lie in) and what to expect. The fixes, runway ends and
  altitudes come from the FAA's CIFP, cycle 2610. The speeds are the
  test's own round figures for a 172, not figures the app states.
- **The plugin** flies the script in one of two modes (`install --fly`):
  - `path` (the default) places the airplane on the path every frame,
    with X-Plane's flight model off, the same flight every time;
  - `autopilot` gives X-Plane's own flight model and autopilot the
    flight from the climb-out to JUMVO. The plugin turns the heading bug
    to a point 1.5 km ahead on the path and sets the altitude and
    vertical speed dials. It takes the airplane back for the landing.

  On the ground the airplane sits on X-Plane's runway (a terrain probe),
  not at the FAA's elevation. Once a second the plugin sends the
  airplane's state, read back from X-Plane, to the feed.

- **The feed** (`python -m sim_flight feed`) needs only the standard
  library and `wingtip.units`. It sends each state as GDL 90 (Heartbeat,
  Ownship, Geometric Altitude, a Traffic Report a scripted airplane) and
  serves it to the browser test. It keeps everything it was sent and
  everything it sent in the run's folder.

## Running it

What it needs from the owner, once:

1. X-Plane 12 and XPPython3; `scripts/dev/xplane-trial.sh check` prints
   the steps. The free demo has only the Seattle area's scenery
   (XPLANE-TRIAL.md, "The demo's limits"): the default KBFI-KPAE flight
   is in it, and its 60-minute session holds it; **the KMSN-KOSH flight
   needs the full X-Plane 12**. The demo's installer needs a click to
   install (XPLANE-TRIAL.md, "Installing the demo"), and X-Plane needs
   the Mac unlocked with its display awake.
2. The live stack up: `scripts/dev/go-live.sh --up`.
3. The phones, optionally: on the same Wi-Fi with Receiver on, they hear
   own ship (N1SIM) and the crossing N4SIM as from a Stratux.

Then:

```
scripts/dev/sim-flight.sh check
scripts/dev/sim-flight.sh install            # or: install --fly autopilot
scripts/dev/sim-flight.sh run                # waits for the simulator, then follows it
```

In X-Plane: New Flight, the Cessna 172 SP at the flight's start (`install`
names it: KBFI on runway 32L by default) with the engine running, then
Start Flight. The plugin starts 8 s after the flight
loads, or from Plugins › Wingtip replay › Fly the test flight. Hands off
until the airplane has stopped at the destination. The browser test waits up to four
more minutes for the logbook and one more for the wake lock.

The run's folder is `~/wingtip-sim-flight/<time>-flight`:

| File                            | What                                                |
| ------------------------------- | --------------------------------------------------- |
| `report.md`                     | The checks and the work per fix                     |
| `results.json`                  | The browser test's checks and measures              |
| `states.jsonl`                  | Every state line from the simulator                 |
| `gdl90.jsonl`, `readback.jsonl` | Every datagram sent, and the engine's reading of it |
| `feed.log`                      | The feed's own lines                                |

The plugin's log is X-Plane's `Output/wingtip/flight-log.txt`.
`scripts/dev/sim-flight.sh report <folder>` writes the report again.

The browser run goes through `scripts/dev/one-at-a-time.sh`, as every
browser run on the Mac does. The feed and X-Plane run outside it. Close
other heavy work first: X-Plane and Chromium together want most of the
Mac's memory.

### MSFS

The MSFS agent replays a Studio track (`tools/msfs-agent`,
`infra/sim-trial/README.md`). Started with `--feed <host>:49010`, it sends
each pose it places as a state line, and the feed takes it as it takes
X-Plane's. A recorded KMSN-KOSH flight from the Studio
(`prepare-track.sh <N-number> <day>`) is then the flight. The instance is
on AWS, so the feed's port must reach it, for example through an SSM port
forward. A track has no script, so the script's checkpoints, phases and
traffic go unchecked ("not run" in the report). The rest is checked as
with X-Plane.

## Unverified until the first flight

Nothing here has been run against a simulator yet (2026-11-21). The unit
tests stand in for X-Plane with a stub of XPPython3. The first flight
finds out:

- that X-Plane updates its latitude, longitude and elevation from the
  local position the plugin writes with its flight model off (the replay
  trial asks the same);
- XPPython3's `probeTerrainXYZ` and `localToWorld` as the plugin calls
  them;
- in `autopilot` mode, that the Cessna's autopilot takes HDG and VS from
  `sim/autopilot/heading` and `vertical_speed` after `servos_on`, and
  holds the dials the plugin sets;
- that Docker Desktop's host networking lets the browser container reach
  the feed at `localhost`, as `branch-specs.sh` reaches the stack;
- the budgets, set from the waste audit's expectations, which the first
  flights will tighten.
