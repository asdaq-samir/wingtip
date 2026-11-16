#!/usr/bin/env bash
# Start the phone simulators on the live stack, so the owner can try the
# wave on the iPhone and Android apps the moment the web is live (the owner,
# 2026-11-12: "Before validation, make the web live and start phone
# simulators"). Run after `scripts/dev/go-live.sh --up`; every wave.
#
#   scripts/dev/simulators.sh [ios|android|both] [--tree <dir>]
#
# Default is both, from ~/Developer/wingtip-live, the tree go-live.sh puts
# live, so the phones run the same code as the web. Both apps are built for
# the host localhost:8443, the gateway's HTTPS port (docs/LOCAL-DEV.md, "On
# a phone, over the Wi-Fi"), and trust the local authority's ca.pem
# (infra/local-https/certs, made by make-certs.sh):
#
# - iOS: the newest iPhone simulator (the highest model number) is booted, the
#   engine XCFramework made (build-xcframework.sh takes it from the shared
#   store when this engine was built before), XcodeGen run, the app built
#   with WINGTIP_HOST=localhost:8443 (apps/ios/Wingtip/Config.swift reads
#   the host from Info.plist's WingtipHost, set by that build setting),
#   installed and launched. The simulator is given the authority with
#   `simctl keychain <udid> add-root-cert`. Its window opens in Simulator.app
#   where this Xcode has one; Xcode 27 ships none (DeviceHub.app instead), and
#   the simulator runs headless as well.
# - Android: an arm64 AVD (an existing one, else made with avdmanager on the
#   newest installed arm64 system image) is started and awaited, the engine
#   built, the app built with WINGTIP_HOST=localhost:8443
#   (apps/android/app/build.gradle.kts, BuildConfig.WINGTIP_HOST ->
#   Config.kt), installed with `adb install -r` and launched with
#   `am start`. The emulator's localhost is not the Mac's, so `adb reverse`
#   maps its 8443 to the Mac's: the host stays "localhost", a name the
#   server certificate holds (make-certs.sh: DNS:localhost); 10.0.2.2
#   would not match it. The debug build trusts ca.pem itself: Gradle copies
#   it into the debug variant's resources and a network security config
#   (`<debug-overrides>`, apps/android/app/build.gradle.kts) trusts it, so
#   the stock Google Play emulator image works, no `adb root`.
#
# Each heavy build takes a turn of one-at-a-time.sh (CLAUDE.md). Nothing is
# built or booted until the stack answers and the certificate exists. A
# wait always has a deadline: SIM_BOOT_WAIT seconds (default 240).
set -euo pipefail

mode=both
tree=${WINGTIP_LIVE_DIR:-$HOME/Developer/wingtip-live}
while [ $# -gt 0 ]; do
  case "$1" in
    ios | android | both) mode=$1 ;;
    --tree)
      tree=${2:?--tree needs a directory}
      shift
      ;;
    -h | --help)
      sed -n '2,/^set -/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "usage: simulators.sh [ios|android|both] [--tree <dir>]" >&2
      exit 2
      ;;
  esac
  shift
done

host=localhost:8443
boot_wait=${SIM_BOOT_WAIT:-240}
die() {
  echo "simulators: $*" >&2
  exit 1
}
say() { echo "simulators: $*" >&2; }

# --- What must be there first ------------------------------------------
[ -d "$tree/apps" ] || die "no checkout at $tree. Run scripts/dev/go-live.sh --up first (it makes ~/Developer/wingtip-live), or pass --tree <dir>."
tree=$(cd "$tree" && pwd)
turn=$tree/scripts/dev/one-at-a-time.sh
[ -x "$turn" ] || die "$turn is missing: $tree is not a current checkout. Run scripts/dev/go-live.sh --up."
ca=$tree/infra/local-https/certs/ca.pem
[ -f "$ca" ] || die "no $ca. Make the certificates once: infra/local-https/make-certs.sh <this Mac's Wi-Fi address> (docs/LOCAL-DEV.md, \"On a phone\"), then scripts/dev/go-live.sh --up."
# -k: the local authority is not in the Mac's trust store; --cacert would do
# but a stack still starting has not the certificate in place either.
if ! curl -ks --max-time 10 -o /dev/null "https://$host/actuator/health"; then
  die "the stack does not answer at https://$host. Run scripts/dev/go-live.sh --up (the live stack is down by default), wait for it to be healthy, then run this again."
