#!/usr/bin/env bash
# The phones' own linters, on the files a change touches (CLAUDE.md,
# "Simplicity rules"): SwiftLint over the iPhone app's Swift, detekt over
# Android's Kotlin, each at .tool-versions' version (SwiftLint installed by mise,
# scripts/build/tool.sh; detekt's jar fetched once into ~/.cache/wingtip-lint
# and checked against its sum, as mise has no detekt build to run). Configs and the
# baselines of today's findings (which only shrink) are in scripts/ci/phones/.
# scripts/ci/guards.sh runs it when the change touches a phone.
#
#   scripts/ci/phone_lint.sh ios|android [--base REF]   the files changed against REF (all without one)
#   scripts/ci/phone_lint.sh ios|android --write        rewrite the baseline from every file
#
# Exit 3 (skipped) on a machine without the tool's runtime (Java for detekt;
# SwiftLint's Linux build or a Mac); CI has both.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
here=$PWD
cfg=$here/scripts/ci/phones
cache=${XDG_CACHE_HOME:-$HOME/.cache}/wingtip-lint
platform=${1:-}
shift || true
base="" write=false
while [ $# -gt 0 ]; do
  case $1 in
    --base) base=$2; shift 2 ;;
    --write) write=true; shift ;;
    *) echo "phone_lint: unknown argument $1" >&2; exit 64 ;;
  esac
done
# A missing tool is a skip (3) on a Mac and a failure in CI (guards.sh's rule).
skip=3
[ -z "${GITHUB_ACTIONS:-}" ] || skip=1
version() { awk -v n="$1" '$1 == n { print $2 }' .tool-versions; }

# Maven Central's .sha1 beside detekt's jar (mise has no detekt build to run).
DETEKT_SHA1="2.0.0-alpha.6 543c524afee8f40330b4bf66e760cb141accb87a"

sum_of() { # FILE ALGO
  if command -v shasum > /dev/null; then shasum -a "$2" "$1" | cut -d' ' -f1; else "sha${2}sum" "$1" | cut -d' ' -f1; fi
}

# FILES: what to lint, one a line: the changed ones of this kind, or all.
files() { # PATTERN
  if [ -n "$base" ] && ! $write; then
    { git diff --name-only --diff-filter=AMR "$base"; git ls-files --others --exclude-standard; } | grep -E "$1" | grep -vE '(Tests?/|/test/|androidTest/|/[Gg]enerated/|apps/ios/WingtipAPI/)' | sort -u
  else
    git ls-files | grep -E "$1" | grep -vE '(Tests?/|/test/|androidTest/|/[Gg]enerated/|apps/ios/WingtipAPI/)'
  fi
}

ios() {
  local list
  # SwiftLint at .tool-versions' version, installed by mise.
  "$here/scripts/build/tool.sh" --have swiftlint || { echo "phone_lint: SwiftLint will not run here"; return "$skip"; }
  list=$(files '^apps/ios/.*\.swift$')
  [ -n "$list" ] || { echo "phone_lint: no Swift changed"; return 0; }
  if $write; then
    # shellcheck disable=SC2086  # one path a word: the repo's paths have no spaces
    "$here/scripts/build/tool.sh" swiftlint lint --quiet --config "$cfg/swiftlint.yml" --write-baseline "$cfg/swiftlint-baseline.json" $list > /dev/null
    echo "phone_lint: wrote scripts/ci/phones/swiftlint-baseline.json"
    return 0
  fi
  # shellcheck disable=SC2086
  "$here/scripts/build/tool.sh" swiftlint lint --quiet --strict --config "$cfg/swiftlint.yml" --baseline "$cfg/swiftlint-baseline.json" $list
}

android() {
  local v jar want
  v=$(version detekt)
  [ "$v" = "${DETEKT_SHA1%% *}" ] || { echo "phone_lint: DETEKT_SHA1 is for ${DETEKT_SHA1%% *}, .tool-versions says $v"; return 1; }
  if ! java -version > /dev/null 2>&1; then
    echo "phone_lint: no Java here for detekt"
    return "$skip"
  fi
  want=${DETEKT_SHA1#* }
  jar=$cache/detekt-cli-$v-all.jar
  if [ ! -f "$jar" ]; then
    mkdir -p "$cache" || return 1
    if ! curl -fsSL -o "$jar.part" "https://repo1.maven.org/maven2/dev/detekt/detekt-cli/$v/detekt-cli-$v-all.jar"; then
      echo "phone_lint: could not fetch detekt $v"
      return "$skip"
    fi
    [ "$(sum_of "$jar.part" 1)" = "$want" ] || { echo "phone_lint: detekt $v's sum does not match"; rm -f "$jar.part"; return 1; }
    mv "$jar.part" "$jar"
  fi
  # Java 24 on warns of the IntelliJ parser's sun.misc.Unsafe use, which is
  # no finding of ours: allowed, quietly, where the flag exists (23 on).
  local jflags=() major
  major=$(java -XshowSettings:properties -version 2>&1 | awk '/java.specification.version/ { print $3 }')
  [ "${major%%.*}" -ge 23 ] 2> /dev/null && jflags=(--sun-misc-unsafe-memory-access=allow)
  # detekt 2 takes each path after an --input of its own.
  local inputs=()
  while IFS= read -r f; do [ -n "$f" ] && inputs+=(--input "$f"); done <<< "$(files '^apps/android/app/src/main/.*\.kt$')"
  [ ${#inputs[@]} -gt 0 ] || { echo "phone_lint: no Kotlin changed"; return 0; }
  if $write; then
    java ${jflags[@]+"${jflags[@]}"} -jar "$jar" "${inputs[@]}" --config "$cfg/detekt.yml" --create-baseline --baseline "$cfg/detekt-baseline.xml" > /dev/null
    echo "phone_lint: wrote scripts/ci/phones/detekt-baseline.xml"
    return 0
  fi
  java ${jflags[@]+"${jflags[@]}"} -jar "$jar" "${inputs[@]}" --config "$cfg/detekt.yml" --baseline "$cfg/detekt-baseline.xml"
}

# --write only lowers a baseline (CLAUDE.md, "Simplicity rules": never
# raise one to pass): more entries than the committed file had puts it back.
shrinks() { # FILE PATTERN
  local before after
  git cat-file -e "HEAD:$1" 2> /dev/null || return 0
  before=$(git show "HEAD:$1" | grep -oE "$2" | wc -l)
  after=$(grep -oE "$2" "$1" | wc -l)
  if [ "$after" -gt "$before" ]; then
    git checkout -q HEAD -- "$1"
    echo "phone_lint: $1 would grow from $before to $after findings: fix the new ones instead"
    return 1
  fi
}

case $platform in
  ios) ios && { ! $write || shrinks scripts/ci/phones/swiftlint-baseline.json '"ruleIdentifier"'; } ;;
  android) android && { ! $write || shrinks scripts/ci/phones/detekt-baseline.xml '<ID>'; } ;;
  *) echo "usage: scripts/ci/phone_lint.sh ios|android [--base REF | --write]" >&2; exit 64 ;;
esac
