# Export for simulator

The Studio's **Export for simulator** menu (features/replay/SimExportMenu)
writes a recorded flight as a file that a flight simulator replays, so a
creator can film it with the simulator's scenery and cameras. The engine's
`sim_flight` rule builds the frames, and lib/replay/simExport writes them
into each format.

The frames contain:

- **Path.** A smooth path through every report: a cubic Hermite spline
  (de Boor, *A Practical Guide to Splines*, ch. IV) that uses each report's
  sent velocity as its slope.
- **Frame rate.** Ten frames a second for X-Plane and Sky Dolly, and one a
  second for the track formats.
- **Altitude.** Above sea level where the airplane sent its crew's altimeter
  setting below 18,000 ft (14 CFR 91.121(a)(1)). Otherwise the file keeps
  pressure altitude and says so.
- **Estimated values.** ADS-B sends none of these, and every file labels
  them as estimated:
  - **Heading:** the track, because the wind is not known.
  - **Bank:** from the turn, using tan(bank) = V × turn rate / g.
  - **Pitch:** the flight path angle.
  - **Gear and flaps:** by phase of flight.
  - **Lights:** by AIM 4-3-24.
- **Smoothing.** The heading, bank and pitch are averaged over 2.5 s on
  each side, so the airplane rolls into a turn before the heading moves.
- **Gaps.** A gap in the reports is never bridged. A format that cannot
  leave a gap empty (FDR, Sky Dolly's CSV, FlightAware's KML) holds only
  the flight around the replay's current moment: scrub to the flight you
  want before exporting.

## The files

| Menu item | File | For | Cost |
|---|---|---|---|
| FlightControlReplay (KML) | `.kml`, FlightAware's shape: one `gx:Track`, 1 frame/s | MSFS 2020 and 2024 through FlightControlReplay 6 | €24 one-off (simMARKET) |
| Sky Dolly (CSV) | `.csv`, the Flight Recorder add-on's 43 columns, 10 frames/s, with the attitude, gear, flaps and lights | MSFS through Sky Dolly | Free (MIT) |
| X-Plane 12: Flight data recorder (FDR) | `.fdr` version 4, 10 rows/s, with gear, flaps and lights as datarefs | X-Plane 12 | Included with X-Plane |
| Google Earth (KML) | `.kml`, the whole day as a `gx:MultiTrack`, with each gap left empty | Google Earth, Little Navmap's KML view | Free |
| GPX | `.gpx` 1.1, one `<trkseg>` for each run between gaps | Little Navmap (File, GPX Exchange Format, Load Aircraft Trail from GPX), Sky Dolly's GPX import, any map | Free |

## Microsoft Flight Simulator 2024: FlightControlReplay

FlightControlReplay is the best-looking route into MSFS 2024. It has its
own cinematic cameras (Wing Reveal, Wing Sweep, Orbit, UpDown360, a Live
Fly-By camera and saved camera paths), cut and edit, and highlights.

1. Export **FlightControlReplay (KML)**.
2. In FlightControlReplay 6, use its **FlightAware Import**. The product
   page lists the feature by that name; follow its manual for where it sits
   in the window.
3. Pick the file, then replay it and set the cameras.

FlightControlReplay works out the airplane's attitude itself from the
path. It does not read ours, because a FlightAware file carries none.

## Microsoft Flight Simulator: Sky Dolly (free)

1. Export **Sky Dolly (CSV)**.
2. In Sky Dolly, choose **File › Flight Import › CSV (Comma-Separated
   Values)**, and set **Format** to **Flight Recorder**.
3. Pick the aircraft in MSFS. Sky Dolly replays its own recording on the
   airplane you are flying.
4. Press **Play**. Sky Dolly's **Replay** menu sets the replay speed and
   looping.

Sky Dolly takes this file's attitude, gear, flaps and lights as given. Its
other imports work out a coarser attitude of their own.

## X-Plane 12: FDR

The X-Plane trial (XPLANE-TRIAL.md) replays this file with scripted
cameras and X-Plane's own recorder.

1. Export **X-Plane 12: Flight data recorder (FDR)**.
2. Open the file in a text editor and change the `ACFT` line to the
   airplane you want to fly. The file names one that ships with X-Plane: a
   737-800 for a jet, otherwise a Cessna 172 SP.
3. In X-Plane 12, choose **Load Saved Flight › Open Saved Flight Not
   Listed**, and pick the `.fdr` file. This is 42fdr's documented path.
   X-Plane 11's is **File › Load Flight › Flight Data Recorder**
   (Laminar's knowledge base).
4. X-Plane opens the flight in replay mode. Use its replay controls and
   external views to film it.

The file's `DATE` and the time on each row set X-Plane's date and time of
day, so the sun matches the flight. `PRES` sets the sea-level pressure to
the airplane's own altimeter setting.

## Weather and time of day

- **X-Plane:** the FDR file sets the date, the time and the sea-level
  pressure. Set the clouds and wind by hand in X-Plane's weather settings.
- **MSFS:** set the date and time in the world map before the replay.
  MSFS's live weather is today's, not the flight's, so pick a weather
  preset or set it by hand.
- **The day's real weather:** the METARs for the departure and arrival
  fields on that day are in the Iowa Environmental Mesonet's ASOS archive
  (mesonet.agron.iastate.edu/request/download.phtml).

## Cameras for cinematic shots

These were checked on the vendors' pages on 2026-11-12.

- **FlightControlReplay 6** (€24): Cinematic Mode, the Live Fly-By camera
  and saved camera paths.
- **ChasePlane** (Parallel 42, $30 for MSFS 2024 while it is an
  experimental build): smooth chase and cinematic cameras in live flight.
- **MSFS's own drone camera** and **X-Plane's external views** are free.
  The keys are in each simulator's control settings.

## What a creator still does by hand

- **In every simulator:**
  - Choose the airplane and its livery.
  - Set the weather.
  - Line up the airport if the simulator's runway sits a few feet off the
    elevation data (X-Plane's FDR has no calibration line in version 4).
- **MSFS:** set the date and time.
- **X-Plane:** edit the `ACFT` line.
- **FlightControlReplay:** check its attitude; it works out its own.
- **Gear, flaps, lights and attitude:** these are estimates. For an
  airplane with fixed gear, the gear handle does nothing.
