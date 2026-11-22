#!/usr/bin/env bash
# One Python suite, as ci.yml's test-python matrix runs each leg (docs/CI.md,
# "The tiers") and as scripts/dev/check.sh runs it on the Mac, in its image:
# the one table of each leg's directory, requirements, code and tests. The
# legs are the services' own suites and wingtip's, the jobs' and the X-Plane
# driver's.
#
#   scripts/ci/python_suite.sh <leg>           CI: the requirements installed
#                                              with uv, then the leg's checks
#   scripts/ci/python_suite.sh --local <leg>   check.sh, in an image that has
#                                              them: ruff, then the checks
#   scripts/ci/python_suite.sh --lint <leg>    ruff over the leg's code alone
#                                              (the guards job, every leg)
#   scripts/ci/python_suite.sh --where <leg>   its directory and requirements
#
#   <leg>: planner, wingtip, jobs, ingest, weather, xplane or flight
#
# `flight` is flight-critical alone (the owner, 2026-11-09: on every change
# but words): the planner's KMSN-KOSH nav log, on a change that does not
# run the planner's whole suite, which has it (scripts/ci/plan.py).
#
# In CI ruff runs once for every leg in the guards job (scripts/ci/guards.sh),
# and the engine's wheel is installed by the step before this one, where the
# leg imports it. RUFF (default `ruff`) is how ruff is run.
set -euo pipefail
cd "$(dirname "$0")/../.."
mode=ci
case "${1:-}" in --local | --lint | --where) mode=${1#--} && shift ;; esac
leg=${1:?a leg: planner, wingtip, jobs, ingest, weather, xplane or flight}

# The directory it runs in, its requirements there, the code ruff reads,
# and its tests.
case "$leg" in
  planner) dir=services/planner req=requirements-dev.txt code="app tests" tests=tests ;;
  flight) dir=services/planner req=requirements-dev.txt code=tests/test_flight_critical.py tests=tests/test_flight_critical.py ;;
  wingtip) dir=services/planner req=requirements-dev-wingtip.txt code="wingtip tests_wingtip" tests=tests_wingtip ;;
  jobs) dir=services/jobs req=requirements-dev-jobs.txt code=charts tests=charts/tests ;;
  ingest) dir=services/ingest req=requirements-dev.txt code="ingest tests" tests=tests ;;
  weather) dir=services/weather req=requirements-dev.txt code="app tests" tests=tests ;;
  # The X-Plane trial's plugin: the standard library and its tests' runner only.
  xplane) dir=tools/xplane-driver req="" code=. tests=tests ;;
  *) echo "python_suite: no leg '$leg'" >&2; exit 64 ;;
esac

if [ "$mode" = where ]; then
  echo "$dir $req"
  exit 0
fi

if [ "$mode" = ci ]; then
  command -v uv > /dev/null || pip install -q uv
  if [ -n "$req" ]; then
    uv pip install --system -q -r "$dir/$req"
  else
    # The runner at the planner's pin, so every suite runs on one version.
    grep -E '^pytest==' services/planner/requirements-dev.txt | sed 's/ .*//' | uv pip install --system -q -r -
  fi
fi

cd "$dir"
# Unquoted: a leg's code and tests may be two folders, and RUFF a command
# and its arguments (uvx -q ruff@<version>).
# shellcheck disable=SC2086
if [ "$mode" != ci ]; then
  ${RUFF:-ruff} check $code
  [ "$mode" = lint ] && exit 0
fi
case "$leg" in
  # The import contracts (.importlinter): the planner's, for app and
  # wingtip alike, then its MCP connector's calls, which are generated
  # (scripts/build/planner_calls.py) and checked; ingest's, the weather
  # service's and the jobs', with wingtip beside them.
  planner) lint-imports && python ../../scripts/build/planner_calls.py --check ;;
  ingest | weather | jobs) PYTHONPATH=../planner lint-imports ;;
esac
# tippecanoe, for the overlay tiles' archive tests; skipped without it (a
# check image has none).
if [ "$leg" = jobs ] && [ "$mode" = ci ]; then
  (sudo apt-get update -qq && sudo apt-get install -y -qq --no-install-recommends tippecanoe > /dev/null) \
    || echo "::warning title=No tippecanoe::the overlay tiles' archive tests are skipped"
fi
verbosity=-q
[ "$mode" = ci ] && verbosity=-v
# shellcheck disable=SC2086
pytest $tests "$verbosity"
