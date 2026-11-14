#!/usr/bin/env bash
# Every tracked shell script and the pre-push hook, checked by shellcheck at
# .tool-versions' version (settings: .shellcheckrc): scripts/, and the nine
# beside the code they serve -- infra's deploy and backup, the engine's
# phone builds, .github/e2e-keys.sh, tools/ -- which went unlinted while
# only scripts/ was (the audit of 6 Nov, C13).
#
#   scripts/ci/shellcheck.sh             every one
#   scripts/ci/shellcheck.sh a.sh b.sh   only these
set -euo pipefail
cd "$(dirname "$0")/../.."
# Not installable here: a skip (3) on a Mac, a failure in CI (guards.sh reads both).
scripts/build/tool.sh --have shellcheck || { echo "no shellcheck here"; [ -z "${GITHUB_ACTIONS:-}" ] && exit 3; exit 1; }
if [ $# -eq 0 ]; then
  git ls-files '*.sh' 'scripts/dev/hooks/*' | sort -u | xargs scripts/build/tool.sh shellcheck -x --format=gcc
else
  exec scripts/build/tool.sh shellcheck -x --format=gcc "$@"
fi
