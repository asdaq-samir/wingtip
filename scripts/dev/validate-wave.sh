#!/usr/bin/env bash
# A wave's validation, on GitHub and not the Mac (decision 0054; docs/CI.md,
# "Validating a wave"): pushes this checkout's commit, the wave's tip on
# claude/integration, to claude/validate-<wave>, which starts
# .github/workflows/validate-wave.yml. That is ci.yml as the night runs it:
# every area in full, the browser suite over 16 shards on the phone, desktop
# and WebKit phone projects, the images built, the iPhone's build and unit
# tests on macOS, and Android's unit tests, lint and APK. Minutes, on
# GitHub's runners, free for a public repository; the Mac runs none of it.
#
#   scripts/dev/validate-wave.sh <wave>      e.g. 2026-11-22a
#
# After a fix, merge it into claude/integration and run this again with the
# same name: the branch moves forward (never forced) and the new run
# replaces the one before. A failure is reproduced with its narrow test
# (each red job's summary names it, scripts/ci/failure_summary.py). The
# push skips the pre-push hook: the run checks all of it.
set -euo pipefail

wave=${1:-}
case "$wave" in -h | --help | "")
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
  [ -n "$wave" ] || exit 64
  exit 0
  ;;
esac
if ! [[ $wave =~ ^[a-z0-9][a-z0-9.-]*$ ]]; then
  echo "validate-wave: a wave's name is lower case, digits, dots and dashes: $wave" >&2
  exit 64
fi

here=$(cd "$(dirname "$0")/../.." && pwd)
if [ -n "$(git -C "$here" status --porcelain --untracked-files=no)" ]; then
  echo "validate-wave: commit first; the run checks out only what is pushed" >&2
  exit 1
fi
branch=claude/validate-$wave
sha=$(git -C "$here" rev-parse HEAD)
SKIP_HOOKS=1 git -C "$here" push -q origin "HEAD:refs/heads/$branch"
repo=$(git -C "$here" remote get-url origin | sed -E 's#^(git@|https://)github\.com[:/]##; s#\.git$##')
echo "validate-wave: ${sha:0:9} ($(git -C "$here" branch --show-current)) pushed to $branch"
echo "  the run: https://github.com/$repo/actions/workflows/validate-wave.yml?query=branch%3A${branch//\//%2F}"
echo "  follow:  gh run watch --exit-status \$(gh run list -w 'Validate wave' -b $branch -L 1 --json databaseId -q '.[0].databaseId')"
