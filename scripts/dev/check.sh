#!/usr/bin/env bash
# The checks CLAUDE.md's "Checks" table names, for one part of the repo or
# for every part a branch changed, run on the owner's Mac the fast way: in
# Docker (the Mac has no node, npm or pytest), each area in its own turn of
# scripts/dev/one-at-a-time.sh, and warm from the first run of any worktree.
#
#   scripts/dev/check.sh <area>...       an area of scripts/areas.yml (the table of areas, their
#                                    paths and checks): web py planner ingest weather
#                                    jobs engine java ios android site sim xplane arch
#   scripts/dev/check.sh all-changed     the areas `git diff origin/main...` and
#                                    the uncommitted files touch, in parallel
#   scripts/dev/check.sh --areas         reads paths on stdin, prints their areas
#
# Every agent's worktree used to start cold: npm ci in a fresh node
# container, the engine compiled from nothing, pip into a fresh container,
# Maven's downloads again. What is kept between runs, and shared by every
# worktree:
# - wingtip-check-web:<hash>: node (.tool-versions') with web's node_modules for this
#   package-lock, installed at /node_modules, which Node, TypeScript and
#   ESLint all find by walking up from /repo/apps/web. Built when the lock
#   changes; npm's downloads in BuildKit's cache (id wingtip-npm).
# - wingtip-check-py-<requirements-dev file>:<hash>: python with that file's
#   requirements and the wingtip_native wheel for this engine/ (CI's `ci`
#   profile), the wheel from the shared engine store (below). Built when
#   either changes; uv's downloads in BuildKit's cache.
# - The engine store and sccache (scripts/build/shared-cache.sh,
#   docs/LOCAL-DEV.md "Shared build caches"): each engine build for an app
#   kept once per engine hash in ~/Library/Caches/wingtip/engine, and Rust's
#   compiles in sccache, in Docker one cache volume per turn of
#   one-at-a-time.sh (wingtip-sccache-turn-<n>), since it allows one server.
# - Volumes: wingtip-cargo-registry and wingtip-cargo-git (Cargo's
#   downloads), wingtip-cargo-target-tests-<rust>-<arch>-<hash of the worktree's path>
#   (the engine tests' build, one per worktree; tidy-build-caches.sh removes
#   those of worktrees that are gone), wingtip-cargo-tools (cargo-machete),
#   wingtip-check-raw (the FAA files the Python tests fetch into
#   data/raw, as CI's cache keeps them), fp-m2 (Maven's repository).
# Every worktree is mounted at /w in the engine's container, so sccache
# shares the engine's own crates between worktrees by their content; the
# target stays the worktree's own, since Cargo's freshness is by mtime.
# CHECK_NO_CACHE=1 builds the images again without BuildKit's layer cache
# (its cache mounts stay), for an image whose key missed a change.
# Each image keeps its newest tag alone; `docker volume rm` any of the
# volumes at any time costs one cold run.
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$HOME/.local/bin:$HOME/.cargo/bin

# Each toolchain at .tool-versions' version, the one the images and CI run.
tool() { "$here/scripts/build/toolchain.sh" get "$1"; }
RUST=$(tool rust) PYTHON=$(tool python) JAVA=$(tool java) MAVEN=$(tool maven) NODE=$(tool nodejs)
RUST_IMAGE=rust:$RUST-slim-$(tool debian)
# CI's (scripts/ci/guards.sh).
CARGO_MACHETE=0.9.2
# The engine store and sccache every worktree shares (sccache_docker_args).
# shellcheck source=scripts/build/shared-cache.sh
. "$here/scripts/build/shared-cache.sh"

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

# Keeps an image's newest tag alone. It kept three, so a lock that changed
# back and forth between branches stayed warm; but with an agent's worktree
# per branch, each lock a few hundred MB to a few GB, the old tags filled
# the disk faster than they saved time (2026-11-10), and a rebuild from
# BuildKit's cache mounts (npm's, uv's, Cargo's downloads) takes a minute
# or two. A tag a running check still uses is left: `docker image rm`
# without -f refuses an image a container holds.
prune_tags() {
  docker image ls "$1" --format '{{.CreatedAt}}|{{.Repository}}:{{.Tag}}' \
    | sort -r | tail -n +2 | cut -d'|' -f2 | xargs -r docker image rm >/dev/null 2>&1 || true
}

