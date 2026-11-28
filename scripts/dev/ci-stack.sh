#!/usr/bin/env bash
# A local copy of the stack CI's e2e job runs the browser suite against, as
# one command (the owner, 2026-11-19), for a spec that fails on CI and not
# beside the live stack. It never touches the owner's stack, nor another worktree's: a
# compose project of this worktree's own on ports Docker picks, and `down`
# takes it all away.
#
#   scripts/dev/ci-stack.sh up [--no-build]   build (--no-build: the images built already), start, wait until warm
#   scripts/dev/ci-stack.sh page              build the page again (the gateway serves it at once)
#   scripts/dev/ci-stack.sh run [--cpus N] [playwright args...]
#   scripts/dev/ci-stack.sh port              the host ports it was given
#   scripts/dev/ci-stack.sh logs              the stack's logs
#   scripts/dev/ci-stack.sh down              containers, volumes, network, images and page gone
#
# As CI's job has it (.github/workflows/ci.yml, e2e): docker-compose.yml with
# infra/docker-compose.ci.yml over it (CHARTS_AUTO_REFRESH=0, no cycle pack,
# no registry), the suite's overlay tiles cut round Chicago
# (scripts/build/e2e-overlay-tiles.sh) in data/raw/packs/tiles, the
# corridor's elevations seeded, the page built from this checkout and
# mounted over the gateway's, the first nav log read before the tests, and
# Playwright on the phone project with CI=1 and no retries, so a flaky test
# fails here rather than passing on its retry. The images (gateway, planner,
# weather) are built from this checkout under the project's name; the
# planner's and weather's code is the checkout's, mounted. This checkout's
# data/raw is seeded once by APFS clones (no copy on disk) of
# CI_STACK_SEED_DATA's FAA files and charts (the main checkout's), so the
# planner warms in minutes rather than downloading a gigabyte.
#
# `run --cpus N` holds the browsers' container to N CPUs (Docker's quota),
# for a test that only fails on CI's four-core runner, which carries the
# stack too. Arguments after it go to `playwright test` (spec files, -g,
# --grep @smoke); --project=mobile is added when none is given.
#
# Heavy steps (the image and page builds, the run) take their turn of
# scripts/dev/one-at-a-time.sh. The project is wingtip-ci-<worktree>
# (CI_STACK_PROJECT names another), and its gateway, inbox and planner are
# published on free ports Docker chooses, read back with `docker compose
# port`, so two worktrees' stacks never meet: a fixed port shared by two
# runs of branch-specs.sh sent one's tests to the other's server, 330
# "connection refused" when it stopped (2026-11-19). `up` prints them.
# CI_STACK_GATEWAY_PORT, _MAILPIT_PORT and _PLANNER_PORT fix them instead,
# for a person signing in by hand (the emailed link is to the gateway's).
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin
turn="$here/scripts/dev/one-at-a-time.sh"
tree=$(basename "$here" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-')
project=${CI_STACK_PROJECT:-wingtip-ci-${tree#wingtip-}}
gateway_port=${CI_STACK_GATEWAY_PORT:-}
mailpit_port=${CI_STACK_MAILPIT_PORT:-}
planner_port=${CI_STACK_PLANNER_PORT:-}
seed=${CI_STACK_SEED_DATA:-$HOME/Developer/wingtip/data/raw}
page=$here/apps/web/dist-ci
override=$(git -C "$here" rev-parse --absolute-git-dir)/ci-stack.$project.yml
images="gateway planner weather"
say() { echo "ci-stack: $*"; }

for p in "$gateway_port" "$mailpit_port" "$planner_port"; do
  case $p in 8080 | 8443 | 8025 | 8084 | 5432) say "port $p is the owner's stack's; choose another" >&2; exit 64 ;; esac
done

# The ports and images CI's override names are the runner's; here the
# project's own, the database unpublished, the page this checkout's.
write_override() {
  cat > "$override" <<EOF
# scripts/dev/ci-stack.sh's stack ($project): its own images and ports.
services:
  db:
    ports: !reset []
  mailpit:
    ports: !override
      - "127.0.0.1:$mailpit_port:8025"
  gateway:
    image: $project-gateway
    ports: !override
      - "127.0.0.1:$gateway_port:8080"
    volumes: !override
      - gateway-cds:/cds
      - $page:/app/static/app:ro
  planner:
    image: $project-planner
    ports: !override
      - "127.0.0.1:$planner_port:8000"
  weather:
    image: $project-weather
EOF
}

stack() {
  [ -f "$override" ] || write_override
  env -u PUBLISH_ADDRESS -u PHONE_BASE_URL -u DEV_PUBLISH_ADDRESS -u MAILPIT_UI_AUTH -u WEB_DIST_MOUNT \
    ${gateway_port:+APP_PUBLIC_BASE_URL="http://localhost:$gateway_port"} \
    docker compose -p "$project" -f "$here/docker-compose.yml" -f "$here/infra/docker-compose.ci.yml" -f "$override" "$@"
}

# The host ports of a running stack, as Docker published them.
ports() {
  gateway_port=$(stack port gateway 8080 2>/dev/null | sed 's/.*://')
  mailpit_port=$(stack port mailpit 8025 2>/dev/null | sed 's/.*://')
  planner_port=$(stack port planner 8000 2>/dev/null | sed 's/.*://')
  [ -n "$gateway_port" ] && [ -n "$mailpit_port" ] && [ -n "$planner_port" ]
}

build_images() {
  # shellcheck disable=SC2086 # one argument per service
  "$turn" "ci-stack images ($(basename "$here"))" \
    env -u PUBLISH_ADDRESS -u PHONE_BASE_URL -u DEV_PUBLISH_ADDRESS \
    docker compose -p "$project" -f "$here/docker-compose.yml" build $images
}

# The page, as branch-specs.sh builds it: vite in the web's check image.
build_page() {
  local NODE web_image
  NODE=$("$here/scripts/build/toolchain.sh" get nodejs)
  # shellcheck source=scripts/dev/check-images.sh
  . "$here/scripts/dev/check-images.sh"
  web_image=$(web_image)
  "$turn" "ci-stack page ($(basename "$here"))" docker run --rm -v "$here:/repo" -w /repo/apps/web "$web_image" \
    npx vite build --outDir dist-ci --emptyOutDir --logLevel warn
}

# The planner's data, as CI's job lays it out ("The planner's data, ready"),
# seeded from $seed by clones the first time.
seed_data() {
  local raw=$here/data/raw entry
  mkdir -p "$raw"
  if [ ! -e "$raw/.wave-seeded" ] && [ -d "$seed" ]; then
    say "seeding data/raw from $seed (APFS clones)"
    for entry in "$seed"/*; do
      case "$(basename "$entry")" in
        # The rendered tiles (33 GB of small files), the live feeds and the
        # cycle packs: the suite's planner renders its own, reads none and
        # builds none (CYCLE_PACK=0).
        chart_tiles.nosync | live | packs | *.lock) continue ;;
      esac
      [ -e "$raw/$(basename "$entry")" ] || cp -cR "$entry" "$raw/" 2>/dev/null || cp -R "$entry" "$raw/"
    done
    : > "$raw/.wave-seeded"
  fi
  [ -e "$raw/elevation_cache.csv" ] || cp "$here/apps/web/e2e/fixtures/elevation_cache.csv" "$raw/elevation_cache.csv"
  mkdir -p "$raw/packs/tiles"
  rm -f "$raw/packs/tiles/"*.pmtiles
  cp "$here/apps/web/e2e/fixtures/overlay-tiles/"* "$raw/packs/tiles/"
  chmod -R a+rwX "$here/data" 2>/dev/null || true
}

up() {
  local i
  if [ "${1:-}" != --no-build ]; then build_images; fi
  for i in $images; do
    docker image inspect "$project-$i" >/dev/null 2>&1 || { say "no image $project-$i (ci-stack.sh up builds it)"; return 1; }
  done
  build_page
  seed_data
  write_override
  # A session signed in on another stack is not this one's.
  rm -rf "$here/apps/web/e2e/.auth"
  stack down -v --remove-orphans >/dev/null 2>&1 || true
  if [ -n "$gateway_port" ] && curl -s -o /dev/null "http://localhost:$gateway_port/"; then
    say "something else answers on :$gateway_port (leave CI_STACK_GATEWAY_PORT unset for a free one)" >&2
    return 1
  fi
  if ! stack up -d --no-build --wait db mailpit gateway planner weather; then
    stack logs --no-color --tail 60 gateway planner weather
    return 1
  fi
  ports || { say "no published ports"; return 1; }
  for _ in $(seq 1 240); do curl -sf -o /dev/null "http://localhost:$gateway_port/app/plan" && break; sleep 1; done
  for _ in $(seq 1 1200); do curl -sf "http://localhost:$planner_port/" | grep -q '"warm":true' && break; sleep 1; done
  if ! curl -sf "http://localhost:$planner_port/" | grep -q '"warm":true'; then
    say "the planner never said it was warm"
    stack logs --no-color --tail 60 planner
    return 1
  fi
  # The route the suite plans most, read once before it, as CI's job does
  # (first-reads.sh): its first nav log fetches the corridor's elevations
  # and obstacles, minutes under a cold cache, and the first tests that
  # asked for it timed out behind it.
  curl -sf -o /dev/null --max-time 600 "http://localhost:$planner_port/api/navlog?dep=C81&dest=KDLH" \
    || say "the first nav log did not come back (curl $?)"
  say "up and warm: http://localhost:$gateway_port/app/ (inbox :$mailpit_port, planner :$planner_port)"
}

run() {
  local cpus=() image vol project_arg=(--project=mobile) a
  if [ "${1:-}" = --cpus ]; then cpus=(--cpus "${2:?--cpus N}"); shift 2; fi
  for a in "$@"; do case $a in --project*) project_arg=() ;; esac; done
  ports || { say "$project is not up (ci-stack.sh up)" >&2; return 2; }
  curl -sf -o /dev/null "http://localhost:$gateway_port/app/" || { say "not up on :$gateway_port (ci-stack.sh up)" >&2; return 2; }
  image=$(sed -nE 's/^ *PLAYWRIGHT_IMAGE: *([^ ]+).*/\1/p' "$here/.github/workflows/ci.yml" | head -1)
  # The suite's packages, as installed in the Playwright image, kept in a
  # volume per lock (docker-tidy.sh keeps wingtip-npm*).
  vol=wingtip-npm-e2e-$({ cat "$here/apps/web/package-lock.json"; echo "$image"; } | shasum -a 256 | cut -c1-12)
  # On the stack's own network, reaching the gateway and the inbox by their
  # service names: Docker Desktop's host network is its VM's, not the
  # Mac's, so a browsers' container there could not reach the ports the
  # stack published on the Mac's loopback (r4-specs, 2026-11-23).
  "$turn" "ci-stack e2e ($(basename "$here"))" docker run --rm --network "${project}_default" "${cpus[@]+"${cpus[@]}"}" -e CI=1 \
    -e BASE_URL="http://gateway:8080" -e MAILPIT_URL="http://mailpit:8025" \
    -v "$here/apps/web:/w" -v "$vol:/w/node_modules" -w /w "$image" sh -c '
      [ -f node_modules/.package-lock.json ] || npm ci --no-audit --no-fund --loglevel=error
      npx playwright test --retries=0 --reporter=list "$@"' sh "${project_arg[@]+"${project_arg[@]}"}" "$@"
}

down() {
  local i
  stack down -v --remove-orphans >/dev/null 2>&1 || true
  # And the base the planner's image is built on (compose builds it as `base`).
  for i in $images base; do docker image rm "$project-$i" >/dev/null 2>&1 || true; done
  rm -rf "$page" "$override" "$here/apps/web/e2e/.auth"
  say "down: $project's containers, volumes, network, images and page removed"
}

cmd=${1:-}
[ $# -gt 0 ] && shift
case $cmd in
  up) up "$@" ;;
  page) build_page ;;
  run) run "$@" ;;
  port) ports && echo "gateway $gateway_port mailpit $mailpit_port planner $planner_port" ;;
  logs) stack logs --no-color --timestamps planner gateway weather ;;
  down) down ;;
  *) sed -n '2,43p' "$0" | sed 's/^# \{0,1\}//'; [ "$cmd" = -h ] || [ "$cmd" = --help ] ;;
esac
