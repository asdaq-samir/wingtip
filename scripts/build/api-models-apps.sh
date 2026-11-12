#!/usr/bin/env bash
# The phones' models of the servers' answers, generated from the same
# OpenAPI documents the web's API client is (`npm run types`:
# services/planner/openapi.json for the planner, services/gateway/openapi.json
# for the gateway, services/assistant/openapi.json for the assistant the
# gateway forwards /api/assistant, /api/words/* and the checkpoint notes
# to), so a field renamed on a server fails the phones' build
# and CI, not a pilot's screen at runtime. quicktype writes models only --
# plain Codable structs and @Serializable data classes, no runtime library --
# and the iPhone keeps its own thin client (apps/ios/Wingtip/API/Planner.swift).
# Android's calls are generated too: openapi-generator's Kotlin client on
# Retrofit (library jvm-retrofit2, kotlinx.serialization, coroutines), one
# interface a server, its answers the quicktype models above (each schema
# mapped to quicktype's class by api-models-apps.mjs's client step), made
# on the app's one OkHttp client (di/NetworkModule.kt):
#
#   apps/ios/Wingtip/API/Generated/PlannerModels.swift      types prefixed API
#   apps/ios/Wingtip/API/Generated/GatewayModels.swift      types prefixed GW
#   apps/android/.../api/generated/PlannerModels.kt         package ...api.generated
#   apps/android/.../api/generated/GatewayModels.kt         package ...api.generated.gateway
#   apps/ios/Wingtip/API/Generated/AssistantModels.swift    types prefixed AS
#   apps/android/.../api/generated/AssistantModels.kt       package ...api.generated.assistant
#   apps/android/.../api/generated/client/apis/{Planner,Gateway,Assistant}Api.kt
#   apps/android/.../api/generated/client/infrastructure/CollectionFormats.kt
#
# all committed with a "generated, do not edit" header (neither app's build
# has Node); CI runs this and fails when the committed files differ.
#
#   scripts/build/api-models-apps.sh
#
# Every schema of both documents is generated, so there is no list to keep
# and no answer a phone reads with a model of its own: an endpoint added to
# a server has its model on the next run. In Docker, since the owner's Mac
# has no Node; openapi-generator in its own image, pinned below.
#
# How the documents are read:
# - Enums and consts become plain strings, as the hand-written models read
#   them: a value the server adds later must not make a whole answer fail
#   to decode on a phone that has not been updated. A string's format (a
#   date) is dropped too, so a date stays the string the apps read.
# - Tuples (a [lat, lon] pair) become arrays of their one type.
# - A member a document leaves untyped is JSONValue on the iPhone
#   (API/JSONValue.swift) and kotlinx's JsonElement on Android.
# - Swift: the planner's answers are read by Planner.snakeCase
#   (keyDecodingStrategy .convertFromSnakeCase), which turns "flight_category"
#   into "flightCategory" before it looks for a key, so each CodingKey is
#   rewritten to that converted name (a key quicktype renamed, "class" or
#   "private", keeps its own). The gateway's JSON is camel case already.
# - Kotlin: @SerialName carries the snake case, as Models.kt's did, read by
#   Gateway.json (ignoreUnknownKeys, explicitNulls false).
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
docker=${DOCKER:-docker}
# openapi-generator-cli 7.27.0, the newest on Maven Central (2026-11-12).
openapi_generator=openapitools/openapi-generator-cli:v7.27.0
kotlin_dir=apps/android/app/src/main/kotlin/app/wingtipmaps/android/api/generated
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

