#!/usr/bin/env bash
# native-android.yml's build job: the app compiled, unit-tested and linted
# on every run; this workflow's own runs (OWN_RUN) package the debug APK
# too, and main's pushes and the night (RELEASE) the release build, R8's,
# whose mapping file (app/build/outputs/mapping/release/mapping.txt) the
# job keeps with the run: a crash report from a release build names
# R8's short names, unreadable without it.
set -euo pipefail
cd "$(dirname "$0")/../../apps/android"
tasks=(testDebugUnitTest lintDebug)
if [[ "${OWN_RUN:-}" == true ]]; then tasks+=(assembleDebug); fi
if [[ "${RELEASE:-}" == true ]]; then tasks+=(assembleRelease); fi
./gradlew --stacktrace --build-cache "${tasks[@]}"
