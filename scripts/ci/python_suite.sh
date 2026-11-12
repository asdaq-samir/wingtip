#!/usr/bin/env bash
# One Python suite, as ci.yml's test-python matrix runs each leg (docs/CI.md,
# "The tiers"): its requirements installed with uv, then its tests. The legs
# are the services' own suites and wingtip's and the jobs': ruff runs once
# for all of them in the guards job (scripts/ci/guards.sh), and the
# engine's wheel is installed by the step before this one, where the leg
# imports it.
#
#   scripts/ci/python_suite.sh planner|wingtip|jobs|ingest|assistant|weather
#
# The packages go into the running Python (`--system`), as on a fresh
# runner; on the Mac, use scripts/dev/check.sh, which runs the same suites in
# containers.
set -euo pipefail
cd "$(dirname "$0")/../.."
leg=${1:?a leg: planner, wingtip, jobs, ingest, assistant or weather}

# The directory it runs in, its requirements there, and its tests.
case "$leg" in
  planner) dir=services/planner req=requirements-dev.txt tests=tests ;;
  wingtip) dir=services/planner req=requirements-dev-wingtip.txt tests=tests_wingtip ;;
  jobs) dir=services/jobs req=requirements-dev-jobs.txt tests="charts/tests crash/tests" ;;
  ingest | assistant | weather) dir=services/$leg req=requirements-dev.txt tests=tests ;;
  *) echo "python_suite: no leg '$leg'" >&2; exit 64 ;;
esac

command -v uv > /dev/null || pip install -q uv
uv pip install --system -q -r "$dir/$req"

cd "$dir"
case "$leg" in
  # The planner's import contracts (.importlinter), for app and wingtip
  # alike: the one leg that runs them.
  planner) lint-imports ;;
  # The assistant's client and tools are generated
  # (scripts/build/assistant_client.py) and checked.
  assistant) python ../../scripts/build/assistant_client.py --check ;;
  # tippecanoe, for the overlay tiles' archive tests; skipped without it.
  jobs)
    (sudo apt-get update -qq && sudo apt-get install -y -qq --no-install-recommends tippecanoe > /dev/null) \
      || echo "::warning title=No tippecanoe::the overlay tiles' archive tests are skipped"
    ;;
esac
# Unquoted: the jobs' leg is two folders (charts/tests crash/tests).
# shellcheck disable=SC2086
pytest $tests -v
