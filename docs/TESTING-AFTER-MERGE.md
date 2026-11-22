# Testing after the merge

Once a wave is merged into `claude/integration` and live
(`scripts/dev/go-live.sh --up`), one campaign tests the stack as
production will meet it: the backup restores, the WebP tiles are in place,
the stack holds its load and comes back from each failure, the FAA's 0901Z
changeover goes as it should, and the scans have nothing open. The owner
asked for it on 2026-11-21 ("Stress test and things like that at the
end"). It runs on the Mac, overnight, one piece at a time, and writes one
report.

```bash
cd ~/Developer/wingtip-live && scripts/dev/after-merge.sh
```

It can be stopped at any point and started again: a piece that ran to its
end is skipped. `--only stress,spike` runs some, `--redo chaos` one again,
`--report` writes the report again, and `--list` names the pieces.

## What it needs

- The wave live in `~/Developer/wingtip-live`, its images built
  (`go-live.sh --up` builds them; the campaign starts the stack with
  `--no-build`).
- A quiet Mac ([LOCAL-DEV.md](LOCAL-DEV.md)): the measurements take every
  turn of `scripts/dev/one-at-a-time.sh` (`--alone`), and every turn waits
  while free memory is under 30% (`ONE_AT_A_TIME_FREE_MIN`, from
  `memory_pressure`). Swap in use is no guide: macOS keeps it high long
  after a spike. Start it with the load average under 16.
- Docker with its 12 GB and 12 CPUs: the stack is held to two of them and
  6.7 GB, k6 runs on four others.
- The internet: the stock tools' images are pulled once, trivy downloads
  its database, and the planner reaches the FAA and NOAA as it does in
  production.
- 15 GB free on the Mac before every piece, 20 GB for the transcode
  (sec@2x peaks at about 17 GB): short of it the campaign stops and says
  so, and starts that piece again next time. The transcode first deletes
  the staged copy beside the tiles (`chart_tiles.nosync.webp-staging`, about
  6 GB), since it runs in place.
- About 60 GB free on the Mac for the disk-full fault (it is skipped,
  and says so, without it), and room beside the largest chart archive for
  the transcode.
- `RESTORE_BACKUP` for a night from S3 (`s3://<ServerBucketName>/backups/<date>`,
  the AWS CLI signed in); without it, the newest local dump.
  `TRANSCODE_CYCLE` (10-29-2026) and `CHART_TILES_BUCKET` for the publish.
  `MAILPIT_UI_AUTH` where the inbox has a password. `PHONES=1` adds the
  phones' own tests to the changeover.

## The stack held to the launch server

The launch server is a t3a.large, 2 vCPU and 8 GB
([README-AWS.md](README-AWS.md)). [`infra/load-tests/t3a-large.yml`](../infra/load-tests/t3a-large.yml)
lays over the live tree's compose files: every service pinned to the same
two cores (`cpuset`, as the server's services share its two), and a memory
limit each, production's own where it has one (ingest 384 MB, weather
768 MB) and a share of what the server leaves for the rest (the planner
3 GB, the gateway 1.5 GB, Postgres 1 GB), with production's settings where
they change the work (no access log, JSON logs, no chart refresh in the
background, production's health checks, Postgres's slow-statement log).
An Apple core does more a second than a t3a's thread, so a pass is a
ceiling, not a promise; a failure here will fail there.

Tiles go to the planner directly, as production's Caddy sends them, and
with no CloudFront in front: every tile is asked of the origin, the worst
case.

## What runs, in order

| Piece | What it does | Its limits | About |
|---|---|---|---|
| drill | [`restore-drill.sh`](../scripts/dev/restore-drill.sh): a backup restored into a scratch Postgres, checked against its manifest, the gateway started on it | Every check passes ("restore drill passed") | 10 min |
| transcode | The charts job's `transcode` of the cycle's archives to lossless WebP, in place on the live tree ([services/jobs/README.md](../services/jobs/README.md)), then `publish --bucket "$CHART_TILES_BUCKET"` where there is one | It finishes; no tile drawn again | 2 h |
| stress | [`pilots.js`](../infra/load-tests/pilots.js), `PROFILE=stress`: 10, 25, 50, 100, 150, 200, 300, 400 and 500 pilots, each step reached in 30 s and held 2 min; k6 stops past 10% errors | Per step: each journey's p95 under its limit, errors under 1%. The breaking point is the last step that held | 35 min |
| soak | 50 pilots, the launch's expected load, for 2 hours | The journeys' limits; after a 20-minute warm, no service's memory growing over 50 MB an hour, the planner's open files over 20 an hour, Postgres, the live stores or a cache on disk over 100 MB an hour | 2 h 15 min |
| spike | 0 to 200 pilots in 10 s, a minute there, back to 10 and 3 minutes to come back | The limits again in the 3 minutes after | 10 min |
| chaos | 50 pilots on, then each fault in turn (below) | Below | 3 h 30 min |
| changeover | A planner with its clock faked across the next 0901Z (below) | Below | 50 min |
| lockfiles | osv-scanner over every lockfile the repo tracks | Nothing open that is not triaged | 5 min |
| images | trivy over the built images and the ones compose pulls, HIGH and CRITICAL | The same | 20 min |
| zap | OWASP ZAP's baseline on the web, and on the gateway's API from its OpenAPI document (safe mode: passive only) | The same | 20 min |

All of it is about ten hours: a night. The journeys and their limits are
`pilots.js`'s, a pilot's idea of slow: the map open 1.5 s, a tile 0.8 s,
the course 1 s, the checkpoints 4 s, the nav log 6 s, the Brief 5 s,
signing in 3 s and the saved flights 1 s, each at the 95th percentile.

### Chaos

With 50 pilots on (k6's load profile, held), each of these in turn, with
a probe asking what a pilot's screen is drawn from every 5 s (the health,
the page, the chart, a tile, a nav log, a Brief, traffic and the feeds'
status), `infra/server/health.sh` run every minute as the server runs it
(in Linux, on this Docker, restarting what is unhealthy), and the
gateway's ALERT lines kept:

- **kill** each of the planner, gateway, weather, ingest and Postgres: a
  SIGKILL of its main process, as an out-of-memory kill is. It must come
  back by itself (Docker's restart policy).
- **pause** each: `docker pause` for 3 minutes, unpaused by hand, since
  nothing on the server would. The report says whether health.sh saw it.
- **hang** each: a SIGSTOP of its main process. Its health check fails,
  Docker calls it unhealthy and health.sh must restart it, with no hand,
  within 20 minutes. The planner's health check allows 10 minutes
  (production's), so it is the slowest.
- **feed** aviationweather.gov, NOMADS, the FAA (aeronav, NASR, TFRs, the
  NOTAM API, the registry) and adsb.lol: their addresses dropped from the
  planner, weather and ingest for 20 minutes, past the feeds' 15-minute
  alert, as a host that does not answer.
- **disk**: the Docker VM's disk, where Postgres and the live stores are,
  filled to 95% for 15 minutes.

Each must leave pilots what [RUNBOOKS.md](RUNBOOKS.md), "What pilots see
when each feed fails", says: routes, nav logs and Briefs still answering
on the stored copy, and the outage said where the figure goes. It must
come back by itself, and any outage longer than an alarm's window must
have mailed the owner. The report judges each alarm of
`infra/cloudformation/template.yaml` from the run: HealthAlarm (the health
check down 4.5 minutes), ServicesAlarm (health.sh's count for 15 minutes),
DataDiskAlarm (85% for 10 minutes) and GatewayAlertAlarm (an ALERT line).
The origin certificate's alarm is not judged: the Mac runs no Caddy.

### The changeover rehearsal

The services have no clock of their own to set, so a planner is started
beside the live one with libfaketime, 25 minutes before the next 0901Z
chart and AIRAC changeover (the engine's `data_cycle` names it;
`CHANGEOVER=<UTC time>` another). It runs on the live tree's data
mounted read-only, so the rehearsal changes nothing on disk, and it is
asked once a minute until ten past. It checks claude/data-cycles' fixes:

- before 0901Z no FAA data set is called out of date, in the status or
  the log;
- from 0901Z the new edition is the one in force, and the map's chart
  cycle is the new one;
- the next cycle was staged before its date (the status's `charts.next`,
  the offline catalog's `next_cycle`); staging starts seven days ahead, so
  a rehearsal more than a week out reports it not staged yet, which is
  right;
- the phones' kept regions: the engine's `data_cycle`, asked as the
  phones ask it, calls a region kept on the old cycle current at 0900Z and
  expired at 0901Z; with `PHONES=1`, the phones' own tests of it
  (`OfflineChartsTests`, `OfflineTest`) run too.

## Reading the report

`~/wingtip-after-merge/<date>/report.md`, written again after each piece,
with each piece's own folder beside it (k6's output and figures, the
samples, the probe, health.sh's lines, the scanners' JSON). From the top:

- **Each piece's exit and minutes.** 99 from a load piece is a limit
  missed, which the stress run means to find; any other non-zero exit is
  in that piece's `.txt`.
- **Stress**: each step's requests a second, errors and the journey
  nearest its limit, then the breaking point and what was nearest its end
  at the step that broke: CPU across the two cores, each service's memory
  against its limit, Postgres connections busy against the gateway's pool
  of 10, and the planner's threads against its pool of 40. The highest is
  what hit it first, and that is the one to fix or size for.
- **The planner rate limit to set**: per client, on `/api/planner/*`
  without the tiles, ten pilots' worth of asking and never more than a
  quarter of what the server held, so four runaway clients cannot take it
  (the ops audit's open item 16, `PlannerProxyController`).
- **Soak**: the journeys over the two hours and what grew per hour.
- **Chaos**: per fault, how long until it was back, whether by itself,
  what the probe saw (each row's failures and the words the answer said),
  when health.sh saw it, and the alarms that would have mailed.
- **Changeover**: each check, yes or no.
- **Scans**: every finding with a first triage by rule (a dev-only
  lockfile, a fixed version to bump to, a base image to rebuild); confirm
  each before acting, and fix or file it as an issue.

A "no" is reproduced on its own: `--redo <piece>`, or the piece's script in
`scripts/dev/after-merge/` with its variables. The campaign deletes the
load test's accounts (`@load.wingtip.invalid`) and stops the stack at
its end.
