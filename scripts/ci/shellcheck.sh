#!/usr/bin/env bash
# Every shell script under scripts/ and the pre-push hook, checked by shellcheck
# at .tool-versions' version (settings: .shellcheckrc). Not the scripts that
# belong to a phone's build (engine/bindings, apps/): their areas own them.
#
#   scripts/ci/shellcheck.sh             every one
#   scripts/ci/shellcheck.sh a.sh b.sh   only these
set -euo pipefail
cd "$(dirname "$0")/../.."
# Not installable here: a skip (3) on a Mac, a failure in CI (guards.sh reads both).
scripts/build/tool.sh --have shellcheck || { echo "no shellcheck here"; [ -z "${GITHUB_ACTIONS:-}" ] && exit 3; exit 1; }
if [ $# -eq 0 ]; then
  git ls-files scripts | grep -E '\.sh$|/hooks/' | xargs scripts/build/tool.sh shellcheck -x --format=gcc
else
  exec scripts/build/tool.sh shellcheck -x --format=gcc "$@"
fi
