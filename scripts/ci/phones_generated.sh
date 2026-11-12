#!/usr/bin/env bash
# The phones' generated API models and engine calls are the committed ones:
# regenerated, they change nothing (neither app's build has Node, so a stale
# one is caught here, not on a phone). ci.yml's web job runs it after
# `npm ci`; run it on the Mac the same way.
set -euo pipefail
cd "$(dirname "$0")/../.."
scripts/build/api-models-apps.sh
scripts/build/engine-contract-apps.sh
generated=(
  apps/ios/Wingtip/API/Generated
  apps/android/app/src/main/kotlin/app/wingtipmaps/android/api/generated
  apps/ios/Wingtip/Engine/Generated
  apps/android/app/src/main/kotlin/app/wingtipmaps/android/engine/generated
)
if [ -n "$(git status --porcelain -- "${generated[@]}")" ]; then
  git status --short -- "${generated[@]}"
  echo "::error title=Phone generated code out of date::the phones' generated API models or engine calls are not what the OpenAPI documents and the engine's contract give: run scripts/build/api-models-apps.sh and scripts/build/engine-contract-apps.sh and commit the files."
  exit 1
fi
