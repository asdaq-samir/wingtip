#!/usr/bin/env bash
# Runs a linter or formatter at the version .tool-versions pins, installed
# by mise, so the Mac, the pre-push hook and CI run the same bytes of the
# same release (the owner, 2026-11-12: stock tools, one source of truth).
#
#   scripts/build/tool.sh shellcheck -x scripts/dev/check.sh
#   scripts/build/tool.sh --have actionlint   exit 0 when it can be had, else 3
#   scripts/build/tool.sh --path shellcheck   its path (for a tool that runs another)
#
# The name is a mise tool and a .tool-versions line (shellcheck, actionlint,
# zizmor, lychee, swiftformat, ktlint, ...); a copy on the PATH at that
# version is used as it is. mise itself is a release binary at the version
# .tool-versions' `mise` line pins, checked against the sums below and kept
# in the cache; scripts/build/toolchain.sh --check holds the sums' version to
# that line. Exits 3 where mise cannot be had (no network, an OS without a
# build below), which a caller reports as a skip on the Mac.
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
# mise's release sums, for the OSes the repo is worked on.
MISE_SUMS="2026.11.8 macos-arm64:3e390ecbcf7f03e91e72c920a248a0f149f00d77ae95d37ea1736a1c7b42fee6 macos-x64:efedda14eb491af096dc27daaccfd5c57caaf77f1b79c5e387b8a091b8938f66 linux-x64:32b6abe844efa43d37d7ac4ed21d2ec41e9479d66feb19b0db8d2c548cd6e36d linux-arm64:0de1450dcc3f838e372e05e8c5231423760ad3f22d14275ef340bc0a250303ce"
cache=${XDG_CACHE_HOME:-$HOME/.cache}/wingtip-tools

sha256() { if command -v shasum > /dev/null; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi; }

# Prints mise's path, fetching it once.
mise_path() {
  local version=${MISE_SUMS%% *} os arch key sum dir tmp
  if command -v mise > /dev/null && [ "$(mise --version 2> /dev/null | cut -d' ' -f1)" = "$version" ]; then
    command -v mise
    return
  fi
  case "$(uname -s)" in Darwin) os=macos ;; Linux) os=linux ;; *) return 3 ;; esac
  case "$(uname -m)" in arm64 | aarch64) arch=arm64 ;; x86_64 | amd64) arch=x64 ;; *) return 3 ;; esac
  key=$os-$arch
  sum=$(printf '%s\n' "${MISE_SUMS#* }" | tr ' ' '\n' | sed -n "s/^$key://p")
  [ -n "$sum" ] || return 3
  dir=$cache/mise-$version
  if [ ! -x "$dir/mise" ]; then
    mkdir -p "$dir"
    tmp=$(mktemp -d)
    curl -fsSL -o "$tmp/mise" "https://github.com/jdx/mise/releases/download/v$version/mise-v$version-$key" || { rm -rf "$tmp"; return 3; }
    if [ "$(sha256 "$tmp/mise")" != "$sum" ]; then
      echo "tool.sh: mise $version's download is not the pinned sum; not used" >&2
      rm -rf "$tmp"
      return 1
    fi
    chmod +x "$tmp/mise"
    mv "$tmp/mise" "$dir/mise"
    rm -rf "$tmp"
  fi
  echo "$dir/mise"
}

have_only="" want_path=""
case "${1:-}" in
  --have) have_only=1; shift ;;
  --path) want_path=1; shift ;;
esac
name=${1:?usage: tool.sh [--have] <tool> [args...]}
shift
version=$("$here/scripts/build/toolchain.sh" get "$name")

# A copy at the pinned version, wherever the PATH has it.
if command -v "$name" > /dev/null && "$name" --version 2> /dev/null | grep -qF "$version"; then
  [ -z "$have_only" ] || exit 0
  [ -z "$want_path" ] || { command -v "$name"; exit 0; }
  exec "$name" "$@"
fi
mise=$(mise_path) || exit 3
export MISE_DATA_DIR=${MISE_DATA_DIR:-$cache/mise-data} MISE_YES=1 MISE_QUIET=1
# --no-config: .tool-versions has lines mise has no tool for (xcode, rust-edition).
if [ -n "$have_only" ]; then
  "$mise" --no-config exec "$name@$version" -- true > /dev/null 2>&1 && exit 0
  exit 3
fi
if [ -n "$want_path" ]; then
  exec "$mise" --no-config exec "$name@$version" -- sh -c 'command -v "$0"' "$name"
fi
exec "$mise" --no-config exec "$name@$version" -- "$name" "$@"
