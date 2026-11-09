#!/usr/bin/env bash
# The one formatter of each language, run over the whole tree, each at the
# version pinned here so the Mac, the pre-push hook and CI write the same
# bytes. Each language's settings are in the repo, where its tool looks:
#
#   web     Prettier: apps/web (TS, JS, CSS, JSON, Markdown) and
#           scripts/build/*.mjs; .prettierrc.yaml, apps/web/.prettierignore
#   python  ruff format: every .py; .ruff.toml's [format]
#   rust    rustfmt (cargo fmt --all): engine/; engine/rustfmt.toml
#   swift   SwiftFormat: apps/ios; apps/ios/.swiftformat
#   kotlin  ktlint: apps/android; .editorconfig's [*.{kt,kts}]
#   java    palantir-java-format through Spotless: services/gateway; its pom
#
#   scripts/dev/format.sh                     format everything
#   scripts/dev/format.sh rust python         format those languages
#   scripts/dev/format.sh --check [lang...]   say what is not formatted, change nothing
#   scripts/dev/format.sh --no-docker ...     skip, with a note, what would need Docker
#
# Generated files and services/planner/app/detection.py (hashed, CLAUDE.md)
# are left out by each tool's own settings. Where a tool is missing it is
# fetched: Prettier through npx (Docker's node, as the Mac has none),
# ruff through uvx or pipx, SwiftFormat and ktlint as their release
# binaries, checked against the sums below, into ~/.cache/wingtip-format.
# rustfmt is rustup's (`rustup component add rustfmt`), the Java Maven's
# (Docker's Maven image where there is no mvn). A language whose tool
# cannot be had here is skipped with a note, and the exit says so only
# when it is asked for by name.
set -uo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$HOME/.local/bin:$HOME/.cargo/bin

RUFF=0.17.4
SWIFTFORMAT=0.64.2
SWIFTFORMAT_SHA256=103b784eeb7bfcbdce12d07f7464a5c12bfdcc6d8d417b6989125fdc2dbf07ae
KTLINT=1.8.0
KTLINT_SHA256=a3fd620207d5c40da6ca789b95e7f823c54e854b7fade7f613e91096a3706d75
# Prettier's version is apps/web/package.json's, which CI's npm ci installs.
PRETTIER=$(sed -nE 's/^ *"prettier": "([0-9.]+)".*/\1/p' "$here/apps/web/package.json")
CACHE=${XDG_CACHE_HOME:-$HOME/.cache}/wingtip-format

check=""
docker_ok=1
langs=()
for arg in "$@"; do
  case "$arg" in
    --check) check=1 ;;
    --no-docker) docker_ok="" ;;
    web|python|rust|swift|kotlin|java) langs+=("$arg") ;;
    -h|--help) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "format: no language '$arg' (web python rust swift kotlin java)" >&2; exit 64 ;;
  esac
done
named=${#langs[@]}
[ "$named" -gt 0 ] || langs=(web python rust swift kotlin java)

note() { echo "format: $*" >&2; }
sha256() {
  if command -v shasum >/dev/null; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi
}

# A release binary at its pinned version, fetched once and checked against
# its sum; prints its path.
fetch() {
  local name=$1 version=$2 sum=$3 url=$4 dir=$CACHE/$1-$2 tmp
  if [ ! -x "$dir/$name" ]; then
    mkdir -p "$dir" && tmp=$(mktemp -d) || return 1
    curl -fsSL -o "$tmp/download" "$url" || { rm -rf "$tmp"; return 1; }
    if [ "$(sha256 "$tmp/download")" != "$sum" ]; then
      note "$name $version: the download's sum is not the pinned one; not used"
      rm -rf "$tmp"
      return 1
    fi
    case "$url" in
      *.zip) (cd "$tmp" && unzip -q download && mv "$name" "$dir/$name") ;;
      *) mv "$tmp/download" "$dir/$name" ;;
    esac
    chmod +x "$dir/$name"
    rm -rf "$tmp"
  fi
  echo "$dir/$name"
}

docker_up() { [ -n "$docker_ok" ] && command -v docker >/dev/null && docker info >/dev/null 2>&1; }

