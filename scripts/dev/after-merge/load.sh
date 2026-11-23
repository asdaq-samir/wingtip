#!/usr/bin/env bash
# One load profile of the after-merge campaign, on the stack held to a
# t3a.large (infra/load-tests/t3a-large.yml): k6's pilots.js under PROFILE
# with the sampler beside it, its results in $OUT/<profile>/ (k6.txt,
# summary.json, samples.jsonl). report.py reads them.
#
#   scripts/dev/after-merge/load.sh stress|soak|spike|load
#
# Run by scripts/dev/after-merge.sh in a turn of its own (--alone): a
# measurement wants a quiet Mac (docs/LOCAL-DEV.md).
set -euo pipefail
# shellcheck source=scripts/dev/after-merge/lib.sh
source "$(dirname "$0")/lib.sh"
profile=${1:?stress, soak, spike or load}
dir=$OUT/$profile
rm -rf "$dir" && mkdir -p "$dir"

stack_up
# Every route's first pass is cold (the planner caches a route's work for
# 15 minutes): one pilot's round first, so the profile measures the warm
# path and the cold one is in the maximum only once.
k6_run load "$dir/warm" -e PILOTS=1 -e HOLD=30s || true
say "$profile: k6 starting"
watch_start sample_loop "$dir/samples.jsonl"
status=0
k6_run "$profile" "$dir" || status=$?
watch_stop sample_loop
# 99 is a threshold crossed, which a stress run is meant to find.
say "$profile: k6 exited $status"
echo "$status" > "$dir/exit"
docker compose -p wingtip --project-directory "$repo" logs --since 3h --no-color planner gateway 2> /dev/null |
  grep -E 'OOM|Killed|Traceback|ERROR|"level": ?"ERROR"' | tail -200 > "$dir/errors.txt" || true
for s in planner gateway db weather ingest; do
  docker inspect -f "$s oom={{.State.OOMKilled}} restarts={{.RestartCount}}" "$(c "$s")" 2> /dev/null
done > "$dir/containers.txt"
[ "$status" = 0 ] || [ "$status" = 99 ]
