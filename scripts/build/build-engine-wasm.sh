#!/usr/bin/env bash
# Builds the engine's WebAssembly (engine/bindings/wasm, wingtip-wasm) into
# apps/web/src/lib/engine/wingtip-engine.wasm, which is committed: the web
# app's build and CI's web jobs have no Rust. Run it after any change
# under engine/facade, engine/crates or engine/bindings/wasm, and commit the .wasm
# with it; CI's `test` job runs it again and fails where the committed
# file differs.
#
#   scripts/build/build-engine-wasm.sh
#
# In Docker, so the bytes are the same on the owner's Mac and on GitHub's
# runner: the Rust image pinned by digest (.tool-versions' rust, linux/amd64), the
# workspace mounted at the same path, a fresh target directory, and
# Cargo.lock as committed (--locked). The rustc that builds it is the
# only thing that makes the code, and the paths it writes into panic
# messages are /src/... and /usr/local/... either way.
#
# Then Binaryen's wasm-opt -Oz, the stock size pass rustc does not run,
# pinned to one release by its checksum so its output is the same bytes
# wherever it runs: every phone downloads the module before the first
# draw. The features it may use are the ones rustc 1.99 already emits for
# wasm32-unknown-unknown (its defaults since 1.82 and 1.87), so the
# optimised module asks no more of a browser than the unoptimised one.
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
# Docker Desktop's CLI, where a shell's PATH lacks it (an agent's, a
# launchd job's). The Rust is all in the container: no cargo here.
command -v docker >/dev/null || PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin
image=${RUST_IMAGE:-rust:1.100-slim-trixie@sha256:e9d95b74296f7126a83ae3d041aeaba1ff4c478f13abc5cc034fcf7c131c3d4a}
binaryen=version_133
binaryen_sha256=2dc9c7813f5375db93d96ead4b78222fcc3e2677bbb832297af4797782a37489
out=apps/web/src/lib/engine/wingtip-engine.wasm

# Built once per engine on this Mac: a worktree whose engine another has
# built already copies the module from the shared store, and a build's
# crates go through sccache, every worktree's at the same /src path, so
# one changed file recompiles its crate and the crates above it
# (scripts/build/shared-cache.sh, docs/LOCAL-DEV.md). Both are off in CI,
# whose build stays the clean one the committed file is checked against.
# shellcheck source=scripts/build/shared-cache.sh
. "$here/scripts/build/shared-cache.sh"
if engine_store_restore web-wasm "$here/$out" scripts/build/build-engine-wasm.sh; then
  echo "$out: $(wc -c < "$here/$out" | tr -d ' ') bytes"
  exit 0
fi
cache_args=()
while IFS= read -r arg; do [ -n "$arg" ] && cache_args+=("$arg"); done < <(sccache_docker_args x86_64-unknown-linux-musl)

# Fetched here, as the image has neither curl nor wget; checked inside it.
tools=$(mktemp -d)
trap 'rm -rf "$tools"' EXIT
tarball=binaryen-$binaryen-x86_64-linux.tar.gz
curl -fsSL -o "$tools/$tarball" "https://github.com/WebAssembly/binaryen/releases/download/$binaryen/$tarball"

docker run --rm --platform linux/amd64 -m 3g \
  -v "$here/engine:/src/engine" \
  -v "$here/apps/web/src/lib/engine:/out" \
  -v "$tools:/tools:ro" \
  "${cache_args[@]+"${cache_args[@]}"}" \
  -e CARGO_TARGET_DIR=/tmp/target \
  -e CARGO_INCREMENTAL=0 \
  -e SOURCE_DATE_EPOCH=0 \
  -e TARBALL="$tarball" \
  -e BINARYEN_SHA256="$binaryen_sha256" \
  -w /src/engine \
  "$image" sh -ec '
    rustup target add wasm32-unknown-unknown >/dev/null 2>&1
    cargo build --locked -p wingtip-wasm --target wasm32-unknown-unknown --profile wasm 2>&1 | tail -3
    echo "$BINARYEN_SHA256  /tools/$TARBALL" | sha256sum -c - >/dev/null
    mkdir /tmp/binaryen && tar xzf "/tools/$TARBALL" -C /tmp/binaryen --strip-components=1
    /tmp/binaryen/bin/wasm-opt -Oz --strip-debug --strip-producers \
      --enable-mutable-globals --enable-sign-ext --enable-reference-types --enable-multivalue \
      --enable-bulk-memory --enable-nontrapping-float-to-int \
      /tmp/target/wasm32-unknown-unknown/wasm/wingtip_wasm.wasm -o /out/wingtip-engine.wasm
  '
engine_store_publish web-wasm "$here/$out" scripts/build/build-engine-wasm.sh
echo "$out: $(wc -c < "$here/$out" | tr -d ' ') bytes"
