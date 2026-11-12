#!/usr/bin/env bash
# The one formatter of each language, run over the whole tree, each at the
# version .tool-versions pins, so the Mac, the pre-push hook and CI write
# the same bytes. Each language's settings are in the repo, where its tool looks:
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
# ruff through uvx or pipx, SwiftFormat and ktlint through mise
# (scripts/build/tool.sh, at .tool-versions' versions).
# palantir-java-format's version is the pom's (Spotless), Prettier's
# apps/web/package.json's; scripts/build/toolchain.sh --check holds both,
# and the sums' versions, to .tool-versions.
# rustfmt is rustup's (`rustup component add rustfmt`), the Java Maven's
# (Docker's Maven image where there is no mvn). A language whose tool
# cannot be had here is skipped with a note, and the exit says so only
# when it is asked for by name.
set -uo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$HOME/.local/bin:$HOME/.cargo/bin

tool() { "$here/scripts/build/toolchain.sh" get "$1"; }
RUFF=$(tool ruff)
# Prettier's, the one apps/web/package.json pins and CI's npm ci installs.
PRETTIER=$(tool prettier)

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
    node=$(tool nodejs)
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
  # rustfmt for rust-toolchain.toml's Rust, which rustup installs minimal.
  if command -v rustup >/dev/null && ! (cd "$here/engine" && cargo fmt --version >/dev/null 2>&1); then
    (cd "$here/engine" && rustup component add rustfmt >/dev/null 2>&1)
  fi
  if ! command -v cargo >/dev/null || ! (cd "$here/engine" && cargo fmt --version >/dev/null 2>&1); then
    note "rust: skipped, no rustfmt here (rustup component add rustfmt)"
    return 3
  fi
  (cd "$here/engine" && cargo fmt --all ${check:+--check})
}

run_swift() {
  "$here/scripts/build/tool.sh" --have swiftformat || { note "swift: skipped, no SwiftFormat $(tool swiftformat) here"; return 3; }
  "$here/scripts/build/tool.sh" swiftformat "$here/apps/ios" --quiet ${check:+--lint}
}

run_kotlin() {
  local jbr
  # A Java for ktlint: JAVA_HOME's, else the PATH's, else .tool-versions'
  # JDK, the one the Android build runs on (check.sh's pick).
  local java
  java=$(tool java)
  jbr=$(ls -d "$HOME"/Library/Java/JavaVirtualMachines/*"$java"*/Contents/Home "$HOME"/.gradle/jdks/*"$java"*/*/Contents/Home 2>/dev/null | tail -1)
  if [ -n "${JAVA_HOME:-}" ]; then PATH=$JAVA_HOME/bin:$PATH
  elif ! java -version >/dev/null 2>&1 && [ -n "$jbr" ]; then PATH=$jbr/bin:$PATH
  fi
  if ! java -version >/dev/null 2>&1; then
    note "kotlin: skipped, ktlint needs a Java here"
    return 3
  fi
  "$here/scripts/build/tool.sh" --have ktlint || { note "kotlin: skipped, no ktlint $(tool ktlint) here"; return 3; }
  local mode=(--format)
  [ -z "$check" ] || mode=()
  (cd "$here/apps/android" && "$here/scripts/build/tool.sh" ktlint --relative "${mode[@]+"${mode[@]}"}" '**/*.kt' '**/*.kts' '!**/generated/**' '!**/build/**')
}

run_java() {
  local goal=spotless:apply
  [ -z "$check" ] || goal=spotless:check
  if command -v mvn >/dev/null; then
    (cd "$here/services/gateway" && mvn -B -q "$goal")
  elif docker_up; then
    # check.sh's java area's image and Maven repository.
    docker run --rm -v "$here/services":/services -v /services/gateway/target -v fp-m2:/root/.m2 \
      -w /services/gateway "maven:$(tool maven)-eclipse-temurin-$(tool java)" mvn -B -q "$goal"
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
