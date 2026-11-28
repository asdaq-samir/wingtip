#!/usr/bin/env bash
# native-ios.yml's test job, in two steps: the app and its tests built for
# the simulator, then those tests run from that build. Between them the job
# checks the string catalog (scripts/build/ios-strings.sh --check), which
# reads what the build extracted and so cannot run sooner. One `xcodebuild
# test` did both, and a stale catalog was found only after it: 753 s of
# build and 655 green unit tests, then red in 10 s (run 43732738720).
#
#   scripts/ci/ios_test.sh build   xcodebuild build-for-testing
#   scripts/ci/ios_test.sh test    xcodebuild test-without-building, from the build's .xctestrun
#
# One leg builds (the iPhone's) and the others test that build
# (scripts/ci/ios_products.py). Every resource is kept
# (ENABLE_ONLY_ACTIVE_RESOURCES=NO, where a build for one device leaves out
# what only another uses), so the iPhone's build runs on the iPad, and the
# test step reads only Build/Products: the .xctestrun and what it names.
#
# Both steps take the same tests, by the run's kind. A pull request's
# (UNIT_ONLY): the unit tests, in WingtipUnit, which builds no UI test.
# Main's push: those and CardSmokeTests, the one UI smoke (the airport card
# opened, scrolled and closed), and IPadLayoutTests, the iPad's sidebar,
# menu bar keys and narrow window, on the iPhone and on the iPad, the
# primary users' (the owner, 2026-11-21); they skip on the iPhone. The
# iPad's leg adds DocumentsIPadTests. The night's (FULL): every test the Wingtip
# scheme holds; the launch, flow and accessibility tests, the card suites
# and the store shots are the night's alone. scripts/ci/test_tiers.py reads
# the three lines below that choose, so every UI test class stays in a tier.
#
# A wave's validation (decision 0058) runs the iPad's whole suite in four
# legs, each its own runner (LEG "iPad 1/4" to "iPad 4/4", which
# native-ios.yml's simulator step sets): the first three the UI classes
# IPAD_LEG_1 to IPAD_LEG_3 name, the fourth every other test, unit tests
# included, by skipping those, so no class is in none. Split by the
# classes' measured times on a slow hosted runner (run 45136421052,
# 2026-11-23), where two legs ran out of their 45 minutes: a leg spent
# some 18 minutes before its first test (its own build 7 to 9 and the
# engine 3.5, the simulator's boot 2 to 4, the runner's install and launch
# the rest), then the accessibility audits about 11 (leg 1), the card rule's
# suite about 15 (leg 2), the card scroll, page toggle, iPad layout and
# documents suites about 16 (leg 3), and the unit tests about 9 with the
# rest (leg 4). Each leg now tests the iPhone's build, booting while it is
# made, so the build is paid once, not on each leg.
#
# xcodebuild's output goes to $RUNNER_TEMP/xcodebuild.log, the build's and
# then the tests' (the job uploads it on failure). Each step prints its
# errors and its tests from its own part of that log and reads its verdict
# there, as the one step did.
#
# Env: SIM (the simulator's id), RUNNER_TEMP, WINGTIP_URL and
# WINGTIP_BUNDLE_ID (native-ios.yml's); UNIT_ONLY and FULL, "true" or not;
# LEG, the matrix's device ("iPad 1/4" for a wave's first iPad leg).
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
UNIT_ONLY=${UNIT_ONLY:-false} FULL=${FULL:-false} LEG=${LEG:-}
IPAD_LEG_1="AccessibilityAuditTests LaunchTests MapButtonsTests PlateMapTests StoreShotsTests"
IPAD_LEG_2="CardRuleTests"
IPAD_LEG_3="CardScrollTests SheetPageToggleTests IPadLayoutTests DocumentsIPadTests"
log=$RUNNER_TEMP/xcodebuild.log
products=$RUNNER_TEMP/derived/Build/Products
opts=(-destination "platform=iOS Simulator,id=$SIM")

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
    # The simulator booted and ready before the first test asks for the
    # app: booted inside xcodebuild, the boot ran into the first test's
    # launch, which on a loaded runner timed out ("Timed out while
    # launching application via Xcode", 321 s, the iPad's 1/2 leg of run
    # 45127491141, its first test). Said how long it took.
    started=$(date +%s)
    xcrun simctl boot "$SIM" 2>/dev/null || true
    xcrun simctl bootstatus "$SIM" -b > /dev/null
    echo "ios_test: the simulator booted in $(($(date +%s) - started)) s"
    ;;
  *)
    echo "ios_test: no step '$step' (build or test)" >&2
    exit 64
    ;;
esac

