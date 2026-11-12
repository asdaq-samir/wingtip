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
| 3. Kit | The track, the TFRs near the place then, the captions; the weather then and the NTSB's record later | `crash/kit.py`, into the draft's folder in the shared store | Yes |
| 4. Notice | The developer is mailed when a draft is ready, with its link in the Studio | the gateway's `CrashDraftMail` (Mailpit locally) | Yes |
| 5. Drafts | The Studio's Drafts list: each draft's status, what the identity check found, the sources' own words; Identity is right, Not this airplane, Dismiss | `apps/web/src/features/studio` (`StudioDrafts`, `useDrafts`), the planner's `/api/studio/drafts` | A person |
| 6. Film | Each ready draft opened in the Studio in a headless Chromium on the Mac's GPU, its export driven, the film saved, the draft marked rendered | `scripts/dev/studio-render.mjs`, every half hour by its LaunchAgent | Yes, once installed |
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
- **NTSB avdata** (the weekly `upDDMON.zip` and the monthly `avall.zip`):
  `TODO(claude/studio-2)`, whose reader (`services/ingest/ingest/ntsb.py`)
  lands there; `crash/ntsb.py` is the seam.
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
docker compose build crash-leads              # once; `run` reuses the image
docker compose create crash-leads             # so the planner can start it
docker compose run --rm crash-leads           # one run of stages 1 to 3 by hand
docker compose run --rm crash-leads parse-check   # the statements page read, nothing written
```

The planner starts it every `CRASH_LEADS_EVERY_MIN` (30) through the
dev-services sidecar (`app.crash_leads`); `CRASH_LEADS_AUTO=0` stops it.
The gateway mails each ready draft to `APP_DEVELOPER_EMAILS` every five
minutes (`APP_STUDIO_DRAFTS_CRON`, `-` to stop it), its link under
`APP_PUBLIC_BASE_URL`.

### Installing the render agent

The film needs the Mac's GPU, so it runs on the Mac, not in Docker. With
Node from `.tool-versions` (mise) and `npm ci` in `apps/web` of the live
checkout:

```bash
cd ~/Developer/wingtip-live
node scripts/dev/studio-render.mjs --sign-in   # once: sign in as the developer, close the window
node scripts/dev/studio-render.mjs             # one pass over the ready drafts

# The agent, every half hour (not installed by any script):
sed -e "s|__NODE__|$(mise which node)|" -e "s|__REPO__|$HOME/Developer/wingtip-live|" -e "s|__HOME__|$HOME|" \
  scripts/dev/launchd/app.wingtipmaps.studio-render.plist > ~/Library/LaunchAgents/app.wingtipmaps.studio-render.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/app.wingtipmaps.studio-render.plist
# and to remove it:
launchctl bootout gui/$(id -u)/app.wingtipmaps.studio-render && rm ~/Library/LaunchAgents/app.wingtipmaps.studio-render.plist
```

Its log is `~/Library/Logs/wingtip-studio-render.log`; the films go to
`~/Movies/Wingtip Studio` (`STUDIO_RENDER_OUT`). A page that draws with
SwiftShader rather than the GPU is refused, not filmed slowly.

## What is still a seam

- **The export** (`TODO(claude/studio-2)`): MapLibre's `setNow` on the
  replay clock, encoded with mediabunny, is claude/studio-2's. The render
  script calls `window.__studioExport({ draftId, preset })`, which must
  resolve `{ filename }` once the film is whole, after handing it to the
  browser as a download, and reject with a reason where it cannot. The
  Studio opened at `/app/studio?draft=<id>&render=1` loads the draft's
  track; the export panel sets the function once the map is ready.
- **The weather then and the NTSB's record** (`TODO(claude/studio-2)`):
  IEM's reports (`wingtip/history/iem.py`) and the NTSB reader go into the
  kit once they land.
- **NOTAMs other than TFRs**: the store keeps today's NOTAMs by field, and
  a past day's are not kept, so only the TFRs near the place are kept, and
  only for an event within the day.
- **The notices' fetch**: the job reads the CSVs a person saves for it; a
  fetch of its own waits for a way in the FAA allows.
