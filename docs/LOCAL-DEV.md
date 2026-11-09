# Running it locally

The whole stack on one machine, on a phone over the Wi-Fi, and the
scripts that keep the owner's Mac tidy. What the services are is
[ARCHITECTURE.md](ARCHITECTURE.md); the checks and CI are [CI.md](CI.md).

## Prerequisites

- **Docker Desktop** with Compose v2. Nothing else is installed natively:
  every service builds its own image, and the checks run in containers.
- **Git.**
- **An Anthropic API key**, only for the Claude features (the Brief's
  narrative, checkpoint notes, the words, the assistant, the mock oral).
  Put `ANTHROPIC_API_KEY=sk-...` in `.env` at the repository's root
  (gitignored; Compose reads it). Without one those features say the
  model cannot be reached and everything else works: the key is read
  with `${ANTHROPIC_API_KEY:-}`, so a missing key fails no command.
- **Xcode and XcodeGen**, or **the Android SDK and JetBrains' JDK 21**,
  only for the phone apps ([NATIVE.md](NATIVE.md), [NATIVE-ANDROID.md](NATIVE-ANDROID.md)).
- **The AWS CLI**, only for a deploy ([README-AWS.md](README-AWS.md)).

## First run

```bash
git clone https://github.com/asdaq-samir/wingtip.git
cd wingtip
docker compose up -d          # gateway, planner, ingest, weather, assistant, db, mailpit, dev-services
```

