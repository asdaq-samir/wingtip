# X-Plane 12 trial on the Mac

This trial checks whether X-Plane 12 on the Mac mini can film the Studio's
flights for the crash-video channel. It runs the free X-Plane 12 demo, side
by side with the MSFS 2024 trial on AWS, and replays the same kind of real,
non-accident flight. It answers four questions:

1. Does our `.fdr` (docs/SIM-EXPORT.md) load and play?
2. Can the cameras be scripted?
3. Can it record a smooth video with nobody at the keyboard?
4. How does it look with and without AutoOrtho's public-domain USGS imagery?

The kit:

- **`tools/xplane-driver/`**: an XPPython3 plugin (`PI_wingtip_replay.py`
  and `wingtip_replay/`) that replays the flight, runs a shot list
  (`shots.json`) and starts and stops X-Plane's own recorder.
- **`scripts/dev/xplane-trial.sh`**: checks what is installed, gets the
  sample flight out of the Studio, copies everything into X-Plane, and
  collects the videos.

## The sample flight

The sample is Kenmore Air's DHC-2 Beaver N17598, flying from Kenmore on
north Lake Washington to Lake Union on 2026-11-11, 20:23 to 20:34 UTC:

- **About 10 minutes.** It climbs out over Lake Washington, crosses Montlake
  and lands on Lake Union beside downtown Seattle.
- **Inside the demo's area.** The demo's scenery is the Seattle area.
- **Good data.** No two reports are more than 33 s apart, so the Studio
  shows no gap. The airplane sent its altimeter setting (1020.8 hPa), so the
  file's altitudes are above sea level.

The reports are adsb.lol's (ODbL 1.0; credit "adsb.lol" on anything
published). They are kept in
`tools/xplane-driver/sample/N17598-2026-11-11.trace.json`, because adsb.lol's
history only goes back about six weeks and sometimes answers 502. When
adsb.lol can't give the day, `xplane-trial.sh sample` puts that trace in the
planner's store, and the Studio reads it from there. The FDR is still written
by the Studio's own export, the path being tested.

X-Plane 12 ships no Beaver, so the export names the Cessna 172 SP. To use
another airplane, set `XPLANE_ACFT=<path from the X-Plane folder>` and the
script edits the `ACFT` line.

## How the plugin replays

`source` in `shots.json` picks how the airplane is replayed. `install
<source>` sets it.

- **`drive`** (the default, unattended): the plugin places the airplane
  itself every frame from the `.fdr`'s rows.
  - It turns off X-Plane's flight model for the airplane
    (`sim/operation/override/override_planepath`), then writes its local
    position and `psi`, `theta`, `phi` and `q`, following Laminar's
    "Moving the plane".
  - Between rows it goes in a straight line. The rows are already the
    engine's smooth curve, ten a second.
  - Its heading is the path's true course, which is what the export's
    heading column is, made magnetic.
  - Gear, flaps and lights come from the file's `DREF` columns.
- **`menu`**: you load the `.fdr` through **Load Flight** and X-Plane
  replays it. The plugin only follows X-Plane's clock (the file sets
  `sim/time/zulu_time_sec`) and runs the cameras and the recorder.
- **`auto`**: asks X-Plane to load the `.fdr` with `xp.loadDataFile`. If
  X-Plane is replaying 3 s later, the plugin follows it as in `menu`;
  otherwise it drives. The SDK documents only situations and replays for
  this call, so expect it to fall back. If X-Plane crashes on it, that is
  the answer too.

**Gaps.** A gap is two rows more than 1 s apart, and nothing is drawn
across it. Each shot is cut into "takes" at the gaps. The recorder stops at
a gap and starts again after it, so the video cuts there; add a title card
in the edit. (A Studio `.fdr` holds one run with no gaps, so this matters
for longer flights.)

**Clock** (`clock`):

- **`fixed`** moves the replay on 1/`fps` second for every frame X-Plane
  draws. However slowly the Mac draws, each frame is one video frame of
  the flight.
- **`real`** keeps to the wall clock.

The trial compares them: whether X-Plane's recorder writes every frame or
samples the wall clock is not documented.

