# Runbooks: what to do when something goes wrong in production

Each alert the owner can get, what it means, and what to do, step by
step, on the AWS stack ([README-AWS.md](README-AWS.md)). What is watched
and the thresholds are in [OPERATIONS.md](OPERATIONS.md); this is the
doing. Every command runs from the Mac with the AWS CLI signed in, or on
the server in a Session Manager shell (README-AWS, "On the server"):

```bash
cd /srv/wingtip/repo
alias dc='docker compose --env-file /srv/wingtip/.env -f infra/docker-compose.prod.yml'
```

## Contents

- [Which alert is which](#which-alert-is-which)
- [A service down](#a-service-down)
- [A feed outage](#a-feed-outage) — [what pilots see when each feed fails](#what-pilots-see-when-each-feed-fails)
- [A bad or late FAA cycle](#a-bad-or-late-faa-cycle)
- [The disk filling](#the-disk-filling)
- [Rolling back a release](#rolling-back-a-release)
- [A Spot interruption](#a-spot-interruption)
- [Certificate renewal](#certificate-renewal)
- [Restore a backup](#restore-a-backup) — [the drill](#the-restore-drill)
- [Reading the logs](#reading-the-logs)
- [Load](#load)

## Which alert is which

Every alert is an email to the stack's `BudgetEmail` (the SNS topic,
confirmed once), or from the gateway's monitor to `APP_ALERT_EMAILS`.

| The email says | From | Runbook |
|---|---|---|
| `HealthAlarm`: not answering its health check | Route 53, through CloudFront, every 30 s | [A service down](#a-service-down), then [A Spot interruption](#a-spot-interruption) |
| `ServicesAlarm`: a service not running or healthy for 15 minutes | the server's `health.sh` | [A service down](#a-service-down) |
| `GatewayAlertAlarm`, or the gateway's own mail: `DOWN` / `BACK` lines | the gateway's minute check (`UptimeWatch`) | [A service down](#a-service-down) or [A feed outage](#a-feed-outage), by the line |
| `RootDiskAlarm` / `DataDiskAlarm`: over 85% | `health.sh` | [The disk filling](#the-disk-filling) |
| `OriginCertAlarm`, or ACM's "Certificate Approaching Expiration" | `health.sh`; ACM | [Certificate renewal](#certificate-renewal) |
| `BackupLateAlarm`, or "nightly backup failed" | `health.sh`; `backup.sh` | [Restore a backup](#restore-a-backup), its first step |
| `ChecksMissingAlarm`: no health figures for 15 minutes | CloudWatch | [A Spot interruption](#a-spot-interruption) |
| "the chart refresh task ... stopped without finishing" | EventBridge (`ChartRefreshFailedRule`) | [A bad or late FAA cycle](#a-bad-or-late-faa-cycle) |
| The budget at 80% of $50 | AWS Budgets | Cost Explorer; the usual cause is CloudFront requests or the server's type |

An alarm mails again when it clears. A Spot interruption's few minutes
may send a pair from `HealthAlarm` and `ChecksMissingAlarm` that need
nothing.

## A service down

1. Which: `dc ps` on the server. `health.sh` has already restarted a
   container Docker called unhealthy (its log: `tail /var/log/wingtip-health.log`).
2. Why: `dc logs --tail 200 <service>`, or from the Mac
   `aws logs tail /wingtip/server --since 1h --log-stream-name-prefix wingtip-<service>`.
   A planner restarting in a loop with `SettingsError` has a bad value in
   its settings; one killed with exit 137 ran out of memory (`docker inspect -f '{{.State.OOMKilled}}'`).
3. Start it: `dc up -d <service>`. The planner takes up to ten minutes to
   warm (its health check allows that), the gateway two.
4. Still failing after a deploy: [roll back](#rolling-back-a-release).
5. Postgres down takes the gateway's readiness with it, and so
   `HealthAlarm`. `dc logs db`; a full data disk is the usual cause
   ([The disk filling](#the-disk-filling)).

## A feed outage

The gateway's mail names the feed (`DOWN feed weather: metars ...`), stale
for 15 minutes. Its line in the developer console's Status says why.

- **A weather product** (METARs, TAFs, the advisories, winds, GLMP, TFRs,
  radar, satellite): the weather service fetches it on its schedule and,
  failing, keeps the stored copy, which the planner serves while it is
  valid (`weather_store.servable`). Nothing to do for an outage at NOAA
  or the FAA; it comes back by itself, and the `BACK` mail says so. Check
  the service is fetching at all: `dc logs --tail 50 weather`. A product
  failing alone for hours with an error that is not a timeout (a changed
  format) is a code fix.
- **SWIM** (STDDS, TFMS, FNS, ITWS, SFDPS): "not connected" with a login
  error is the subscription (the SCDS portal: an expired password, a
  queue removed); with a network error, `dc restart ingest`. Silence on a
  connected feed is usually the FAA's; their status is at
  [the SCDS portal](https://scds.swim.faa.gov).
- **ingest** (its own line where no SWIM feed is set up): `dc logs ingest`,
  `dc up -d ingest`.
- **An FAA data set past its cycle** (NASR, CIFP, the DOF): the planner
  looks for a new edition four times a day (`FAA_DATA_AUTO_REFRESH`).
  `dc logs planner | grep -i edition` says what it found. The charts are
  below.

### What pilots see when each feed fails

Nothing a pilot plans by is ever made up; a source that is down says so
where its figure would be (`lib/problems` on the web).

| Feed down | The server | A pilot sees |
|---|---|---|
| aviationweather.gov (METARs, TAFs, advisories, PIREPs) | the stored copy, until its product's validity ends | the last reports; past validity, "<product> unavailable from aviationweather.gov just now" where the weather goes, and the Status page's row |
| NOMADS (winds, GLMP) | the stored run, until it is past validity | times and fuel on the last run's winds; then no winds, said |
| TFRs | the stored list | the last TFRs, the Status row stale |
| SWIM | the live store's last messages | no D-ATIS, RVR or flow programs; NOTAMs as last heard; the Status row |
| adsb.lol and ADS-B Exchange (traffic) | nothing kept: asked as the map asks | traffic shows "—" (`TrafficUnavailable`) |
| The tile archive (CloudFront or S3) | no tile | the map without the chart under it; the route, the nav log and the Brief unaffected |
| The FAA's chart sheets (aeronav) | the corridor's sheets already on the disk | checkpoints off sheets already fetched; a new corridor's are read once it answers |
| SES | the alert mail fails (logged) | sign-in links do not arrive; `GatewayAlertAlarm` still reaches the owner by SNS |
| Google and Apple sign-in | | the email link still signs in |

## A bad or late FAA cycle

**Charts.** The refresh task (Fargate Spot, daily 08:30 UTC) stages the
next cycle in the week before its date, once the FAA has it up
(`next.json` in the tiles bucket); every planner takes it at 0901Z on
the date, and the next run makes it `serving.json`'s
(README-AWS, "Chart cycles"). So a run that fails has six more days.

1. The task's log: `aws logs tail /ecs/wingtip-chart-refresh --since 1d`.
   "not on aeronav.faa.gov yet" is the FAA being late, and it asks again
   each day; "sheets missing" is a sheet the FAA has not put up or that
   failed to download, tried again the next day.
2. Run it now rather than wait a day: the stack's `ChartRefreshNow` output.
3. What is staged and served:
   `aws s3 cp s3://<ChartTilesBucketName>/tiles/next.json -` and `.../serving.json -`.
4. **A bad cycle** (wrong tiles, a sheet drawn wrong): point
   `serving.json` back at the cycle before, whose archives are still in
   the bucket (kept 120 days). Each new `serving.json` keeps the one it
   replaced as `serving-previous.json`:

   ```bash
   T=s3://<ChartTilesBucketName>/tiles
   aws s3 cp $T/serving-previous.json $T/serving.json --cache-control "public, max-age=300" --content-type application/json
   aws s3 rm $T/next.json     # if it names the bad cycle, or the planners take it again at 0901Z
   ```

   Each planner moves within a minute; CloudFront keeps the pointer five
   minutes. The map then draws the cycle before, past its date: the
   gateway's alert stands until a good cycle is published (step 2, once
   the cause is fixed).
5. Past its date with nothing staged, the map draws the expired cycle and
   the gateway mails "Charts ... past its cycle" (14 CFR 91.103 wants the
   current one): run the task now (step 2); it draws the cycle in force in
   a few hours and publishes it.

**NASR, CIFP, the obstacles.** Fetched by the planner itself. A bad
edition (a parse error in the planner's log after the 28-day changeover):
`dc restart planner` fetches again; a format the FAA changed is a code fix,
and until then the planner keeps the edition it has, past its cycle, with
the alert standing.

## The disk filling

`health.sh` sends both disks' use every five minutes; 85% alarms.

**The system disk (20 GB)**: images, swap, the cron jobs' logs.

```bash
df -h / && docker system df
docker image prune -af          # every image not in use; deploy.sh prunes dangling ones
docker builder prune -af
journalctl --vacuum-size=200M
```

**The data disk** (`DataVolumeGb`, 30 GB): Postgres, the FAA data, the
chart sheets the checkpoints are read off, the weather store.

```bash
du -xh --max-depth=2 /srv/wingtip | sort -h | tail -20
```

The planner lets an older cycle's chart sheets go by itself every six
hours (`/srv/wingtip/data/raw/charts.nosync/<cycle>`,
`chart_upkeep.prune_behind_served`); the cycle in force's can go by hand
too, and the planner fetches a corridor's again as routes need them.
Nothing under `postgres` or `data/labels` is ever deleted by hand. To grow the disk, which gp3 does in place with the server up:

```bash
aws cloudformation deploy --region us-east-1 --stack-name wingtip \
  --template-file infra/cloudformation/template.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides DataVolumeGb=60 --no-execute-changeset   # look, then execute
# then on the server, once the volume says "optimizing":
xfs_growfs /srv/wingtip
```

## Rolling back a release

Each merge to `main` deploys `sha-<commit>` (README-AWS, "Deploys"); ECR
keeps the last 20 images of each service.

1. Find the last good commit: `git log --oneline origin/main`.
2. Deploy it:

   ```bash
   aws ssm send-command --region us-east-1 --targets Key=tag:Name,Values=<ServerName> \
     --document-name AWS-RunShellScript \
     --parameters 'commands=["/srv/wingtip/repo/infra/server/deploy.sh <full 40-character hash>"]'
   ```

3. Stop the next merge redeploying the bad one: revert the commit on a
   branch and merge it, which deploys the revert.
4. **The database goes forward only.** A release that added a Flyway
   migration leaves it applied: the older gateway starts on the newer
   schema (Flyway ignores migrations it does not know, `*:future`), which
   holds as long as the migration only added (a table, a column with a
   default, an index). One that dropped or renamed a column the older code
   reads fails Hibernate's check at start: roll forward with a fix, or
   [restore](#restore-a-backup) the night before, which loses the day's
   accounts and flights.

## A Spot interruption

Nothing to do. AWS gives two minutes' notice; the Auto Scaling group
starts another server, which takes over the address and the data disk
and is serving within minutes (README-AWS, "A new server"). The pair of
alarms it may send clears by itself.

If `HealthAlarm` stays in alarm past 15 minutes:

1. `aws autoscaling describe-scaling-activities --auto-scaling-group-name <group> --max-items 5`:
   "could not launch" with no Spot capacity in either type means waiting
   or deploying with `ServerPricing=on-demand` (it replaces the server,
   keeping the disk).
2. A server that is running but not serving: its first boot's log,
   `/var/log/cloud-init-output.log` (Session Manager). It waits for the
   data disk until the old server lets go of it.

## Certificate renewal

Two certificates, both renewed by themselves:

- **CloudFront's** (`app.<domain>`), from ACM, renewed by DNS while the
  validation record in Route 53 stands. ACM's "Approaching Expiration"
  email means that record has gone: put it back from the certificate's
  page in the ACM console ("Create records in Route 53").
- **The origin's** (`origin.<domain>`), from Let's Encrypt through Caddy,
  renewed 30 days out over port 80. `OriginCertAlarm` (under 14 days, or
  unreadable) means it has failed for two weeks:

  ```bash
  dc logs caddy | grep -iE 'certificate|acme|error' | tail -20
  dig +short origin.<domain>   # must be the server's address
  ```

  Port 80 must be open to anywhere (the security group) and
  `origin.<domain>` point at the server. Then `dc restart caddy`, which
  tries again at once. An expired origin certificate stops CloudFront
  reaching the server, which `HealthAlarm` shows.

## Restore a backup

The nightly backup (`backup.sh`, 07:17 UTC) leaves in
`s3://<ServerBucketName>/backups/<date>/`: `postgres.dump`, `manifest.txt`
(each table's rows, and the Flyway version) and `labels.tar.gz`. A failed
night mails; `BackupLateAlarm` mails a night that never ran. First,
whatever the alert: `tail -50 /var/log/wingtip-backup.log` on the server,
and run `infra/server/backup.sh` by hand once it is fixed.

To restore, on the server:

1. Pick the night: `aws s3 ls s3://<ServerBucketName>/backups/`. Drill it
   first if there is time ([below](#the-restore-drill)).
2. Keep the deletions made since: `infra/server/restore-deletions.sh save`.
3. Stop what writes to the database: `dc stop gateway planner`.
4. Restore:

   ```bash
   B=s3://<ServerBucketName>/backups/<date>
   aws s3 cp $B/postgres.dump - | dc exec -T db pg_restore -U wingtip -d wingtip --clean --if-exists
   aws s3 cp $B/labels.tar.gz - | tar -xz -C /srv/wingtip/data
   ```

5. Put the deletions back: `infra/server/restore-deletions.sh apply`.
6. Start them again: `dc up -d gateway planner`. The gateway migrates the
   schema forward if the dump is older than the code, and deletes again
   every account deleted since the dump (`DeletionsReapplied`). Its
   Flyway runs as the owner and gives the app's own role, `wingtip_app`,
   the rows of every table the dump brought back, and no more
   (`db/callback/afterMigrate.sql`), so the restore needs no grant by hand.
7. Check: `dc exec -T db psql -U wingtip -d wingtip -c 'SELECT count(*) FROM pilots'`
   against the night's `manifest.txt`, and sign in.

A lost data disk is restored from its daily snapshot instead (README-AWS,
"A new server"), `restore-deletions.sh save` before and `apply` after.

### The restore drill

[`scripts/dev/restore-drill.sh`](../scripts/dev/restore-drill.sh) restores
a backup into a scratch Postgres of its own, checks it against its
manifest, starts the gateway on it (Flyway migrates it, Hibernate
validates it, deleted accounts go again) and throws it all away:

```bash
scripts/dev/one-at-a-time.sh "restore drill" scripts/dev/restore-drill.sh s3://<ServerBucketName>/backups/<date>
scripts/dev/one-at-a-time.sh "restore drill" scripts/dev/restore-drill.sh      # the Mac's newest nightly dump
```

Run it once a month and before any restore. The night's CI job
(`backup-restore`) drills the dump format itself on throwaway rows.

## Reading the logs

Every service's log is in CloudWatch, `/wingtip/server`, a stream per
container, kept 30 days, as one JSON object a line (the gateway's in
Elastic Common Schema, the planner's, weather's and ingest's
`{time, level, logger, message, request_id, error}`). The page's request
id (`X-Request-Id` on every answer) is on the gateway's lines and the
planner's both. In CloudWatch Logs Insights, the `/wingtip/server` group:

```
fields @timestamp, @logStream, message, coalesce(request_id, requestId) as id
| filter id = "<the id>"
| sort @timestamp asc
```

```
fields @timestamp, @logStream, message, error
| filter level = "ERROR" or `log.level` = "ERROR"
| sort @timestamp desc | limit 50
```

Postgres writes every statement slower than half a second, and every
wait on a lock over a second, to its own stream (`wingtip-db-1`), by its
text alone:

```
fields @timestamp, @message
| filter @logStream like /db/ and @message like /duration:|still waiting/
| sort @timestamp desc | limit 50
```

## Load

[`infra/load-tests/pilots.js`](../infra/load-tests/pilots.js) is 50 pilots
at once with k6: the map's chart and airports, a screenful of tiles, a
route's course, checkpoints and nav log, and its Brief, each with its own
95th-percentile threshold. Against the live stack on the Mac, quiet
(`--alone`):

```bash
scripts/dev/one-at-a-time.sh --alone "load test" \
  docker run --rm -i --add-host=host.docker.internal:host-gateway \
    -e BASE_URL=http://host.docker.internal:8080 grafana/k6:1.3.0 run - < infra/load-tests/pilots.js
```

k6 exits non-zero when a threshold is missed. Read beside it the planner's
CPU and memory (`docker stats`), and run it again after a change that
touches a route's work. The server is a t3a.large's two cores; the Mac
has more, so a pass here is a ceiling, not a promise.
