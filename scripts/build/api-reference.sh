#!/usr/bin/env bash
# The API reference: each service's committed openapi.json rendered by Redoc
# into one static HTML page, <out>/planner.html and gateway.html
# and an index.html linking them. The documents are the source of truth
# (FastAPI and springdoc write them from the code, and a test holds each to
# its code), so the endpoint lists in the READMEs are this, not prose.
#
#   scripts/build/api-reference.sh [out-dir]     default: build/api-reference
#
# Run in Docker (node, as the Mac has none; the version is .tool-versions')
# with Redocly CLI pinned below. CI runs it and uploads the result as the
# `api-reference` artifact (ci.yml, the docs job, which Docker is on the
# runner for); the HTML is not committed:
# GitHub shows it as source, a rebuild's bytes change with Redoc's bundle, and
# the .json it is made from is already readable in the repository.
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin
REDOCLY=@redocly/cli@2.2.0
out=${1:-$here/build/api-reference}
mkdir -p "$out"
out=$(cd "$out" && pwd)
node=$("$here/scripts/build/toolchain.sh" get nodejs)

# The service's document, the title the page carries.
services="planner:services/planner/openapi.json gateway:services/gateway/openapi.json"

render='set -e; cd /repo
for s in $SERVICES; do
  name=${s%%:*}; doc=${s#*:}
  npx --yes '"$REDOCLY"' build-docs "$doc" --output "/out/$name.html" --title "Wingtip $name API"
done'

if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  docker run --rm -e SERVICES="$services" -e npm_config_cache=/tmp/npm \
    -v "$here:/repo:ro" -v "$out:/out" "node:${node}-slim" sh -c "$render"
else
  # CI's runners have node.
  (cd "$here" && for s in $services; do
    npx --yes "$REDOCLY" build-docs "${s#*:}" --output "$out/${s%%:*}.html" --title "Wingtip ${s%%:*} API"
  done)
fi

{
  echo '<!doctype html><meta charset="utf-8"><title>Wingtip Maps API reference</title>'
  echo '<h1>Wingtip Maps API reference</h1><ul>'
  for s in $services; do
    echo "<li><a href=\"${s%%:*}.html\">${s%%:*}</a> (from <code>${s#*:}</code>)</li>"
  done
  echo '</ul>'
} > "$out/index.html"
echo "api-reference: $(ls "$out" | tr '\n' ' ')in $out"
