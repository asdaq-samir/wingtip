#!/usr/bin/env bash
# The after-merge campaign's cycle changeover rehearsal: a planner whose
# clock is faked (libfaketime; the services have no clock of their own to
# set, wingtip.data_cycles.now reads the system's) started 25 minutes
# before the next 0901Z changeover and watched across it, beside the live
# stack, on the live tree's data mounted read-only, so the rehearsal
# changes nothing on disk. It checks claude/data-cycles' fixes:
#
# - before 0901Z no FAA data set is called out of date (the Status page's
#   data_cycles, the log's "FAA data past its cycle");
# - from 0901Z the new edition is the one in force, and the map's chart
#   cycle is the new one where it was staged;
# - the next cycle was staged before its date (the status's charts.next,
#   the offline catalog's next_cycle);
# - the phones' kept regions: the engine's data_cycle, asked as the phones
#   ask it (OfflineKept.expired: kind chart, the kept cycle's date, the
#   minute), says current at 0900Z and expired at 0901Z; with PHONES=1 the
#   phones' own tests of it run too (OfflineChartsTests, OfflineTest).
#
#   scripts/dev/after-merge/changeover.sh
#   CHANGEOVER=2026-12-24T09:01:00Z ...   another changeover than the next chart one
#
# Results in $OUT/changeover/ (polls.jsonl, kept.json, planner.log).
set -euo pipefail
# shellcheck source=scripts/dev/after-merge/lib.sh
source "$(dirname "$0")/lib.sh"
dir=$OUT/changeover
rm -rf "$dir" && mkdir -p "$dir"
name=wingtip-after-merge-clock

stack_up
# The engine names the next changeover: no 0901Z or 56 days written here.
ask() {
  docker exec "$(c planner)" python3 -c '
import datetime, json, sys
from wingtip import data_cycles
kind, effective, on = sys.argv[1:4]
effective = datetime.date.fromisoformat(effective) if effective else None
on = datetime.datetime.fromisoformat(on.replace("Z", "+00:00")) if on else None
print(json.dumps(data_cycles.cycle(kind, effective, on)))' "$@"
}
at=${CHANGEOVER:-$(ask chart "" "" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("next_at",""))')}
[ -n "$at" ] || { say "changeover: the engine's data_cycle has no next_at: claude/data-cycles is not in this tree"; exit 1; }
epoch=$(python3 -c 'import sys, datetime; print(int(datetime.datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00")).timestamp()))' "$at")
utc() { python3 -c 'import sys, datetime; print(datetime.datetime.fromtimestamp(int(sys.argv[1]), datetime.timezone.utc).strftime(sys.argv[2]))' "$@"; }
say "changeover: rehearsing $at"
echo "{\"at\":\"$at\",\"epoch\":$epoch}" > "$dir/target.json"

# Staged ahead, as the real clock has it now.
curl -s --max-time 60 http://localhost:8084/api/status > "$dir/status-now.json" || true

# The phones' rule, asked at the minute before and the minute of.
current=$(ask chart "" "$(utc $((epoch - 60)) %FT%TZ)" | python3 -c 'import json,sys; print(json.load(sys.stdin)["current"])')
{
  echo "{\"kept_cycle\":\"$current\","
  echo "\"before\":$(ask chart "$current" "$(utc $((epoch - 60)) %FT%TZ)"),"
  echo "\"at\":$(ask chart "$current" "$(utc "$epoch" %FT%TZ)"),"
  echo "\"after\":$(ask chart "$current" "$(utc $((epoch + 60)) %FT%TZ)")}"
} > "$dir/kept.json"

# The planner image with libfaketime, its clock started at T-25m and
# running at the real rate; monotonic time left alone (uvicorn, timeouts).
docker build -q -t "$name" - > /dev/null << 'EOF'
FROM wingtip-planner
USER root
RUN apt-get update && apt-get install -y --no-install-recommends libfaketime && rm -rf /var/lib/apt/lists/* \
  && ln -s "$(dpkg -L libfaketime | grep 'libfaketime.so.1$' | head -1)" /usr/local/lib/libfaketime.so.1
USER appuser
EOF
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$(c planner)" | grep -vE '^(PATH|LD_PRELOAD|FAKETIME|HOSTNAME)=' > "$dir/env"
cat >> "$dir/env" << EOF
LD_PRELOAD=/usr/local/lib/libfaketime.so.1
FAKETIME=@$(utc $((epoch - 25 * 60)) '%F %T')
FAKETIME_DONT_FAKE_MONOTONIC=1
FAKETIME_DONT_RESET=1
TZ=UTC
CHARTS_AUTO_REFRESH=0
CHARTS_CYCLE_AUTO=0
FAA_DATA_AUTO_REFRESH=0
DEV_SERVICES_URL=
EOF
docker rm -f "$name" > /dev/null 2>&1 || true
trap 'docker logs "$name" > "$dir/planner.log" 2>&1 || true; docker rm -f "$name" > /dev/null 2>&1 || true' EXIT
# The live planner's mounts, read-only: what the switch reads is there,
# and nothing it would write lands in the live tree.
docker run -d --name "$name" --network "$NET" -p 127.0.0.1:8094:8000 --env-file "$dir/env" \
  --volumes-from "$(c planner):ro" --tmpfs /tmp "$name" > /dev/null
started=$(date +%s)

# Polled once a minute until ten past (the faked clock's), each poll the
# faked time, the data sets' states, the served chart cycle and the
# offline catalog's cycles.
until curl -sf --max-time 5 http://localhost:8094/ > /dev/null; do
  [ $(($(date +%s) - started)) -lt 900 ] || { say "changeover: the faked planner did not start"; exit 1; }
  sleep 10
done
while :; do
  faked=$((epoch - 25 * 60 + $(date +%s) - started))
  [ "$faked" -le $((epoch + 10 * 60)) ] || break
  {
    printf '{"faked":%s,"status":' "$faked"
    curl -s --max-time 50 http://localhost:8094/api/status || printf 'null'
    printf ',"chart":'
    curl -s --max-time 20 http://localhost:8094/api/chart || printf 'null'
    printf ',"offline":'
    curl -s --max-time 20 http://localhost:8094/api/offline-charts || printf 'null'
    echo "}"
  } | tr -d '\n' >> "$dir/polls.jsonl"
  echo >> "$dir/polls.jsonl"
  sleep 60
done

if [ "${PHONES:-0}" = 1 ]; then
  (cd "$repo/apps/ios" && xcodegen -q) || true
  sim=$(xcrun simctl list devices available -j | python3 "$repo/scripts/dev/newest_simulator.py" iPhone)
  "$repo/scripts/dev/one-at-a-time.sh" "after-merge kept regions iOS" "$repo/scripts/dev/xcodebuild.sh" \
    -project "$repo/apps/ios/Wingtip.xcodeproj" -scheme Wingtip -destination "platform=iOS Simulator,id=$sim" \
    -only-testing:WingtipTests/OfflineChartsTests test > "$dir/phones-ios.txt" 2>&1 && echo ok >> "$dir/phones-ios.txt" || true
  (cd "$repo/apps/android" && "$repo/scripts/dev/one-at-a-time.sh" "after-merge kept regions Android" \
    ./gradlew testDebugUnitTest --tests '*OfflineTest' > "$dir/phones-android.txt" 2>&1 && echo ok >> "$dir/phones-android.txt"; ./gradlew --stop > /dev/null 2>&1) || true
  xcrun simctl shutdown all > /dev/null 2>&1 || true
fi
say "changeover: done"
