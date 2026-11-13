# The Studio's crash pipeline

The owner's words (2026-11-12): "I want to automate this cinematic output
for the crashes that happen", and "build whatever you need to support
these plans". This page is how a reported accident becomes a draft in the
Studio, then a film, and what a person must still do. It runs on the Mac
today; on AWS it becomes a scheduled task and a GPU render host when the
rest of the stack moves there (#115).

## The stages

| Stage | What happens | Where | Automatic? |
|---|---|---|---|
| 1. Leads | The FAA's statements page is read every half hour, and the preliminary notices a person saves from the FAA's dashboard, into `crash_leads` (one lead an event: its local date and its town) | `services/jobs/crash` (`statements.py`, `notices.py`, `ntsb.py`), the store `wingtip.crash_drafts` | Yes |
| 2. Identity | The report's N-number, the FAA registry's Mode S code for it and an ADS-B track by that code must agree, in time and place | the engine's `occurrence_identity` (`engine/crates/procedures/src/occurrence.rs`), asked by `crash/identity.py` | Yes, and a person where they do not agree |
| 3. Kit | The track, the TFRs near the place then, the captions; then, on each run until they are in, the weather then, the NOTAMs then and the NTSB's record | `crash/kit.py`, `crash/then.py`, into the draft's folder in the shared store | Yes |
| 4. Notice | The developer is mailed when a draft is ready, with its link in the Studio | the gateway's `CrashDraftMail` (Mailpit locally) | Yes |
| 5. Drafts | The Studio's Drafts list: each draft's status, what the identity check found, the sources' own words; Identity is right, Not this airplane, Dismiss | `apps/web/src/features/studio` (`StudioDrafts`, `useDrafts`), the planner's `/api/studio/drafts` | A person |
| 6. Film | Each ready draft with a track opened in the Studio in a headless Chromium on the Mac's GPU, its export driven (the finished 16:9 film and its layers zip), the files saved, the draft marked rendered | `scripts/dev/studio-render.mjs`, every half hour by its LaunchAgent; the Studio's `useRenderEntry` | Yes, once installed |
| 7. Publishing | Watching the film, checking it against the rules below, publishing it | a person | **Never automatic** |

A draft's status is one of: **needs identity check** (the sources do not
all agree, or the report gives no N-number), **ready** (they agree, or the
developer confirmed it), **rendered** (the film is made) and **dismissed**.

### The sources

- **FAA Statements on Aviation Accidents and Incidents**
  (faa.gov/newsroom/statements/accident_incidents): plain HTML, the same
  day, read with BeautifulSoup. Only the events whose words say an aircraft
  crashed are leads, from the last 30 days, in the United States. A time is
  read only with its a.m. or p.m.; without one the whole local day is used.
  The statements seldom give an N-number.
- **FAA Preliminary Accident and Incident Notices**
  (faa.gov/data_research/accident_incident/preliminary_data): a Tableau
  dashboard whose CSV export answers 403 to a scripted request, and to a
  headless Chromium's after loading the dashboard (checked 2026-11-12).
  The job does not fetch it and carries no browser for it: a person saves
  it from the dashboard (Download, Crosstab) into `data/raw/faa_prelim/`,
  and each run reads every CSV there.
  The notices give the N-number, a day or two after the event, and the
  statement's lead takes it.
- **NTSB avdata** (the weekly `upDDMON.zip` and the monthly `avall.zip`),
  which ingest reads into `ntsb.sqlite` on the data volume
  (`services/ingest/ingest/ntsb.py`, `wingtip.history.ntsb`). The job reads
  that store as the planner's `/api/studio/ntsb` does (`crash/ntsb.py`):
  the NTSB's case of the draft's N-number on the event's local date goes
  into the kit as `ntsb.json` when it appears, usually a week or more on,
  and its narrative is quoted in the captions as written, its kind
  (preliminary or final) said; its probable cause stays in `ntsb.json` and
  out of the captions. It makes no leads: the store keeps no time of day
  and no point, so the identity check could only send one to a person.
- Not used: the Aviation Herald (its terms prohibit reuse) and the Aviation
  Safety Network (terms not verified). A news story is a lead for a person,
  never for the job.

### The identity check

A draft is made only where three independent sources agree:

