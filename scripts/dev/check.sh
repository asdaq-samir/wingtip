#!/usr/bin/env bash
# The checks CLAUDE.md's "Checks" table names, for one part of the repo or
# for every part a branch changed, run on the owner's Mac the fast way: in
# Docker (the Mac has no node, npm or pytest), each area in its own turn of
# scripts/dev/one-at-a-time.sh, and warm from the first run of any worktree.
#
#   scripts/dev/check.sh <area>...       an area of scripts/areas.yml (the table of areas, their
#                                    paths and checks): web py planner ingest assistant
#                                    weather jobs engine java ios android
#   scripts/dev/check.sh all-changed     the areas `git diff origin/main...` and
#                                    the uncommitted files touch, in parallel
#   scripts/dev/check.sh --areas         reads paths on stdin, prints their areas
#
# Every agent's worktree used to start cold: npm ci in a fresh node
# container, the engine compiled from nothing, pip into a fresh container,
# Maven's downloads again. What is kept between runs, and shared by every
# worktree:
# - wingtip-check-web:<hash>: node (apps/web/.nvmrc) with web's node_modules for this
#   package-lock, installed at /node_modules, which Node, TypeScript and
#   ESLint all find by walking up from /repo/apps/web. Built when the lock
#   changes; npm's downloads in BuildKit's cache (id wingtip-npm).
# - wingtip-check-py-<requirements-dev file>:<hash>: python with that file's
#   requirements and the wingtip_native wheel built from this engine/
#   (CI's `ci` profile). Built when either changes; uv's downloads and the
#   wheel's Rust in BuildKit's caches.
# - Volumes: wingtip-cargo-registry and wingtip-cargo-git (Cargo's
#   downloads), wingtip-cargo-target-tests-<rust>-<arch>-<hash of the worktree's path>
#   (the engine tests' build, one per worktree; tidy-local.sh removes those
#   of worktrees that are gone), wingtip-check-raw (the FAA files the Python tests fetch into
#   data/raw, as CI's cache keeps them), fp-m2 (Maven's repository).
# The test build is never scripts/build/build-engine-wasm.sh's: that one stays a
# clean, reproducible build in its pinned image. Each worktree is mounted at
# its own path in the engine's container, so Cargo keys its own crates by
# worktree (another worktree's older files can never pass for built) and
# shares only the third-party ones.
# CHECK_NO_CACHE=1 builds the images again without BuildKit's layer cache
# (its cache mounts stay), for an image whose key missed a change.
# Each image keeps its newest three tags; `docker volume rm` any of the
# volumes at any time costs one cold run.
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$HOME/.local/bin:$HOME/.cargo/bin

RUST_IMAGE=rust:1.89-slim-bookworm

# The areas and the paths that belong to each are scripts/areas.yml's, the
# one table the pre-push hook and CI's changes filter read too.
AREAS=$(python3 "$here/scripts/areas.py" names | tr '\n' ' ')
# The areas a list of changed paths touches, one per line in AREAS' order.
areas_for() { python3 "$here/scripts/areas.py" areas; }

changed_paths() {
  git -C "$here" fetch -q origin main 2>/dev/null || true
  {
    git -C "$here" diff --name-only origin/main...HEAD
    git -C "$here" diff --name-only HEAD
    git -C "$here" ls-files -o --exclude-standard
  } | sort -u
}

sha() { shasum -a 256 | cut -c1-16; }

# Keeps an image's newest three tags, so a lock that changes back and forth
# between branches is still warm, and the disk is not filled with old ones.
prune_tags() {
  docker image ls "$1" --format '{{.CreatedAt}}|{{.Repository}}:{{.Tag}}' \
    | sort -r | tail -n +4 | cut -d'|' -f2 | xargs -r docker image rm >/dev/null 2>&1 || true
}

web_image() {
  local node tag ctx
  node=$(tr -d ' \n' < "$here/apps/web/.nvmrc")
  tag=wingtip-check-web:$({ echo "node $node"; cat "$here/apps/web/package.json" "$here/apps/web/package-lock.json"; } | sha)
  if [ -n "${CHECK_NO_CACHE:-}" ] || ! docker image inspect "$tag" >/dev/null 2>&1; then
    ctx=$(mktemp -d)
    cp "$here/apps/web/package.json" "$here/apps/web/package-lock.json" "$ctx/"
    echo "check: building $tag (web's packages changed)" >&2
    docker build -q ${CHECK_NO_CACHE:+--no-cache} -t "$tag" --build-arg NODE="$node" -f - "$ctx" >/dev/null <<'EOF'
ARG NODE
FROM node:${NODE}-slim
COPY package.json package-lock.json /
RUN --mount=type=cache,id=wingtip-npm,target=/root/.npm \
    cd / && npm ci --no-audit --no-fund --loglevel=error
ENV PATH=/node_modules/.bin:$PATH
EOF
    rm -rf "$ctx"
    prune_tags wingtip-check-web
  fi
  echo "$tag"
}

