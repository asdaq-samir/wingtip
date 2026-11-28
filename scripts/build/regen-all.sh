#!/usr/bin/env bash
# Every generator, in the order each feeds the next: the engine's contract,
# the web's types, the phones' engine calls, the planner's OpenAPI document
# and its MCP connector's calls, the gateway's document, the phones' API
# models, the design tokens, the screens, the shared words, the web's
# engine rules and the WebAssembly. One command after a change, instead of
# remembering which of twelve it needs (CLAUDE.md, "Adding or changing a
# rule" and "An API that changes changes its document").
#
#   scripts/build/regen-all.sh                      write them all
#   scripts/build/regen-all.sh --check              fail, naming each generator whose files are stale
#   scripts/build/regen-all.sh [--check] --base B   only those whose inputs or outputs B..HEAD touched
#   scripts/build/regen-all.sh --check --light      and leave out the heavy ones (cargo, Maven, the
#                                                   planner's Python, the WebAssembly), named as left to CI
#
# --check uses a generator's own --check where it has one. Where it has
# none, it runs it and asks git whether its committed files changed, then
# puts them back; a generator whose files have uncommitted changes is not
# run so (commit or stash first), since putting them back would lose them.
# The web's types (`npm run types`) are not committed: --check leaves them
# out. Node, Maven and the planner's Python run in Docker where the Mac has
# none, each in a turn of scripts/dev/one-at-a-time.sh.
set -uo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
cd "$here" || exit 1
PATH=$PATH:$HOME/.cargo/bin:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin
check="" base="" light=""
while [ $# -gt 0 ]; do
  case $1 in
    --check) check=1 ;;
    --light) light=1 ;;
    --base) base=${2:?--base needs a commit}; shift ;;
    *) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 64 ;;
  esac
  shift
done
turn() { if [ -n "${CI:-}" ]; then shift; "$@"; else scripts/dev/one-at-a-time.sh "$@"; fi; }
A=apps/android/app/src/main/kotlin/app/wingtipmaps/android

# Node in apps/web: the host's, or check.sh's web image (check-images.sh).
in_web() {
  if command -v npx >/dev/null && [ -d apps/web/node_modules ]; then (cd apps/web && sh -c "$1")
  else
    NODE=$(scripts/build/toolchain.sh get nodejs)
    # shellcheck source=scripts/dev/check-images.sh
    . scripts/dev/check-images.sh
    turn "regen-all web ($(basename "$here"))" docker run --rm -v "$here:/repo" --tmpfs /repo/apps/web/node_modules \
      -w /repo/apps/web "$(web_image)" sh -c "ln -s /node_modules/* /node_modules/.bin node_modules/ && $1"
  fi
}
# The planner's Python (FastAPI and its requirements): the host's, or check.sh's newest planner image.
in_planner() {
  if python3 -c 'import fastapi' 2>/dev/null; then (cd services/planner && python3 "$@")
  else
    local image
    # The image of this tree's requirements and engine (check-images.sh's
    # py_image, built where it is missing): an older tag may lack a package
    # the planner now imports (prometheus_client, vitals).
    image=$(
      NODE=$("$here/scripts/build/toolchain.sh" get nodejs) PYTHON=$("$here/scripts/build/toolchain.sh" get python)
      RUST=$("$here/scripts/build/toolchain.sh" get rust)
      RUST_IMAGE=rust:$RUST-slim-$("$here/scripts/build/toolchain.sh" get debian)
      sha() { shasum -a 256 | cut -c1-16; }
      # shellcheck source=scripts/build/shared-cache.sh
      . "$here/scripts/build/shared-cache.sh"
      # shellcheck source=scripts/dev/check-images.sh
      . "$here/scripts/dev/check-images.sh"
      py_image services/planner requirements-dev.txt
    ) || image=""
    [ -n "$image" ] || { echo "no planner image: scripts/dev/check.sh planner builds it"; return 3; }
    turn "regen-all planner ($(basename "$here"))" docker run --rm -v "$here:/repo" -w /repo/services/planner "$image" python "$@"
  fi
}
gateway_openapi() {
  turn "regen-all gateway ($(basename "$here"))" docker run --rm -v "$here:/repo" -v /repo/services/gateway/target -v fp-m2:/root/.m2 \
    -v /var/run/docker.sock:/var/run/docker.sock -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal -e WRITE_OPENAPI=1 \
    -w /repo/services/gateway "maven:$(scripts/build/toolchain.sh get maven)-eclipse-temurin-$(scripts/build/toolchain.sh get java)" \
    mvn -B -q test -Dtest=OpenApiDocumentTest
}

stale=() left=() failed=()
# step <name> <heavy 0|1> <inputs and outputs, a space each> <outputs, "" for none committed> <write> [<own check>]
step() {
  local name=$1 heavy=$2 paths=$3 outputs=$4 write=$5 own=${6:-}
  # shellcheck disable=SC2086 # each a git pathspec
  if [ -n "$base" ] && [ -z "$(git diff --name-only "$base" HEAD -- $paths $outputs)" ]; then return 0; fi
  if [ -n "$check" ] && [ -z "$outputs" ]; then return 0; fi
  if [ -n "$light" ] && [ "$heavy" = 1 ]; then left+=("$name"); return 0; fi
  echo "regen-all: $name"
  if [ -z "$check" ]; then eval "$write" || failed+=("$name"); return 0; fi
  if [ -n "$own" ]; then
    eval "$own"
    case $? in 0) ;; 3) left+=("$name") ;; *) stale+=("$name") ;; esac
    return 0
  fi
  # shellcheck disable=SC2086
  if [ -n "$(git status --porcelain -- $outputs)" ]; then
    echo "regen-all: $name not checked: its files have uncommitted changes ($outputs)"; failed+=("$name"); return 0
  fi
  eval "$write"
  local status=$?
  # shellcheck disable=SC2086 # each a git pathspec
  if [ "$status" = 3 ]; then left+=("$name")
  elif [ "$status" != 0 ]; then failed+=("$name")
  elif [ -n "$(git status --porcelain -- $outputs)" ]; then
    git status --short -- $outputs
    stale+=("$name")
  fi
  # shellcheck disable=SC2086
  git checkout -q -- $outputs 2>/dev/null
  # shellcheck disable=SC2086
  git clean -fdq -- $outputs
}