web_image() {
  local node tag ctx
  node=$NODE
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

# The engine's wheel (wingtip_native, CI's `ci` profile) for Docker's
# machine, into <dest>: from the shared engine store when any worktree has
# built this engine, else built and put there (scripts/build/shared-cache.sh).
# Built at one path, /engine, through sccache in a BuildKit cache that one
# build holds at a time (sharing=locked: sccache's disk cache wants a single
# server), so a changed file recompiles its crate and those above it; the
# target is the build's own and goes with it.
engine_wheel() {
  local dest=$1 kind ctx wrapper=""
  kind=py-wheel-linux-$(docker version -f '{{.Server.Arch}}')
  engine_store_restore "$kind" "$dest" scripts/dev/check.sh && return 0
  ctx=$(mktemp -d)
  (cd "$here" && git ls-files -z -co --exclude-standard -- engine | xargs -0 tar cf - 2>/dev/null) | tar xf - -C "$ctx"
  mkdir -p "$ctx/bin"
  if shared_cache_on && cp "$(sccache_bin "$(sccache_linux_triple)")" "$ctx/bin/sccache" 2>/dev/null; then
    wrapper=/bin-sccache/sccache
  fi
  cat > "$ctx/Dockerfile" <<WHEEL
FROM python:$PYTHON-slim AS native
COPY --from=$RUST_IMAGE /usr/local/cargo /usr/local/cargo
COPY --from=$RUST_IMAGE /usr/local/rustup /usr/local/rustup
ENV PATH=/usr/local/cargo/bin:\$PATH CARGO_HOME=/usr/local/cargo RUSTUP_HOME=/usr/local/rustup
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \\
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \\
    rm -f /etc/apt/apt.conf.d/docker-clean \\
    && apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev
RUN --mount=type=cache,id=wingtip-uv,target=/root/.cache/uv pip install -q uv && uv pip install --system -q maturin==1.16.0
COPY bin /bin-sccache
COPY engine /engine
RUN --mount=type=cache,id=wingtip-cargo-registry,target=/usr/local/cargo/registry \\
    --mount=type=cache,id=wingtip-sccache-buildkit,target=/sccache,sharing=locked \\
    export SCCACHE_DIR=/sccache SCCACHE_CACHE_SIZE=$SCCACHE_CACHE_SIZE CARGO_INCREMENTAL=0 RUSTC_WRAPPER=$wrapper \\
    && CARGO_TARGET_DIR=/tmp/target maturin build --profile ci --compatibility linux -m /engine/bindings/py/Cargo.toml -o /wheels \\
    && { [ -z "$wrapper" ] || $wrapper --stop-server >/dev/null; }

FROM scratch
COPY --from=native /wheels /
WHEEL
  echo "check: building the engine's wheel (engine/ changed)" >&2
  rm -rf "$dest" && docker build -q -o "type=local,dest=$dest" "$ctx" >/dev/null
  rm -rf "$ctx"
  engine_store_publish "$kind" "$dest" scripts/dev/check.sh
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
  engine_wheel "$ctx/wheels"
  cat > "$ctx/Dockerfile" <<EOF
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
    --mount=type=bind,source=wheels,target=/wheels \\
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

# The key of the worktree's own Cargo target volume (see the top).
worktree_hash() { echo "$here" | sha | cut -c1-8; }

run_py() {
  local dir=$1 dev=$2 py=$3 lint=$4 tests=$5 extra=${6:-} tag
  tag=$(py_image "$dir" "$dev" "$py" "$extra")
  docker run --rm -v "$here:/repo" -v wingtip-check-raw:/repo/data/raw -w "/repo/$dir" "$tag" \
    sh -c "ruff check $lint $tests && { [ ! -f .importlinter ] || PYTHONPATH=../planner lint-imports; } && pytest $tests/ -q -p no:cacheprovider"
}

# The newest iPhone this Xcode has, by its id (native-ios.yml's pick).
newest_iphone() {
  xcrun simctl list devices available -j | python3 -c '
import json, sys
ds = [d for r, ds in json.load(sys.stdin)["devices"].items() if "iOS" in r for d in ds
      if d["name"].startswith("iPhone") and "Duo" not in d["name"]]
print(sorted(ds, key=lambda d: d["name"])[-1]["udid"] if ds else "")'
}

run_area() {
  local tag
  case "$1" in
    web)
      tag=$(web_image)
      # A worktree's own node_modules (macOS binaries, or an older lock's)
      # would come first in Node's walk up: hidden behind one of the
      # container's own, links to the image's /node_modules, where knip
      # looks for the packages package.json names (it reads no further up).
      docker run --rm -v "$here:/repo" --tmpfs /repo/apps/web/node_modules -w /repo/apps/web "$tag" \
        sh -c 'ln -s /node_modules/* /node_modules/.bin node_modules/ && npm run -s types && npx tsc --noEmit && npx eslint . --max-warnings 0 && npx knip --no-progress && npx vitest run'
      ;;
    py) run_py services/planner requirements-dev-wingtip.txt "$PYTHON" wingtip tests_wingtip ;;
    planner) run_py services/planner requirements-dev.txt "$PYTHON" app tests ;;
    ingest) run_py services/ingest requirements-dev.txt "$PYTHON" ingest tests ;;
    weather) run_py services/weather requirements-dev.txt "$PYTHON" app tests ;;
    jobs) run_py services/jobs requirements-dev-jobs.txt "$PYTHON" "charts crash" "charts/tests crash/tests" ;;
    engine)
      # The crates' layering, as engine/README.md's table gives it (seconds).
      python3 "$here/scripts/ci/engine_layers.py"
      # No dependency a crate names and does not use (cargo-machete, CI's
      # version), installed once into a volume of its own.
      docker run --rm -v "$here:/w" -v wingtip-cargo-registry:/usr/local/cargo/registry \
        -v wingtip-cargo-tools:/tools -w /w/engine "$RUST_IMAGE" sh -c \
        "[ -x /tools/bin/cargo-machete ] || cargo install -q --locked cargo-machete@$CARGO_MACHETE --root /tools; /tools/bin/cargo-machete"
      # Clippy with its warnings denied, then cargo test over every crate CI
      # tests (scripts/ci/engine_affected.py --all, the list ci.yml's
      # test-engine runs on main's push), so the crates tested here are
      # always the ones tested there.
      local cmd
      cmd="cargo test --profile ci --manifest-path engine/Cargo.toml $(python3 "$here/scripts/ci/engine_affected.py" --all)"
      # Every worktree at one path, /w, so sccache (Cargo's RUSTC_WRAPPER,
      # with this turn's cache, scripts/build/shared-cache.sh) finds a crate
      # another worktree built from the same files: its key is the files'
      # content and the compile's directory. The target stays the
      # worktree's own, a volume labelled with its path
      # (tidy-build-caches.sh removes it with the worktree): Cargo judges a
      # crate fresh by mtime, and a target shared with another worktree
      # served its older build of a crate for this one's (2026-11-08); the
      # cache sccache keeps is by content, so it cannot. Clippy runs
      # without it: a check's metadata is not what sccache keeps.
      local tvol cache_args=() arg
      tvol=wingtip-cargo-target-tests-$RUST-$(docker version -f '{{.Server.Arch}}')-$(worktree_hash)
      docker volume inspect "$tvol" >/dev/null 2>&1 || docker volume create --label "wingtip.worktree=$here" "$tvol" >/dev/null
      while IFS= read -r arg; do [ -n "$arg" ] && cache_args+=("$arg"); done < <(sccache_docker_args)
      docker run --rm -v "$here:/w" \
        -v wingtip-cargo-registry:/usr/local/cargo/registry -v wingtip-cargo-git:/usr/local/cargo/git \
        -v "$tvol":/target "${cache_args[@]+"${cache_args[@]}"}" \
        -e CARGO_TARGET_DIR=/target -w /w "$RUST_IMAGE" sh -c \
        "rustup component add clippy 2>/dev/null && RUSTC_WRAPPER= cargo clippy -q --manifest-path engine/Cargo.toml --workspace --all-targets -- -D warnings && $cmd"
      ;;
    java)
      # The whole repository, not the gateway alone: the pom reads the
      # planner's ../planner/openapi.json, and the tests read the shared
      # fixtures in apps/web/src/lib/fixtures.
      docker run --rm -v "$here":/repo -v /repo/services/gateway/target -v fp-m2:/root/.m2 \
        -v /var/run/docker.sock:/var/run/docker.sock -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
        -w /repo/services/gateway "maven:$MAVEN-eclipse-temurin-$JAVA" mvn -B -q test
      ;;
    ios)
      local sim
      # .tool-versions' Xcode, as CI's (scripts/ci/select-xcode.sh).
      DEVELOPER_DIR=$("$here/scripts/ci/select-xcode.sh") && export DEVELOPER_DIR
      # The engine from the shared store when this engine was built before
      # (scripts/build/shared-cache.sh).
      "$here/engine/bindings/ffi/build-xcframework.sh"
      xcodegen generate --spec "$here/apps/ios/project.yml" --project "$here/apps/ios" --quiet
      sim=$(newest_iphone)
      [ -n "$sim" ] || { echo "check: no iPhone simulator in this Xcode" >&2; return 1; }
      # The turn's DerivedData and Xcode's compilation cache, shared with
      # every worktree (scripts/dev/xcodebuild.sh). Signed ad hoc, as
      # native-ios.yml signs it: an unsigned app has no keychain on the
      # simulator, so the session's Keychain tests could not pass.
      "$here/scripts/dev/xcodebuild.sh" -quiet -project "$here/apps/ios/Wingtip.xcodeproj" -scheme Wingtip -configuration Debug \
        -destination "platform=iOS Simulator,id=$sim" CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= test
      ;;
    android)
      local sdk=$HOME/Library/Android/sdk
      # .tool-versions' Java, the build's (gradle-daemon-jvm.properties): one
      # installed, else the Temurin Gradle fetched into ~/.gradle/jdks.
      export JAVA_HOME=${JAVA_HOME:-$(for d in /Library/Java/JavaVirtualMachines/*"$JAVA"*/Contents/Home "$HOME"/Library/Java/JavaVirtualMachines/*"$JAVA"*/Contents/Home "$HOME"/.gradle/jdks/*"$JAVA"*/*/Contents/Home; do [ -d "$d" ] && echo "$d"; done | sort | tail -1)}
      export ANDROID_HOME=${ANDROID_HOME:-$sdk}
      # The NDK .tool-versions names (android-ndk), the app's ndkVersion:
      # build-android.sh looks in the SDK for it whatever this says.
      ANDROID_NDK_HOME=$ANDROID_HOME/ndk/$(tool android-ndk)
      export ANDROID_NDK_HOME
      "$here/engine/bindings/ffi/build-android.sh"
      (cd "$here/apps/android" && ./gradlew --quiet testDebugUnitTest lintDebug assembleDebug)
      ;;
    site)
      # The website: built, then its pages, links and hosts checked (seconds).
      python3 "$here/apps/site/build.py"
      python3 "$here/apps/site/check.py"
      ;;
    sim)
      # The MSFS replay agent: built (without the SDK's SimConnect, which
      # only the trial's instance has), its format checked and its tests
      # run (scripts/ci/sim_suite.sh, which CI runs too); then the
      # trial's template (cfn-lint) and scripts (shellcheck).
      "$here/scripts/ci/sim_suite.sh"
      docker run --rm -v "$here/infra/sim-trial:/data" -w /data "python:$PYTHON-slim" \
        sh -c 'pip install -q --root-user-action=ignore cfn-lint && cfn-lint template.yaml'
      docker run --rm -v "$here:/mnt" -w /mnt koalaman/shellcheck:stable infra/sim-trial/trial.sh tools/msfs-agent/prepare-track.sh
      ;;
    xplane)
      # The X-Plane trial's plugin (tools/xplane-driver): its plain parts,
      # and the player against a stub of XPPython3 (seconds). The planner's
      # wingtip image has the ruff and pytest it needs.
      tag=$(py_image services/planner requirements-dev-wingtip.txt "$PYTHON" "")
      docker run --rm -v "$here:/repo" -w /repo/tools/xplane-driver "$tag" \
        sh -c 'ruff check . && pytest tests -q -p no:cacheprovider'
      ;;
    arch)
      # No new or grown source file over 400 lines (seconds); the allow-list
      # compared with main's where this clone has it.
      local base=()
      git -C "$here" rev-parse -q --verify origin/main >/dev/null && base=(--base origin/main)
      python3 "$here/scripts/ci/file_sizes.py" "${base[@]+"${base[@]}"}"
      # Every version the repo states is .tool-versions' (seconds).
      "$here/scripts/build/toolchain.sh" --check
      # No raw colour, type size, padding or corner outside the design
      # tokens, past the allow-list (seconds).
      python3 "$here/scripts/ci/brand_guard.py"
      # No card head, section title or close drawn by hand where a shared
      # component draws it, past the allow-list (seconds).
      python3 "$here/scripts/ci/shared_parts_guard.py"
      # No unused Python (vulture, with its list of what it cannot see used).
      "$here/scripts/ci/dead_python.sh"
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
