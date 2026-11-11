#!/usr/bin/env bash
# Keeps the build caches every worktree shares (scripts/build/shared-cache.sh,
# docs/LOCAL-DEV.md "Shared build caches") within bounds, and removes what
# belonged to worktrees that are gone. Run by scripts/dev/docker-tidy.sh and
# scripts/dev/tidy-branches.sh; safe at any time, as everything it removes a
# build makes again.
#
# - The engine store: its newest five engines (by last use) stay.
# - sccache's caches (Docker volumes wingtip-sccache-turn-<n>, BuildKit's
#   wingtip-sccache-buildkit) cap themselves at SCCACHE_CACHE_SIZE, 10 GB.
# - Xcode: the DerivedData of a worktree that no longer exists (Xcode's
#   Wingtip-<hash> folders name their workspace in info.plist,
#   xcodebuild.sh's wingtip-check-<worktree>-<hash> folders the worktree;
#   its wingtip-turn-<n> ones are every worktree's and stay), and the
#   compilation cache over 25 GB (Xcode trims it itself, by
#   COMPILATION_CACHE_LIMIT_SIZE, while it builds; this is the backstop).
# - Gradle prunes its own build cache (entries unused for seven days) and
#   its daemons stop after three idle hours; nothing to do here.
# - The caches of the scripts before this one: ~/Library/Caches/wingtip-checks
#   (check.sh's phone engines, now the engine store's).
#
#   scripts/dev/tidy-build-caches.sh [--dry-run]
set -uo pipefail
dry=""; verb=removed
[ "${1:-}" = --dry-run ] && { dry=1; verb="would remove"; }
here=$(cd "$(dirname "$0")/../.." && pwd)
PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin
# shellcheck source=scripts/build/shared-cache.sh
. "$here/scripts/build/shared-cache.sh"
keep_engines=${KEEP_ENGINES:-5}
derived=$HOME/Library/Developer/Xcode/DerivedData
cap_kb=$((25 * 1024 * 1024))

gone() { echo "tidy-build-caches: $verb $1 ($2)"; [ -n "$dry" ] || rm -rf "$1"; }
size_kb() { du -sk "$1" 2>/dev/null | cut -f1; }

# The engine store, newest first by the time a build last used or made it.
if [ -d "$WINGTIP_CACHE/engine" ]; then
  # shellcheck disable=SC2012  # names are hex hashes
  ls -t "$WINGTIP_CACHE/engine" | tail -n +$((keep_engines + 1)) | while read -r key; do
    gone "$WINGTIP_CACHE/engine/$key" "an older engine than the newest $keep_engines"
  done
fi
# The engine store's half-written copies a killed build left (an hour on).
find "$WINGTIP_CACHE/engine" -mindepth 2 -maxdepth 2 -name '.*' -mmin +60 2>/dev/null | while read -r d; do
  gone "$d" "an unfinished copy"
done


# Xcode's per-project folders: info.plist's WorkspacePath is the project
# it built; one whose project is gone (a removed worktree) goes.
for d in "$derived"/Wingtip-*/; do
  [ -d "$d" ] || continue
  ws=$(/usr/libexec/PlistBuddy -c 'Print :WorkspacePath' "$d/info.plist" 2>/dev/null) || continue
  [ -e "$ws" ] || [ -d "${ws%/apps/ios/*}" ] || gone "${d%/}" "its project $ws is gone"
done
# check.sh's: wingtip-check-<worktree folder>-<hash of its path> (its
# worktree_key), kept while a worktree of the repository has that key.
keys=$(git -C "$here" worktree list --porcelain | sed -n 's/^worktree //p' | while read -r wt; do
  echo "$(basename "$wt")-$(echo "$wt" | shasum -a 256 | cut -c1-8)"
done)
for d in "$derived"/wingtip-check-*/; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  grep -qxF "${name#wingtip-check-}" <<<"$keys" || gone "${d%/}" "its worktree is gone"
done
if [ -d "$derived/CompilationCache.noindex" ] && [ "$(size_kb "$derived/CompilationCache.noindex")" -gt "$cap_kb" ]; then
  gone "$derived/CompilationCache.noindex" "over 25 GB"
fi

[ -d "$HOME/Library/Caches/wingtip-checks" ] && gone "$HOME/Library/Caches/wingtip-checks" "replaced by the engine store"

# Docker: the target volumes of worktrees that are gone (check.sh labels
# each with its worktree; one without a label is a hand-made leftover).
# The sccache volume caps itself.
if docker info >/dev/null 2>&1; then
  for vol in $(docker volume ls -q --filter name=wingtip-cargo-target- 2>/dev/null); do
    path=$(docker volume inspect -f '{{index .Labels "wingtip.worktree"}}' "$vol" 2>/dev/null)
    if [ -z "$path" ] || [ ! -d "$path" ]; then
      echo "tidy-build-caches: $verb volume $vol (${path:-no worktree label}${path:+ is gone})"
      [ -n "$dry" ] || docker volume rm "$vol" >/dev/null 2>&1 || echo "  (in use, kept)"
    fi
  done
  # An old name for Cargo's git checkouts no script uses any more.
  if docker volume inspect wingtip-cargo-reg-git >/dev/null 2>&1; then
    echo "tidy-build-caches: $verb volume wingtip-cargo-reg-git (no script uses it)"
    [ -n "$dry" ] || docker volume rm wingtip-cargo-reg-git >/dev/null 2>&1 || true
  fi
fi
du -sh "$WINGTIP_CACHE" "$derived" 2>/dev/null