**Shots**: each has `kind`, `from_s` and `to_s`, in seconds from the file's
first row.

| Kind | Where the camera is | Settings |
|---|---|---|
| `chase` | Behind and above the airplane, swinging round after it in a turn | `distance_m`, `height_m`, `lag_s` |
| `flyby` | Beside where the airplane will be `lead_s` later, turning to follow it past | `lead_s`, `side_m` (negative is left), `height_m`, `frame_m` (zoom to about that many metres across) |
| `tower` | Fixed at `lat`, `lon`, `alt_ft` (MSL), following the airplane | `frame_m` |
| `cockpit` | X-Plane's own 3D cockpit view (`sim/view/3d_cockpit_cmnd_look`) | none |

The cameras use XPLMControlCamera. The recorder is the command
`sim/operation/video_record_toggle` (File › Toggle video recording). The
sample's shot list records about 5.7 minutes:

- the climb out;
- a flyby;
- the cockpit;
- the crossing into Lake Union;
- the landing, from a camera at Gas Works Park;
- the water taxi.

**The log** is `Output/wingtip/replay-log.txt`. It has every take, every
cut, the recorder going on and off, and the frame times (mean, worst, and
how many took over twice the mean). Once a second it also compares X-Plane's
true and magnetic heading with the path and with the file. In `menu` mode,
a true heading that matches the path's course says X-Plane reads the `.fdr`
heading column as magnetic; one that is off by the variation (about 15° E
at Seattle) says it reads it as true. That settles SIM-EXPORT.md's open
question.

## The steps, with times

**Once, about 1 to 1.5 hours, mostly waiting on the download:**

1. **Download the demo** (30 to 60 minutes, about 25 GB of disk). Use the
   installer at x-plane.com/desktop/try-it, choose the demo, and install to
   `~/X-Plane 12 Demo`.
2. **First run** (5 minutes). Start it, fly a minute anywhere around
   Seattle, and quit.
3. **XPPython3** (5 minutes). Run `scripts/dev/xplane-trial.sh check`,
   which prints the exact steps: download it, unzip it into
   `Resources/plugins`, clear the quarantine flag with `xattr`, start
   X-Plane once.
4. **The sample** (5 minutes). With the stack up, run
   `scripts/dev/xplane-trial.sh sample`. It opens the flight in the Studio
   and waits for **Export for simulator › X-Plane 12 › Flight data recorder
   (FDR)** to arrive in Downloads.
5. **Video settings** (2 minutes). In X-Plane, open **File › Configure video
   recording** (in X-Plane 12 it may be under Settings): 30 frames a second,
   width 1920.

**Run A: drive, no AutoOrtho** (15 to 25 minutes, unattended once started):

1. `scripts/dev/xplane-trial.sh install drive`
2. `scripts/dev/xplane-trial.sh launch`, then New Flight: Cessna 172 SP at
   Kenmore Air Harbor (S60) or Seattle Seaplanes (W55), Start Flight.
3. **Plugins › Wingtip replay › Play the shot list**, then hands off until
   the log says `stopped: finished`. Note the wall time; the script prints
   it at collect.
4. Quit X-Plane, then `scripts/dev/xplane-trial.sh collect drive-plain`.

Fully unattended: set `"autostart": true` and `"quit_when_done": true` in
`Output/wingtip/shots.json`. The plugin then starts 8 s after the flight
loads and quits X-Plane at the end.

**Run B: X-Plane's own FDR replay** (15 minutes):

1. `install menu`, then launch and start a flight as in run A.
2. **File › Load Flight › Open Saved Flight Not Listed**: pick
   `Output/wingtip/sample.fdr`, then Load Flight. Note what happens.
3. **Plugins › Wingtip replay › Play the shot list**.
4. Then `collect menu-plain`.

**Run C: auto** (10 minutes, optional): `install auto`, play, `collect
auto-plain`. This shows whether `loadDataFile` takes an `.fdr`.

**Run A again with AutoOrtho** (45 to 60 minutes the first time, below),
then `collect drive-autoortho`.

