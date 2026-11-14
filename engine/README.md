# engine

Wingtip's Rust: the engine (`facade/`), over its crates (`crates/`), its
contract (`contract/`) and its three faces (`bindings/`).

The engine is the lowest of the project's four layers: under the planner
(FastAPI, which works out a flight and asks the engine every rule), Spring
Boot (accounts and saved records; it holds no aviation logic, and asks the planner for a
figure such as a pilot's currency) and the apps (web,
iOS, Android, which draw and ask the engine the rest). Every aviation
rule and figure belongs here once; the ones still written in Python,
Java, TypeScript, Swift or Kotlin are listed, in the order they move, in
issue #482.

- `facade/` (`wingtip-engine`): the figures that must come out the same
  wherever they are worked out -- route options' straight lines over the
  grid, whether an airspace volume holds a point, and the cycle pack's
  reader (its format is in `crates/airspace/src/pack.rs`). A facade over
  the domain crates in `crates/` (below): it holds `call.rs`, the one
  dispatcher, and uses each crate's modules at the paths they had when
  the engine was one crate (`wingtip_engine::gonogo`, `::pack` ...), so
  `bindings/py`, `bindings/ffi`, `bindings/wasm` and the tests name them
  as before. Plain Rust
  with no dependencies but its own crates (its build script's aside, below), so it builds as it is for the phones: aarch64-apple-ios
  (the native iOS app, from Swift) and aarch64-linux-android (the native
  Android app, from Kotlin), both through `bindings/ffi`.
  Keep it that way: no PyO3, no host-only crates, no network, and files
  read from bytes the caller maps.
- `bindings/py` (`wingtip_native`): the engine as wingtip imports it, through PyO3. It
  only carries arrays and mapped files across; every figure is the
  engine's. wingtip imports it at module level, so every image that copies
  services/planner/wingtip needs it: the planner, the pipeline stages and ML are each built
  FROM wingtip's base image (services/Dockerfile.base), which compiles it
  and installs it with wingtip's requirements once for all of them
  (services/planner/tests_wingtip/test_dockerfiles.py holds every such image to it). A new image
  that reads wingtip is built FROM it too.

## The engine's crates

`crates/<name>` (`wingtip-<name>`), each a layer that may use only the
ones under it, so the compiler keeps the direction (core cannot reach for
the Go / No-Go) and a build or a test can take one area alone
(`cargo test -p wingtip-weather`). The layers come from the modules'
own uses of each other when the engine was one crate; two that use each
other share a crate. Like the engine, none has a dependency outside the
workspace but the few named below ("Outside the workspace"). The table below is held to the crates' Cargo.toml files by
`scripts/ci/engine_layers.py` (CI's test job and check.sh's engine area):
a crate's wingtip-* dependencies must be its "Uses" exactly, "route
(without its options)" with route's default features off, and a binding
reaches the crates through the facade alone. A new dependency changes the
table, and its why below, in the same commit.

| Crate | Modules | Uses |
|---|---|---|
| `core` | geo, flat (nm east and north of a point, the small flat frame), wmm, grid, sums, time, json, xml, sort, text (a whole number with its thousands grouped, "12,500"), units (the SI's foot, nautical mile and kelvin, one copy), ask (a rule's input read by its name, for every crate's `call`), faa_case (the FAA's capitals in sentence case with its codes kept, the one copy: wording's `faa_words` and a TFR's purpose) | nothing |
| `flight` | flight (the wind triangle, 91.159's altitudes, 91.151's reserve, the atmosphere, the turnaround and cruise reference), performance (the airplane's cruise and climbs in the day's air), limits (the altitudes a flight may be planned at: 71.33, 91.119(c), 91.121, 91.159, 91.179), filing (FAA Form 7233-4's items), sun (1.1's night and 61.57(b)'s night-passenger period), vfr (91.155's minimums, one copy), field (whether a field is open: NASR's ARPT_STATUS, O alone; decision 0043; and whether it is military or joint) | core |
| `weather` | metar, sky (a report's ceiling and its cover, for the station model), taf, winds, forecast (with run: the dry run against the forecast), validity, notam, notam_read (a NOTAM as a pilot reads it: its keyword as a heading, its words written out, its window) over contractions (the FAA's contractions, the one table, which the radio's D-ATIS reads by too), notam_rank (the NOTAMs that matter to a flight, best first), tfr, cycles, rvr (RVR against a minimum, 91.175(h)'s table), ready (ready to fly: what the device holds against the cycles and the weather's age; kept: a kept answer's age), worse (a route's weather worse since the briefing) | core, flight |
| `procedures` | figures (debrief, diversion, endurance (91.151(a) and 91.167(a)(3)'s reserve kept back), holding, lost comms, words), paths (a procedure's legs as drawn: arcs, CIFP holds, procedure turns), occurrence (an accident report, the registry and an ADS-B track as one airplane: the Studio's crash drafts) | core, flight |
| `radio` | clearance, callsign (our call sign and where it was said, AIM 4-2-3 c, 4-2-4), instruction (an instruction heard in flight read into its items), readback (AIM 4-4-7 b), atc (the ATC copilot's `atc_call` and `readback_check`), atis, datis (a digital ATIS as the tower's data link writes it), mayday (the distress call, AIM 6-3-2), guidance (an emergency's general good practice with no airplane picked) | core, flight, weather, procedures |
| `pilot` | pilot (a checklist, the logbook's CSV, endorsements, currency and 61.109, records: endorsements' days, 61.93(d), inspections and 91.171), autolog (a logbook entry drawn from a flown track: 1.1, 61.1(b), 61.57), aircraft (with figures: an airplane's figures and where each comes from, and what a figure lacks), documents (a photographed page's figures checked before the pilot sees them), coach (a pilot's proficiency plan: what is due under 61.56 and 61.57, the weak areas their debriefs show, the sessions) | core, flight, procedures, route (without its options) |
| `brief` | gonogo, runway (with marks: a field's wind on the map), alternates (91.169's IFR alternate), fields (the best fields to land at: a glide or a diversion), icing_forecast (the AWC's forecast icing on an IFR route), passengers (the passengers' SAFETY briefing, 91.107(a)) | core, flight, procedures |
| `route` | route (and its options: route options' grid and ways, fuel stops, the way round high ground, Class B detours), motion (with along: where the airplane is on the route; fuel_left: the fuel the plan leaves in flight, from the last fuel stop, less each start and taxi), approach, navlog | core, flight, weather, procedures |
| `airspace` | airspace, pack, rules, pack_query, view, spoken (with spoken_ask: the places a clearance names and its SID and STAR, `clearance_places`), ahead, drills (91.125's light signals and 91.155's minimums as cards and by name) | core, flight, procedures, radio |
| `wording` | wording (with script: the radio calls' words) | core, procedures, airspace, brief, route (without its options) |
| `altitude` | altitude (the floor, the band, the cruising altitudes, the selection and its words, the cautions on a pilot's own altitude, 91.119(b)'s congested areas) | core, flight, weather, procedures |
| `inflight` | watch, checks, message (`copilot_watch`: the in-flight copilot's ranked messages), fields (its alternative: brief's best_fields in diversion mode, held to its weather and fuel checks) | core, flight, weather, procedures, brief |
| `receiver` | frame, message, report, uplink, dlac, fisb, nexrad, picture (a portable ADS-B receiver's GDL 90: own ship, its traffic, FIS-B's text and NEXRAD; AIM 4-5-7, 4-5-9), views | core |
| `facade/` | call | all of them |

Why these lines:

- `core` is the ground: distances, magnetic variation, the grid, dates
  and the JSON and XML every rule reads and writes, used by all. It holds
  no aviation rule; its WGS-84 geodesics are asked by name
  (`distance_nm`, `bearing_deg`, `destination`), so no app keeps its own
  great-circle arithmetic.
- `flight` holds the flight's own rules (the wind triangle, 14 CFR
  91.159's cruising altitudes, 91.151's reserve, the atmosphere), and
  takes `core` for the JSON and the input reader its rules are asked
  through and the SI's kelvin its atmosphere is worked in. It is a
  crate of its own, not part of `brief`, because `procedures` (the
  diversion's triangle, the fuel strip's reserve) uses it and `brief`
  sits above `procedures`; `weather` reads it too, for the standard
  atmosphere's lapse rate a temperature aloft is carried past its levels
  with (winds.rs).
- `weather` reads the products the hosts fetch: the AWC's cache files
  into the shapes the weather store keeps (`forecast::awc`), what they
  say along a route (`forecast::route`), a field's hours for the airport
  card (`forecast::hours`) and the winds and temperatures aloft at an
  altitude (winds.rs). The basic VFR minimums its "VFR flight not
  recommended" reasons are held to are `flight`'s (vfr.rs), which
  `airspace`'s rules.rs uses too.
- `procedures` sits just above them because its `figures::words` (a number
  written as the web writes it) is shared by the Go / No-Go, runways,
  routes, the airspace rules and the wording.
- `route` takes `flight` and `weather` for route options
  (`route/options`): 91.159's cruising altitudes and 91.151's reserve,
  and a report's flight category, read onto the grid.
- `gonogo` and `runway` are one crate, `brief`: the Go / No-Go's runway
  check goes by the runway pick, and the runway rules read their input
  with the Go / No-Go's helpers, so each uses the other.
- `radio` takes `weather` for `datis`: a D-ATIS's weather is a METAR's
  groups, read by `metar`, the rest as `atis` reads a spoken one.
- `airspace` takes `radio` because `spoken` finds the places a clearance
  names (it stays in `airspace`, not `radio`, as it reads the phone's
  packs through `pack` and `pack_query`, which `radio` is under), and `figures` because `rules` writes its figures with
  `figures::words`; `wording` sits on top of it for `rules`' entry rules
  and call types by class, and on `brief` and `route` for the radio
  script's runway words and its 3:1 ten-mile altitude (`route` without
  its `options`).
- `altitude` takes `flight` for 91.159's lowest altitude and the limits,
  `weather` for the TAF's reach round a field (`forecast::field`), and
  `procedures` for `figures::words`, which its words where no altitude
  fits are written in; nothing above it uses it but the facade.
- `route` takes `flight` for the nav log: its legs fly the wind triangle
  and the airplane's performance, which sit in `flight` because the
  altitude selection needs the service ceiling on the day from them too.
- `receiver` reads bytes a receiver sent into what it says, and needs
  only `core` (its JSON and Base64): the METARs and TAFs it is sent are
  handed on as sent, for `weather` to read where a screen asks, so it
  sits beside `weather`, not on it.
- `call.rs` dispatches every rule, so it alone stays in the facade, over all;
  it answers none itself: each rule is its crate's function, named in its
  contract file.

### Outside the workspace

What the phones and the WebAssembly carry is plain Rust the engine holds
itself, with these exceptions, each weighed for its bytes and its build
(`scripts/ci/engine_layers.py` holds the crates to this list, its
`OUTSIDE`):

- `base64` (receiver's `calls`): the bytes a host hands `receiver_read`
  in JSON, RFC 4648's standard alphabet, the maintained Rust codec rather
  than one of our own. Its default `simd-unsafe` feature is off, so it is
  plain safe Rust; the web asks no receiver rule, so it is not in the
  WebAssembly. GDL 90's own frame check stays receiver's table
  (`frame::crc`): the specification's Crc16Compute adds each byte after
  the table, which no catalogued CRC (the `crc` crate's) does.
- `crc32fast` (airspace's `pack`): the cycle pack's checksum, zlib's
  CRC-32, the stock crate rather than a table of our own. No system
  library; the web's rules never verify a pack, so it is not in the
  WebAssembly.
- `geographiclib-rs` (core's `geo`, with `libm` under it): the geodesic
  on the WGS-84 ellipsoid, Karney's algorithm as GeographicLib and PROJ
  have it, a georust port, MIT, rather than a Vincenty of our own. Plain
  Rust; its default `accurate` feature (the polygon area's sums) is off.
  It is in the WebAssembly, since every app's distance is asked there.
- `similar` (airspace's `spoken`): how alike two sounds are, a word heard
  and a fix's letters, as a diff's ratio, mitsuhiko's diff crate rather
  than a port of Python's difflib of our own. Its features are off (no
  text or Unicode layer); the web asks no clearance's places, so it is
  not in the WebAssembly.

A build-dependency runs on the host when a crate is built and is in no
build of the engine, so it needs no entry: the facade's `build.rs` reads
the rules' contract files with `serde_json`. A dev-dependency is the
tests' alone.

Inside a crate, the modules under it are used at the root by the names
they had in the one crate (`use wingtip_core::json;` in its lib.rs), so
the code still reads `crate::json` and the move changed no rule. A new
module goes in the lowest crate whose modules it needs; one that would
need a crate above its own belongs higher, never in a cycle.

## The contract, and adding a rule

Each rule says what it is in one file beside its code:
`crates/<crate>/contract/<name>.json`, named for the rule; the facade
answers none itself. The file is the rule's entry in the contract -- its description, with the
AIM, 14 CFR or ACS source of each figure, and its `input` and `answer` as JSON Schema -- and two members
for the build: `"x-call"`, the Rust function that answers it (a path
from the facade, `fn(&str, &Value) -> Result<String, String>`, which gets
the name, so one function may answer several), and `"x-feature"` where a
cargo feature gates it (route options' `"route-options"`). A type several
rules share is a file of its own in a `contract/definitions/` folder: the
crate's, or `contract/definitions/` here where more than one crate's rules
use it.

Nothing lists the rules by hand. `facade/build.rs` reads the files'
`"x-call"`s into the table `call.rs` looks a name up in, and
`contract/gen` (`wingtip-contract-gen`) assembles the files into
`contract/engine.schema.json`, rules and types in order of name, with the
build-only members left out. That file is committed, as the apps and the
gateway's image read it, and generated: `cargo run -p
wingtip-contract-gen` in `engine/` writes it, and its test (in CI's
engine line) fails where the committed one is not what the files give.
Two branches that each add a rule add two files, and the contract's lines
each one changes are its own.

The apps' types come from the contract rather than from hand-written
copies: the web's `apps/web/src/lib/engine/contract.ts`
(json-schema-to-typescript, in `npm run types`), which types `callEngine`
by name, so a renamed field fails the web's typecheck rather than a screen
on a phone; the phones' typed calls and answer types
(`scripts/build/engine-contract-apps.sh`, into `apps/ios/Wingtip/Engine/Generated`
and `apps/android/.../engine/generated`).
`facade/tests/contract.rs` holds every name's function to answering it
and the shared fixtures' answers to the schema; `contract.test.ts` holds
the web's generated file to the schema.

A rule goes in this way, each step in the same pull request:

1. The Rust, in the lowest crate whose modules it needs (above), with its
   source cited in a comment: a function reading the input `Value` and
   writing JSON, or an arm in the module's existing `call(name, v)`.
2. Its file, `crates/<crate>/contract/<name>.json`: `"x-call"`, the
   description with its source, and its `input` and `answer`.
3. `cargo run -p wingtip-contract-gen` in `engine/`, then `npm run types`
   in `apps/web/` and `scripts/build/engine-contract-apps.sh`; commit what
   they write.
4. A test against the shared fixtures in `apps/web/src/lib/fixtures`, so the
   web, the phones and the planner are held to the same examples.
5. Where the web asks it, `python3 scripts/build/web_rules.py` (the web's
   module is built with only the rules the web asks, below), then
   `scripts/build/build-engine-wasm.sh`, and the `.wasm` committed; the
   planner's image rebuilt for the Python side.

Then the callers switch to the name and the old copy is deleted.

## The engine's rules

- A portable ADS-B receiver's GDL 90 (`crates/receiver`): the phones hand
  over the bytes heard on UDP port 4000 with the last picture once a
  second (`receiver_read`), and draw its views -- the traffic merged with
  the internet's (`receiver_traffic`), a field's FIS-B METAR and TAF
  (`receiver_reports`), the NEXRAD as rectangles (`receiver_nexrad`).
  The web has the rules but no listener: a browser opens no UDP socket.
- The engine also reads an ATC clearance heard into its items and a call
  to us by its call sign (`crates/radio`, the web's lib/clearance and
  lib/heardCall, held to their fixtures in `apps/web/src/lib/fixtures`), and
  finds the places it names in the phone's kept packs with no signal
  (`crates/airspace`, the matcher the planner asks as
  `clearance_places`): `wt_clearance_hear`.
- The four pilot pages' figures are the engine's too (`crates/procedures`): a
  flight debriefed against its flown track (ACS PA.VI.A), the diversion
  drill (PA.VI.C), a hold's entry and its legs in the wind (AIM 5-3-8)
  and lost communications' altitudes (14 CFR 91.185), with their words.
  app.figures only carries the dicts across; the phones get the
  planner's very answers from `call` (`debrief`, `diversion`,
  `holding`, `lost_comms`).
- The Brief's Go / No-Go is the engine's too (`crates/brief`): the seven
  findings and the line over them, the pilot's minimums, icing under IFR
  (and `gonogo_icing_unchecked` where the freezing level is not known),
  freezing rain and drizzle in a field's METAR or TAF on any flight
  (`crates/weather`'s `freezing_precip`, AIM 7-1-20), the risk assessment and the airplane's airworthiness, the runway check,
  the weight and balance and the pass times (the web's lib/verdict and
  the modules it is fed from), and the route's fuel and TFR figures the
  findings are put together from (`gonogo_route_figures`: the least fuel
  margin, the fuel required, the reserve, the TFRs in force and near), so
  neither shell works them out. Each is a name in `call.rs`
  (`gonogo_verdict_items`, `gonogo_risk`, `gonogo_runway_checks` ...), asked by
  the web app (callEngine), the planner's app.gonogo (wingtip_native.call)
  and the phones (the generated `call`). Which Class B band of a route's
  profile holds an altitude is `class_b_at_altitude` (crates/airspace,
  14 CFR 91.131), the Profile card's "clearance needed".
- The 3D map's airspace is the engine's too (`crates/airspace`): how high
  a volume stands (`airspace_volume_span`) and, given the plan's
  altitudes, whether it holds any of them (its `holds`, for the volumes at
  the pilot's altitude to stand out), and a Class B, C or D shelf's
  altitudes as the sectional writes them, ceiling over floor in hundreds
  of feet MSL (`airspace_shelf_label`, the FAA's Chart User's Guide: "100"
  over "30", "T", "-30"), held to the web's fixtures
  `airspaceVolumeSpan.json` and `airspaceShelfLabel.json`.
- Where an airplane is usually based is the engine's too (`crates/flight`,
  `usual_base`): the field its heard flights most often start or end at,
  said only with at least 3 of their takeoffs and landings, 0.4 of them
  and no tie (the owner's figures), for the planner's airplane card and the
  Aircraft tab's "based at"; held to the web's fixture `usualBase.json`.
- Runways, the wind on them and the traffic pattern are the engine's too
  (`crates/brief`): a wind along and across a runway and the end it favours,
  the runway flown (the pilot's pick, else into the wind, AC 90-66C
  11.5), the pattern's side, entry, exit and altitude, a POH's
  short-field distances and how an end suits the airplane, and the
  pattern's legs on the map and as the planner flies them (the web's
  lib/wind, lib/pattern, lib/runwayFit, lib/takeoffLanding and
  lib/trafficPattern; wingtip.runway_wind and wingtip.pattern), each a name in
  `call.rs` (`wind_pick`, `runway_end_fit`, `traffic_pattern` ...). The
  Go / No-Go's runway check goes by the same. A crosswind is rounded to
  the knot for the page only: a limit (the POH's demonstrated crosswind,
  the pilot's own) is judged against the unrounded one, which a
  runway's wind carries as `crosswind_exact_kt`, and one past its limit
  that rounds within it is shown to the tenth. A landing's distance is
  held to the runway available on its end (`displaced_threshold_ft`,
  `lda_ft` on each of a runway's ends: the declared LDA, else the length
  past a displaced threshold, AIM 2-3-3), a takeoff's to the whole length.
- The nav log is the engine's too (`crates/route`'s navlog, over
  `crates/flight`'s performance; #482 phase 4): each leg's wind triangle,
  headings, ground speed, time and fuel with the airplane flown in the
  leg's own air, the climbs from the field and at each step up, the tops
  of climb and of descent at three to one (to the pattern, or to an
  approach's fix), the four altitude plans and the altitude wheel's
  figures, a route with stops' plans joined, the fuel plan (14 CFR
  91.151, 91.167) and the IFR alternate's leg, and a pilot's hold flown
  on its leg (AIM 5-3-8). A figure the airplane's profile lacks is never
  filled with another's (the owner, 2026-11-09): no cruise power, no
  power model (`power_pct` null, the TAS and burn as given); no climb
  fuel flow, the climb's gallons not counted (`climb_fuel_unknown` on the
  leg) and no economical plan; and route options with no service ceiling,
  usable fuel or start and taxi fuel close no ground on a ceiling and say
  in `unchecked` what was not worked out. The planner looks up the air -- the winds and
  temperatures aloft at each leg's midpoint, at every altitude the plans
  may fly (`navlog_candidates`), and the variation -- and asks
  `navlog_plans`, `navlog_legs`, `navlog_with_descents` ... by name;
  `engine/facade/tests/navlog.rs` holds them to the planner's tests from
  before the move and to its recorded routes
  (`services/planner/tests_wingtip/golden`).
- Instrument approaches are the engine's too (`crates/route`): a flown
  approach debriefed against its procedure -- the final it flew, full
  scale off the course (AIM 1-1-9, 1-1-17), each fix's altitude (AIM
  5-4-5), the glidepath, the lowest against the pilot's minimums (14 CFR
  91.175(c), (e)), the missed approach or the landing -- and the lesson:
  the briefing, the coached dry run's steps with the descent rate on the
  path (the TPP's table), the side view and the quiz (the web's
  lib/approachDebrief and lib/approachLesson), held to the web's fixture
  `approachKbur.json`, so the iPhone can teach and debrief one offline
  (`approach_find`, `approach_coaching`, `approach_quiz` ... in
  `call.rs`).
- The pilot's own records and text are the engine's too (`crates/pilot`): a
  checklist typed as text, the logbook to and from a CSV file
  (ForeFlight's export among them, papaparse's reading ported step for
  step), a handbook page's figures read off its photo, and endorsements
  (in force, an instructor's lapsed date under 14 CFR 61.197, the words
  signed, a knowledge test's ACS codes), held to the web's fixtures
  `checklist.json` and `logbookCsv.json`.
- The map's overlays with no network are the engine's too (`crates/airspace`):
  the Class B, C and D, the landing fields and the VORs inside the map's
  box from the phone's kept packs, in the shapes the planner's in-view
  endpoints answered (the airports' still does; the web's map draws the
  airspace and navaids from the overlay tiles) (`wt_airspace_in_view`, `wt_airports_in_view`,
  `wt_navaids_in_view`), with what a pack cannot hold -- a live METAR's
  flight category, a navaid's remarks -- answered null or empty.
- The altitude a flight is planned at is the engine's too (`crates/altitude`,
  #482 phase 3): each leg's floor -- the terrain and DOF obstacles with
  14 CFR 91.119's clearances (`vfr_floors`, asked once a leg with the
  ground and obstacles under that leg as flown, wingtip.terrain), or 91.177(a)'s minimum IFR
  altitude over Part 95's mountainous areas (`ifr_floors`, the areas drawn
  in `mountainous.rs`), or an airway's MEA -- the band under the Class B
  shelf (only Class B bounds it: Class B takes a clearance, 91.131(a)(1),
  while Class C and D take two-way radio communication, 91.130(c)(1) and
  91.129(c)(1), so they are calls to make, not airspace to fly under), 91.155's distance under the forecast clouds and the service
  ceiling, none in prohibited airspace (73.83), the cruising altitudes by
  course (91.159, 91.179(b)), the recommendation and the icing
  (`select_cruise_altitude`), the altitude wheel's rows, and the altitude
  flown anyway where none is legal with why (`altitude_anyway`,
  `no_altitude`). The planner reads the ground, the obstacles, the towns,
  the airspace and the weather and passes them in; held to the shared
  fixture `altitude.json`.
- Night, the planning cautions and the IFR alternate are the engine's too
  (#482 phase 1, claude/engine-phase1c): night and civil twilight by
  NOAA's solar calculation (`crates/flight`'s sun: `night_on_the_way`, 14 CFR 1.1 and 91.151), which the nav log's fuel
  plan and route options read; what a pilot's own altitude breaks
  (`crates/altitude`'s cautions: 91.119, 91.131, 91.155, 91.159, 71.33,
  91.211's oxygen, 91.177 and 91.179 under IFR, 73.83) and whether a
  point is over a congested area under 91.119(b) (`congested_points`);
  whether an IFR flight needs an alternate and whether a field will do
  (`crates/brief`'s alternates, 91.169); the nav log's checkpoints from
  the chart model's scores (`checkpoints_select`); what is ahead of own
  ship with the DOF's obstacles (`crates/airspace`'s ahead,
  `alerts_ahead`); the service ceiling in the day's temperatures
  (`service_ceiling_on_the_day`); and on the web the field's TAF
  (`field_taf`), the radio calls' words (`crates/wording`'s script,
  `radio_script`) and a student's solo endorsement's standing
  (`solo_standing`, 61.87(n)). Held to the shared fixtures
  `planning.json`, `cautions.json`, `ahead.json`, `congested.json` and
  `webRules.json`.
- The map's airport weather marks are the engine's too (`crates/brief`'s
  runway::marks, the owner's pick of 2026-11-10): `least_crosswind` (of a
  field's runways, each on the end the wind favours, the least
  crosswind, steady or gust; a variable wind all crosswind, AIM 7-1-28),
  `wind_arrow` (whether the wind earns its arrow, 10 kt or more or
  gusting, and whether it is red: past the picked airplane's maximum
  demonstrated crosswind, the POH's, never with no airplane or no
  figure) and `wind_barb` (the station model's flags, barbs and
  half-barbs, FAA-H-8083-28B 25.2.3.4.5; calm under 3 kt, the NWS's
  table), held to the shared fixture
  `airportWeatherMarks.json`.
- What the weather does to a flight after the planning is the engine's
  too (`crates/weather`): `weather_worse` (a field's category worse than
  at the briefing, and worse than VFR, a SIGMET or AIRMET newly on the
  route, a TAF worse at the ETA; AIM 7-1-6, 7-1-7; a caution, never a
  limit), `forecast_run` (the dry run against the forecast: each point's
  TAF and GLMP ceiling and visibility, the GFS winds at its altitude, the
  advisories and the SPC outlook), `ready_to_fly` (what the device holds
  before it loses the signal: the charts and cycle packs in force, a
  briefing under an hour old, each field's METAR and TAF, the NOTAMs;
  14 CFR 91.103) and `kept_age` (a kept answer's age, "Fetched 42 min
  ago", against the freshness ready_to_fly holds it to).
- The airplane's own figures are the engine's too: `airplane_figures`
  (`crates/pilot`: each figure with where it comes from, the pilot's own,
  the photographed handbook's or the type's stock profile's, null where
  none has it, never another airplane's), `airplane_needs` (the inputs a
  figure needs that the profile lacks, so the app asks for them where the
  figure is) and `endurance` (`crates/procedures`: usable fuel over the
  cruise burn, and what is left once 91.151(a)'s or 91.167(a)(3)'s
  reserve is kept back, a warning below it, never a refusal). Each
  figure's range is stated once, `airplane_figure_ranges` (`crates/pilot`'s
  aircraft form, sanity bounds, no regulation): `aircraft_problems` checks
  the "Your Airplane" form and the gateway's save against it, and the
  planner builds its query parameters' bounds from it (app.plan_query),
  so an airplane the form takes is one every plan takes.
- Whether a field is the armed services' own is the engine's too:
  `field_military` (`crates/flight`'s field, NASR APT_BASE's
  OWNERSHIP_TYPE_CODE and FACILITY_USE_CODE: "military", "joint" or
  null), asked by the planner (wingtip.field_status), the cycle pack's
  overlays (services/jobs) and the engine's own map pins.
- `emergency_guidance` (`crates/radio`): with no airplane picked, an
  emergency's general good practice only, each item with its source
  (FAA-H-8083-3C ch. 18; AIM 6-1-1, 6-1-2, 6-2-1, 6-2-2, 6-3-1, 6-3-2;
  14 CFR 91.3(b)),
  never a type's checklist.
- Route options (`crates/route`'s options) are a cargo feature, `options`
  (the facade's `route-options`), on for the planner and the phones and
  off in the web's WebAssembly, which never asks them: they were 150 KB of
  the module. A way's `crosses` names, besides what closes a cell, each
  restricted area, MOA, warning and alert area it is flown through (never
  closed: warn, never limit; AIM 3-4), and each way's `warning` is its
  card's one warning in the engine's words, the worst first ("Crosses a
  restricted area" before "Crosses a MOA").
  Across the antimeridian (Adak to Shemya) everything a route's options
  read is moved within 180 degrees of the departure's longitude before
  the grid is framed (`options/wrap.rs`), so the frame's boxes may pass
  -180 or 180 (the planner reads them as two boxes) and every longitude
  handed back is between -180 and 180.
- The web's WebAssembly is built with only the rules the web asks
  (`facade/build.rs`, wherever the facade is built for wasm32, which only
  `bindings/wasm` is; the planner's wheel and the phones build every rule,
  and a cargo feature would have leaked into `cargo test --workspace`). The list is
  `facade/web-rules.txt`, which `scripts/build/web_rules.py` writes from
  every `callEngine("<rule>"` in `apps/web/src`, with
  `apps/web/src/lib/engine/webRules.ts` beside it: `callEngine` takes only
  those names, so a rule the web starts to ask is a type error until the
  script is run again and the module rebuilt, and asked past the types it
  throws, naming the rule. The guards' "Web engine rules" runs the script
  with `--check`, and `engine.test.ts` asks every listed rule of the
  module. The 143 rules left out were 194 KB (2026-11-10); the module's
  size is held to a budget (`scripts/ci/wasm_size.py`).
- The planner's own copies are going (#482 phase 0): the airspace column
  (its bands split at 1,500 ft above the surface, where 71.71(a)(2)'s
  14,500 ft Class E stops, and 91.215(b)'s general arms asked before a
  Class D's own radio) and the Mode C veil (`airspace_column`,
  `mode_c_veil`), an FNS message's
  NOTAMs (`notams_fns`), a report's ceiling and category (`ceiling_ft`,
  `flight_category`, `vfr_basic_minimums`), a hazard's window
  (`gonogo_hazard_window`), the reserve, the atmosphere and the descent
  (`reserve_min`, `isa_temp_c` ...) and a figure in
  the web's words (`words_*`) are asked by name from wingtip and
  app.gonogo, held to the planner's answers from before the move in
  `apps/web/src/lib/fixtures/plannerRules.json`.
- `bindings/ffi` (`wingtip-ffi`): the engine for the phones through
  Mozilla's UniFFI (proc-macro mode, `#[uniffi::export]` in
  `bindings/ffi/src/lib.rs`): `call`, every rule by name with JSON in and
  out, and the readers of the phone's cycle packs (the airspace over a
  point, what is ahead, the map's view, a clearance heard), which take
  the packs by their files' paths and map each for the call. The Swift
  and the Kotlin round it are written by uniffi-bindgen
  (`bindings/ffi/bindgen`, at the `uniffi` crate's own version) from the
  built library each time it is built, and never committed or edited
  (`bindings/ffi/uniffi.toml` names their modules).
  Every exported function runs its rule under `catch_unwind`
  (`guarded`), so a panic in the engine comes back as the call's
  refusal (`EngineError::Refused`, Swift's `Engine.Refused`, Kotlin's
  `EngineException`) and the app goes on; UniFFI catches a panic too, but
  hands it to the generated Swift of a function that cannot fail as a
  `try!`, a crash. It needs the release profile's `panic = "unwind"`
  (`Cargo.toml`, said aloud there); only the WebAssembly's own profile
  aborts. A cycle pack's header is read with its count of sections held
  to what the file can hold before anything is allocated (`pack.rs`), as
  an allocation too large aborts rather than panics.
  The phones' builds write the engine's hash (the engine store's,
  `scripts/build/shared-cache.sh`) beside what they build, `engine.hash`:
  `scripts/dev/xcodebuild.sh` refuses to build against an XCFramework
  from another engine, and `scripts/dev/go-live.sh` builds the live
  tree's again, since an app linked against an older engine builds and
  only says "the engine has no rule called …" on a screen.
  `bindings/ffi/build-xcframework.sh` builds a static library for the
  iPhone and the simulator into
  `apps/ios/Frameworks/WingtipEngine/WingtipEngineFFI.xcframework` with
  the C header and module map, beside the generated
  `Generated/WingtipEngine.swift`, which project.yml builds as the `WingtipEngine`
  module the app imports (native-ios.yml, on GitHub's macOS runner);
  `bindings/ffi/build-android.sh` a shared library for each ABI and the
  Kotlin into `apps/android/app/engine/`, loaded through JNA.

- `bindings/wasm` (`wingtip-wasm`): the engine for the web app, as WebAssembly
  with no wasm-bindgen. Every host asks a rule the same way, by name with
  JSON in and JSON out (`facade/src/call.rs`, which looks each name up in
  the table its contract files give): the browser through `wt_call` in the module
  (`apps/web/src/lib/engine/engine.ts`, `callEngine`), the planner through
  `wingtip_native.call`, the phones through the generated `call`. A rule
  moved into the engine needs only a name there. The module's ABI is in
  `bindings/wasm/src/lib.rs`. `scripts/build/build-engine-wasm.sh` builds it in Docker
  (the Rust image pinned by digest, so the bytes are the same anywhere)
  into `apps/web/src/lib/engine/wingtip-engine.wasm`, which is committed, as
  the web build has no Rust; CI's `test` job builds it again and fails
  where it differs. Rebuild and commit it with any change under
  `facade/`, `crates/` or `bindings/wasm`.

The tests share their fixtures with the Python's (`services/planner/tests_wingtip/fixtures/native`):

    cargo test --manifest-path engine/Cargo.toml -p wingtip-engine   # the facade's tests
    cargo test --manifest-path engine/Cargo.toml -p wingtip-brief    # one crate's
    pytest services/planner/tests_wingtip/test_native.py   # with the wheel installed

The cycle pack itself is written by `wingtip.cycle_pack`, by the planner after its
warm-up once a cycle, to `data/raw/packs/wingtip-<cycle>.pack` (not
committed); the phones' packs of it, one a 4-degree region with the rings
simplified (`wingtip.cycle_pack.write_phone`), to `data/raw/packs/phone/<cycle>/`,
served at `/api/cycle-packs` and `/api/cycle-pack/<cycle>/<region>.pack`.
`services/planner/tests_wingtip/test_phone_pack.py` holds the engine's answer from them to the
planner's own code; the iOS app's `CyclePackTests` read the Chicago ones
in `services/planner/tests_wingtip/fixtures/native/phone`.
