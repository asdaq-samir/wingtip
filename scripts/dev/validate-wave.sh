#!/usr/bin/env bash
# The end-of-wave validation on claude/integration, as one command
# (CLAUDE.md, Branches, "Fast turnover"): every scripts/dev/check.sh area,
# the stack's image builds, the @smoke browser specs against a throwaway
# stack of this checkout on shifted ports, and the iPhone app's tests on an
# iPad. Every step takes its turn of scripts/dev/one-at-a-time.sh (two at
# once), runs to its end whatever the others do, and leaves its log; then
# one table of what passed and what failed, each failure with a short
# excerpt, and a non-zero exit if anything failed.
#
#   scripts/dev/validate-wave.sh [--rebuild] [step...]
#
#   steps     web py planner ingest assistant weather jobs engine java ios
#             android (check.sh's areas), images, e2e, ipad; all by default
#   --rebuild builds the check images again without BuildKit's layer cache
#             (check.sh's CHECK_NO_CACHE), for an image whose key missed a
#             change -- the engine wheel inside the Python ones
#
# The browser step never touches the owner's stack: its own compose project
# (wingtip-wave), images built from this checkout by the images step
# (wingtip-wave-<service>), the gateway on localhost:18080, the inbox on
# :18025 and the planner on :18084, no database port, and torn down with
# its volumes when the suite ends. It runs as CI's e2e job does
# (infra/docker-compose.ci.yml: no chart refresh, no cycle pack, the suite's
# overlay tiles), with this checkout's data/raw seeded once by APFS clones
# (no copy on disk) of WAVE_SEED_DATA's FAA files and charts (the main
# checkout's by default), so the planner warms in minutes rather than
# downloading a gigabyte. It runs --alone: a second stack beside a suite
# or a build is what timed the browser tests out before (the checks skill).
#
# Logs and exit codes go to WAVE_OUT (a fresh directory in $TMPDIR by
# default), named in the summary, the browser stack's own as stack.log;
# WAVE_KEEP_STACK=1 leaves that stack up after the suite.
set -uo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$HOME/.local/bin:$HOME/.cargo/bin
export ONE_AT_A_TIME_SLOTS=${ONE_AT_A_TIME_SLOTS:-2}
# A wave's steps queue behind each other and behind other sessions' turns:
# hours in line are expected here, not a sign of something stuck.
export ONE_AT_A_TIME_WAIT=${ONE_AT_A_TIME_WAIT:-14400}
turn="$here/scripts/dev/one-at-a-time.sh"

CHECK_AREAS="web py planner ingest assistant weather jobs engine java ios android"
ALL="$CHECK_AREAS images e2e ipad"
PROJECT=wingtip-wave
GATEWAY_PORT=18080 MAILPIT_PORT=18025 PLANNER_PORT=18084
SEED=${WAVE_SEED_DATA:-$HOME/Developer/wingtip/data/raw}

if [ "${1:-}" = --rebuild ]; then export CHECK_NO_CACHE=1; shift; fi
case "${1:-}" in -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; esac
# The browser step's own run, in its turn (step_e2e): the steps are not
# this call's.
inner=""
if [ "${1:-}" = --e2e-suite ]; then inner=1; shift; fi
steps=${*:-$ALL}
for s in $steps; do
  case " $ALL " in *" $s "*) ;; *) echo "validate-wave: no step '$s' (one of: $ALL)" >&2; exit 64 ;; esac
done

out=${WAVE_OUT:-$(mktemp -d "${TMPDIR:-/tmp}/validate-wave.XXXXXX")}
mkdir -p "$out"
if [ -z "$inner" ]; then
  echo "validate-wave: $(git -C "$here" rev-parse --short HEAD) ($(git -C "$here" branch --show-current)), steps: $steps" >&2
  echo "validate-wave: logs in $out" >&2
fi

# The stack's images, every service a plain `up` starts, built from this
# checkout under the wave's own project, so the owner's wingtip-* images
# are never replaced.
step_images() {
  "$turn" "validate-wave images ($(basename "$here"))" \
    env -u PUBLISH_ADDRESS -u PHONE_BASE_URL -u DEV_PUBLISH_ADDRESS \
    docker compose -p "$PROJECT" -f "$here/docker-compose.yml" build
}

# The iPhone app's tests on an iPad (the ios step runs them on the newest
# iPhone), in the same derived data, so the build is the ios step's.
step_ipad() {
  local sim
  sim=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
ds = [d for r, ds in json.load(sys.stdin)["devices"].items() if "iOS" in r for d in ds
      if d["name"].startswith("iPad Pro")]
print(sorted(ds, key=lambda d: d["name"])[-1]["udid"] if ds else "")')
  [ -n "$sim" ] || { echo "validate-wave: no iPad Pro simulator in this Xcode"; return 1; }
  [ -d "$here/apps/ios/Frameworks/WingtipEngine.xcframework" ] || { echo "validate-wave: no engine for the iPad (run the ios step first)"; return 1; }
  xcodegen generate --spec "$here/apps/ios/project.yml" --project "$here/apps/ios" --quiet || return 1
  "$turn" "validate-wave ipad ($(basename "$here"))" \
    xcodebuild -quiet -project "$here/apps/ios/Wingtip.xcodeproj" -scheme Wingtip -configuration Debug \
      -destination "platform=iOS Simulator,id=$sim" \
      -derivedDataPath "$HOME/Library/Developer/Xcode/DerivedData/wingtip-check-$(basename "$here")-$(echo "$here" | shasum -a 256 | cut -c1-8)" \
      CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= test
}

