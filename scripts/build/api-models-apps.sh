#!/usr/bin/env bash
# The phones' code for the servers' APIs, generated from the same OpenAPI
# documents the web's API client is (`npm run types`:
# services/planner/openapi.json for the planner, services/gateway/openapi.json
# for the gateway), so a field renamed on a server fails the phones' build and CI, not
# a pilot's screen at runtime. All committed with a "generated, do not
# edit" header (neither app's build has Node or the generator); CI runs
# this and fails when the committed files differ.
#
#   scripts/build/api-models-apps.sh            write them
#   scripts/build/api-models-apps.sh --check    fail, naming them, where one differs
#
# The iPhone: apple/swift-openapi-generator (its version and the Swift it
# is built with in .tool-versions) writes each document's client and
# types, one module each, which the app links (apps/ios/project.yml) and
# calls through its runtime and URLSession transport (API/Planner.swift):
#
#   apps/ios/WingtipAPI/{PlannerAPI,GatewayAPI}/*.swift
#   apps/ios/Wingtip/API/Generated/{Planner,Gateway}API.swift
#       each schema's name in the app: APICourse, GWPilotDto, ASSource
#
# Android: quicktype writes the models -- @Serializable data classes, no
# runtime library -- and openapi-generator's Kotlin client on Retrofit
# (library jvm-retrofit2, kotlinx.serialization, coroutines) the calls, one
# interface a server, its answers the quicktype models (each schema mapped
# to quicktype's class by api-models-apps.mjs's client step), made on the
# app's one OkHttp client (di/NetworkModule.kt):
#
#   apps/android/.../api/generated/PlannerModels.kt     package ...api.generated
#   apps/android/.../api/generated/GatewayModels.kt     package ...api.generated.gateway
#   apps/android/.../api/generated/client/apis/{Planner,Gateway}Api.kt
#   apps/android/.../api/generated/client/infrastructure/CollectionFormats.kt
#
# Every schema of every document is generated, so there is no list to keep.
# In Docker (node for quicktype and the documents' steps, swift for the
# Swift generator, built once per version, openapi-generator in its own
# image, pinned below), since the owner's Mac has no Node.
#
# How the documents are read (api-models-apps.mjs):
# - Enums and consts become plain strings: a value the server adds later
#   must not make a whole answer fail to decode on a phone that has not
#   been updated. A string's format (a date) is dropped too, so a date
#   stays the string the apps read.
# - Tuples (a [lat, lon] pair) become arrays of their one type.
# - A member a document leaves untyped is OpenAPIRuntime's
#   OpenAPIValueContainer on the iPhone and kotlinx's JsonElement on Android.
# - Swift: a member that may be null is optional, its properties in name
#   order (each init's arguments), FastAPI's operation ids its functions'
#   names ("course", not "course_api_course_get"), and the gateway's "*/*"
#   answers the JSON they are. Each type carries its keys, so the planner's
#   snake case needs no strategy on the decoder.
# - Kotlin: @SerialName carries the snake case, as Models.kt's did, read by
#   Gateway.json (ignoreUnknownKeys, explicitNulls false).
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
docker=${DOCKER:-docker}
command -v "$docker" >/dev/null || PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
check=0
case "${1:-}" in
  --check) check=1 ;;
  "") ;;
  *) echo "usage: scripts/build/api-models-apps.sh [--check]" >&2; exit 2 ;;
esac
toolchain="$here/scripts/build/toolchain.sh"
generator=$("$toolchain" get swift-openapi-generator)
# openapi-generator-cli 7.27.0, the newest on Maven Central (2026-11-12).
openapi_generator=openapitools/openapi-generator-cli:v7.27.0

swift_api=apps/ios/WingtipAPI
swift_dir=apps/ios/Wingtip/API/Generated
kotlin_dir=apps/android/app/src/main/kotlin/app/wingtipmaps/android/api/generated
# Written into a scratch folder, then moved over the committed files (or,
# with --check, compared with them).
work=$(mktemp -d)
# On Linux (CI) the containers write the scratch folder as root, which the
# runner's user cannot remove, and a failed removal in the EXIT trap became
# the script's exit status after a good run: the files are removed from a
# container then.
cleanup() {
  rm -rf "$work" 2>/dev/null && return
  "$docker" run --rm -v "$work:/x" "node:$("$toolchain" get nodejs)-slim" sh -c 'rm -rf /x/* /x/.[!.]*' >/dev/null 2>&1 || true
  rm -rf "$work" 2>/dev/null || true
}
trap cleanup EXIT
mkdir -p "$work/docs" "$work/out/$swift_api" "$work/out/$swift_dir" "$work/out/$kotlin_dir"

node() { # the repo read-only at /w, the scratch folder at /x
  "$docker" run --rm -v "$here:/w:ro" -v "$work:/x" -w /w "node:$("$toolchain" get nodejs)-slim" sh -ec "$1"
}

