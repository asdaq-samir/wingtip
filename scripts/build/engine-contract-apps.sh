#!/usr/bin/env bash
# The phones' typed calls into the engine, generated from its contract
# (engine/contract/engine.schema.json), as the web's types are by
# json-schema-to-typescript (`npm run types`): one function per rule, its
# input's members as parameters and its answer as a type of the contract,
# so a rule asked wrongly fails the app's build, not a pilot's screen.
#
#   apps/ios/Wingtip/Engine/Generated/EngineContract.swift   the inputs and answers (enum EngineContract)
#   apps/ios/Wingtip/Engine/Generated/EngineCalls.swift      extension Engine: try Engine.underway(speedKt:)
#   apps/android/.../engine/generated/EngineContract.kt      object EngineContract
#   apps/android/.../engine/generated/EngineCalls.kt         Engine.underway(speedKt = ...): Result<Boolean>
#
# all committed with a "generated, do not edit" header (neither app's build
# has Node); CI runs this and fails when the committed files differ. Run it
# after changing the contract, and commit the four files.
#
#   scripts/build/engine-contract-apps.sh
#
# scripts/build/engine-contract-apps.mjs says how the contract is read. In
# Docker, since the owner's Mac has no Node.
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
docker=${DOCKER:-docker}

"$docker" run --rm -v "$here:/w" -w /w node:24-slim \
  node scripts/build/engine-contract-apps.mjs engine/contract/engine.schema.json \
  apps/ios/Wingtip/Engine/Generated \
  apps/android/app/src/main/kotlin/app/wingtipmaps/android/engine/generated
