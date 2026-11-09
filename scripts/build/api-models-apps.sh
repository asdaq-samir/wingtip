#!/usr/bin/env bash
# The phones' models of the servers' answers, generated from the same
# OpenAPI documents the web's API client is (`npm run types`:
# services/planner/openapi.json for the planner, services/gateway/openapi.json
# for the gateway), so a field renamed on a server fails the phones' build
# and CI, not a pilot's screen at runtime. quicktype writes models only --
# plain Codable structs and @Serializable data classes, no runtime library --
# and each app keeps its own thin client (apps/ios/Wingtip/API/Planner.swift,
# apps/android/.../api/Planner.kt):
#
#   apps/ios/Wingtip/API/Generated/PlannerModels.swift      types prefixed API
#   apps/ios/Wingtip/API/Generated/GatewayModels.swift      types prefixed GW
#   apps/android/.../api/generated/PlannerModels.kt         package ...api.generated
#   apps/android/.../api/generated/GatewayModels.kt         package ...api.generated.gateway
#
# all committed with a "generated, do not edit" header (neither app's build
# has Node); CI runs this and fails when the committed files differ.
#
#   scripts/build/api-models-apps.sh
#
# Every schema of both documents is generated, so there is no list to keep
# and no answer a phone reads with a model of its own: an endpoint added to
# a server has its model on the next run. In Docker, since the owner's Mac
# has no Node.
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

"$docker" run --rm -v "$here:/w" -w /w node:24-slim sh -ec '
  swift_dir=apps/ios/Wingtip/API/Generated
  kotlin_dir=apps/android/app/src/main/kotlin/app/wingtipmaps/android/api/generated
  mkdir -p "$swift_dir" "$kotlin_dir" /tmp/api
  for doc in planner gateway; do
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
'
echo "generated every schema of services/planner/openapi.json and services/gateway/openapi.json"
