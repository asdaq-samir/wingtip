#!/usr/bin/env bash
# What the after-merge campaign's pieces share (scripts/dev/after-merge.sh,
# docs/TESTING-AFTER-MERGE.md): where results go, the stock tools'
# versions, the stack held to a t3a.large, k6, and the two watchers that
# run beside a load: the sampler (each service's CPU and memory, Postgres's
# connections, the planner's threads and open files, the data's size) and
# the probe (what a pilot's requests answer, every few seconds). Sourced,
# never run.
# shellcheck shell=bash disable=SC2034

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
# A campaign not finished is taken up again in its own folder, whatever
# the day (after-merge.sh points `current` at it and marks it finished).
home=$HOME/wingtip-after-merge
if [ -z "${AFTER_MERGE_OUT:-}" ] && [ -L "$home/current" ] && [ ! -f "$home/current/finished" ]; then
  AFTER_MERGE_OUT=$(readlink "$home/current")
fi
OUT=${AFTER_MERGE_OUT:-$home/$(date +%F)}
mkdir -p "$OUT/state"

# The stock tools, one version each, all at least two weeks old; read by
# the scripts that source this (so shellcheck, which reads this file
# alone, is told they are used: SC2034, the whole file).
K6_IMAGE=grafana/k6:1.3.0
ZAP_IMAGE=ghcr.io/zaproxy/zaproxy:2.16.1
TRIVY_IMAGE=aquasec/trivy:0.66.0
OSV_IMAGE=ghcr.io/google/osv-scanner:v2.2.2
NETSHOOT_IMAGE=nicolaka/netshoot:v0.14
DOCKER_CLI_IMAGE=docker:28.5.1-cli
ALPINE_IMAGE=alpine:3.22

NET=wingtip_default
say() { echo "$(date -u +%FT%TZ) after-merge: $*" | tee -a "$OUT/log.txt" >&2; }
done_mark() { date -u +%FT%TZ > "$OUT/state/$1.done"; }
is_done() { [ -f "$OUT/state/$1.done" ]; }
c() { echo "wingtip-$1-1"; }

# The live tree's compose files, with the t3a.large caps over them.
compose() {
  local files=(-f "$repo/docker-compose.yml")
  [ -f "$repo/docker-compose.override.yml" ] && files+=(-f "$repo/docker-compose.override.yml")
  docker compose -p wingtip --project-directory "$repo" "${files[@]}" -f "$repo/infra/load-tests/t3a-large.yml" "$@"
}

# Up as a t3a.large from the images built (go-live.sh --up builds them),
# and wait until every service with a health check says healthy: the
# planner's warm takes up to ten minutes.
stack_up() {
  say "stack up, held to a t3a.large"
  compose up -d --no-build --remove-orphans > /dev/null
  wait_healthy 900
}

wait_healthy() {
  local deadline=$((SECONDS + $1)) bad
  while [ $SECONDS -lt $deadline ]; do
    bad=$(compose ps --format '{{.Service}} {{.Health}}' | awk '$2 != "" && $2 != "healthy"' || true)
    [ -z "$bad" ] && return 0
    sleep 10
  done
  say "not healthy after $1 s: $bad"
  return 1
}

# Back to the stack's own settings, then down: the Mac stays quiet
# (CLAUDE.md, "The stack stays down").
stack_down() {
  docker compose -p wingtip --project-directory "$repo" stop > /dev/null 2>&1 || true
}

# k6 on its own cores, on the stack's network, so neither the Mac's
# loopback nor the services' two cores are in its way.
# The sign-in link is read from Mailpit, whose UI login is in .env; without
# it every inbox poll fails and the run counts them as errors (2026-11-22).
: "${MAILPIT_UI_AUTH:=$(grep -s '^MAILPIT_UI_AUTH=' "$repo/.env" | cut -d= -f2-)}"
k6_run() {
  local profile=$1 dir=$2
  shift 2
  mkdir -p "$dir"
  docker run --rm --network "$NET" --cpuset-cpus "${K6_CPUSET:-2-5}" \
    -v "$repo/infra/load-tests:/s:ro" -v "$dir:/out" \
    -e PROFILE="$profile" -e SUMMARY=/out/summary.json -e RUN="$profile-$(date +%s)" \
    -e BASE_URL=http://gateway:8080 -e TILE_URL=http://planner:8000/api \
    -e MAILPIT_URL=http://mailpit:8025 -e MAILPIT_AUTH="${MAILPIT_UI_AUTH:-}" \
    "$@" "$K6_IMAGE" run --quiet /s/pilots.js > "$dir/k6.txt" 2>&1
}