run_web() {
  local args=(--log-level warn . ../../scripts/build/*.mjs)
  if [ -n "$check" ]; then args=(--check "${args[@]}"); else args=(--write "${args[@]}"); fi
  if [ -x "$here/apps/web/node_modules/.bin/prettier" ] && command -v node >/dev/null; then
    (cd "$here/apps/web" && node_modules/.bin/prettier "${args[@]}")
  elif docker_up; then
    # The repo at its own path, so the scripts' ../../ reach it; npm's
    # downloads kept in a volume of their own.
    local node
    node=$(tr -d ' \n' < "$here/apps/web/.nvmrc")
    docker run --rm -v "$here:/repo" -v wingtip-format-npm:/root/.npm -w /repo/apps/web "node:$node-slim" \
      sh -c 'npx -y "prettier@$0" "$@"' "$PRETTIER" "${args[@]}"
  else
    note "web: skipped, no node here and no Docker${docker_ok:+ running}"
    return 3
  fi
}

run_python() {
  local ruff=()
  if command -v ruff >/dev/null && [ "$(ruff --version 2>/dev/null)" = "ruff $RUFF" ]; then ruff=(ruff)
  elif command -v uvx >/dev/null; then ruff=(uvx -q "ruff@$RUFF")
  elif command -v pipx >/dev/null; then ruff=(pipx run --spec "ruff==$RUFF" ruff)
  else note "python: skipped, no ruff $RUFF, uvx or pipx here"; return 3
  fi
  (cd "$here" && "${ruff[@]}" format ${check:+--check} .)
}

run_rust() {
  if ! command -v cargo >/dev/null || ! cargo fmt --version >/dev/null 2>&1; then
    note "rust: skipped, no rustfmt here (rustup component add rustfmt)"
    return 3
  fi
  (cd "$here/engine" && cargo fmt --all ${check:+--check})
}

run_swift() {
  local sf=""
  if command -v swiftformat >/dev/null && [ "$(swiftformat --version 2>/dev/null)" = "$SWIFTFORMAT" ]; then sf=swiftformat
  elif [ "$(uname -s)" = Darwin ]; then
    sf=$(fetch swiftformat "$SWIFTFORMAT" "$SWIFTFORMAT_SHA256" \
      "https://github.com/nicklockwood/SwiftFormat/releases/download/$SWIFTFORMAT/swiftformat.zip") || sf=""
  fi
  [ -n "$sf" ] || { note "swift: skipped, no SwiftFormat $SWIFTFORMAT here"; return 3; }
  "$sf" "$here/apps/ios" --quiet ${check:+--lint}
}

run_kotlin() {
  local kt="" jbr
  # A Java for ktlint: JAVA_HOME's, else the PATH's, else the JDK 25 the
  # Android build runs on (check.sh's pick).
  jbr=$(ls -d "$HOME"/Library/Java/JavaVirtualMachines/*25*/Contents/Home "$HOME"/.gradle/jdks/*25*/*/Contents/Home 2>/dev/null | tail -1)
  if [ -n "${JAVA_HOME:-}" ]; then PATH=$JAVA_HOME/bin:$PATH
  elif ! java -version >/dev/null 2>&1 && [ -n "$jbr" ]; then PATH=$jbr/bin:$PATH
  fi
  if ! java -version >/dev/null 2>&1; then
    note "kotlin: skipped, ktlint needs a Java here"
    return 3
  fi
  if command -v ktlint >/dev/null && [ "$(ktlint --version 2>/dev/null)" = "ktlint version $KTLINT" ]; then kt=ktlint
  else
    kt=$(fetch ktlint "$KTLINT" "$KTLINT_SHA256" "https://github.com/pinterest/ktlint/releases/download/$KTLINT/ktlint") || kt=""
  fi
  [ -n "$kt" ] || { note "kotlin: skipped, no ktlint $KTLINT here"; return 3; }
  local mode=(--format)
  [ -z "$check" ] || mode=()
  (cd "$here/apps/android" && "$kt" --relative "${mode[@]+"${mode[@]}"}" '**/*.kt' '**/*.kts' '!**/generated/**' '!**/build/**')
}

run_java() {
  local goal=spotless:apply
  [ -z "$check" ] || goal=spotless:check
  if command -v mvn >/dev/null; then
    (cd "$here/services/gateway" && mvn -B -q "$goal")
  elif docker_up; then
    # check.sh's java area's image and Maven repository.
    docker run --rm -v "$here/services":/services -v /services/gateway/target -v fp-m2:/root/.m2 \
      -w /services/gateway maven:3.9-eclipse-temurin-25 mvn -B -q "$goal"
  else
    note "java: skipped, no mvn here and no Docker${docker_ok:+ running}"
    return 3
  fi
}

failed=()
skipped=()
for lang in "${langs[@]}"; do
  "run_$lang"
  case $? in
    0) ;;
    3) skipped+=("$lang") ;;
    *) failed+=("$lang") ;;
  esac
done
if [ ${#failed[@]} -gt 0 ]; then
  if [ -n "$check" ]; then
    note "not formatted: ${failed[*]} (scripts/dev/format.sh ${failed[*]} formats them)"
  else
    note "failed: ${failed[*]}"
  fi
  exit 1
fi
# A language asked for by name and not run is a failure: CI names each one.
if [ "$named" -gt 0 ] && [ ${#skipped[@]} -gt 0 ]; then exit 2; fi
exit 0
