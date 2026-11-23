#!/usr/bin/env bash
# ci.yml's e2e job's smaller steps, here so the workflows stay within their
# line budget (scripts/ci/workflow_rules.py):
#
#   e2e_steps.sh logs          the stack's logs, and the planner's last lines as a warning
#   e2e_steps.sh lighthouse    Lighthouse on the planner page at its phone settings, into /tmp/e2e-out
#                              (Chrome off /dev/shm, 64 MB in a container, where it lost scripts or crashed)
#   e2e_steps.sh detections    the corridor's chart detections read, for the charts cache
#   e2e_steps.sh this-cycle    every chart cycle but CYCLE's deleted, so the cache keeps this one
#                              (the planner's files are its own user's: sudo)
set -euo pipefail
compose=(docker compose -f docker-compose.yml -f infra/docker-compose.ci.yml)
case "${1:-}" in
  logs)
    "${compose[@]}" logs --no-color --tail 300 gateway planner weather
    "${compose[@]}" logs --no-color --tail 60 planner \
      | grep -vE "GET /api/(chart-tile|tiles)|200 OK|404 Not Found" | tail -25 \
      | python3 -c 'import sys; t=sys.stdin.read().replace("%","%25").replace("\n","%0A"); print(f"::warning title=planner log, at the end::{t[:4000]}")'
    ;;
  lighthouse)
    # shellcheck disable=SC2016 # expanded in the container
    docker run --rm --network host -v /tmp/e2e-out:/out "$PLAYWRIGHT_IMAGE" sh -c '
      export CHROME_PATH=$(find /ms-playwright -type f -name chrome -path "*chrome-linux*" | head -1)
      npx --yes lighthouse@13.5.0 http://localhost:8080/app/plan --quiet \
        --only-categories=performance,accessibility,best-practices \
        --output=json --output-path=/out/lighthouse.json \
        --chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage"'
    ;;
  detections)
    start=$SECONDS
    curl -sf --max-time 600 -o /dev/null "http://localhost:8084/api/detect/stream?dep=C81&dest=KDLH"
    echo "read in $((SECONDS - start)) s: $(find data/raw/chart_tiles.nosync -path '*/detections/*.json' -printf '%f ')"
    ;;
  this-cycle)
    for root in data/raw/charts.nosync data/raw/chart_tiles.nosync; do
      if [ -d "$root" ]; then sudo find "$root" -mindepth 1 -maxdepth 1 -type d ! -name "$CYCLE" -print -exec rm -rf {} +; fi
    done
    ;;
  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 64
    ;;
esac
