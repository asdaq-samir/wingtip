#!/usr/bin/env bash
# xcodebuild for the iOS app, sharing its work with every other worktree on
# the Mac (the owner, 2026-11-10: "make it all efficient and share
# resources"; docs/LOCAL-DEV.md, "Shared build caches"):
#
#   scripts/dev/xcodebuild.sh -project apps/ios/Wingtip.xcodeproj -scheme Wingtip \
#     -destination "platform=iOS Simulator,name=<iPhone>" build-for-testing
#
# Takes a turn of scripts/dev/one-at-a-time.sh (or runs in the one it is
# called in) and builds with:
# - the turn's own DerivedData, ~/Library/Developer/Xcode/DerivedData/
#   wingtip-turn-<n>: one per turn, so no two builds share one at once,
#   and the next worktree's build in it finds every product and module
#   whose inputs are the same;
# - Xcode's compilation cache (COMPILATION_CACHE_ENABLE_CACHING), in the one
#   store Xcode keeps for every project (DerivedData's
#   CompilationCache.noindex), with the checkout's and the DerivedData's
#   paths mapped out of its keys (the *_PREFIX_MAPPING settings), so a
#   compile whose sources are the same is replayed, whichever worktree
#   asks.
# WINGTIP_XCODE_CAS names another store (a cold measurement's).
# Measured 2026-11-10 on the Mac mini, build-for-testing: a cold build
# 36 s (plain xcodebuild's 30-32 s, in every new worktree), the same commit
# in a second worktree 8 s, one Swift file changed 28 s.
#
# A Swift compile's key is its whole module's sources, so a changed file
# compiles its module again (the app's own); the modules around it, the
# SDK's and the tests' unchanged ones are replayed. The
# cache is Xcode's own: no other setting of the project changes, and
# Xcode's IDE builds and CI's are as they were.
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
if [ -z "${ONE_AT_A_TIME_HELD:-}" ]; then
  exec "$here/scripts/dev/one-at-a-time.sh" "xcodebuild ($(basename "$here"))" "$0" "$@"
fi
derived=$HOME/Library/Developer/Xcode/DerivedData
if [ -n "${ONE_AT_A_TIME_SLOT:-}" ]; then
  dd=$derived/wingtip-turn-$ONE_AT_A_TIME_SLOT
else
  # A turn from a copy of one-at-a-time.sh that names none (an older
  # worktree's): this worktree's own DerivedData, which no other build
  # can be using.
  dd=$derived/wingtip-check-$(basename "$here")-$(echo "$here" | shasum -a 256 | cut -c1-8)
fi
# Xcode keeps the build description it made in the DerivedData, under a key
# that holds the project and the request but not whether the files they
# name are there. One made while the engine's XCFramework was missing keeps
# its "There is no XCFramework found" error, and every later build of that
# checkout in this turn reused it and failed, though the framework was there
# by then (2026-11-12, a worktree built before build-xcframework.sh ran).
# So no build starts without the framework, and a description that cached
# the error is dropped (Xcode makes a new one; build.db keeps what is built).
engine=$here/apps/ios/Frameworks/WingtipEngine/WingtipEngineFFI.xcframework
if [ ! -d "$engine" ]; then
  echo "xcodebuild.sh: no $engine; run engine/bindings/ffi/build-xcframework.sh first" >&2
  exit 1
fi
# Nor with a framework built from another engine than this checkout's: the
# app asks its rules by name, so it would link and build without a word
# and every screen asking a newer rule would say "the engine has no rule
# called ..." (IOS-11: a phone build from wingtip-live's older framework,
# 2026-11-14). build-xcframework.sh stamps the engine's hash beside it.
# shellcheck source=scripts/build/shared-cache.sh
. "$here/scripts/build/shared-cache.sh"
if ! engine_stamp_check "$(dirname "$engine")" engine/bindings/ffi/build-xcframework.sh; then
  echo "xcodebuild.sh: not building against a stale engine" >&2
  exit 1
fi
for d in "$dd"/Build/Intermediates.noindex/XCBuildData/*.xcbuilddata; do
  if grep -qs "There is no XCFramework found" "$d/description.msgpack"; then rm -rf "$d"; fi
done
# .tool-versions' Xcode, as CI's (scripts/ci/select-xcode.sh).
DEVELOPER_DIR=${DEVELOPER_DIR:-$("$here/scripts/ci/select-xcode.sh")}
export DEVELOPER_DIR
exec xcodebuild -derivedDataPath "$dd" \
  COMPILATION_CACHE_ENABLE_CACHING=YES COMPILATION_CACHE_CAS_PATH="${WINGTIP_XCODE_CAS:-$derived/CompilationCache.noindex}" \
  SWIFT_ENABLE_PREFIX_MAPPING=YES CLANG_ENABLE_PREFIX_MAPPING=YES \
  SWIFT_ENABLE_PROJECT_PREFIX_MAPPING=YES CLANG_ENABLE_PROJECT_PREFIX_MAPPING=YES \
  "$@"