"$docker" run --rm -v "$here:/w" -v "$work:/tmp/api" -w /w "node:$("$here/scripts/build/toolchain.sh" get nodejs)-slim" sh -ec '
  swift_dir=apps/ios/Wingtip/API/Generated
  kotlin_dir=apps/android/app/src/main/kotlin/app/wingtipmaps/android/api/generated
  mkdir -p "$swift_dir" "$kotlin_dir"
  for doc in planner gateway assistant; do
    node scripts/build/api-models-apps.mjs prep "services/$doc/openapi.json" "/tmp/api/$doc.kotlin.json"
    node scripts/build/api-models-apps.mjs prep "services/$doc/openapi.json" "/tmp/api/$doc.swift.json" swift
  done

  gen() { # language, document, type prefix or package, file
    lang=$1 doc=$2 name=$3 file=$4
    srcs=""
    for s in $(node scripts/build/api-models-apps.mjs names "services/$doc/openapi.json"); do
      srcs="$srcs /tmp/api/$doc.$lang.json#/components/schemas/$s"
    done
    if [ "$lang" = swift ]; then
      npx -y quicktype@23.2.6 -s schema -l swift --type-prefix "$name" --no-initializers \
        --struct-or-class struct --protocol equatable --sendable --access-level internal \
        --mutable-properties --acronym-style camel --density dense -o "$file" $srcs
    else
      npx -y quicktype@23.2.6 -s schema -l kotlin --framework kotlinx --acronym-style camel \
        --package "$name" -o "$file" $srcs
    fi
  }

  gen swift planner API "$swift_dir/PlannerModels.swift"
  node scripts/build/api-models-apps.mjs swift "$swift_dir/PlannerModels.swift" snake
  gen swift gateway GW "$swift_dir/GatewayModels.swift"
  node scripts/build/api-models-apps.mjs swift "$swift_dir/GatewayModels.swift" camel
  gen kotlin planner app.wingtipmaps.android.api.generated "$kotlin_dir/PlannerModels.kt"
  node scripts/build/api-models-apps.mjs kotlin "$kotlin_dir/PlannerModels.kt" services/planner/openapi.json
  gen kotlin gateway app.wingtipmaps.android.api.generated.gateway "$kotlin_dir/GatewayModels.kt"
  node scripts/build/api-models-apps.mjs kotlin "$kotlin_dir/GatewayModels.kt" services/gateway/openapi.json
  gen swift assistant AS "$swift_dir/AssistantModels.swift"
  node scripts/build/api-models-apps.mjs swift "$swift_dir/AssistantModels.swift" snake
  gen kotlin assistant app.wingtipmaps.android.api.generated.assistant "$kotlin_dir/AssistantModels.kt"
  node scripts/build/api-models-apps.mjs kotlin "$kotlin_dir/AssistantModels.kt" services/assistant/openapi.json
  node scripts/build/api-models-apps.mjs client services/planner/openapi.json "$kotlin_dir/PlannerModels.kt" planner /tmp/api
  node scripts/build/api-models-apps.mjs client services/gateway/openapi.json "$kotlin_dir/GatewayModels.kt" gateway /tmp/api
  node scripts/build/api-models-apps.mjs client services/assistant/openapi.json "$kotlin_dir/AssistantModels.kt" assistant /tmp/api
'

# Each server's Retrofit interface, and the one support file it imports.
rm -rf "$here/$kotlin_dir/client"
mkdir -p "$here/$kotlin_dir/client/apis" "$here/$kotlin_dir/client/infrastructure"
for server in planner gateway assistant; do
  "$docker" run --rm -v "$work:/api" "$openapi_generator" generate --skip-validate-spec \
    -i "/api/$server.client.json" -c "/api/$server.config.json" -o "/api/out-$server" \
    -g kotlin --library jvm-retrofit2 \
    --additional-properties=serializationLibrary=kotlinx_serialization,useCoroutines=true,packageName=app.wingtipmaps.android.api.generated.client \
    --global-property apis,supportingFiles=CollectionFormats.kt,apiTests=false,apiDocs=false >/dev/null
  src="$work/out-$server/src/main/kotlin/app/wingtipmaps/android/api/generated/client"
  for f in "$src"/apis/*.kt "$src"/infrastructure/CollectionFormats.kt; do
    dest="$here/$kotlin_dir/client/${f#"$src"/}"
    { printf "// Generated by scripts/build/api-models-apps.sh from the servers\x27 OpenAPI\n// documents (openapi-generator); do not edit. Change the server and run the script.\n\n"
      # A number's default as Kotlin writes a Double (kotlin.Double("0") is
      # the generator's BigDecimal form, which does not compile).
      sed -E -e "s/[[:space:]]*$//" -e 's/kotlin\.Double\("(-?[0-9]+)"\)/\1.0/g' \
        -e 's/kotlin\.Double\("(-?[0-9]+\.[0-9]+)"\)/\1/g' "$f"; } | cat -s >"$dest"
  done
done
echo "generated every schema and the Android client of services/planner, services/gateway and services/assistant openapi.json"
