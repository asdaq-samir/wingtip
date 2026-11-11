#!/usr/bin/env bash
# The emulator's instrumented tests (native-android.yml, the night's
# "device" job): the engine held to the shared fixtures through the
# app's own bridge (EngineTest), then the release build, R8's, started
# and its engine called (ReleaseEngineTest, :baselineprofile's
# benchmarkRelease build). The emulator's timings are no phone's, so the
# startup benchmark and the profile's generator are left out
# (docs/NATIVE-ANDROID.md).
set -euo pipefail
cd "$(dirname "$0")/../../apps/android"
./gradlew --stacktrace --build-cache :app:connectedDebugAndroidTest
./gradlew --stacktrace --build-cache :baselineprofile:connectedBenchmarkReleaseAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=app.wingtipmaps.android.baselineprofile.ReleaseEngineTest
