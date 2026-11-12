#!/usr/bin/env bash
# The quick checks, all at once: ci.yml's guards job, one of the jobs "CI
# passed" waits on (docs/CI.md, "The tiers"). One runner's start-up for all
# of them, rather than one each, and every check started together, so the
# job takes as long as its slowest check, not their sum.
#
#   always   the paths filter is scripts/areas.yml's, no aviation rule
#            outside the engine, the legal pages, every test in one tier
#            (and CI's tiers in shape), warnings fatal, the workflows'
#            rules, the Markdown's links, the web's engine rules
#            (scripts/build/web_rules.py), ruff over every Python suite
#            and the Python's layout
#   ARCH     no new or grown source file over 400 lines (a new one over
#            300), one version of each toolchain, no raw style value
#            outside the tokens, no unused Python; the simplicity rules on
#            the files changed: one home per constant or helper (Semgrep),
#            no new copy-paste (jscpd), and the simplicity ratchet
#   IOS      SwiftLint on the Swift changed (scripts/ci/phone_lint.sh)
#   ANDROID  detekt on the Kotlin changed
#   SITE     the website built and checked
#   WEB      apps/web: the API types, tsc, ESLint with no warning (the
#            stock-component bans among its rules), Prettier, knip, the
#            feature layers (dependency-cruiser)
#   ENGINE   the crates' layering, the WebAssembly's size budget, no
#            unused dependency (cargo-machete), rustfmt, clippy with
#            warnings denied
#   FLIGHT   flight-critical: the engine's FAA worked examples and the
#            planner's KMSN-KOSH nav log (needs the engine's wheel and the
#            planner's requirements)
#
# Each area is on unless its variable is "false" (ci.yml sets them from
# `changes`). INSTALL=true lets it install what it needs (npm ci, the
# planner's requirements, cargo-machete), as CI does on a fresh runner; on
# the Mac a check whose tool is missing is skipped with a note, and in CI it
# fails. BASE_REF is the branch the file sizes are held against (main).
#
#   scripts/ci/guards.sh
#   WEB=false ENGINE=false FLIGHT=false scripts/ci/guards.sh    the seconds-long ones
#
# Each check's output is printed in a group of its own once all are done,
# and each failure is an ::error naming it.
set -uo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
cd "$here" || exit 1
PATH=$PATH:$HOME/.cargo/bin:$HOME/.local/bin
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
on() { [ "${!1:-true}" != false ]; }
CARGO_MACHETE=0.9.2
RUFF=$(scripts/build/toolchain.sh get ruff)

# NAME CMD...: started in the background, its output and status kept.
start() {
  local name=$1 slug
  shift
  slug=$(printf '%s' "$name" | tr -c 'A-Za-z0-9' '-')
  echo "$name" >> "$out/order"
  ( "$@" > "$out/$slug.log" 2>&1; echo $? > "$out/$slug.status" ) &
}

# TOOL: there, or on the Mac a skip (exit 3, reported as skipped).
need() {
  command -v "$1" > /dev/null && return 0
  echo "no $1 here"
  [ -n "${GITHUB_ACTIONS:-}" ] && return 1
  return 3
}

ruff_check() {
  local ruff=(ruff)
  if [ "$(ruff --version 2>/dev/null)" != "ruff $RUFF" ]; then
    need uvx || return $?
    ruff=(uvx -q "ruff@$RUFF")
  fi
  # Each suite from its own directory, as its job ran it, so each finds
  # the settings it always has.
  (cd services/planner && "${ruff[@]}" check app tests wingtip tests_wingtip) &&
    (cd services/ingest && "${ruff[@]}" check ingest tests) &&
    (cd services/assistant && "${ruff[@]}" check app tests) &&
    (cd services/weather && "${ruff[@]}" check app tests) &&
    (cd services/jobs && "${ruff[@]}" check charts crash) &&
    (cd tools/xplane-driver && "${ruff[@]}" check .)
}

# The branch a change is held against, fetched once for every check that
# reads it (one deep: a tree is all they compare).
base=refs/guards/base
if on ARCH || on IOS || on ANDROID; then
  git fetch -q --depth=1 origin "+refs/heads/${BASE_REF:-main}:$base" 2> /dev/null || base=origin/${BASE_REF:-main}
fi

file_sizes() { python3 scripts/ci/file_sizes.py --base "$base"; }

site() { python3 apps/site/build.py && python3 apps/site/check.py; }

# The web app's types first (generated from the API documents), then its
# four checks at once.
web() {
  need npm || return $?
  cd apps/web || return 1
  if [ "${INSTALL:-}" = true ]; then npm ci --no-audit --no-fund || return 1; fi
  npm run types || return 1
  start "Web: tsc" npx tsc --noEmit
  start "Web: ESLint" npx eslint . --max-warnings 0
  start "Web: Prettier" npm run format:check
  start "Web: knip" npx knip --no-progress
  start "Web: layers" npm run -s layers
  wait
}