# A requirements file and every file it names with -r or -c, from the repo
# root, each once.
requirements_of() {
  local file=$1 dir line
  echo "$file"
  dir=$(dirname "$file")
  sed -nE 's/^-[rc][[:space:]]*([^[:space:]#]+).*/\1/p' "$here/$file" | while read -r line; do
    requirements_of "$(cd "$here/$dir" && python3 -c 'import os,sys; print(os.path.relpath(os.path.abspath(sys.argv[1]), sys.argv[2]))' "$line" "$here")"
  done
}

# python for that directory with one of its requirements-dev files and the
# native wheel.
py_image() {
  local dir=$1 dev=$2 py=$3 extra=$4 name tag ctx req
  name=wingtip-check-py-$(basename "$dev" .txt)
  # Another service's suite keeps an image name of its own, so its tags
  # never prune the planner's.
  [ "$dir" = services/planner ] || name=wingtip-check-py-$(basename "$dir")-$(basename "$dev" .txt)
  ctx=$(mktemp -d)
  mkdir -p "$ctx/reqs"
  for req in $(requirements_of "$dir/$dev" | sort -u); do
    mkdir -p "$ctx/reqs/$(dirname "$req")"
    cp "$here/$req" "$ctx/reqs/$req"
  done
  (cd "$here" && git ls-files -z -co --exclude-standard -- engine | xargs -0 tar cf - 2>/dev/null) | tar xf - -C "$ctx"
  cat > "$ctx/Dockerfile" <<EOF
# The wheel's stage: the same for every directory, so BuildKit builds it once.
FROM python:3.14-slim AS native
COPY --from=$RUST_IMAGE /usr/local/cargo /usr/local/cargo
COPY --from=$RUST_IMAGE /usr/local/rustup /usr/local/rustup
ENV PATH=/usr/local/cargo/bin:\$PATH CARGO_HOME=/usr/local/cargo RUSTUP_HOME=/usr/local/rustup
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \\
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \\
    rm -f /etc/apt/apt.conf.d/docker-clean \\
    && apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev
RUN --mount=type=cache,id=wingtip-uv,target=/root/.cache/uv pip install -q uv && uv pip install --system -q maturin==1.9.4
COPY engine /engine
# The target is this worktree's own (the id carries its path's hash): Cargo
# fingerprints by mtime, so a target shared with another worktree took its
# older build of a crate for this one's and served stale code (2026-11-08).
RUN --mount=type=cache,id=wingtip-cargo-registry,target=/usr/local/cargo/registry \\
    --mount=type=cache,id=wingtip-check-wheel-target-$(worktree_hash),target=/target,sharing=locked \\
    CARGO_TARGET_DIR=/target maturin build --profile ci --compatibility linux -m /engine/bindings/py/Cargo.toml -o /wheels

FROM python:$py-slim
ENV PYTHONDONTWRITEBYTECODE=1
# rasterio's wheel links libexpat, which GitHub's runner has and slim lacks.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \\
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \\
    rm -f /etc/apt/apt.conf.d/docker-clean \\
    && apt-get update && apt-get install -y --no-install-recommends libexpat1
RUN --mount=type=cache,id=wingtip-uv,target=/root/.cache/uv pip install -q uv
COPY reqs /reqs
RUN --mount=type=cache,id=wingtip-uv,target=/root/.cache/uv \\
    ${extra:+uv pip install --system -q $extra &&} uv pip install --system -q -r /reqs/$dir/$dev
RUN --mount=type=cache,id=wingtip-uv,target=/root/.cache/uv \\
    --mount=type=bind,from=native,source=/wheels,target=/wheels \\
    uv pip install --system -q /wheels/*.whl
EOF
  tag=$name:$( (cd "$ctx" && find . -type f | LC_ALL=C sort | xargs shasum -a 256) | sha)
  if [ -n "${CHECK_NO_CACHE:-}" ] || ! docker image inspect "$tag" >/dev/null 2>&1; then
    echo "check: building $tag ($dir's requirements or engine/ changed${CHECK_NO_CACHE:+, or CHECK_NO_CACHE})" >&2
    docker build -q ${CHECK_NO_CACHE:+--no-cache} -t "$tag" "$ctx" >/dev/null
    prune_tags "$name"
  fi
  rm -rf "$ctx"
  echo "$tag"
}

# The worktree's own path in the engine's container (see the top).
worktree_hash() { echo "$here" | sha | cut -c1-8; }
worktree_key() { echo "$(basename "$here")-$(echo "$here" | sha | cut -c1-8)"; }

run_py() {
  local dir=$1 dev=$2 py=$3 lint=$4 tests=$5 extra=${6:-} tag
  tag=$(py_image "$dir" "$dev" "$py" "$extra")
  docker run --rm -v "$here:/repo" -v wingtip-check-raw:/repo/data/raw -w "/repo/$dir" "$tag" \
    sh -c "ruff check $lint $tests && { [ ! -f .importlinter ] || lint-imports; } && pytest $tests/ -q -p no:cacheprovider"
}

# The newest iPhone this Xcode has, by its id (native-ios.yml's pick).
newest_iphone() {
  xcrun simctl list devices available -j | python3 -c '
import json, sys
ds = [d for r, ds in json.load(sys.stdin)["devices"].items() if "iOS" in r for d in ds
      if d["name"].startswith("iPhone") and "Duo" not in d["name"]]
print(sorted(ds, key=lambda d: d["name"])[-1]["udid"] if ds else "")'
}

# The engine built for a phone, kept by the engine's files under
# ~/Library/Caches/wingtip-checks, as CI's caches keep it: a worktree with
# the same engine copies it instead of compiling three targets again.
phone_engine() {
  local kind=$1 out=$2 script=$3 key cache
  key=$(cd "$here" && git ls-files -z -co --exclude-standard -- engine/facade engine/crates engine/bindings/ffi 'engine/Cargo.*' \
    | xargs -0 shasum -a 256 | sha)
  cache=$HOME/Library/Caches/wingtip-checks/engine-$kind-$key
  if [ ! -d "$cache" ]; then
    "$here/$script"
    mkdir -p "$(dirname "$cache")"
    rm -rf "$cache.tmp" && cp -R "$here/$out" "$cache.tmp" && mv "$cache.tmp" "$cache"
  fi
  rm -rf "${here:?}/$out" && mkdir -p "$(dirname "$here/$out")" && cp -R "$cache" "$here/$out"
}

run_area() {
  local tag key
  case "$1" in
    web)
      tag=$(web_image)
      # A worktree's own node_modules (macOS binaries, or an older lock's)
      # would come first in Node's walk up: hidden behind an empty one.
      local hide=()
      [ -d "$here/apps/web/node_modules" ] && hide=(--tmpfs /repo/apps/web/node_modules)
      docker run --rm -v "$here:/repo" "${hide[@]+"${hide[@]}"}" -w /repo/apps/web "$tag" \
        sh -c 'npm run -s types && npx tsc --noEmit && npx eslint . && npx vitest run'
      ;;
    py) run_py services/planner requirements-dev-wingtip.txt 3.14 wingtip tests_wingtip ;;
    planner) run_py services/planner requirements-dev.txt 3.14 app tests ;;
    ingest) run_py services/ingest requirements-dev.txt 3.14 ingest tests ;;
    assistant) run_py services/assistant requirements-dev.txt 3.14 app tests ;;
    weather) run_py services/weather requirements-dev.txt 3.14 app tests ;;
    jobs) run_py services/jobs requirements-dev-jobs.txt 3.14 charts charts/tests ;;
    engine)
      # The crates' layering, as engine/README.md's table gives it (seconds).
      python3 "$here/scripts/ci/engine_layers.py"
      # CI's own cargo test line (ci.yml's test job), so the crates tested
      # here are always the ones tested there.
      local cmd
      cmd=$(grep -oE 'cargo test --profile ci [^#]*' "$here/.github/workflows/ci.yml" | head -1)
      key=$(worktree_key)
      # The target is a volume of this worktree's own, labelled with its path
      # so tidy-local.sh can remove it when the worktree is gone.
      local tvol=wingtip-cargo-target-tests-1.89-$(docker version -f '{{.Server.Arch}}')-$(worktree_hash)
      docker volume inspect "$tvol" >/dev/null 2>&1 || docker volume create --label "wingtip.worktree=$here" "$tvol" >/dev/null
      docker run --rm -v "$here:/w/$key" \
        -v wingtip-cargo-registry:/usr/local/cargo/registry -v wingtip-cargo-git:/usr/local/cargo/git \
        -v "$tvol":/target \
        -e CARGO_TARGET_DIR=/target -w "/w/$key" "$RUST_IMAGE" sh -c "$cmd"
      ;;
    java)
      # services/, not the gateway alone: the pom generates the assistant's
      # answers from ../assistant/openapi.json.
      docker run --rm -v "$here/services":/services -v /services/gateway/target -v fp-m2:/root/.m2 \
        -v /var/run/docker.sock:/var/run/docker.sock -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
        -w /services/gateway maven:3.9-eclipse-temurin-25 mvn -B -q test
      ;;
    ios)
      local sim
      phone_engine ios apps/ios/Frameworks/WingtipEngine.xcframework engine/bindings/ffi/build-xcframework.sh
      xcodegen generate --spec "$here/apps/ios/project.yml" --project "$here/apps/ios" --quiet
      sim=$(newest_iphone)
      [ -n "$sim" ] || { echo "check: no iPhone simulator in this Xcode" >&2; return 1; }
      xcodebuild -quiet -project "$here/apps/ios/Wingtip.xcodeproj" -scheme Wingtip -configuration Debug \
        -destination "platform=iOS Simulator,id=$sim" \
        -derivedDataPath "$HOME/Library/Developer/Xcode/DerivedData/wingtip-check-$(worktree_key)" \
        CODE_SIGNING_ALLOWED=NO test
      ;;
    android)
      local sdk=$HOME/Library/Android/sdk
      export JAVA_HOME=${JAVA_HOME:-$(ls -d "$HOME"/Library/Java/JavaVirtualMachines/jbr-21*/Contents/Home | tail -1)}
      export ANDROID_HOME=${ANDROID_HOME:-$sdk}
      export ANDROID_NDK_HOME=${ANDROID_NDK_HOME:-$(ls -d "$ANDROID_HOME"/ndk/* | sort -V | tail -1)}
      phone_engine android apps/android/app/engine engine/bindings/ffi/build-android.sh
      (cd "$here/apps/android" && ./gradlew --quiet testDebugUnitTest lintDebug assembleDebug)
      ;;
    *) echo "check: no area '$1' (one of: $AREAS, all-changed)" >&2; return 64 ;;
  esac
}

# One area in its own turn, timed.
in_turn() {
  local area=$1 start status=0
  start=$(date +%s)
  "$here/scripts/dev/one-at-a-time.sh" "check $area ($(basename "$here"))" "$0" --run "$area" || status=$?
  echo "check: $area exit $status, $(( $(date +%s) - start ))s with the wait for a turn" >&2
  return "$status"
}

case "${1:-}" in
  --areas) areas_for; exit 0 ;;
  --run)
    # The time in the turn, apart from the time in line before it. Called
    # plainly, not under `||`, so `set -e` stops an area at its first
    # failing step.
    start=$(date +%s) area=$2
    trap 'echo "check: $area ran in $(( $(date +%s) - start ))s" >&2' EXIT
    run_area "$area"
    exit 0 ;;
  ""|-h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 64 ;;
esac

if [ "$1" = all-changed ]; then
  # shellcheck disable=SC2046
  set -- $(changed_paths | areas_for)
  [ $# -gt 0 ] || { echo "check: nothing changed that a check covers"; exit 0; }
  echo "check: $*" >&2
  # In parallel, each in its own turn; each one's output kept apart and
  # shown when it ends, so two logs never interleave.
  logs=$(mktemp -d)
  pids=()
  for area in "$@"; do
    ( in_turn "$area" > "$logs/$area.log" 2>&1 ) &
    pids+=($!)
  done
  failed=()
  i=0
  for area in "$@"; do
    if wait "${pids[$i]}"; then :; else failed+=("$area"); fi
    echo "===== $area" && cat "$logs/$area.log"
    i=$((i + 1))
  done
  rm -rf "$logs"
  [ ${#failed[@]} -eq 0 ] || { echo "check: failed: ${failed[*]}" >&2; exit 1; }
  exit 0
fi

status=0
for area in "$@"; do in_turn "$area" || status=1; done
exit "$status"
