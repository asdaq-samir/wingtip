# Operations: what is watched and where alerts go

What tells the owner the app is broken before a pilot writes in: the
services' uptime, the live feeds' freshness, and the faults and speed
the apps report from real devices. No third-party tracker is used for
any of it; everything goes to the app's own gateway and mail.

## Where alerts go

- **Mail**, from the gateway's monitor (`UptimeWatch`), through the mail
  the app already sends (`Mailer`): Mailpit locally (the inbox at
  http://localhost:8025, to `alerts@example.com`), the deployment's
  `MAIL_HOST` (Amazon SES) in production. To `APP_ALERT_EMAILS`
  (comma-separated; the owner's secret, `infra/server/env.example`), or
  the developers' addresses (`APP_DEVELOPER_EMAILS`) where it is unset.
  One message for everything a minute's check began or ended, with a
  `DOWN` or `BACK` line each; the subject says how many.
- **The gateway's log**, every alert, mail or none: `ALERT ...` and
  `RECOVERED ...` lines (CloudWatch's `wingtip-gateway` stream in
  production, README-AWS.md).
- **The planner's log**, each feed going stale and coming back, and a
  JSON POST to `FEED_ALERT_WEBHOOK` where one is set.
- **The developer console's Status**, every feed's line as last checked
  (`GET /api/status/feeds`); the pilot's Status page (and the iPhone's
  Setup, Map) the sources a pilot plans by that have stopped updating.

## Services

Each minute (at :30, UTC; `APP_MONITORING_CRON`), the gateway asks:

| Service | Asked | Down when |
|---|---|---|
| Planner | `GET /` | no 2xx within 10 s |
| Weather service | `GET /` (`WEATHER_SERVICE_URL`; not watched where unset) | the same; its products' freshness is a feed's, below |
| Gateway's database | the gateway's own `/actuator/health/readiness` | the same |

A service down for **5 minutes** in a row (`APP_MONITORING_DOWN_AFTER`,
an ISO duration) is mailed, and mailed again when it answers. A blip
shorter than that (a restart, a deploy) says nothing. The feeds are not
asked of a planner that is down.

The gateway cannot see itself stop. Docker restarts it
(`restart: unless-stopped`) and its health check fails, which the
server's own checks see; an outside check of `https://<host>/actuator/health/readiness`
is what would page for a gateway or host that is down.

## Live feeds

The planner judges each feed against its own cadence each minute
(`wingtip.feed_health`, `app.feeds.watch`) and marks one **alerting**
once it has been stale **15 minutes** (`FEED_ALERT_AFTER_MIN`); the
gateway mails that as it begins and ends.

| Feed | Stale when |
|---|---|
| SWIM STDDS (terminal radar, RVR, D-ATIS) | no message for 2 min, or disconnected |
| SWIM TFMS (flight plans, flow programs) | no message for 5 min, or disconnected |
| SWIM FNS (NOTAMs) | no message for 30 min, or disconnected |
| SWIM ITWS, SFDPS | disconnected only (quiet by nature) |
| Every SWIM feed | ingest has not beaten for 60 s |
| METARs, TAFs, AIRMETs and SIGMETs, PIREPs, G-AIRMETs | older than 3 of their idle turns (3 × 30 min), or past their validity |
| Winds aloft (GFS) | older than 3 × 2 h, or past validity |
| GLMP | older than 3 × 1 h |
| TFRs | older than 3 × 30 min |
| NEXRAD frames (radar) | older than 3 × 15 min |
| GOES frames (satellite) | older than 3 × 30 min |
| Charts, NASR, CIFP, DOF, offline packs | the edition is past its cycle (56-day charts, 28-day AIRAC; `wingtip.data_cycles`, 14 CFR 91.103) |
| The weather service | not answering (its products then unjudged) |

A SWIM feed not set up (no queue in ingest's settings) is "off", not
stale, and never alerts.

## Faults and speed from devices

All three apps report through one door, `POST /api/diagnostics`
(`DiagnosticsController`), with the app's version, the OS version and
phone, tablet or desktop, and nothing of the pilot's (no account,
cookie, position or route; the server scrubs queries, emails, home
folders and install ids, `DiagnosticText`):

| App | Faults | Speed |
|---|---|---|
| Web | uncaught errors, unhandled promises, renders React could not finish (`lib/errorReports`) | Core Web Vitals (`lib/speed`, Google's web-vitals), long tasks (`lib/longTasks`) |
| iPhone | MetricKit's crash, hang, CPU and disk-write diagnostics (`Diagnostics/DiagnosticsReporter`) | MetricKit's launch, resume, hang time, scroll hitches, peak memory, memory exits |
| Android | `ApplicationExitInfo` (crashes, ANRs with traces, low-memory kills), the uncaught handler (`diagnostics/`) | start-up time, slow frames (JankStats); Play vitals covers the rest once published |

Faults are kept **30 days** in the `diagnostics` table (let go each
night at 03:15 UTC and as reports come in), written to the gateway's
log as one line each, and read by a developer at `GET
/api/diagnostics?days=N` (newest 200, up to 30 days). Speed figures go
to `speed_samples` (400 days), read on the console's Speed page. A
caller may send 30 reports an hour; the rest are dropped.
docs/privacy-inventory.md lists what is collected.
