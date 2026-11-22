#!/usr/bin/env bash
# The after-merge campaign's chaos run: with 50 pilots on the stack (k6's
# load profile, held), take each piece out in turn and record what pilots
# see (the probe), what the server's own checks say (infra/server/health.sh
# every HEALTH_EVERY seconds, restarting what is unhealthy as it does on
# the server), the gateway's ALERT lines, and whether it all comes back
# with no hand on it. docs/RUNBOOKS.md, "What pilots see when each feed
# fails", is what the probe is held to; report.py judges each fault and
# which alarm of infra/cloudformation/template.yaml would have fired.
#
#   scripts/dev/after-merge/chaos.sh            every fault
#   CHAOS_ONLY="kill:planner feed:awc" ...      some
#
# Faults, in order:
#   kill:<s>   SIGKILL of the service's main process, a crash as an OOM
#              kill is: Docker's restart policy should bring it back
#   pause:<s>  docker pause for PAUSE_S (180), then unpaused by hand: a
#              frozen container, which nothing on the server unpauses
#   hang:<s>   SIGSTOP of the main process: its health check fails, Docker
#              calls it unhealthy and health.sh restarts it; SIGCONT by
#              hand after HANG_MAX (1200 s) if nothing did
#   feed:<f>   every address of the feed's hosts dropped from the planner,
#              weather and ingest for FEED_CUT_S (1200: past the feeds'
#              15-minute alert), as a host that does not answer
#   disk:95    the Docker VM's disk (Postgres, the live stores) filled to
#              95% for DISK_HOLD_S (900: two of DataDiskAlarm's periods)
# for s in planner gateway weather ingest db. Results in $OUT/chaos/.
set -euo pipefail
# shellcheck source=scripts/dev/after-merge/lib.sh
source "$(dirname "$0")/lib.sh"
dir=$OUT/chaos
mkdir -p "$dir"
services="planner gateway weather ingest db"
all=""
for s in $services; do all+="kill:$s pause:$s hang:$s "; done
all+="feed:awc feed:nomads feed:faa feed:adsb disk:95"
faults=${CHAOS_ONLY:-$all}

# Each feed's hosts, as the services ask them (macOS's bash 3.2 has no
# associative array).
hosts_of() {
  case $1 in
    awc) echo aviationweather.gov ;;
    nomads) echo nomads.ncep.noaa.gov ;;
    faa) echo aeronav.faa.gov nfdc.faa.gov tfr.faa.gov external-api.faa.gov www.faa.gov registry.faa.gov ;;
    adsb) echo api.adsb.lol adsb.lol vrs-standing-data.adsb.lol ;;
  esac
}

event() { printf '{"t":%s,"fault":"%s","what":"%s"}\n' "$(date +%s)" "$1" "$2" >> "$dir/events.jsonl"; }

# health.sh as the server runs it, in Linux (GNU date and df), on the
# stack's own Docker: the prod compose file's services asked of the live
# tree's (caddy left out, the Mac runs none), figures printed, not sent.
# Its data disk is a volume, so it reads the Docker VM's disk, as the fill
# below fills it.
health_image() {
  docker build -q -t wingtip-after-merge-health - > /dev/null << EOF
FROM $DOCKER_CLI_IMAGE
RUN apk add --no-cache bash coreutils openssl
RUN mkdir /shim && printf '%s\n' '#!/bin/bash' \
  'if [ "\$1" = compose ]; then' \
  '  case "\$*" in *"config --services"*) printf "%s\n" db planner ingest weather gateway; exit ;; esac' \
  '  args=(); skip=0; for a in "\$@"; do' \
  '    if [ \$skip = 1 ]; then skip=0; continue; fi' \
  '    case "\$a" in compose) ;; --env-file|-f) skip=1 ;; *) args+=("\$a") ;; esac; done' \
  '  exec /usr/local/bin/docker compose -p wingtip --project-directory /srv/wingtip/repo "\${args[@]}"' \
  'fi' 'exec /usr/local/bin/docker "\$@"' > /shim/docker \
  && printf '%s\n' '#!/bin/sh' 'echo "aws \$*"' > /shim/aws && chmod +x /shim/docker /shim/aws
ENV PATH=/shim:\$PATH
EOF
}

health_loop() {
  local conf=$dir/wingtip.conf
  printf 'AWS_REGION=us-east-1\nLOG_GROUP=/wingtip/server\nORIGIN_HOST=localhost\n' > "$conf"
  while :; do
    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v wingtip-after-merge-fill:/srv/wingtip \
      -v "$repo:/srv/wingtip/repo:ro" -v "$conf:/etc/wingtip.conf:ro" wingtip-after-merge-health \
      bash /srv/wingtip/repo/infra/server/health.sh 2>&1 | sed "s/^/$(date +%s) /" >> "$dir/health.log" || true
    sleep "${HEALTH_EVERY:-60}"
  done
}

# The process Docker started, seen from the VM, for a signal of our own.
signal() {
  local pid
  pid=$(docker inspect -f '{{.State.Pid}}' "$(c "$2")")
  docker run --rm --privileged --pid=host "$ALPINE_IMAGE" kill "-$1" "$pid"
}