fi
say "the stack answers at https://$host; the phones use $tree"

# wait_until <seconds> <what> <command...>: poll once a second, with a
# deadline, and say what it was waiting for when it runs out.
wait_until() {
  local limit=$1 what=$2 end
  shift 2
  end=$((SECONDS + limit))
  until "$@"; do
    [ "$SECONDS" -lt "$end" ] || die "gave up after ${limit}s waiting for $what."
    sleep 2
  done
}

# --- iOS ---------------------------------------------------------------
# The newest iPhone: the highest model number, and of that model the plain
# one before the Max or the e ("iPhone 18 Pro" over "iPhone 18 Pro Max").
# Sorting by name alone put "iPhone Air" last, after
# every numbered model. iPhone Duo is the foldable, tested apart.
newest_iphone() {
  xcrun simctl list devices available -j | python3 "$(dirname "$0")/newest_simulator.py" iPhone
}

# The list read whole, then searched: piped into `grep -q` under pipefail,
# a match killed simctl with SIGPIPE and failed the pipeline, so a booted
# simulator could read as not booted (go-live.sh's waits, 2026-11-14).
sim_booted() { grep -q "$1.*(Booted)" <<<"$(xcrun simctl list devices)"; }

ios() {
  command -v xcodegen >/dev/null || die "xcodegen is not installed (brew install xcodegen)."
  DEVELOPER_DIR=$("$tree/scripts/ci/select-xcode.sh") || die "no Xcode at .tool-versions' version in /Applications."
  export DEVELOPER_DIR
  local sim
  sim=$(newest_iphone)
  [ -n "$sim" ] || die "no iPhone simulator in this Xcode. Xcode > Settings > Components: install the newest iOS simulator runtime."
  say "iOS: simulator $(xcrun simctl list devices available | grep "$sim" | sed 's/ *(.*//;s/^ *//') ($sim)"
  xcrun simctl boot "$sim" 2>/dev/null || true # already booted is fine
  wait_until "$boot_wait" "the iPhone simulator to boot" sim_booted "$sim"
  # Simulator.app shows the window where this Xcode has it; Xcode 27 has
  # none (DeviceHub.app in its place), so carry on headless: the app still
  # installs, launches and is seen with `simctl io <udid> screenshot`.
  if open -a Simulator --args -CurrentDeviceUDID "$sim" 2>/dev/null; then
    :
  elif open -a "$DEVELOPER_DIR/../Applications/DeviceHub.app" 2>/dev/null; then
    say "iOS: no Simulator.app in this Xcode; opened DeviceHub, and the simulator runs headless"
  else
    say "iOS: no Simulator.app in this Xcode; the simulator runs headless (xcrun simctl io $sim screenshot <file> to see it)"
  fi
  # The authority, into the simulator's trust store, so https://localhost:8443
  # is trusted (LOCAL-DEV.md: ca.pem is what a phone installs once).
  xcrun simctl keychain "$sim" add-root-cert "$ca"

  "$turn" "simulators: iOS engine" "$tree/engine/bindings/ffi/build-xcframework.sh"
  xcodegen generate --spec "$tree/apps/ios/project.yml" --project "$tree/apps/ios" --quiet

  # xcodebuild.sh, with the shared compilation cache, builds into the turn's
  # own DerivedData (wingtip-turn-<slot>) and names it with -derivedDataPath
  # itself; xcodebuild takes that option once only and printed its usage
  # (exit 64) when this script named a second. So the build runs inside a
  # turn of this script's, where xcodebuild.sh runs at once, and the app is
  # copied out of that DerivedData before the turn ends and another build
  # takes it. Signed ad hoc, as check.sh and native-ios.yml do (the
  # simulator's keychain needs a signature).
  local out=$HOME/Library/Developer/Xcode/DerivedData/wingtip-simulators-ios
  rm -rf "$out" && mkdir -p "$out"
  WINGTIP_HOST=$host "$turn" "simulators: iOS app" bash -c '
    set -euo pipefail
    tree=$1 sim=$2 out=$3
    "$tree/scripts/dev/xcodebuild.sh" -quiet -project "$tree/apps/ios/Wingtip.xcodeproj" -scheme Wingtip \
      -configuration Debug -destination "platform=iOS Simulator,id=$sim" \
      CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= \
      WINGTIP_HOST="$WINGTIP_HOST" build
    ditto "$HOME/Library/Developer/Xcode/DerivedData/wingtip-turn-${ONE_AT_A_TIME_SLOT:?no turn}/Build/Products/Debug-iphonesimulator/Wingtip.app" "$out/Wingtip.app"
  ' _ "$tree" "$sim" "$out"
  local app=$out/Wingtip.app bundle
  [ -d "$app" ] || die "the build left no $app."
  bundle=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$app/Info.plist")
  xcrun simctl install "$sim" "$app"
  xcrun simctl launch "$sim" "$bundle" >/dev/null
  say "iOS: $bundle launched on $sim, talking to https://$host"
}