# The planner's data, as CI's e2e job lays it out ("The planner's data,
# ready"), seeded from SEED by clones the first time.
seed_data() {
  local raw=$here/data/raw entry
  mkdir -p "$raw"
  if [ ! -e "$raw/.wave-seeded" ] && [ -d "$SEED" ]; then
    echo "validate-wave: seeding data/raw from $SEED (APFS clones)"
    for entry in "$SEED"/*; do
      case "$(basename "$entry")" in
        # The rendered tiles (33 GB of small files), the live feeds and the
        # cycle packs: the suite's planner renders its own, reads none and
        # builds none (CYCLE_PACK=0).
        chart_tiles.nosync|live|packs|*.lock) continue ;;
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

# The suite's packages, as installed in the Playwright image, kept in a
# volume per lock file.
e2e_modules() {
  local image=$1 vol
  vol=wingtip-wave-e2e-modules-$({ cat "$here/apps/web/package-lock.json"; echo "$image"; } | shasum -a 256 | cut -c1-12)
  docker run --rm -v "$here/apps/web:/w" -v "$vol:/w/node_modules" -w /w "$image" \
    sh -c '[ -f node_modules/.package-lock.json ] || npm ci --no-audit --no-fund --loglevel=error' >&2
  echo "$vol"
}

e2e_suite() {
  local override=$out/compose.wave.yml image vol status=0 i
  image=$(sed -nE 's/^ *PLAYWRIGHT_IMAGE: *([^ ]+).*/\1/p' "$here/.github/workflows/ci.yml" | head -1)
  cat > "$override" <<EOF
# validate-wave.sh's stack: the wave's images, on ports of its own.
services:
  db:
    ports: !reset []
  mailpit:
    ports: !override
      - "127.0.0.1:$MAILPIT_PORT:8025"
  gateway:
    image: $PROJECT-gateway
    ports: !override
      - "127.0.0.1:$GATEWAY_PORT:8080"
    # The page baked into the image, built from this checkout, not a dist.
    volumes: !override
      - gateway-cds:/cds
  planner:
    image: $PROJECT-planner
    ports: !override
      - "127.0.0.1:$PLANNER_PORT:8000"
  weather:
    image: $PROJECT-weather
EOF
  local -a files=(-f "$here/docker-compose.yml" -f "$here/infra/docker-compose.ci.yml" -f "$override")
  wave() {
    env -u PUBLISH_ADDRESS -u PHONE_BASE_URL -u DEV_PUBLISH_ADDRESS -u MAILPIT_UI_AUTH \
      APP_PUBLIC_BASE_URL="http://localhost:$GATEWAY_PORT" \
      docker compose -p "$PROJECT" "${files[@]}" "$@"
  }
  for i in gateway planner weather; do
    docker image inspect "$PROJECT-$i" >/dev/null 2>&1 || { echo "validate-wave: no image $PROJECT-$i (run the images step)"; return 1; }
  done
  seed_data
  wave down -v --remove-orphans >/dev/null 2>&1 || true
  if ! wave up -d --no-build --wait db mailpit gateway planner weather; then
    wave logs --no-color --tail 60 gateway planner weather
    wave down -v --remove-orphans >/dev/null 2>&1
    return 1
  fi
  for i in $(seq 1 240); do curl -sf -o /dev/null "http://localhost:$GATEWAY_PORT/app/plan" && break; sleep 1; done
  for i in $(seq 1 1200); do curl -sf "http://localhost:$PLANNER_PORT/" | grep -q '"warm":true' && break; sleep 1; done
  if ! curl -sf "http://localhost:$PLANNER_PORT/" | grep -q '"warm":true'; then
    echo "validate-wave: the planner never said it was warm"
    wave logs --no-color --tail 60 planner
    wave down -v --remove-orphans >/dev/null 2>&1
    return 1
  fi
  # The route the suite plans most, read once before it, as CI's e2e job
  # does (first-reads.sh): its first nav log fetches the corridor's
  # elevations and obstacles, minutes under a cold cache, and the first
  # tests that asked for it timed out behind it.
  curl -sf -o /dev/null --max-time 600 "http://localhost:$PLANNER_PORT/api/navlog?dep=C81&dest=KDLH" \
    || echo "validate-wave: the first nav log did not come back (curl $?)"
  echo "validate-wave: stack up and warm"
  vol=$(e2e_modules "$image")
  rm -rf "$here/apps/web/e2e/.auth"
  docker run --rm --network host -e CI=1 \
    -e BASE_URL="http://localhost:$GATEWAY_PORT" -e MAILPIT_URL="http://localhost:$MAILPIT_PORT" \
    -v "$here/apps/web:/w" -v "$vol:/w/node_modules" -w /w "$image" \
    npx playwright test --project=mobile --grep @smoke --reporter=list || status=$?
  # Then every spec the wave changed, in whole (the owner's efficiency rules,
  # 2026-11-12): @smoke and what the wave touched here, the whole suite in
  # CI's nightly run (decision 0034).
  touched=$(git -C "$here" diff --name-only "$(git -C "$here" merge-base HEAD origin/main)" HEAD -- 'apps/web/e2e/*.spec.ts' |
    while read -r f; do [ -f "$here/$f" ] && echo "${f#apps/web/}"; done)
  if [ -n "$touched" ]; then
    echo "validate-wave: the $(echo "$touched" | wc -l | tr -d ' ') specs the wave changed"
    # shellcheck disable=SC2086 # one argument per spec file
    docker run --rm --network host -e CI=1 \
      -e BASE_URL="http://localhost:$GATEWAY_PORT" -e MAILPIT_URL="http://localhost:$MAILPIT_PORT" \
      -v "$here/apps/web:/w" -v "$vol:/w/node_modules" -w /w "$image" \
      npx playwright test --project=mobile --reporter=list $touched || status=$?
  fi
  # The stack's whole logs beside the suite's, for a failure to be read.
  wave logs --no-color --timestamps planner gateway weather > "$out/stack.log" 2>&1
  [ "$status" -eq 0 ] || echo "validate-wave: the stack's logs are in $out/stack.log"
  # WAVE_KEEP_STACK=1 leaves it up, to run a failing spec again against it.
  if [ -n "${WAVE_KEEP_STACK:-}" ]; then
    echo "validate-wave: the stack is left up (docker compose -p $PROJECT ... down -v to remove it)"
  else
    wave down -v --remove-orphans >/dev/null 2>&1
  fi
  return "$status"
}