# Back once every health check says healthy and the probe's health row
# answers: the time it took, or "never" after RECOVER_MAX.
recovered() {
  local fault=$1 deadline=$((SECONDS + ${RECOVER_MAX:-1200}))
  while [ $SECONDS -lt $deadline ]; do
    if wait_healthy 10 2> /dev/null && curl -sf --max-time 5 http://localhost:8080/actuator/health > /dev/null; then
      event "$fault" recovered
      return 0
    fi
    sleep 5
  done
  event "$fault" never
}

hosts_rule() {
  local op=$1 feed=$2 svc
  for svc in planner weather ingest; do
    # shellcheck disable=SC2086
    docker run --rm --net "container:$(c "$svc")" --cap-add NET_ADMIN "$NETSHOOT_IMAGE" sh -c "
      for h in $(hosts_of "$feed"); do for ip in \$(dig +short A \$h | grep -E '^[0-9.]+\$'); do
        iptables -C OUTPUT -d \$ip -j DROP 2>/dev/null && [ $op = -I ] || iptables $op OUTPUT -d \$ip -j DROP 2>/dev/null || true
      done; for ip in \$(dig +short AAAA \$h | grep ':'); do
        ip6tables -C OUTPUT -d \$ip -j DROP 2>/dev/null && [ $op = -I ] || ip6tables $op OUTPUT -d \$ip -j DROP 2>/dev/null || true
      done; done" > /dev/null 2>&1 || true
  done
}

fill_disk() {
  local size used need free
  read -r size used < <(docker run --rm -v wingtip-after-merge-fill:/fill "$ALPINE_IMAGE" df -Pk /fill | awk 'NR==2 {print $2, $3}')
  need=$((size * 95 / 100 - used))
  free=$(df -Pk /System/Volumes/Data | awk 'NR==2 {print $4}')
  if [ "$need" -le 0 ] || [ "$free" -lt $((need + 50 * 1024 * 1024)) ]; then
    event disk:95 "skipped: the VM needs ${need} KB more and the Mac has ${free} KB free (50 GB kept)"
    return 1
  fi
  docker run --rm -v wingtip-after-merge-fill:/fill "$NETSHOOT_IMAGE" fallocate -l "${need}K" /fill/blob
}

run_fault() {
  local fault=$1 kind=${1%%:*} what=${1#*:}
  event "$fault" start
  case $kind in
    kill) signal KILL "$what" ;;
    pause)
      docker pause "$(c "$what")" > /dev/null
      sleep "${PAUSE_S:-180}"
      docker unpause "$(c "$what")" > /dev/null
      event "$fault" "healed by hand"
      ;;
    hang)
      signal STOP "$what"
      local started=$SECONDS
      until [ "$(docker inspect -f '{{.State.StartedAt}}' "$(c "$what")")" != "$started_at" ] ||
        [ $((SECONDS - started)) -gt "${HANG_MAX:-1200}" ]; do sleep 10; done
      if [ "$(docker inspect -f '{{.State.StartedAt}}' "$(c "$what")")" = "$started_at" ]; then
        signal CONT "$what"
        event "$fault" "healed by hand"
      else
        event "$fault" "restarted by itself"
      fi
      ;;
    feed)
      local end=$((SECONDS + ${FEED_CUT_S:-1200}))
      # A host's addresses move (CDNs): asked again every half minute.
      while [ $SECONDS -lt $end ]; do hosts_rule -I "$what"; sleep 30; done
      hosts_rule -D "$what"
      event "$fault" healed
      ;;
    disk)
      if fill_disk; then
        sleep "${DISK_HOLD_S:-900}"
        docker run --rm -v wingtip-after-merge-fill:/fill "$ALPINE_IMAGE" rm -f /fill/blob
        event "$fault" healed
      fi
      ;;
  esac
  recovered "$fault"
  # Settle: the next fault starts on a stack that has been well a while.
  sleep "${SETTLE_S:-60}"
}

stack_up
health_image
docker volume create wingtip-after-merge-fill > /dev/null
say "chaos: 50 pilots on, then: $faults"
docker rm -f wingtip-after-merge-k6 > /dev/null 2>&1 || true
k6_run load "$dir/k6" -e HOLD=12h --name wingtip-after-merge-k6 &
k6pid=$!
watch_start probe_loop "$dir/probe.jsonl"
watch_start sample_loop "$dir/samples.jsonl"
watch_start health_loop "$dir/health.log"
trap 'watch_stop probe_loop; watch_stop sample_loop; watch_stop health_loop; docker rm -f wingtip-after-merge-k6 > /dev/null 2>&1 || true' EXIT
sleep "${BASELINE_S:-180}"
event baseline end

for fault in $faults; do
  started_at=""
  case $fault in hang:*) started_at=$(docker inspect -f '{{.State.StartedAt}}' "$(c "${fault#*:}")") ;; esac
  say "chaos: $fault"
  run_fault "$fault"
done

docker rm -f wingtip-after-merge-k6 > /dev/null 2>&1 || true
wait "$k6pid" 2> /dev/null || true
docker logs --timestamps "$(c gateway)" --since 24h 2>&1 | grep -E 'ALERT|DOWN|BACK' > "$dir/alerts.txt" || true
docker volume rm wingtip-after-merge-fill > /dev/null 2>&1 || true
say "chaos: done"
