# shellcheck shell=bash
# What the builds of every worktree on one Mac share, so an agent that
# changed ten files compiles about ten files (the owner, 2026-11-10: "make
# it all efficient and share resources"). Sourced by the engine's build
# scripts and scripts/dev/check.sh; docs/LOCAL-DEV.md ("Shared build
# caches") says what each cache holds and how it is pruned.
#
# - The engine store: each build of the engine for an app (the web's
#   WebAssembly, the iPhone's XCFramework, Android's libraries, the
#   planner's wheel) kept under the hash of everything that makes it,
#   $WINGTIP_CACHE/engine/<hash>/<kind>. A worktree whose engine is the
#   same copies it (an APFS clone, no extra disk) instead of compiling
#   again. Published by an atomic rename, so two builds of one hash at
#   once never leave a half-written one: the second rename fails and its
#   copy is dropped.
# - sccache (.tool-versions' version, a release binary checked against its
#   sum below) as Cargo's RUSTC_WRAPPER in Docker, where every worktree is
#   mounted at one path: keyed by content, not by mtime, so the reason a
#   target directory shared between worktrees served stale code (check.sh,
#   2026-11-08) does not apply to it. Not on the Mac: Rust's key holds the
#   compile's directory and output paths, which are the worktree's, and a
#   second worktree's engine build had 0 hits in 180 compiles (2026-11-10);
#   the engine store is what spares it.
#
# In CI (CI set), or with WINGTIP_SHARED_CACHE=0, nothing is kept or
# reused: every build is the clean one it was before.

WINGTIP_CACHE=${WINGTIP_CACHE:-$([ "$(uname -s)" = Darwin ] && echo "$HOME/Library/Caches/wingtip" || echo "${XDG_CACHE_HOME:-$HOME/.cache}/wingtip")}
_shared_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
# The release's sha256 for each Linux it runs on in Docker: an
# Apple-silicon Mac's, and an x86_64 one (the .wasm's linux/amd64 build).
# scripts/build/toolchain.sh --check holds the version to .tool-versions'.
SCCACHE_SUMS="0.19.0 aarch64-unknown-linux-musl:3e47fc4a71b1ddd1b4294a0de9d34498922fdf41e3cd0bda5df3954e3d6deb9d x86_64-unknown-linux-musl:aa73c7270c997894038c0d8f0d297865f57569e1687883322bc431713d4bb9dd"
# sccache evicts its oldest entries past this, in each of its caches (one
# per turn of one-at-a-time.sh, and BuildKit's for the wheel); the engine
# store keeps its newest five hashes (scripts/dev/tidy-build-caches.sh).
SCCACHE_CACHE_SIZE=${SCCACHE_CACHE_SIZE:-10G}

shared_cache_on() { [ -z "${CI:-}" ] && [ "${WINGTIP_SHARED_CACHE:-1}" != 0 ]; }

_sha() { if command -v shasum >/dev/null; then shasum -a 256; else sha256sum; fi; }
# The same for files named, as a script for xargs (macOS has shasum, a
# slim Linux image sha256sum).
_sha_files='if command -v shasum >/dev/null; then shasum -a 256 "$@"; else sha256sum "$@"; fi'

# --- the engine store ------------------------------------------------------

# The hash of what makes an engine build: every engine file a checkout
# has (committed or not, by content and name), .tool-versions (Rust, the
# NDK, Xcode), this file, and the extra files the caller names (its own
# build script, where it lives outside engine/).
engine_store_key() {
  {
    (cd "$_shared_root" && git ls-files -z -co --exclude-standard -- engine | LC_ALL=C sort -z | xargs -0 sh -c "$_sha_files" sh)
    (cd "$_shared_root" && sh -c "$_sha_files" sh .tool-versions scripts/build/shared-cache.sh "$@")
  } | _sha | cut -c1-16
}

# Copies <kind> of this engine from the store to <dest> (a file or a
# folder), replacing it; fails when the store has none. Extra arguments
# are engine_store_key's.
engine_store_restore() {
  local kind=$1 dest=$2 key src
  shift 2
  shared_cache_on || return 1
  key=$(engine_store_key "$@")
  src=$WINGTIP_CACHE/engine/$key/$kind
  [ -e "$src/payload" ] || return 1
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest.tmp.$$"
  # -c clones on APFS (no copy, no disk); elsewhere a plain copy.
  cp -Rc "$src/payload" "$dest.tmp.$$" 2>/dev/null || cp -R "$src/payload" "$dest.tmp.$$" || return 1
  rm -rf "$dest" && mv "$dest.tmp.$$" "$dest"
  touch "$WINGTIP_CACHE/engine/$key"   # newest first, for the pruning
  echo "engine store: $kind for engine $key, copied (no build)" >&2
}

