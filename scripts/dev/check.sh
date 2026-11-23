#!/usr/bin/env bash
# The checks CLAUDE.md's "Checks" table names, for one part of the repo or
# for every part a branch changed, run on the owner's Mac the fast way: in
# Docker (the Mac has no node, npm or pytest), each area in its own turn of
# scripts/dev/one-at-a-time.sh, and warm from the first run of any worktree.
#
#   scripts/dev/check.sh <area>...       an area of scripts/areas.yml (the table of areas, their
#                                    paths and checks): web py planner ingest weather
#                                    jobs engine java ios android site arch
#   scripts/dev/check.sh all-changed     the areas `git diff origin/main...` and
#                                    the uncommitted files touch, in parallel
#   scripts/dev/check.sh --areas         reads paths on stdin, prints their areas
#
# What is kept between runs and shared by every worktree (the images,
# the engine's wheel, the caches) is scripts/dev/check-images.sh's.
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

# The check images and the engine's wheel (web_image, py_image, sha).
# shellcheck source=scripts/dev/check-images.sh
. "$here/scripts/dev/check-images.sh"

# The key of the worktree's own Cargo target volume (see the top).
worktree_hash() { echo "$here" | sha | cut -c1-8; }

# A Python suite (a leg of scripts/ci/python_suite.sh, the table CI's
# test-python reads too) in the image of its requirements: ruff, its import
# contracts, then its tests, as CI runs them.
#
# Each leg has a data/raw volume of its own (wingtip-check-raw-<leg>), since
# all-changed runs the legs side by side and they share nothing else: the
# suites fetch and refresh the FAA files in data/raw (airports.csv, faa_nasr,
# the stores), so one leg could read a file another was replacing, and the
# planner's navlog test once saw altitude 10500 where 4500 was expected while
# the other legs ran beside it (2026-11-20; it passed alone and on a rerun).
# CI is unaffected: each suite is its own job with its own cache. A leg's
# first run copies the old shared volume, if there is one, so it starts warm.
raw_volume() {
  local vol=wingtip-check-raw-$1 old=wingtip-check-raw
  if ! docker volume inspect "$vol" >/dev/null 2>&1; then
    docker volume create "$vol" >/dev/null
    if docker volume inspect "$old" >/dev/null 2>&1; then
      docker run --rm -v "$old:/from:ro" -v "$vol:/to" busybox cp -a /from/. /to/ >/dev/null 2>&1 || true
    fi
  fi
  echo "$vol"
}

run_py() {
  local leg=$1 dir dev tag raw
  read -r dir dev < <("$here/scripts/ci/python_suite.sh" --where "$leg")
  [ -n "$dev" ] || { dir=services/planner dev=requirements-dev-wingtip.txt; }
  tag=$(py_image "$dir" "$dev")
  raw=$(raw_volume "$leg")
  docker run --rm -v "$here:/repo" -v "$raw:/repo/data/raw" -e PYTEST_ADDOPTS="-p no:cacheprovider" \
    -w /repo "$tag" scripts/ci/python_suite.sh --local "$leg"
}

# The newest iPhone this Xcode has, by its id (scripts/dev/newest_simulator.py).
newest_iphone() {
  xcrun simctl list devices available -j | python3 "$here/scripts/dev/newest_simulator.py" iPhone
}

run_area() {
  local tag
  case "$1" in
    web)
      tag=$(web_image)
      # A worktree's own node_modules (macOS binaries, or an older lock's)
      # would come first in Node's walk up: hidden behind one of the
      # container's own, a copy of the image's /node_modules, where knip
      # looks for the packages package.json names (it reads no further up).
      # A copy, not links, so the packages sit inside the app as they do on
      # CI (npm ci): Vite serves no file outside it, and a test importing a
      # package's file by URL (makeMap's Inter, `?url`) failed here only
      # ("Denied ID /node_modules/...", firstDraw.test, 2026-11-20).
      docker run --rm -v "$here:/repo" --tmpfs /repo/apps/web/node_modules:exec -w /repo/apps/web "$tag" \
        sh -c 'cp -a /node_modules/. node_modules/ && npm run -s types && npx tsc --noEmit && npx eslint . --max-warnings 0 && npm run -s format:check && npx knip --no-progress && npm run -s layers && npx vitest run'
      ;;
    py) run_py wingtip ;;
    planner) run_py planner ;;
    ingest) run_py ingest ;;
    weather) run_py weather ;;
    jobs) run_py jobs ;;
    engine)
      # The crates' layering, as engine/README.md's table gives it (seconds).
      python3 "$here/scripts/ci/engine_layers.py"
      # The committed WebAssembly within its budget (seconds), as the guards'.
      python3 "$here/scripts/ci/wasm_size.py"
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
      # adb's server with no mDNS bridge: on macOS 27.2 with platform-tools
      # 37.0.1 it panics there every few seconds and drops the emulator
      # (simulators.sh); a server Gradle starts reads this too.
      export ADB_MDNS=0
      "$here/engine/bindings/ffi/build-android.sh"
      (cd "$here/apps/android" && ./gradlew --quiet testDebugUnitTest lintDebug assembleDebug)
      ;;
    site)
      # The website: built, then its pages, links and hosts checked (seconds).
      python3 "$here/apps/site/build.py"
      python3 "$here/apps/site/check.py"
      ;;
    sim)
      # The test flight's feed and report linted and tested
      # (scripts/ci/sim_suite.sh, which CI runs too), then its runner
      # (shellcheck). The MSFS agent and its trial left with the Studio
      # (the feature review, 2026-11-21).
      "$here/scripts/ci/sim_suite.sh"
      docker run --rm -v "$here:/mnt" -w /mnt koalaman/shellcheck:stable scripts/dev/sim-flight.sh
      ;;
    # The X-Plane trial's plugin (tools/xplane-driver): its plain parts,
    # and the player against a stub of XPPython3 (seconds).
    xplane) run_py xplane ;;
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
