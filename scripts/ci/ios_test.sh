#!/usr/bin/env bash
# native-ios.yml's test job, in two steps: the app and its tests built for
# the simulator, then those tests run from that build. Between them the job
# checks the string catalog (scripts/build/ios-strings.sh --check), which
# reads what the build extracted and so cannot run sooner. One `xcodebuild
# test` did both, and a stale catalog was found only after it: 753 s of
# build and 655 green unit tests, then red in 10 s (run 43732738720).
#
#   scripts/ci/ios_test.sh build   xcodebuild build-for-testing
#   scripts/ci/ios_test.sh test    xcodebuild test-without-building
#
# Both steps take the same tests, by the run's kind. A pull request's
# (UNIT_ONLY): the unit tests, in WingtipUnit, which builds no UI test.
# Main's push: those and CardSmokeTests, the one UI smoke (the airport card
# opened, scrolled and closed). The night's (FULL): every test the Wingtip
# scheme holds; the launch, flow and accessibility tests, the card suites
# and the store shots are the night's alone. scripts/ci/test_tiers.py reads
# the three lines below that choose, so every UI test class stays in a tier.
#
# xcodebuild's output goes to $RUNNER_TEMP/xcodebuild.log, the build's and
# then the tests' (the job uploads it on failure). Each step prints its
# errors and its tests from its own part of that log and reads its verdict
# there, as the one step did.
#
# Env: SIM (the simulator's id), RUNNER_TEMP, WINGTIP_URL and
# WINGTIP_BUNDLE_ID (native-ios.yml's); UNIT_ONLY and FULL, "true" or not.
# On the Mac, once build-xcframework.sh and xcodegen have run (as
# scripts/dev/check.sh's ios area runs them), in a turn of
# scripts/dev/one-at-a-time.sh:
#
#   export SIM=$(xcrun simctl list devices available -j | python3 scripts/dev/newest_simulator.py iPhone)
#   export RUNNER_TEMP=<a scratch folder> UNIT_ONLY=true WINGTIP_BUNDLE_ID=app.wingtipmaps.ios
#   export WINGTIP_URL=https://wingtipmaps.app/app/plan
#   scripts/ci/ios_test.sh build && scripts/build/ios-strings.sh --check --derived-data "$RUNNER_TEMP/derived" \
#     && scripts/ci/ios_test.sh test
set -euo pipefail
cd "$(dirname "$0")/../.."
step=${1:?a step: build or test}
UNIT_ONLY=${UNIT_ONLY:-false} FULL=${FULL:-false}
log=$RUNNER_TEMP/xcodebuild.log
opts=(-destination "platform=iOS Simulator,id=$SIM" -derivedDataPath "$RUNNER_TEMP/derived")

case "$step" in
  build)
    action=build-for-testing verdict="TEST BUILD SUCCEEDED"
    : > "$log"
    ;;
  test)
    action=test-without-building verdict="TEST EXECUTE SUCCEEDED"
    # The tests' result bundle; xcodebuild refuses one that is there, an
    # earlier run's on the Mac.
    rm -rf "$RUNNER_TEMP/Wingtip.xcresult"
    opts+=(-resultBundlePath "$RUNNER_TEMP/Wingtip.xcresult")
    touch "$log"
    ;;
  *)
    echo "ios_test: no step '$step' (build or test)" >&2
    exit 64
    ;;
esac

host=$(python3 -c "from urllib.parse import urlparse; print(urlparse('$WINGTIP_URL').hostname)")
only=(-only-testing:WingtipTests) scheme=WingtipUnit
[ "$UNIT_ONLY" = true ] || only+=(-only-testing:WingtipUITests/CardSmokeTests) scheme=Wingtip
[ "$FULL" = true ] && only=() scheme=Wingtip

# This step's part of the log starts here: a verdict above it is another
# step's, or an earlier run's.
from=$(($(wc -l < "$log") + 1))
said() { tail -n "+$from" "$log"; }
# `only` is empty at night, which the Mac's bash 3.2 calls unset under -u.
xcodebuild -project apps/ios/Wingtip.xcodeproj -scheme "$scheme" -configuration Debug "${opts[@]}" ${only[@]+"${only[@]}"} \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= COMPILER_INDEX_STORE_ENABLE=NO \
  WINGTIP_HOST="$host" WINGTIP_BUNDLE_ID="$WINGTIP_BUNDLE_ID" "$action" >> "$log" 2>&1 || true

# Each error with the lines after it (a cause), the tests, the verdict.
said | grep -nE "error:|error\b|Could not|Test (Case|Suite)|Executed|\*\* (BUILD|TEST)" -A6 | tail -200 || true
said | grep -E "✔ Test|✘ Test|Test run with" || true
# Not `grep -q`, which stops at the verdict and fails the pipe it closes.
if ! said | grep -E "\*\* $verdict \*\*" > /dev/null; then
  echo "::error title=iOS $step failed::xcodebuild $action did not end in ** $verdict ** (its errors above; the whole log is the run's native-ios-log artifact)"
  exit 1
fi
