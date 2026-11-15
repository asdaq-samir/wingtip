#!/usr/bin/env bash
# ci.yml's test-web, once the packages and the API types are in: one of its
# two legs, each on a runner of its own.
#
#   tests   Vitest: on a pull request the tests whose files or imports it
#           changed (--changed, against the base it lands on; a change to
#           the package or Vite's config runs them all), elsewhere every test
#   build   the generated files are the committed ones
#           (scripts/ci/web_generated.sh), then `vite build` and the
#           JavaScript a phone loads before the planner draws, against its
#           budget (scripts/first-load.mjs; raise it only with the reason)
#
#   scripts/ci/web_suite.sh tests|build [BASE]   BASE: the commit the pull request lands on
#
# One after the other on one runner they were the pull request gate's
# longest job: 4.0 of its 3 minutes with Vitest 81 s, the generated files
# 78 s and the build 30 s (run 43551090407, 2026-11-14). Both at once on
# that runner was slower still, each starving the other of its four cores:
# 264 s for the same work that takes about 150 s in turn (run 43727254429,
# 2026-11-15). So each has a runner.
set -euo pipefail
cd "$(dirname "$0")/../.."
part=${1:?a leg: tests or build}
base=${2:-}
FIRST_LOAD_BUDGET=1100000

case "$part" in
  tests)
    cd apps/web
    if [ -n "$base" ]; then
      npx vitest run --changed "$base" --passWithNoTests
    else
      npx vitest run
    fi
    ;;
  build)
    scripts/ci/web_generated.sh "$base"
    cd apps/web
    npx vite build
    node scripts/first-load.mjs dist --budget "$FIRST_LOAD_BUDGET"
    ;;
  *)
    echo "web_suite: no leg '$part' (tests or build)" >&2
    exit 64
    ;;
esac
