#!/usr/bin/env bash
# The test flight's checks, as ci.yml's test-sim job and the sim area of
# the Mac's area checks (scripts/dev/check.sh) both run them. The MSFS
# replay agent's .NET build left with the Studio (the feature review,
# 2026-11-21).
set -euo pipefail
cd "$(dirname "$0")/../.."
# The test flight's Mac side (tools/sim-flight: the feed, GDL 90, the flight
# scripts and the report; docs/SIM-FLIGHT.md): ruff and its unit tests, in
# Python's own image at .tool-versions' version, the repository whole
# (wingtip.units from services/planner, the GDL 90 fixture from apps/web).
python=$(scripts/build/toolchain.sh get python)
ruff=$(scripts/build/toolchain.sh get ruff)
runner=$(grep -E '^pytest==' services/planner/requirements-dev.txt | sed 's/ .*//')
docker run --rm -v "$PWD:/repo" -v wingtip-pip:/root/.cache/pip -w /repo/tools/sim-flight -e PYTHONDONTWRITEBYTECODE=1 \
  "python:$python-slim" sh -c "pip install -q --root-user-action=ignore ruff==$ruff $runner && ruff check . && python -m pytest -q -p no:cacheprovider tests"