step_e2e() {
  WAVE_OUT=$out "$turn" --alone "validate-wave e2e ($(basename "$here"))" "$0" --e2e-suite
}

run_step() {
  local s=$1 start status=0
  start=$(date +%s)
  case "$s" in
    images) step_images ;;
    e2e) step_e2e ;;
    ipad) step_ipad ;;
    *) "$here/scripts/dev/check.sh" "$s" ;;
  esac > "$out/$s.log" 2>&1 || status=$?
  echo "$status $(( $(date +%s) - start ))" > "$out/$s.exit"
  echo "validate-wave: $s exit $status" >&2
}

if [ -n "$inner" ]; then e2e_suite; exit $?; fi

has() { case " $steps " in *" $1 "*) return 0 ;; esac; return 1; }

# Everything at once, each in its own turn; the iPad after the iPhone (one
# derived data), the browser suite after the images it runs.
pids=()
for s in $CHECK_AREAS; do
  [ "$s" = ios ] && continue
  if has "$s"; then run_step "$s" & pids+=($!); fi
done
{ has ios && run_step ios; has ipad && run_step ipad; } & pids+=($!)
{ has images && run_step images; has e2e && run_step e2e; } & pids+=($!)
for p in "${pids[@]}"; do wait "$p"; done

# The summary: one row a step, and for each failure the lines of its log
# that say why.
failed=0
printf '\n%-10s %-6s %8s\n' step result seconds
for s in $steps; do
  if [ -f "$out/$s.exit" ]; then
    read -r code secs < "$out/$s.exit"
  else
    code="?" secs="-"
  fi
  if [ "$code" = 0 ]; then res=pass; else res=FAIL; failed=1; fi
  printf '%-10s %-6s %8s\n' "$s" "$res" "$secs"
done
for s in $steps; do
  read -r code _ < "$out/$s.exit" 2>/dev/null || code="?"
  [ "$code" = 0 ] && continue
  echo
  echo "== $s (exit $code): $out/$s.log"
  # The lines that name what failed, in each tool's words: pytest's and
  # cargo's FAILED, ESLint's and tsc's errors, Surefire's failing tests,
  # xcodebuild's and Gradle's, Playwright's numbered failures.
  grep -nE '(^FAILED |FAILED$|^test .* FAILED|panicked at| error |error TS[0-9]+|^\[ERROR\]   |<<< (FAILURE|ERROR)|Tests run:.*(Failures|Errors): [1-9]|\*\* TEST FAILED|error:|FAILURE:|^ +[0-9]+\) |✘|[0-9]+ failed)' "$out/$s.log" \
    | grep -vE 'warning|^[0-9]+:\s*0 failed' | tail -15
  echo "-- last lines:"
  tail -6 "$out/$s.log"
done
echo
[ "$failed" = 0 ] && echo "validate-wave: all green" || echo "validate-wave: failures above; logs in $out"
exit "$failed"