machete() {
  need cargo || return $?
  if ! command -v cargo-machete > /dev/null; then
    [ "${INSTALL:-}" = true ] || { echo "no cargo-machete here"; return 3; }
    echo "::notice title=Cache miss::cargo-machete"
    cargo install -q --locked "cargo-machete@$CARGO_MACHETE" || return 1
  fi
  cargo machete engine
}

clippy() {
  need cargo || return $?
  # clippy is added before the checks start, above.
  cargo clippy --manifest-path engine/Cargo.toml --workspace --all-targets -- -D warnings
}

# What must never break in the air (the owner, 2026-11-09): the engine
# against worked examples from the FAA's own texts
# (apps/web/src/lib/fixtures/flightCritical.json: FAA-H-8083-25C ch. 16,
# 14 CFR 91.151, 91.155, 91.159, 91.167, 91.179, AIM 5-3-8), and the
# planner's nav log and nearest fields, which ask the engine every rule.
flight_engine() {
  need cargo || return $?
  cargo test --profile ci --manifest-path engine/Cargo.toml -p wingtip-engine --test flight_critical
}
flight_planner() {
  if [ "${INSTALL:-}" = true ]; then
    { command -v uv > /dev/null || pip install -q uv; } && uv pip install --system -q -r services/planner/requirements-dev.txt || return 1
  fi
  need pytest || return $?
  cd services/planner && pytest tests/test_flight_critical.py -v
}

# The engine's toolchain (engine/rust-toolchain.toml) and its components,
# installed once before the checks start: four rustups at once raced on
# one download (run 42932986845, "could not rename 'downloaded' file").
if { on ENGINE || on FLIGHT; } && command -v rustup > /dev/null; then
  (cd engine && rustup toolchain install > /dev/null 2>&1 && rustup component add clippy rustfmt > /dev/null 2>&1) || true
fi

start "Areas filter" python3 scripts/areas.py check
start "Rules boundary" python3 scripts/ci/rules_boundary.py
start "Legal pages" python3 scripts/build/legal_pages.py --check
start "Test tiers" python3 scripts/ci/test_tiers.py
start "Warnings fatal" python3 scripts/ci/warnings_fatal.py
start "Workflow rules" python3 scripts/ci/workflow_rules.py
start "Doc links" python3 scripts/ci/check_links.py
start "Web engine rules" python3 scripts/build/web_rules.py --check
start "Python lint" ruff_check
start "Python layout" scripts/dev/format.sh --check python
if on ARCH; then
  start "File sizes" file_sizes
  start "Toolchain" scripts/build/toolchain.sh --check
  start "Brand" python3 scripts/ci/brand_guard.py
  start "Shared parts" python3 scripts/ci/shared_parts_guard.py
  start "Unused Python" scripts/ci/dead_python.sh
  start "One home (Semgrep)" python3 scripts/ci/semgrep_check.py --base "$base"
  start "Copy-paste (jscpd)" python3 scripts/ci/jscpd_check.py --base "$base"
  start "Simplicity ratchet" python3 scripts/ci/simplicity_ratchet.py --base "$base"
fi
on IOS && start "iPhone: SwiftLint" scripts/ci/phone_lint.sh ios --base "$base"
on ANDROID && start "Android: detekt" scripts/ci/phone_lint.sh android --base "$base"
on SITE && start "Website" site
on WEB && start "Web: API types" web
if on ENGINE; then
  start "Engine layers" python3 scripts/ci/engine_layers.py
  start "Engine: WebAssembly size" python3 scripts/ci/wasm_size.py
  start "Engine: machete" machete
  start "Engine: rustfmt" scripts/dev/format.sh --check rust
  start "Engine: clippy" clippy
fi
if on FLIGHT; then
  start "Flight-critical: engine" flight_engine
  start "Flight-critical: planner" flight_planner
fi
wait

failed=() skipped=()
while read -r name; do
  slug=$(printf '%s' "$name" | tr -c 'A-Za-z0-9' '-')
  status=$(cat "$out/$slug.status" 2>/dev/null || echo 1)
  echo "::group::$name ($([ "$status" = 0 ] && echo passed || { [ "$status" = 3 ] && echo skipped; } || echo failed))"
  cat "$out/$slug.log"
  echo "::endgroup::"
  if [ "$status" = 3 ]; then
    skipped+=("$name")
  elif [ "$status" != 0 ]; then
    failed+=("$name")
    tail -25 "$out/$slug.log" | python3 -c 'import sys; t=sys.stdin.read().replace("%","%25").replace("\r","").replace("\n","%0A"); print(f"::error title=Guard failed: {sys.argv[1]}::{t[:4000]}")' "$name"
  fi
done < "$out/order"

[ ${#skipped[@]} -eq 0 ] || echo "skipped, their tool missing here: ${skipped[*]}"
if [ ${#failed[@]} -gt 0 ]; then
  echo "failed: ${failed[*]}"
  exit 1
fi
echo "guards: $(wc -l < "$out/order" | tr -d ' ') checks passed"