# Puts <src>, just built, in the store as <kind> of this engine.
engine_store_publish() {
  local kind=$1 src=$2 key dir tmp
  shift 2
  shared_cache_on || return 0
  key=$(engine_store_key "$@")
  dir=$WINGTIP_CACHE/engine/$key
  mkdir -p "$dir"
  tmp=$(mktemp -d "$dir/.$kind.XXXXXX")
  cp -Rc "$src" "$tmp/payload" 2>/dev/null || cp -R "$src" "$tmp/payload"
  # rename(2) onto a folder that exists and is not empty fails: the first
  # build of a hash to finish is the one kept, whole.
  if python3 -c 'import os, sys; os.rename(sys.argv[1], sys.argv[2])' "$tmp" "$dir/$kind" 2>/dev/null; then
    echo "engine store: $kind for engine $key, kept for the other worktrees" >&2
  else
    rm -rf "$tmp"
  fi
}

# --- the engine a phone's build links ---------------------------------------

# The engine's hash, engine_store_key's, written into a phone's engine build
# (<dir>/engine.hash: the XCFramework's folder, Android's app/engine) by
# build-xcframework.sh and build-android.sh, whether built or copied from
# the store. Rules are asked by name, so an app linked against an older
# engine builds without a word and only says "the engine has no rule
# called ..." on a screen (IOS-11, 2026-11-14); the stamp lets a build see
# it first. Kept in CI too, where nothing else of the store is.
engine_stamp() {
  engine_store_key > "$1/engine.hash"
}

# Fails, saying so, where the phone's engine build in <dir> is missing or
# was built from another engine than this checkout's; <rebuild> is the
# script that makes it again, named in the message.
engine_stamp_check() {
  local dir=$1 rebuild=$2 have want
  want=$(engine_store_key)
  have=$(cat "$dir/engine.hash" 2>/dev/null || echo none)
  [ "$have" = "$want" ] && return 0
  echo "the engine in $dir is engine $have, not this checkout's $want: run $rebuild" >&2
  return 1
}

# --- sccache ---------------------------------------------------------------

# The sccache binary for <triple> (aarch64-unknown-linux-musl,
# x86_64-unknown-linux-musl), fetched once into
# the cache and checked against its sum; prints its path.
sccache_bin() {
  local triple=$1 version sum dir tmp name
  version=${SCCACHE_SUMS%% *}
  sum=$(tr ' ' '\n' <<<"$SCCACHE_SUMS" | sed -n "s/^$triple://p")
  [ -n "$sum" ] || { echo "shared-cache: no sccache sum for $triple" >&2; return 1; }
  dir=$WINGTIP_CACHE/tools/sccache-$version-$triple
  if [ ! -x "$dir/sccache" ]; then
    name=sccache-v$version-$triple
    tmp=$(mktemp -d) || return 1
    if ! curl -fsSL -o "$tmp/s.tgz" "https://github.com/mozilla/sccache/releases/download/v$version/$name.tar.gz"; then
      rm -rf "$tmp"; echo "shared-cache: sccache $version not fetched; building without it" >&2; return 1
    fi
    if [ "$(_sha < "$tmp/s.tgz" | cut -d' ' -f1)" != "$sum" ]; then
      rm -rf "$tmp"; echo "shared-cache: sccache $version's sum is not the pinned one; not used" >&2; return 1
    fi
    tar xzf "$tmp/s.tgz" -C "$tmp" && mkdir -p "$dir" && mv "$tmp/$name/sccache" "$dir/sccache.$$" \
      && chmod +x "$dir/sccache.$$" && mv -f "$dir/sccache.$$" "$dir/sccache"
    rm -rf "$tmp"
  fi
  echo "$dir/sccache"
}

# The Linux sccache for Docker's machine (arm64 on the Mac).
sccache_linux_triple() {
  case "$(docker version -f '{{.Server.Arch}}' 2>/dev/null)" in
    arm64|aarch64) echo aarch64-unknown-linux-musl ;;
    *) echo x86_64-unknown-linux-musl ;;
  esac
}

# The arguments that give a `docker run` of Cargo the shared Linux cache,
# one per line: the sccache binary (Docker's own machine's, or the triple
# given: x86_64-unknown-linux-musl for a --platform linux/amd64 container)
# and the cache volume of this turn of scripts/dev/one-at-a-time.sh,
# wingtip-sccache-turn-<n>. sccache's local cache allows one server at a
# time ("multiple concurrent servers will race and cause spurious build
# failures", its docs/Local.md), and the server each container starts
# lives as long as the container: one cache per turn is one server per
# cache, and the worktrees that take that turn share it. (One daemon
# container for every build was tried, 2026-11-10: in client-side mode the
# daemon still stats each build's compiler, which only the build's own
# container has, and it panicked.) Outside a turn, nothing: the build runs
# without sccache.
sccache_docker_args() {
  local triple bin
  shared_cache_on || return 0
  [ -n "${ONE_AT_A_TIME_SLOT:-}" ] || return 0
  triple=${1:-$(sccache_linux_triple)}
  bin=$(sccache_bin "$triple") || return 0
  printf '%s\n' -v "wingtip-sccache-turn-$ONE_AT_A_TIME_SLOT:/sccache" -v "$bin:/usr/local/bin/sccache:ro" \
    -e RUSTC_WRAPPER=/usr/local/bin/sccache -e SCCACHE_DIR=/sccache -e SCCACHE_CACHE_SIZE="$SCCACHE_CACHE_SIZE" \
    -e CARGO_INCREMENTAL=0
}