**Review** (15 to 20 minutes): the videos and logs are in
`~/Movies/wingtip-xplane-trial/<time>-<label>`.

If X-Plane's recorder writes nothing in the demo, use `scripts/dev/
xplane-trial.sh screen <seconds>` (macOS's own `screencapture`; Terminal
needs Screen Recording permission). It records in real time, so use
`"clock": "real"` with it.

## What to judge

These are the same criteria as the MSFS trial (the plan, "Decision
criteria"):

- [ ] **Look.** Would viewers watch it: the scenery, the light, the
  airplane, with and without AutoOrtho?
- [ ] **Smooth and honest.** Does it follow the real track smoothly (the
  log's frame times and the video), with any gap shown as a cut?
- [ ] **Unattended.** Did it run start to finish with nobody at the
  keyboard (autostart and quit_when_done)?
- [ ] **Time and cost per video.** The wall time from Play to `stopped`,
  against the minutes of footage. The cost is $0 to run on the Mac.
- [ ] **Licence fit.** X-Plane's consumer terms (Steam's "Terms for X-Plane
  12") are "for non-commercial purposes only" and forbid distributing its
  artwork without Laminar's permission. Any revenue needs the X-Plane 12
  Professional licence: $1,000 a computer (digital; $1,250 on a USB key),
  "required for generating revenue, either directly or indirectly"
  (x-plane.com/pro). Its page does not mention video or YouTube. Ask
  Laminar in writing before a monetised channel.

## Adding AutoOrtho

AutoOrtho streams satellite imagery under X-Plane's scenery as you fly.

- **Which one.** The original (github.com/kubilus1/autoortho, Apache-2.0)
  last released 0.7.2 in January 2024, last pushed in October 2024, and has
  no Mac build. The maintained fork is **AutoOrtho Continued**
  (github.com/ProgrammingDinosaur/autoortho4xplane, Apache-2.0): 3.1.0 on
  2026-11-11, with a Mac build for Apple silicon only.
- **What it needs.** A FUSE layer: macFUSE or FUSE-T. Pick **FUSE-T**: it
  needs no kernel extension, while macFUSE on Apple silicon asks you to
  lower the Mac's security in Recovery. The fork's notes record a shutdown
  problem on macOS 27 with macFUSE 5.4.0.

Steps (30 to 45 minutes, plus the imagery download):

1. Install FUSE-T (fuse-t.org).
2. Download `AutoOrtho_mac_3.1.0.zip` from the fork's releases and unzip
   it, then run `xattr -d com.apple.quarantine /path/to/AutoOrtho.app`.
3. Open it and set the X-Plane folder and a cache folder.
4. **Scenery** tab: download the North America set that covers Seattle.
5. **Settings**: set the map type to **USGS** (`maptype_override = USGS`),
   USGS The National Map's imagery, which is public domain (17 U.S.C. 105).
   Not NAIP: the fork fetches NAIP through Esri's tile server, whose terms
   apply. Not Bing, Google, Apple or ArcGIS, which the plan rules out for
   anything exported.
6. Start Streaming, check that its scenery is above the default in
   `Custom Scenery/scenery_packs.ini`, then start X-Plane.

For the plain run, stop AutoOrtho's streaming first. `xplane-trial.sh
check` says whether AutoOrtho is in `scenery_packs.ini`. Whether the demo
loads custom scenery at all is not documented, so the first AutoOrtho run
answers it.

## The demo's limits

| | What we know | Source |
|---|---|---|
| Time | 60 minutes a session since 12.2.1 (July 2025; it was 15), then the controls lock; quit and start again, without limit | Laminar's 12.2.1 release notes; restarts from Laminar's Q&A forum (users' answers) |
| Scenery | The Seattle area | Secondary only (flyawaysimulation.com); Laminar does not say |
| Plugins | Allowed in the demo | Laminar's Q&A forum (a user's answer, 2019) |
| FDR replay, replay mode, the video recorder | Not documented either way | The trial answers it |
| Mac | Apple silicon supported, macOS 12 or newer | Laminar's X-Plane 12 system requirements |

The 60-minute session is enough for the sample: the plugin's run is about
10 minutes at the Mac's speed. If the controls lock mid-run, quit, start
again and play again; the plugin starts from the shot list's first take.

## Research, 2026-11-12

| Question | Answer | Source |
|---|---|---|
| XPPython3 | 4.7.1 (12 July 2026); X-Plane 12 on Mac Intel and M-series; Python 3.12 bundled since 4.3.0, so no python.org install; clear macOS's quarantine (its "Drop Quarantine" app or `xattr`). Its licence is not stated in its docs. | xppython3.readthedocs.io (changelog, installation, mac_quarantine) |
| Loading an FDR by script | `xp.loadDataFile` takes `DataFile_Situation` (.sit) and `DataFile_ReplayMovie` (.rep) only; no command loads an .fdr (`sim/operation/load_flight` only opens the window). So the plugin drives the airplane, or follows a replay loaded by hand. | XPLMLoadDataFile (developer.x-plane.com/sdk), XPPython3's utilities page, X-Plane 12's Commands.txt |
| Cameras | `xp.controlCamera(xp.ControlCameraForever, cb, ref)`; `cb(position, isLosingControl, ref)` fills the list in place with x, y, z, pitch, heading, roll, zoom and returns 1 | XPPython3's camera page |
| The recorder | `sim/operation/video_record_toggle` ("Toggle AVI movie recording"), `sim/operation/configure_video_recording`; Ctrl+Space; a `.mov` in the X-Plane Output folder (the manual also says .avi), no sound. Frame by frame or real time: not documented. | X-Plane 12 Commands.txt; the X-Plane 12 manual, "Creating a Movie" |
| Replay commands | `sim/replay/replay_toggle`, `rep_begin`, `rep_play_rf`, `rep_pause`, `rep_end` | X-Plane 12 Commands.txt |
| Placing the airplane | `override_planepath` (int[20], the user's airplane first); `local_x/y/z` writable; `latitude`/`longitude` read-only; `psi`, `theta`, `phi`, `q` writable | X-Plane 12 DataRefs.txt |
| FDR heading | X-Plane 11's FDR page calls the column "heading in degrees TRUE"; nothing for version 4 in X-Plane 12; the export writes magnetic. The plugin's log settles it in run B. | x-plane.com/kb/fdr-files-x-plane-11 |
| Midnight | Not documented; the plugin reads a row that runs back over half a day as the next day | |
| Command line | Laminar documents `--load_smo=<replay>`, `--fps_test`, `--pref:`, `--no_sound` (X-Plane 8 to 10 era); nothing for a situation or an .fdr. Try `--help` in the demo. | Laminar's dev blog (2006), kb "frame rate test" |
| AutoOrtho | Above | GitHub |

The commands and datarefs above are from a copy of X-Plane 12's own
`Commands.txt` and `DataRefs.txt` (version 1210). Compare them with the
demo's `Resources/plugins/Commands.txt` and `DataRefs.txt`; the plugin's log
names any dataref X-Plane does not have.

## Unverified until the trial runs

- Whether the demo replays an `.fdr`, records video and loads AutoOrtho's
  scenery.
- Whether X-Plane's recorder writes every frame (the fixed clock's
  premise) or the wall clock.
- XPPython3 details the plugin relies on:
  - the names `xp.createMenu(..., handler=None)`,
    `xp.appendMenuItemWithCommand`, `xp.getDatavf(ref, list, 0, 1)` and
    `xp.MSG_AIRPORT_LOADED`;
  - that a plugin's sibling folder (`wingtip_replay`) can be imported. The
    plugin adds its own folder to `sys.path` for that.
- Whether gear, flaps and lights move with the flight model off. The log
  reads back `sim/flightmodel2/gear/deploy_ratio`.
- That `q`, written by Laminar's formula, turns the airplane the way
  `psi`, `theta` and `phi` say.
- That X-Plane 12's "Load Flight" path is the menu named above. 42fdr
  documents "Load Saved Flight › Open Saved Flight Not Listed".
- The FDR heading's reference, and midnight crossing, in X-Plane itself.