# One sample a SAMPLE_S (10 s): each container's CPU and memory, Postgres's
# connections by state, the planner's threads (its thread pool is where a
# synchronous endpoint waits) and open files; every 30th, the data's size.
sample_loop() {
  local file=$1 n=0 data=${WINGTIP_DATA:-$repo/data}
  while :; do
    {
      printf '{"t":%s,"stats":[' "$(date +%s)"
      docker stats --no-stream --format '{{json .}}' | paste -sd, -
      printf '],"pg":"%s"' "$(docker exec "$(c db)" psql -U wingtip -d wingtip -tAc \
        "select coalesce(state,'none')||':'||count(*) from pg_stat_activity where datname='wingtip' group by 1" 2> /dev/null | paste -sd' ' -)"
      printf ',"planner":"%s"' "$(docker exec "$(c planner)" sh -c 'grep Threads /proc/1/status | tr -d "\t"; echo " fds:$(ls /proc/1/fd | wc -l)"' 2> /dev/null | paste -sd' ' -)"
      if [ $((n % 30)) = 0 ]; then
        printf ',"du_kb":"%s"' "$(du -sk "$data/raw/chart_tiles.nosync" "$data/raw/charts.nosync" "$data/raw/weather" 2> /dev/null | awk '{printf "%s=%s ", $2, $1}')"
        printf ',"live_kb":"%s"' "$(docker exec "$(c planner)" du -sk /live 2> /dev/null | cut -f1)"
        printf ',"db_bytes":"%s"' "$(docker exec "$(c db)" psql -U wingtip -d wingtip -tAc 'select pg_database_size(current_database())' 2> /dev/null)"
      fi
      echo "}"
    } >> "$file"
    n=$((n + 1))
    sleep "${SAMPLE_S:-10}"
  done
}

# What a pilot sees, every PROBE_S (5 s): the status, time and the first
# words of each answer a pilot's screen is drawn from, through the gateway.
# The page is /app/plan (the gateway serves no page at /: always 404), and
# traffic is asked around a point, as the app asks it (a box was always 422).
probe_loop() {
  local file=$1 q="dep=C81&dest=KDLH" name url code
  local -a asks=(
    "health http://localhost:8080/actuator/health"
    "web http://localhost:8080/app/plan"
    "chart http://localhost:8080/api/planner/chart"
    "tile http://localhost:8084/api/chart-tile/sec/9/130/189.png"
    "navlog http://localhost:8080/api/planner/navlog?$q"
    "brief http://localhost:8080/api/planner/briefing?$q"
    "traffic http://localhost:8080/api/planner/traffic?lat=42&lon=-88&radius=30"
    "feeds http://localhost:8084/api/status/feeds"
  )
  while :; do
    for ask in "${asks[@]}"; do
      name=${ask%% *} url=${ask#* }
      code=$(curl -s -o "$OUT/state/probe.body" -w '%{http_code} %{time_total}' --max-time 30 "$url" || echo "000 30")
      printf '{"t":%s,"name":"%s","code":%s,"s":%s,"said":%s}\n' "$(date +%s)" "$name" "${code% *}" "${code#* }" \
        "$(grep -oiE '[^"]{0,60}(unavailable|stale|not answering|down|expired|past its cycle)[^"]{0,60}' "$OUT/state/probe.body" 2> /dev/null |
          head -3 | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')" >> "$file"
    done
    sleep "${PROBE_S:-5}"
  done
}

# Start and stop a watcher beside a run.
watch_start() { "$1" "$2" & echo $! > "$OUT/state/$1.pid"; }
watch_stop() { kill "$(cat "$OUT/state/$1.pid" 2> /dev/null)" 2> /dev/null || true; }
trap 'watch_stop sample_loop; watch_stop probe_loop' EXIT
