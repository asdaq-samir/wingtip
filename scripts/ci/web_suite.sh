#!/usr/bin/env bash
# ci.yml's test-web, once the packages and the API types are in: the unit
# tests beside the rest, not before it. Run one after the other, Vitest
# (81 s), the generated files' check (78 s) and `vite build` (30 s) made
# test-web the pull request gate's longest job, 4.0 of its 3 minutes (run
# 43551090407, 2026-11-14); the tests and the build read the same tree and
# write to different places, so they share the runner's four cores.
#
#   in the background   Vitest: on a pull request the tests whose files or
#                       imports it changed (--changed, against the base it
#                       lands on; a change to the package or Vite's config
#                       runs them all), elsewhere every test
#   meanwhile           the generated files are the committed ones
#                       (scripts/ci/web_generated.sh), then `vite build` and
#                       the JavaScript a phone loads before the planner
#                       draws, against its budget (scripts/first-load.mjs;
#                       raise it only with the reason)
#
#   scripts/ci/web_suite.sh [BASE]   BASE: the commit the pull request lands on
#
# The build's output is printed as it runs and Vitest's in a group of its
# own once both are done; each that failed is an ::error naming it.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
base=${1:-}
FIRST_LOAD_BUDGET=1100000
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT

tests() {
  cd apps/web || return 1
  if [ -n "$base" ]; then
    npx vitest run --changed "$base" --passWithNoTests
  else
    npx vitest run
  fi
}

build() {
  scripts/ci/web_generated.sh "$base" || return 1
  cd apps/web || return 1
  npx vite build && node scripts/first-load.mjs dist --budget "$FIRST_LOAD_BUDGET"
}

(
  tests > "$out/vitest.log" 2>&1
  echo $? > "$out/vitest.status"
) &
(build)
built=$?
wait

echo "::group::Vitest"
cat "$out/vitest.log"
echo "::endgroup::"
tested=$(cat "$out/vitest.status" 2> /dev/null || echo 1)

failed=0
if [ "$tested" != 0 ]; then
  echo "::error title=Web suite::the unit tests failed (Vitest, the group above names each)"
  failed=1
fi
if [ "$built" != 0 ]; then
  echo "::error title=Web suite::the generated files, the build or the first-load budget failed (above the Vitest group)"
  failed=1
fi
exit "$failed"
