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
#   steps     web py planner ingest weather jobs engine java ios
#             android (check.sh's areas), images, e2e, ipad; all by default
#   --rebuild builds the check images again without BuildKit's layer cache
#             (check.sh's CHECK_NO_CACHE), for an image whose key missed a
#             change -- the engine wheel inside the Python ones
#
# The browser step never touches the owner's stack: it runs on
# scripts/dev/ci-stack.sh's copy of CI's e2e stack, under its own compose
# project (wingtip-wave) with the images the images step built from this
# checkout (wingtip-wave-<service>), on ci-stack.sh's shifted ports, and
# takes it down when the suite ends; data/raw is seeded from
# WAVE_SEED_DATA (the main checkout's by default). It runs --alone: a
# second stack beside a suite or a build is what timed the browser tests
# out before (the checks skill).
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

CHECK_AREAS="web py planner ingest weather jobs engine java ios android"
ALL="$CHECK_AREAS images e2e ipad"
PROJECT=wingtip-wave
SEED=${WAVE_SEED_DATA:-$HOME/Developer/wingtip/data/raw}

if [ "${1:-}" = --rebuild ]; then export CHECK_NO_CACHE=1; shift; fi
case "${1:-}" in -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; esac
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
  sim=$(xcrun simctl list devices available -j | python3 "$here/scripts/dev/newest_simulator.py" iPad)
  [ -n "$sim" ] || { echo "validate-wave: no iPad simulator in this Xcode"; return 1; }
  [ -d "$here/apps/ios/Frameworks/WingtipEngine/WingtipEngineFFI.xcframework" ] || { echo "validate-wave: no engine for the iPad (run the ios step first)"; return 1; }
  xcodegen generate --spec "$here/apps/ios/project.yml" --project "$here/apps/ios" --quiet || return 1
  "$turn" "validate-wave ipad ($(basename "$here"))" \
    xcodebuild -quiet -project "$here/apps/ios/Wingtip.xcodeproj" -scheme Wingtip -configuration Debug \
      -destination "platform=iOS Simulator,id=$sim" \
      -derivedDataPath "$HOME/Library/Developer/Xcode/DerivedData/wingtip-check-$(basename "$here")-$(echo "$here" | shasum -a 256 | cut -c1-8)" \
      CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= test
}

# The browser step, on scripts/dev/ci-stack.sh's copy of CI's stack under
# this wave's project, with the images step's images.
e2e_suite() {
  local stack=(env CI_STACK_PROJECT="$PROJECT" CI_STACK_SEED_DATA="$SEED" "$here/scripts/dev/ci-stack.sh")
  local status=0 batch touched
  "${stack[@]}" up --no-build || { "${stack[@]}" down; return 1; }
  "${stack[@]}" run --grep @smoke || status=$?
  # Then every spec the wave changed, in whole (the owner's efficiency rules,
  # 2026-11-12): @smoke and what the wave touched here, the whole suite in
  # CI's nightly run (decision 0034).
  touched=$(git -C "$here" diff --name-only "$(git -C "$here" merge-base HEAD origin/main)" HEAD -- 'apps/web/e2e/*.spec.ts' |
    while read -r f; do [ -f "$here/$f" ] && echo "${f#apps/web/}"; done)
  if [ -n "$touched" ]; then
    echo "validate-wave: the $(echo "$touched" | wc -l | tr -d ' ') specs the wave changed"
    # In batches of WAVE_SPEC_BATCH files, one Playwright call each: one
    # call for a wave's 65 specs ran into CI's 30-minute globalTimeout
    # (playwright.config.ts) with 205 tests never started (2026-11-12),
    # and that limit is CI's, not to be raised here.
    while read -r batch; do
      [ -n "$batch" ] || continue
      echo "validate-wave: batch $batch"
      # shellcheck disable=SC2086 # one argument per spec file
      "${stack[@]}" run $batch || status=$?
    done < <(echo "$touched" | xargs -n "${WAVE_SPEC_BATCH:-15}")
  fi
  # The stack's whole logs beside the suite's, for a failure to be read.
  "${stack[@]}" logs > "$out/stack.log" 2>&1
  [ "$status" -eq 0 ] || echo "validate-wave: the stack's logs are in $out/stack.log"
  # WAVE_KEEP_STACK=1 leaves it up, to run a failing spec again against it.
  if [ -n "${WAVE_KEEP_STACK:-}" ]; then
    echo "validate-wave: the stack is left up (CI_STACK_PROJECT=$PROJECT scripts/dev/ci-stack.sh down removes it)"
  else
    "${stack[@]}" down
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