node '
  for doc in planner gateway; do
    node scripts/build/api-models-apps.mjs prep "services/$doc/openapi.json" "/x/docs/$doc.kotlin.json"
    node scripts/build/api-models-apps.mjs openapi "services/$doc/openapi.json" "/x/docs/$doc.swift.json"
  done
  gen() { # document, package, file
    doc=$1 name=$2 file=/x/out/'"$kotlin_dir"'/$3
    srcs=""
    for s in $(node scripts/build/api-models-apps.mjs names "services/$doc/openapi.json"); do
      srcs="$srcs /x/docs/$doc.kotlin.json#/components/schemas/$s"
    done
    npx -y quicktype@23.2.6 -s schema -l kotlin --framework kotlinx --acronym-style camel \
      --package "$name" -o "$file" $srcs
    node scripts/build/api-models-apps.mjs kotlin "$file" "services/$doc/openapi.json"
  }
  gen planner app.wingtipmaps.android.api.generated PlannerModels.kt
  gen gateway app.wingtipmaps.android.api.generated.gateway GatewayModels.kt
  for doc in planner gateway; do
    models=$(echo "$doc" | sed "s/^./\U&/")Models.kt
    node scripts/build/api-models-apps.mjs client "services/$doc/openapi.json" "/x/out/'"$kotlin_dir"'/$models" "$doc" /x/docs
  done
'

# Each server's Retrofit interface, and the one support file it imports.
mkdir -p "$work/out/$kotlin_dir/client/apis" "$work/out/$kotlin_dir/client/infrastructure"
for server in planner gateway; do
  "$docker" run --rm -v "$work:/api" "$openapi_generator" generate --skip-validate-spec \
    -i "/api/docs/$server.client.json" -c "/api/docs/$server.config.json" -o "/api/out-$server" \
    -g kotlin --library jvm-retrofit2 \
    --additional-properties=serializationLibrary=kotlinx_serialization,useCoroutines=true,packageName=app.wingtipmaps.android.api.generated.client \
    --global-property apis,supportingFiles=CollectionFormats.kt,apiTests=false,apiDocs=false >/dev/null
  src="$work/out-$server/src/main/kotlin/app/wingtipmaps/android/api/generated/client"
  for f in "$src"/apis/*.kt "$src"/infrastructure/CollectionFormats.kt; do
    dest="$work/out/$kotlin_dir/client/${f#"$src"/}"
    { printf "// Generated by scripts/build/api-models-apps.sh from the servers\x27 OpenAPI\n// documents (openapi-generator); do not edit. Change the server and run the script.\n\n"
      # A number's default as Kotlin writes a Double (kotlin.Double("0") is
      # the generator's BigDecimal form, which does not compile).
      sed -E -e "s/[[:space:]]*$//" -e 's/kotlin\.Double\("(-?[0-9]+)"\)/\1.0/g' \
        -e 's/kotlin\.Double\("(-?[0-9]+\.[0-9]+)"\)/\1/g' "$f"; } | cat -s >"$dest"
  done
done

# The generator, built once per version into a folder kept between runs
# (CI caches it by .tool-versions), then run over each document into its
# module.
cache=${SWIFT_OPENAPI_GENERATOR_CACHE:-$HOME/.cache/wingtip/swift-openapi-generator}
mkdir -p "$cache"
"$docker" run --rm -v "$here:/w:ro" -v "$work:/x" -v "$cache:/cache" -w /w \
  "swift:$("$toolchain" get swift)-noble" sh -ec '
  bin=/cache/$1/swift-openapi-generator
  if [ ! -x "$bin" ]; then
    git clone -q --depth 1 --branch "$1" https://github.com/apple/swift-openapi-generator.git /tmp/generator
    swift build -q -c release --package-path /tmp/generator --product swift-openapi-generator
    mkdir -p "/cache/$1"
    cp "$(swift build -c release --package-path /tmp/generator --show-bin-path)/swift-openapi-generator" "$bin"
  fi
  for doc in Planner Gateway; do
    lower=$(echo "$doc" | tr "[:upper:]" "[:lower:]")
    "$bin" generate --config "$2/openapi-generator-config.yaml" --output-directory "/x/out/$2/${doc}API" \
      "/x/docs/$lower.swift.json" >/tmp/log 2>&1 || { cat /tmp/log; exit 1; }
  done
' sh "$generator" "$swift_api"

node '
  node scripts/build/api-models-apps.mjs aliases /x/out/'"$swift_api"'/PlannerAPI/Types+Components+Schemas.swift PlannerAPI API /x/out/'"$swift_dir"'/PlannerAPI.swift
  node scripts/build/api-models-apps.mjs aliases /x/out/'"$swift_api"'/GatewayAPI/Types+Components+Schemas.swift GatewayAPI GW /x/out/'"$swift_dir"'/GatewayAPI.swift
'

cp "$here/$swift_api/openapi-generator-config.yaml" "$work/out/$swift_api/"
status=0
for dir in "$swift_api" "$swift_dir" "$kotlin_dir"; do
  if [ "$check" = 1 ]; then
    diff -rq "$here/$dir" "$work/out/$dir" || status=1
  else
    rm -rf "${here:?}/$dir"
    mkdir -p "$(dirname "$here/$dir")"
    cp -R "$work/out/$dir" "$here/$dir"
  fi
done
if [ "$status" = 1 ]; then
  echo "the phones' generated API code is not what the OpenAPI documents give: run scripts/build/api-models-apps.sh and commit the files" >&2
  exit 1
fi
[ "$check" = 1 ] || echo "generated every schema and the clients of services/planner and services/gateway openapi.json"