1. the FAA's or the NTSB's N-number is in the FAA's aircraft registry with
   a Mode S code (`wingtip.registry`, the registry's `MODE S CODE HEX`);
2. the ADS-B track is that code's (adsb.lol's day trace,
   `wingtip.traffic.day_tracks`; a same-day trace is fetched at once and
   kept in the kit before it rolls off); a TIS-B or ADS-R pseudo-address
   (`~`) never agrees;
3. the track has a report from 60 minutes before the reported local time
   to 15 after it, read at each UTC offset the state keeps that day, within
   20 nm of the town's point (the Census gazetteer's) or 10.5 nm of a point
   the NTSB gives.

The tolerances are the check's own judgment, not a regulation; the
engine's module says why each is what it is. Anything else waits for a
person. Where the registry agrees and the track has no report in the
window, the draft is of the place alone, marked **No ADS-B track**: no
path is ever guessed.

## The rules

These hold for every film, whatever the tools do:

- **Identity is confirmed by three sources** -- the report's N-number, the
  registry's Mode S code and the ADS-B track -- or by the developer, who
  has looked. Never by a news story or a resemblance.
- **"Preliminary" is shown.** The FAA's and the NTSB's early words are
  preliminary and subject to change, and the captions say so.
- **The NTSB's and the FAA's words are quoted**, as they wrote them, with
  where they came from. Nothing is paraphrased into a claim they did not
  make.
- **No cause, no blame, no names.** The captions are facts: the aircraft's
  make and model, the place, the date, the time, what the sources said.
  No probable cause before the NTSB gives one, no judgment of the pilot,
  and no names of those on board: the FAA itself sends the press to local
  authorities for them.
- **A hold after a fatal event.** Where a source says someone died, or no
  source says whether anyone did, nothing is published until the NTSB's
  preliminary report is out (usually two to three weeks) and the owner has
  decided the hold is over.
- **Publishing is always a person's**, never automatic. The pipeline makes
  a draft and a film; the owner decides whether it goes anywhere.

## Running it on the Mac

```bash
docker compose up -d crash-leads              # its own schedule: a run every half hour
docker compose run --rm crash-leads poll      # one run of stages 1 to 3 by hand
docker compose run --rm crash-leads parse-check   # the statements page read, nothing written
```

