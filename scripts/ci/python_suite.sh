#!/usr/bin/env bash
# One Python suite, as ci.yml's test-python matrix runs each leg (docs/CI.md,
# "The tiers"): its requirements installed with uv, then its tests. The legs
# are the services' own suites and wingtip's, the jobs' and the X-Plane
# driver's: ruff runs once
# for all of them in the guards job (scripts/ci/guards.sh), and the
# engine's wheel is installed by the step before this one, where the leg
# imports it.
#
#   scripts/ci/python_suite.sh planner|wingtip|jobs|ingest|weather|xplane
#
# The packages go into the running Python (`--system`), as on a fresh
# runner; on the Mac, use scripts/dev/check.sh, which runs the same suites in
# containers.
set -euo pipefail
cd "$(dirname "$0")/../.."
leg=${1:?a leg: planner, wingtip, jobs, ingest, weather or xplane}

# The directory it runs in, its requirements there, and its tests.
case "$leg" in
  planner) dir=services/planner req=requirements-dev.txt tests=tests ;;
  wingtip) dir=services/planner req=requirements-dev-wingtip.txt tests=tests_wingtip ;;
  jobs) dir=services/jobs req=requirements-dev-jobs.txt tests="charts/tests crash/tests" ;;
  ingest | weather) dir=services/$leg req=requirements-dev.txt tests=tests ;;
  # The X-Plane trial's plugin: the standard library and its tests' runner only.
  xplane) dir=tools/xplane-driver req="" tests=tests ;;
  *) echo "python_suite: no leg '$leg'" >&2; exit 64 ;;
esac

command -v uv > /dev/null || pip install -q uv
if [ -n "$req" ]; then
  uv pip install --system -q -r "$dir/$req"
else
  # The runner at the planner's pin, so every suite runs on one version.
  grep -E '^pytest==' services/planner/requirements-dev.txt | sed 's/ .*//' | uv pip install --system -q -r -
fi

cd "$dir"
case "$leg" in
  # The import contracts (.importlinter): the planner's, for app and
  # wingtip alike, then its MCP connector's calls, which are generated
  # (scripts/build/planner_calls.py) and checked; ingest's and the jobs',
  # with wingtip beside them.
  planner) lint-imports && python ../../scripts/build/planner_calls.py --check ;;
  ingest | weather) PYTHONPATH=../planner lint-imports ;;
  # tippecanoe, for the overlay tiles' archive tests; skipped without it.
  jobs)
    PYTHONPATH=../planner lint-imports || exit 1
    (sudo apt-get update -qq && sudo apt-get install -y -qq --no-install-recommends tippecanoe > /dev/null) \
      || echo "::warning title=No tippecanoe::the overlay tiles' archive tests are skipped"
    ;;
esac
# Unquoted: the jobs' leg is two folders (charts/tests crash/tests).
# shellcheck disable=SC2086
pytest $tests -v