The first start downloads the FAA's reference data (about a gigabyte) and
takes some minutes before the planner is healthy; `docker compose ps`
shows each service's health. Then open
[localhost:8080/app](http://localhost:8080/app).

### Signing in

The local stack has a mail host, Mailpit, so it runs as a deployment
does: reading is open, and saving needs a session.

1. In the app, choose Sign in and enter an address.
   `developer@example.com` also gets the developer role (the console and
   the training workspace); add your own to `APP_DEVELOPER_EMAILS` in `.env`.
2. Open the inbox at [localhost:8025](http://localhost:8025) and follow
   the sign-in link.

Google and Apple sign-in need credentials of your own and the `oauth`
Spring profile ([services/gateway/README.md](../services/gateway/README.md)).

## Addresses

Every port is on `127.0.0.1` unless `.env` says otherwise (below).

| What | Address | Service |
|---|---|---|
| The app (bare `/app` opens Plan) | [localhost:8080/app](http://localhost:8080/app) | gateway |
| The developer page: training workspace and console | [localhost:8080/app/dev](http://localhost:8080/app/dev) | gateway |
| The gateway's API docs and spec | [/swagger-ui/index.html](http://localhost:8080/swagger-ui/index.html), [/v3/api-docs](http://localhost:8080/v3/api-docs) | gateway |
| Health | [localhost:8080/actuator/health](http://localhost:8080/actuator/health) | gateway |
| The planner's API docs | [localhost:8084/docs](http://localhost:8084/docs) | planner |
| The assistant's API docs | [localhost:8085/docs](http://localhost:8085/docs) | assistant |
| The sign-in inbox | [localhost:8025](http://localhost:8025) | mailpit |
| Jupyter (token `wingtip`) | [localhost:8888](http://localhost:8888) | ml, on request |
| Traces | [localhost:16686](http://localhost:16686) | jaeger, on request |

The apps only ever talk to the gateway; it proxies `/api/planner/*` to
the planner and the assistant. Port 8084 is for debugging. The database
is never published.

## On a phone, over the Wi-Fi

A phone needs HTTPS for its position and for the route's charts kept
offline, so the gateway also listens on 8443 once it has a certificate.

```bash
infra/local-https/make-certs.sh 192.168.1.42   # this Mac's address on the Wi-Fi
cat >> .env <<'EOF'
PUBLISH_ADDRESS=0.0.0.0
PHONE_BASE_URL=https://192.168.1.42:8443
MAILPIT_UI_AUTH=<user>:<password>
EOF
docker compose up -d
```

- `PUBLISH_ADDRESS` opens the gateway's two ports and the inbox on every
  interface, for a network you trust. Compose refuses to start without
  `PHONE_BASE_URL` (where the sign-in link points) and `MAILPIT_UI_AUTH`
  (the inbox holds sign-in links) once it is set.
- Install `infra/local-https/certs/ca.pem` on the phone once; the script
  prints the steps for iPhone and Android. The authority's own key stays
  in `~/.config/wingtip-local-ca`, out of the repository, and is limited
  to private addresses and `localhost` (`make-certs.sh --new-ca <address>`
  replaces an older one).
- Then open `https://<address>:8443/app`, and add it to the home screen to
  open it as an app. Over HTTPS the map shows your position, and its menu
  keeps the route's charts offline: the service worker holds the chart
  tiles within 10 nm of the course with the course, checkpoints and nav
  log. The briefing and the weather are not kept, since a cached METAR
  could only be shown as if it were current.
- `DEV_PUBLISH_ADDRESS=0.0.0.0` opens the planner (8084) and Jupyter
  (8888) too. Neither has a password and Jupyter runs code; the assistant
  and the database stay on loopback whatever it says.

The top of [`docker-compose.yml`](../docker-compose.yml) lists every such
setting.

### Front-end work without rebuilding the image

```bash
cat >> .env <<'EOF'
COMPOSE_PROFILES=web-dev
WEB_DIST_MOUNT=/app/static/app
EOF
docker compose up -d
```

`web-build` runs `vite build --watch` into `apps/web/dist` and the gateway
serves that folder. Each build is swapped in whole, `index.html` last, so
a phone that loads mid-build never gets half of one
([apps/web/README.md](../apps/web/README.md)).

### Going live for the owner

`scripts/dev/go-live.sh [branch]` puts a branch (by default
`claude/integration`) on the owner's stack for the phone. It runs the
stack from its own worktree, `~/Developer/wingtip-live`, so the main
checkout stays on `main`; links the main checkout's `.env`, certificates
and `data/`; follows the Mac's address if DHCP moved it (a new
certificate and `PHONE_BASE_URL`); rebuilds what changed; and prints the
address when every service is healthy.

## The jobs and on-demand services

The jobs are behind the `jobs` profile, so `docker compose up` never
starts one. The developer console starts them through `dev-services`,
which can start a container but not create one, so create them once:

```bash
docker compose create retrain charts charts-overlays charts-next
```

| Command | What it does |
|---|---|
| `docker compose run --rm retrain` | The whole training run, every stage in order; each model promoted only if it beats the one serving |
| `docker compose run --rm retrain collect` (or `engineer-features`, `retrain`) | One stage |
| `docker compose run --rm --entrypoint python retrain -m wingtip.model_registry evaluate` | Evaluate or promote by hand |
| `docker compose run --rm charts` | The chart cycle: overlay tiles where due, then the FAA's current cycle fetched, rendered and packed where due |
| `docker compose run --rm charts overlays` | The overlay tiles alone |
| `docker compose run --rm charts pack` | A cycle's loose tiles into archives (a cycle drawn before archives) |
| `docker compose run --rm charts-next` | Stage the FAA's next cycle before its date |
| `docker compose up ml` | Jupyter, for the notebooks ([DATA.md](DATA.md#notebooks)) |
| `TRACING=true docker compose --profile tracing up -d jaeger gateway planner` | Traces in Jaeger |

The planner starts the charts jobs by itself when a cycle is due, inside
`CHARTS_REFRESH_WINDOW` (01:00 to 06:00 by default); `CHARTS_AUTO_REFRESH=0`
and `CHARTS_CYCLE_AUTO=0` turn that off. The training run writes each
stage to `data/models/run.json`, which the console follows; one run at a
time. [services/jobs/README.md](../services/jobs/README.md) has the rest.

## The developer scripts

All in `scripts/dev/`, each with its usage at its top.

| Script | What it does |
|---|---|
| `check.sh <area>` or `check.sh all-changed` | The quick checks for a part of the repo (web, py, planner, ingest, assistant, weather, jobs, engine, java, ios, android), in Docker, warm from any worktree's first run ([CI.md](CI.md)) |
| `one-at-a-time.sh "<label>" <command>` | Runs a heavy command (a suite, an image build, a browser run) in one of two turns, waiting while memory is short; `--alone` takes the whole machine for a measurement |
| `validate-wave.sh` | The end-of-wave validation on `claude/integration`: every check area, the image builds, the `@smoke` browser specs on a throwaway stack, the iPad tests; one table of what passed |
| `go-live.sh [branch]` | A branch on the owner's stack for the phone (above) |
| `tidy-local.sh [--dry-run]` | Removes merged, clean worktrees and branches and stopped scratch containers; never volumes, never a running agent's worktree |
| `tidy-branches.sh` | Deletes local `worktree-agent-*` branches already on `origin/main` |
| `docker-tidy.sh` | Reclaims Docker disk, keeping recent build layers and every named volume |
| `backup-db.sh`, `install-backup.sh` | The nightly database dump (below) |
| `install-hooks.sh` | Installs the pre-push hook (tsc and ESLint, ruff, `cargo check` for what a push changes) |
| `rename-local.sh` | Once, on a Mac that ran the stack before the rename to Wingtip |

### The nightly database backup

`scripts/dev/install-backup.sh` installs a launchd agent that runs
`backup-db.sh` at 03:30 every day: `pg_dumpall` of the `db` container into
`~/Developer/branch-backup/db-YYYY-MM-DD.sql.gz`, kept only when it is
whole, the newest 14 kept, hand-named dumps (`db-before-*.sql.gz`) never
touched. Its log is `~/Library/Logs/wingtip-db-backup.log`;
`install-backup.sh --now` runs one at once and `--remove` takes it out.
The server's backups are in [README-AWS.md](README-AWS.md#backups-and-restore).

## Gotchas

- **A rebuilt image needs a recreated container.** `docker compose up
  <service>` can reuse the old one; `docker compose up -d --build
  --force-recreate <service>` does not.
- **`data/raw` (about 600 MB and up) stays in `.dockerignore`.** The
  services mount the repository at run time instead.
- **A checkout under iCloud Drive (`~/Desktop`, `~/Documents`) grows
  conflict copies** such as `file 2.ext`, which have broken Flyway's
  migrations and the planner's caches. Keep the checkout elsewhere; if
  one appears, delete the copy and restart the service that held it.
  `.gitignore`'s `* [0-9].*` keeps them out of commits.
- **`Path("s3://bucket/x")` collapses to `s3:/bucket/x`.** Code that
  rejects a remote URI checks the raw string for `://` before making a
  `Path` (`_reject_remote_uri` in `services/planner/wingtip/model_registry.py`).
- **A literal `--` inside an XML comment in `pom.xml`** breaks Maven with
  an opaque "Non-parseable POM".
- **Recent numpy, pandas and pyarrow wheels dropped Intel macOS**, one
  more reason everything runs in Docker.
