#!/usr/bin/env bash
# The assistant's generated code -- the planner's models and client from
# services/planner/openapi.json, the engine's rules as its tools from
# engine/contract/engine.schema.json -- and the planner's allow-list of
# those rules (scripts/build/assistant_client.py says what each file is).
# Run it after the planner's document or the contract changes, and commit
# what it writes; --check only says whether the committed files are
# current (services/assistant/tests/test_generated.py runs the same).
#
#   scripts/build/assistant-client.sh [--check]
#
# In Docker, with datamodel-code-generator at the version the assistant's
# requirements-dev.txt pins, since the owner's Mac has no pip of its own.
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
docker=${DOCKER:-docker}
command -v "$docker" >/dev/null || PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
pin=$(grep -E '^datamodel-code-generator==' "$here/services/assistant/requirements-dev.txt")
pydantic=$(grep -E '^pydantic==' "$here/services/assistant/requirements.txt")

"$docker" run --rm -v "$here:/w" -w /w -e PIP_ROOT_USER_ACTION=ignore -e PIP_DISABLE_PIP_VERSION_CHECK=1 \
  python:3.15-slim sh -ec 'pip install -q "$1" "$2" && python scripts/build/assistant_client.py ${3:-}' \
  sh "$pin" "$pydantic" "${1:-}"