host=$(python3 -c "from urllib.parse import urlparse; print(urlparse('$WINGTIP_URL').hostname)")
only=(-only-testing:WingtipTests) scheme=WingtipUnit
[ "$UNIT_ONLY" = true ] || only+=(-only-testing:WingtipUITests/CardSmokeTests -only-testing:WingtipUITests/IPadLayoutTests) scheme=Wingtip
# The iPad's leg of main's push opens the documents library too
# (DocumentsIPadTests: the reader, its inspector, ⌘F, ⌘[ and ⌘]), the iPad
# being the primary users' device (decision 0058); the iPhone's leg skips it.
if [ "$UNIT_ONLY" != true ] && [ "$LEG" = iPad ]; then only+=(-only-testing:WingtipUITests/DocumentsIPadTests); fi
[ "$FULL" = true ] && only=() scheme=Wingtip
case "$LEG" in
  *" 1/4") only=() scheme=Wingtip && for c in $IPAD_LEG_1; do only+=("-only-testing:WingtipUITests/$c"); done ;;
  *" 2/4") only=() scheme=Wingtip && for c in $IPAD_LEG_2; do only+=("-only-testing:WingtipUITests/$c"); done ;;
  *" 3/4") only=() scheme=Wingtip && for c in $IPAD_LEG_3; do only+=("-only-testing:WingtipUITests/$c"); done ;;
  *" 4/4") only=() scheme=Wingtip && for c in $IPAD_LEG_1 $IPAD_LEG_2 $IPAD_LEG_3; do only+=("-skip-testing:WingtipUITests/$c"); done ;;
esac

# The build: the scheme's every test target, chosen from at the test step,
# as -only-testing at the build would be written into the .xctestrun.
# ENABLE_DEBUG_DYLIB=NO: one app binary, as CI needs no Xcode Previews.
# With the debug dylib on, the app's Wingtip.debug.dylib and its
# __preview.dylib both write Wingtip_dependency_info.dat, and Xcode links
# them in either order. Where the preview stub was linked last (the night's
# iPhone Duo leg, run 44927130075), the App Intents tool found no
# AppIntents.framework in that file, skipped the Siri phrases
# ("Metadata extraction skipped, no AppIntents.framework dependency
# found"), and the string catalog's check read them as gone.
if [ "$step" = build ]; then
  only=()
  opts+=(-project apps/ios/Wingtip.xcodeproj -scheme "$scheme" -configuration Debug -derivedDataPath "$RUNNER_TEMP/derived"
    CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= COMPILER_INDEX_STORE_ENABLE=NO
    ENABLE_DEBUG_DYLIB=NO ENABLE_ONLY_ACTIVE_RESOURCES=NO WINGTIP_HOST="$host" WINGTIP_BUNDLE_ID="$WINGTIP_BUNDLE_ID")
else
  # The scheme's own run file as the build wrote it (Wingtip_ is not
  # WingtipUnit_'s), which names the products beside it, wherever they were built.
  runs=("$products/${scheme}_"*.xctestrun)
  if [ ! -f "${runs[0]}" ]; then
    echo "::error title=iOS test failed::no ${scheme}_*.xctestrun in $products: the build's products are not here"
    exit 1
  fi
  opts+=(-xctestrun "${runs[0]}")
fi

# This step's part of the log starts here: a verdict above it is another
# step's, or an earlier run's.
from=$(($(wc -l < "$log") + 1))
said() { tail -n "+$from" "$log"; }
# `only` is empty at night and at the build, which the Mac's bash 3.2 calls unset under -u.
#
# Said as it goes, not only at the end: each test as it starts and ends,
# and a line a minute with the runner's free memory, swap and simulators,
# so a leg stopped part way (the iPad's 2/2, cancelled twice with nothing
# said, runs 45113706296 and 45127491141) shows where it was and what the
# runner had left.
( while sleep 60; do
    echo "ios_test: $(date -u +%H:%M:%S) $(memory_pressure 2>/dev/null | grep -o 'free percentage: [0-9]*%' || true), swap $(sysctl -n vm.swapusage 2>/dev/null | awk '{print $6}'), disk free $(df -h "$RUNNER_TEMP" 2>/dev/null | awk 'NR==2 {print $4}'), $(pgrep -f launchd_sim | wc -l | tr -d ' ') simulators running, load $(sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}')"
  done ) &
watch=$!
trap 'kill "$watch" 2>/dev/null || true' EXIT
# NSUnbufferedIO: xcodebuild writes each line as it comes, where into a
# pipe it held them in its buffer, and a leg stopped part way had shown
# none of its tests (run 45152106014).
NSUnbufferedIO=YES xcodebuild "${opts[@]}" ${only[@]+"${only[@]}"} "$action" 2>&1 \
  | tee -a "$log" | grep --line-buffered -E "^Test Case '.*' (started|passed|failed|skipped)|^✘ Test" || true
kill "$watch" 2>/dev/null || true

# Each error with the lines after it (a cause), the tests, the verdict.
said | grep -nE "error:|error\b|Could not|Test (Case|Suite)|Executed|\*\* (BUILD|TEST)" -A6 | tail -200 || true
said | grep -E "✔ Test|✘ Test|Test run with" || true
# Not `grep -q`, which stops at the verdict and fails the pipe it closes.
if ! said | grep -E "\*\* $verdict \*\*" > /dev/null; then
  # Each failed test by name, from the result bundle (else the log).
  if [ "$step" = test ]; then
    { xcrun xcresulttool get test-results tests --path "$RUNNER_TEMP/Wingtip.xcresult" 2> /dev/null || true; } |
      LOG=$log python3 scripts/ci/ios_failures.py
  fi
  echo "::error title=iOS $step failed::xcodebuild $action did not end in ** $verdict ** (its errors above; the whole log is the run's native-ios-log artifact)"
  exit 1
fi