# --- Android -----------------------------------------------------------
sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}
adb=$sdk/platform-tools/adb
emu=$sdk/emulator/emulator

booted() { [ "$("$adb" -s "$1" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; }

# The AVD to use: an arm64 one that exists (the newest by name), else one
# made on the newest installed arm64 system image.
# An AVD's folder is the path its <name>.ini names, not always <name>.avd
# (Android Studio's "Medium_Phone_API_37.0" lives in Medium_Phone.avd).
# Each line of the loop ends true, or pipefail made the function fail and
# set -e stopped the script without a word when the last AVD was not arm64.
pick_avd() {
  local name abi dir avds=${ANDROID_AVD_HOME:-$HOME/.android/avd}
  while read -r name; do
    dir=$(sed -n 's/^path *= *//p' "$avds/$name.ini" 2>/dev/null || true)
    dir=${dir:-$avds/$name.avd}
    abi=$(sed -n 's/^abi.type *= *//p' "$dir/config.ini" 2>/dev/null || true)
    if [ "$abi" = arm64-v8a ]; then echo "$name"; fi
  done < <("$emu" -list-avds | sort) | tail -1
}

make_avd() {
  local mgr=$sdk/cmdline-tools/latest/bin/avdmanager image
  [ -x "$mgr" ] || die "no AVD and no avdmanager. Make one in Android Studio (Device Manager > Create Device, an arm64 image), or install the SDK's command-line tools (SDK Manager > SDK Tools > Android SDK Command-line Tools)."
  image=$(cd "$sdk/system-images" 2>/dev/null && ls -d android-*/*/arm64-v8a 2>/dev/null | sort -V | tail -1 || true)
  [ -n "$image" ] || die "no arm64 system image under $sdk/system-images. Install one: sdkmanager \"system-images;android-37.0;google_apis;arm64-v8a\" (Google APIs lets the script trust the local certificate; Google Play does not)."
  say "Android: making AVD wingtip-phone on ${image//\//;}"
  echo no | "$mgr" create avd --force --name wingtip-phone --device pixel_8 --package "system-images;${image//\//;}" >&2
  echo wingtip-phone
}

android() {
  [ -x "$adb" ] || die "no adb at $adb. Set ANDROID_HOME, or install the SDK's platform-tools (Android Studio > SDK Manager)."
  [ -x "$emu" ] || die "no emulator at $emu. Install it: Android Studio > SDK Manager > SDK Tools > Android Emulator."
  export ANDROID_HOME=$sdk
  local java
  java=$("$tree/scripts/build/toolchain.sh" get java)
  JAVA_HOME=${JAVA_HOME:-$(for d in /Library/Java/JavaVirtualMachines/*"$java"*/Contents/Home "$HOME"/Library/Java/JavaVirtualMachines/*"$java"*/Contents/Home "$HOME"/.gradle/jdks/*"$java"*/*/Contents/Home; do [ -d "$d" ] && echo "$d"; done | sort | tail -1)}
  export JAVA_HOME
  [ -n "$JAVA_HOME" ] || die "no JDK $java (.tool-versions). Install Temurin $java, or let Gradle fetch it by running the Android check once."
  ANDROID_NDK_HOME=$sdk/ndk/$("$tree/scripts/build/toolchain.sh" get android-ndk)
  export ANDROID_NDK_HOME

  # adb's server, with its mDNS discovery on, aborted every few seconds on
  # this Mac (2026-11-12, macOS 27.2, platform-tools 37.0.1: a panic in
  # adbmdns_bridge parsing a service name on the network, in its crash
  # report), and each command after started a new one that had lost the
  # emulator and the reverse mapping. The emulator needs no mDNS, so the
  # server runs without it, and one started with it is replaced. The
  # emulator started below inherits the setting for the servers it starts.
  export ADB_MDNS=0
  if ! "$adb" mdns check 2>&1 | grep -q disabled; then
    "$adb" kill-server 2>/dev/null || true
  fi
  "$adb" start-server >&2

  local serial avd
  serial=$("$adb" devices | awk '/^emulator-.*device$/ {print $1; exit}')
  # An emulator already running but not listed yet (still booting, or the
  # server new) is waited for below, not started a second time.
  if [ -z "$serial" ] && pgrep -qf 'qemu-system-[^ ]* .*-avd '; then
    say "Android: an emulator is running already; waiting for it"
  elif [ -z "$serial" ]; then
    avd=$(pick_avd)
    [ -n "$avd" ] || avd=$(make_avd)
    say "Android: starting the emulator on $avd (log: ${TMPDIR:-/tmp}/wingtip-emulator.log)"
    # -crash-report-mode never: after an emulator crash the next start asks,
    # in a dialog, whether to send the report, and waits there without
    # booting (2026-11-12, "Showing crashdialog to get consent").
    nohup "$emu" -avd "$avd" -no-snapshot-save -no-boot-anim -crash-report-mode never >"${TMPDIR:-/tmp}/wingtip-emulator.log" 2>&1 &
  fi

  # The engine builds while the emulator boots.
  "$turn" "simulators: Android engine" "$tree/engine/bindings/ffi/build-android.sh"

  if [ -z "$serial" ]; then
    wait_until "$boot_wait" "an emulator to appear (see ${TMPDIR:-/tmp}/wingtip-emulator.log)" bash -c '"$0" devices | grep -q "^emulator-.*device$"' "$adb"
    serial=$("$adb" devices | awk '/^emulator-.*device$/ {print $1; exit}')
  fi
  wait_until "$boot_wait" "Android to finish booting (sys.boot_completed)" booted "$serial"

  # WINGTIP_HOST is read by build.gradle.kts before its gradle property.
  # Built by Gradle and installed by adb itself: Gradle's installDebug talks
  # to the adb server through ddmlib, and failed with "Connection refused"
  # when that server had gone between the boot and the install
  # (2026-11-12); adb starts its server again on its own.
  WINGTIP_HOST=$host "$turn" "simulators: Android app" bash -c 'cd "$1/apps/android" && ./gradlew --quiet assembleDebug -PwingtipLocalCa="$2"' _ "$tree" "$ca"
  local apk=$tree/apps/android/app/build/outputs/apk/debug/app-debug.apk
  [ -f "$apk" ] || die "the build left no $apk."
  wait_until "$boot_wait" "Android to be back after the build" booted "$serial"
  "$adb" -s "$serial" install -r "$apk" >&2
  # The emulator's localhost:8443 is the Mac's, and "localhost" is a name the
  # server certificate holds. Set last: the adb server holds the mapping,
  # and one that has gone since takes it with it.
  "$adb" -s "$serial" reverse tcp:8443 tcp:8443 >/dev/null
  local appid
  appid=$(sed -n 's/.*"\(app\.wingtipmaps\.android\.native\)".*/\1/p' "$tree/apps/android/app/build.gradle.kts" | head -1)
  appid=${appid:-app.wingtipmaps.android.native}
  "$adb" -s "$serial" shell am force-stop "$appid"
  "$adb" -s "$serial" shell am start -n "$appid/app.wingtipmaps.android.MainActivity" >/dev/null
  say "Android: $appid launched on $serial, talking to https://$host through adb reverse"
}

case "$mode" in
  ios) ios ;;
  android) android ;;
  both)
    ios
    android
    ;;
esac
