#!/usr/bin/env bash
# native-android.yml's build job: the app compiled, unit-tested and linted
# on every run; this workflow's own runs (OWN_RUN) package the debug APK
# too, and main's pushes and the night (RELEASE) the release build, R8's,
# as an APK and as the Android App Bundle Google Play takes (bundleRelease).
# The job keeps the bundle and R8's mapping file
# (app/build/outputs/mapping/release/mapping.txt) with the run: a crash
# report from a release build names R8's short names, unreadable without it.
#
# The release is signed with the upload key where the repository has its
# secrets (ANDROID_UPLOAD_KEYSTORE, the keystore as base64, and
# ANDROID_UPLOAD_PASSWORD, its store and key password; the key's alias
# "upload" unless ANDROID_UPLOAD_ALIAS says otherwise), unsigned where it
# has none (app/build.gradle.kts). Play App Signing holds the key the
# phones see (docs/NATIVE-ANDROID.md, "Releasing to Google Play"). Every
# release build's native libraries are checked for 16 KB pages
# (scripts/ci/android_16k.py), which Play requires of updates from
# 1 February 2027.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/../../apps/android"
tasks=(testDebugUnitTest lintDebug)
if [[ "${OWN_RUN:-}" == true ]]; then tasks+=(assembleDebug); fi
if [[ "${RELEASE:-}" == true ]]; then
  tasks+=(assembleRelease bundleRelease)
  if [[ -n "${ANDROID_UPLOAD_KEYSTORE:-}" && -n "${ANDROID_UPLOAD_PASSWORD:-}" ]]; then
    keystore="${RUNNER_TEMP:-$(mktemp -d)}/upload.jks"
    printf '%s' "$ANDROID_UPLOAD_KEYSTORE" | base64 --decode > "$keystore"
    export WINGTIP_UPLOAD_KEYSTORE="$keystore" WINGTIP_UPLOAD_PASSWORD="$ANDROID_UPLOAD_PASSWORD"
    export WINGTIP_UPLOAD_ALIAS="${ANDROID_UPLOAD_ALIAS:-upload}"
    echo "The release is signed with the upload key."
  else
    echo "::notice title=Unsigned release::no ANDROID_UPLOAD_KEYSTORE secret; the bundle is built unsigned"
  fi
fi
./gradlew --stacktrace --build-cache "${tasks[@]}"
if [[ "${RELEASE:-}" == true ]]; then
  python3 "$here/android_16k.py" app/build/outputs/apk/release/*.apk app/build/outputs/bundle/release/*.aab
fi
