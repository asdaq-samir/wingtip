#!/usr/bin/env bash
# The planner's MCP connector's calls (services/planner/app/generated),
# generated from the planner's OpenAPI document by
# scripts/build/planner_calls.py, which says what it writes. Run it after
# the planner's document changes (python -m app.openapi), and commit what
# it writes; --check only says whether the committed files are current
# (the planner's suite runs the same, scripts/ci/python_suite.sh).
#
#   scripts/build/planner-calls.sh [--check]
#
# The standard library alone: any python3 on the path will do.
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
exec python3 "$here/scripts/build/planner_calls.py" "$@"
