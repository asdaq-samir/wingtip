#!/usr/bin/env bash
# ci.yml's e2e: waits for each piece scripts/ci/e2e_stack.sh started in the
# background (the network, the database, the stack), then for the services
# healthy, the page served and the planner's own word that it is warm
# (healthy is not ready), each moment in /tmp/e2e-out/timeline from T0, the
# job's first step. A piece that failed is an ::error with its log's tail.
# `e2e_wait.sh playwright` waits for the Playwright image's pull alone.
set -euo pipefail
pieces=(net db stack)
[ "${1:-}" != playwright ] || pieces=(playwright)
for job in "${pieces[@]}"; do
  while [ ! -f "/tmp/e2e-out/$job.exit" ]; do sleep 1; done
  if [ "$(cat "/tmp/e2e-out/$job.exit")" != 0 ]; then
    tail -40 "/tmp/e2e-out/$job.log"
    tail -25 "/tmp/e2e-out/$job.log" | python3 -c 'import sys; t=sys.stdin.read().replace("%","%25").replace("\n","%0A"); print(f"::error title='"$job"' failed::{t[:4000]}")'
    exit 1
  fi
done
[ "${pieces[0]}" != playwright ] || exit 0
docker compose -f docker-compose.yml -f infra/docker-compose.ci.yml up -d --no-build --wait gateway planner weather
echo "$(($(date +%s) - T0)) healthy" >> /tmp/e2e-out/timeline
for _ in $(seq 1 240); do
  curl -sf -o /dev/null http://localhost:8080/app/plan && break
  sleep 1
done
echo "$(($(date +%s) - T0)) the page" >> /tmp/e2e-out/timeline
for _ in $(seq 1 900); do
  curl -sf http://localhost:8084/ | grep -q '"warm":true' && break
  sleep 1
done
curl -sf http://localhost:8084/ | grep -q '"warm":true' || { echo "the planner never reported itself warm"; exit 1; }
echo "$(($(date +%s) - T0)) the planner warm" >> /tmp/e2e-out/timeline