step "engine contract (cargo run -p wingtip-contract-gen)" 1 "engine/crates engine/contract" engine/contract/engine.schema.json \
  "(cd engine && cargo run -q -p wingtip-contract-gen)" "(cd engine && cargo run -q -p wingtip-contract-gen -- --check)"
step "web types (npm run types)" 0 "services/planner/openapi.json services/gateway/openapi.json engine/contract/engine.schema.json" "" \
  "in_web 'npm run -s types'"
step "phones' engine calls (engine-contract-apps.sh)" 0 "engine/contract/engine.schema.json scripts/build/engine-contract-apps.*" \
  "apps/ios/Wingtip/Engine/Generated $A/engine/generated" "turn 'regen-all engine-contract-apps' scripts/build/engine-contract-apps.sh"
step "planner OpenAPI (python -m app.openapi)" 1 "services/planner/app services/planner/wingtip" services/planner/openapi.json \
  "in_planner -m app.openapi"
step "MCP connector's calls (planner-calls.sh)" 0 "services/planner/openapi.json scripts/build/planner*calls*" services/planner/app/generated \
  scripts/build/planner-calls.sh "scripts/build/planner-calls.sh --check"
step "gateway OpenAPI (WRITE_OPENAPI=1 mvn test)" 1 services/gateway/src/main services/gateway/openapi.json gateway_openapi
step "phones' API models (api-models-apps.sh)" 1 "services/planner/openapi.json services/gateway/openapi.json scripts/build/api-models-apps.* .tool-versions" \
  "apps/ios/Wingtip/API/Generated apps/ios/WingtipAPI $A/api/generated" \
  "turn 'regen-all api-models-apps' scripts/build/api-models-apps.sh" "turn 'regen-all api-models-apps' scripts/build/api-models-apps.sh --check"
step "design tokens (design-tokens.sh)" 0 "design/tokens.json scripts/build/design-tokens.sh scripts/build/design_tokens*" \
  "apps/web/src/styles/tokens.css apps/web/src/lib/tokens.ts apps/ios/Wingtip/Design/Generated $A/design/generated" \
  scripts/build/design-tokens.sh "scripts/build/design-tokens.sh --check"
step "map overlay layers (map-style.sh)" 0 "design/map-style.json design/tokens.json scripts/build/map-style.sh scripts/build/map_style*.py" \
  "apps/web/src/lib/generated/overlayLayers.ts $A/map/generated" \
  scripts/build/map-style.sh "scripts/build/map-style.sh --check"
step "screens (screens.sh)" 0 "design/screens.json scripts/build/screens.*" \
  "docs/navigation.md apps/web/src/lib/navigation/generated apps/ios/Wingtip/Navigation/Generated $A/navigation/generated" \
  scripts/build/screens.sh "scripts/build/screens.sh --check"
# The shared words, where this tree has them (design/wording.json, claude/words-audit).
if [ -x scripts/build/wording.sh ]; then
  step "shared words (wording.sh)" 0 "design/wording.json scripts/build/wording.*" \
    "apps/web/src/lib/wording/generated apps/ios/Wingtip/Design/Generated/Wording.swift apps/android/app/src/main/res/values/wording_strings.xml docs/design/rules.md" \
    scripts/build/wording.sh "scripts/build/wording.sh --check"
fi
step "card actions (card-actions.sh)" 0 "design/card-actions.json design/wording.json scripts/build/card-actions.sh scripts/build/card_actions.py" \
  "apps/web/src/lib/generated/cardActions.ts apps/ios/Wingtip/Design/Generated/CardActions.swift $A/design/generated/CardActions.kt docs/design/icons.md" \
  scripts/build/card-actions.sh "scripts/build/card-actions.sh --check"
step "web's engine rules (web_rules.py)" 0 "apps/web/src scripts/build/web_rules.py" "engine/facade/web-rules.txt apps/web/src/lib/engine/webRules.ts" \
  "python3 scripts/build/web_rules.py" "python3 scripts/build/web_rules.py --check"
step "WebAssembly (build-engine-wasm.sh)" 1 "engine/facade engine/crates engine/bindings/wasm engine/Cargo.lock scripts/build/build-engine-wasm.sh" \
  apps/web/src/lib/engine/wingtip-engine.wasm "turn 'regen-all wasm' scripts/build/build-engine-wasm.sh"

[ ${#left[@]} -eq 0 ] || echo "regen-all: left to CI (heavy, or no tool here): ${left[*]}"
if [ ${#failed[@]} -gt 0 ]; then echo "regen-all: failed to run: ${failed[*]}"; exit 1; fi
if [ ${#stale[@]} -gt 0 ]; then
  echo "regen-all: stale, run scripts/build/regen-all.sh and commit what it writes: ${stale[*]}"
  exit 1
fi
if [ -n "$check" ]; then echo "regen-all: every file checked is current"; else echo "regen-all: done"; fi