The job keeps its own schedule (`python -m crash every`, the compose
service's command): a run every `CRASH_LEADS_EVERY_MIN` (30), none with
`CRASH_LEADS_AUTO=0`. No other service starts it.
The gateway mails each ready draft to `APP_DEVELOPER_EMAILS` every five
minutes (`APP_STUDIO_DRAFTS_CRON`, `-` to stop it), its link under
`APP_PUBLIC_BASE_URL`.

### The kit

A draft's folder (`crash_kits/<id>` beside the live store) holds one JSON
file a part:

| Part | What | When |
|---|---|---|
| `lead.json` | the facts, the identity check's findings, the sources' words, the captions | when the draft is ready |
| `track.json` | the ADS-B track (none for "No ADS-B track") | when the draft is ready |
| `tfrs.json` | the TFRs within 30 nm in the event's window (the weather store's list of today) | an event within the day only |
| `weather.json` | IEM's METARs and TAFs of the fields near the place over the hour before the event's moment, and the radar frames (`wingtip.history.weather_then`, the planner's `POST /api/studio/weather`'s own code) | once the hour after the event has passed and IEM answers |
| `notams.json` | the NOTAMs and TFRs in force at the event's moment within 30 nm, from that UTC day's snapshot (`wingtip.history.notam_archive`, `/api/studio/notams`' code) | once that day's snapshot is kept, or the day has passed without one (`archived: false`: no archive of past NOTAMs exists to fill it from) |
| `ntsb.json` | the NTSB's case(s) on the event's local date, as written | when the NTSB publishes it |

The event's moment is the reported local time where the state keeps one
offset from UTC that day, else the confirmed track's report nearest the
place. A part not yet given is asked again on each run (`kit.fill`).

### Installing the render agent

The film needs the Mac's GPU, so it runs on the Mac, not in Docker. Node
(`.tool-versions`' major) is the official build in `~/.local/node`, and
Playwright comes from `scripts/dev/render`, never from `apps/web`, whose
`node_modules` the Linux web-build container mounts:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd ~/Developer/wingtip-live/scripts/dev/render && npm ci && npx playwright install chromium
cd ~/Developer/wingtip-live
node scripts/dev/studio-render.mjs --sign-in   # once: sign in as the developer, close the window
node scripts/dev/studio-render.mjs             # one pass over the ready drafts

# The agent, every half hour (not installed by any script):
sed -e "s|__NODE__|$HOME/.local/node/bin/node|" -e "s|__REPO__|$HOME/Developer/wingtip-live|" -e "s|__HOME__|$HOME|" \
  scripts/dev/launchd/app.wingtipmaps.studio-render.plist > ~/Library/LaunchAgents/app.wingtipmaps.studio-render.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/app.wingtipmaps.studio-render.plist
# and to remove it:
launchctl bootout gui/$(id -u)/app.wingtipmaps.studio-render && rm ~/Library/LaunchAgents/app.wingtipmaps.studio-render.plist
```

Its log is `~/Library/Logs/wingtip-studio-render.log`; the films go to
`~/Movies/Wingtip Studio` (`STUDIO_RENDER_OUT`), each named for its draft.
A page that draws with SwiftShader rather than the GPU is refused, not
filmed slowly.

### One draft end to end, by hand

1. The stack up (`scripts/dev/go-live.sh`) with ingest's history thread
   running (the NTSB store and the daily NOTAM snapshots).
2. `docker compose run --rm crash-leads poll`: leads read, identities checked,
   kits made and filled. The Studio's Drafts list shows each.
3. A draft waiting for a person: open it in the Studio
   (`/app/studio?draft=<id>`), read what the identity check found, and
   press Identity is right (or Not this airplane, or Dismiss). The next
   run makes its kit.
4. `node scripts/dev/studio-render.mjs` (signed in once with `--sign-in`):
   each ready draft with a track opened at
   `/app/studio?draft=<id>&render=1`; once its track, the weather then and
   the map are in, the page offers `window.__studioExport`; the script asks
   for each preset of `STUDIO_RENDER_PRESET`, saves each download, and
   marks the draft rendered. To watch it, open the same address in a
   browser signed in as the developer and call
   `await window.__studioExport({ draftId: "<id>", preset: "draft-1080p" })`
   in the console.
5. Check the film: `docker run --rm --platform linux/amd64 -v "$HOME/Movies/Wingtip Studio:/m"
   --entrypoint ffprobe jrottenberg/ffmpeg:7-alpine -hide_banner /m/<file>.mp4`.

### The export's presets

`window.__studioExport({ draftId, preset })` (`features/replay/export/useRenderEntry.ts`)
makes the whole track, its gaps included, with the export the panel uses
(MapLibre's `setNow` frame by frame, mediabunny), at the slowest of the
Studio's speeds that keeps the film to three minutes (16x at most). It
resolves `{ filename }` once the file is handed to the browser as a
download, which the script then saves, and rejects with the reason where
the draft is not the one open, the preset is not known, an export is
running, or the video could not be made. It is set only at `?render=1` on
the Studio, the developer's page.

| Preset | What |
|---|---|
| `draft-1080p` | one MP4, 1920×1080 (16:9), 30 fps, the credit line, the disclaimer ("Reconstruction from ADS-B data. Not an official finding.") and the captions burned in |
| `draft-1080p-layers` | the same as the layers zip: the map's MP4, the overlays as WebM with alpha, the captions as SRT, the credits |

The radio's captions use Whisper on the device; behind the gateway its
model downloads from huggingface.co and its CDN, which the gateway's
content security policy allows (`ModelHosts`).

## What is still a seam

Closed (claude/crash-wire): the export's entry (`useRenderEntry`), the
NTSB's record, the weather then, and the NOTAMs then from the daily
snapshots, each in the kit as above. Left:

- **The kit's captions in the film**: the film's overlays are the
  Studio's own (the data block, the METAR, the radio's captions, the
  credit line and the disclaimer); the kit's title, "Preliminary" and the
  sources' quotes are in `lead.json` and the Drafts list, not yet drawn
  into the film.
- **NOTAMs before the snapshots began**: no public archive of past NOTAMs
  exists, so an event on a day ingest kept none of has `archived: false`.
- **The notices' fetch**: the job reads the CSVs a person saves for it; a
  fetch of its own waits for a way in the FAA allows.
