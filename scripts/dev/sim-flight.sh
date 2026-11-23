#!/usr/bin/env bash
# The scripted test flight (docs/SIM-FLIGHT.md): X-Plane 12 flies a flight
# script (tools/sim-flight/flights) through the X-Plane driver's plugin
# (tools/xplane-driver), the feed passes the airplane on to the phones as
# GDL 90 and to the web app's browser test as its GPS, and the test checks
# the in-flight features along the way: the nav log's progress, the alerts
# ahead, the traffic, the auto-logbook, the wake lock and the work a fix
# does. Weekly, and before a release; never in CI (no runner has a
# simulator).
#
#   scripts/dev/sim-flight.sh check                  X-Plane, XPPython3, Python, Docker and the stack there?
#   scripts/dev/sim-flight.sh install [--fly MODE]   the plugin and the flight file into X-Plane (MODE: path, autopilot)
#   scripts/dev/sim-flight.sh run [--label L] [--no-readback]
#                                                    the feed, the browser test and the report, while X-Plane flies
#   scripts/dev/sim-flight.sh report DIR             the report again from a run's folder
#
# SIM_FLIGHT the flight script (tools/sim-flight/flights/kmsn-kosh-r36.json),
# SIM_FLIGHT_OUT where runs go (~/wingtip-sim-flight), SIM_FEED_PORT the
# feed's HTTP port (8765), SIM_GDL90 where GDL 90 goes (255.255.255.255:4000,
# every phone on the Wi-Fi), BASE_URL the web app (the live stack's,
# http://localhost:8080), XPLANE_DIR the X-Plane folder, PYTHON the Mac's
# Python (python3, 3.9 or newer; the feed needs nothing but its standard
# library). With the MSFS agent instead of X-Plane: `run`, then the agent
# with --feed <this Mac>:49010 (docs/SIM-FLIGHT.md, "MSFS").
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin
turn="$here/scripts/dev/one-at-a-time.sh"
kit=$here/tools/sim-flight
FLIGHT=${SIM_FLIGHT:-$kit/flights/kmsn-kosh-r36.json}
OUT=${SIM_FLIGHT_OUT:-$HOME/wingtip-sim-flight}
PORT=${SIM_FEED_PORT:-8765}
GDL90=${SIM_GDL90:-255.255.255.255:4000}
BASE_URL=${BASE_URL:-http://localhost:8080}
PY=${PYTHON:-python3}

say() { printf '%s\n' "$*"; }
die() { printf 'sim-flight: %s\n' "$*" >&2; exit 1; }
py() { PYTHONPATH="$here/services/planner:$kit" "$PY" -m sim_flight "$@"; }

check() {
  local ok=0
  "$here/scripts/dev/xplane-trial.sh" check || ok=1
  "$PY" -c 'import sys; sys.exit(sys.version_info < (3, 9))' 2>/dev/null || { say "Python 3.9 or newer as $PY (or set PYTHON)"; ok=1; }
  docker info >/dev/null 2>&1 || { say "Docker is not running: the browser test and the read-back run in it"; ok=1; }
  if curl -sf -o /dev/null "$BASE_URL/app/"; then say "The web app: $BASE_URL"; else
    say "The stack is not up at $BASE_URL: scripts/dev/go-live.sh --up"
    ok=1
  fi
  return "$ok"
}

install() {
  local fly=path xp plugins
  [ "${1:-}" = --fly ] && fly=${2:?path or autopilot}
  xp=$("$here/scripts/dev/xplane-trial.sh" check >/dev/null 2>&1 && find_xplane) || die "no X-Plane with XPPython3: run $0 check"
  plugins=$xp/Resources/plugins/PythonPlugins
  mkdir -p "$plugins/wingtip_replay" "$xp/Output/wingtip"
  cp "$here/tools/xplane-driver/PI_wingtip_replay.py" "$plugins/"
  cp "$here"/tools/xplane-driver/wingtip_replay/*.py "$here"/tools/xplane-driver/wingtip_replay/*.json "$plugins/wingtip_replay/"
  py prepare --scenario "$FLIGHT" --out "$xp/Output/wingtip" --fly "$fly"
  say "Installed into $xp (fly: $fly). Then:"
  say "  1. $0 run (it waits for the simulator), in one Terminal."
  say "  2. X-Plane: New Flight, the Cessna 172 SP, at KMSN on runway 36, engine running, Start Flight."
  say "     The plugin starts the flight 8 s after it loads (or Plugins > Wingtip replay > Fly the test flight)."
  say "  3. Hands off for about 40 minutes; the report is written when the airplane has stopped at KOSH."
  say "The plugin's log: $xp/Output/wingtip/flight-log.txt"
}

find_xplane() {
  local d
  for d in "${XPLANE_DIR:-}" "$HOME/X-Plane 12 Demo" "$HOME/X-Plane 12" "$HOME/Desktop/X-Plane 12 Demo" \
    "$HOME/Desktop/X-Plane 12" "/Applications/X-Plane 12 Demo" "/Applications/X-Plane 12"; do
    [ -n "$d" ] && [ -d "$d/X-Plane.app" ] && { printf '%s\n' "$d"; return 0; }
  done
  return 1
}

run() {
  local label=flight readback=1 dir image vol auth status=0
  while [ $# -gt 0 ]; do
    case $1 in
      --label) label=${2:?a label}; shift ;;
      --no-readback) readback="" ;;
      *) die "run takes --label L and --no-readback, not $1" ;;
    esac
    shift
  done
  curl -sf -o /dev/null "$BASE_URL/app/" || die "the stack is not up at $BASE_URL: scripts/dev/go-live.sh --up"
  dir=$OUT/$(date +%Y-%m-%d-%H%M)-$label
  mkdir -p "$dir"
  py feed --scenario "$FLIGHT" --run "$dir" --http "$PORT" --gdl90 "$GDL90" >"$dir/feed.log" 2>&1 &
  FEED_PID=$!
  trap 'kill "$FEED_PID" 2>/dev/null || true' EXIT
  say "The feed is up (its log: $dir/feed.log). Waiting up to 15 minutes for the simulator's first state line ..."
  local deadline=$((SECONDS + 900))
  until curl -sf "http://localhost:$PORT/state" | "$PY" -c 'import json, sys; sys.exit(json.load(sys.stdin)["received"] == 0)' 2>/dev/null; do
    kill -0 "$FEED_PID" 2>/dev/null || { cat "$dir/feed.log"; die "the feed stopped"; }
    [ "$SECONDS" -lt "$deadline" ] || die "no state line from the simulator in 15 minutes: is the flight started (Plugins > Wingtip replay)?"
    sleep 2
  done
  say "The simulator is flying. The browser test follows it to the end (about 40 minutes)."
  image=$(sed -nE 's/^ *PLAYWRIGHT_IMAGE: *([^ ]+).*/\1/p' "$here/.github/workflows/ci.yml" | head -1)
  vol=wingtip-npm-branch-specs-$({ cat "$here/apps/web/package-lock.json"; echo "$image"; } | shasum -a 256 | cut -c1-12)
  auth=$(sed -n 's/^MAILPIT_UI_AUTH=//p' "$HOME/Developer/wingtip/.env" 2>/dev/null || true)
  "$turn" "sim-flight browser test ($(basename "$here"))" docker run --rm --network host \
    -e SIM_FEED_URL="http://localhost:$PORT" -e SIM_RUN_DIR=/simrun -e BASE_URL="$BASE_URL" \
    -e MAILPIT_URL=http://localhost:8025 -e MAILPIT_UI_AUTH="$auth" \
    -v "$here/apps/web:/w" -v "$vol:/w/node_modules" -v "$dir:/simrun" -w /w "$image" sh -c '
      [ -f node_modules/.package-lock.json ] || npm ci --no-audit --no-fund --loglevel=error
      npx playwright test --config playwright.sim.config.ts' || status=$?
  kill "$FEED_PID" 2>/dev/null || true
  if [ -n "$readback" ] && [ -s "$dir/gdl90.jsonl" ]; then
    # The GDL 90 sent, read by the engine's receiver_read as the phones read it.
    docker compose -p wingtip exec -T planner python -c "$(cat "$kit/sim_flight/readback.py")" \
      <"$dir/gdl90.jsonl" >"$dir/readback.jsonl" || say "The read-back failed: the report says so."
  fi
  py report --run "$dir" || status=$?
  say "The run: $dir (report.md, results.json, states.jsonl, gdl90.jsonl)"
  return "$status"
}

case "${1:-}" in
  check) check ;;
  install) shift; install "$@" ;;
  run) shift; run "$@" ;;
  report) py report --run "${2:?the run folder}" ;;
  *) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 64 ;;
esac
