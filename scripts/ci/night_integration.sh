#!/usr/bin/env bash
# ci.yml's night-integration job: while a wave is open (claude/integration
# is on GitHub), the night's three workflows run on it too, so a red fixed
# there is not reported off main for days (the CI audit of 2026-11-23, H4:
# main sat four nights on reds integration had fixed; the owner took the
# recommendation). Each by hand (workflow_dispatch), ten seconds apart, as
# CLAUDE.md asks of GitHub writes; nightly-issue.yml gives the branch's
# reds an issue of their own. Env: GH_TOKEN, GH_REPO.
set -euo pipefail
branch=claude/integration
if ! gh api "repos/$GH_REPO/branches/$branch" --silent 2> /dev/null; then
  echo "night-integration: no $branch, no wave open; main's night only"
  exit 0
fi
gh workflow run ci.yml --ref "$branch" -f standards=true
sleep 10
gh workflow run native-ios.yml --ref "$branch" -f full=true
sleep 10
gh workflow run native-android.yml --ref "$branch"
echo "night-integration: CI, Native iOS and Native Android started on $branch"
