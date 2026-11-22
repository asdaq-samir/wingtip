#!/usr/bin/env bash
# The emulator's instrumented tests (native-android.yml, the night's and a
# wave's "device" jobs), on the device DEVICE names. The phone (the
# default): the engine held to the shared fixtures through the app's own
# bridge (EngineTest) and every other test, then the release build, R8's,
# started and its engine called (ReleaseEngineTest, :baselineprofile's
# benchmarkRelease build). The tablet (DEVICE=tablet, a Pixel Tablet,
# 1280 x 800 dp on its side, Android's 10.5-inch test size): the wide
# layouts' tests alone (@LargeScreen: WidePanesTest, TabletLayoutTest),
# as the phone's sheet tests ask for a sheet a tablet does not have. The
# emulator's timings are no device's, so the startup benchmark and the
# profile's generator are left out (docs/NATIVE-ANDROID.md).
set -euo pipefail
cd "$(dirname "$0")/../../apps/android"
# The site's host, whose links the app opens (build.gradle.kts's WINGTIP_HOST).
WINGTIP_HOST="${WINGTIP_HOST:-$(python3 -c 'import sys, urllib.parse; print(urllib.parse.urlparse(sys.argv[1]).hostname)' "${WINGTIP_URL:?}")}"
export WINGTIP_HOST
if [[ "${DEVICE:-phone}" == tablet ]]; then
  ./gradlew --stacktrace --build-cache :app:connectedDebugAndroidTest \
    -Pandroid.testInstrumentationRunnerArguments.annotation=app.wingtipmaps.android.LargeScreen
  exit 0
fi
./gradlew --stacktrace --build-cache :app:connectedDebugAndroidTest
./gradlew --stacktrace --build-cache :baselineprofile:connectedBenchmarkReleaseAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=app.wingtipmaps.android.baselineprofile.ReleaseEngineTest
