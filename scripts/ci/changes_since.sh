#!/usr/bin/env bash
# What ci.yml's changes job diffs against, written to $GITHUB_OUTPUT for
# its paths filter (the job's opening comment says why; a pull request that
# is words only is the paths filter's own `every` rule, in ci.yml):
#
#   changes_since.sh last-green   a push since main's last green CI run
#                                 (REPO, EVENT): sha=<it>; anything else,
#                                 or a history it is not behind, all=true
#
# GH_TOKEN reads the API; nothing here writes to GitHub.
set -euo pipefail

case "${1:-}" in
  last-green)
    sha=$(gh api "repos/$REPO/actions/workflows/ci.yml/runs?branch=main&status=success&per_page=1" --jq '.workflow_runs[0].head_sha // ""' || true)
    status=""
    [ -n "$sha" ] && status=$(gh api "repos/$REPO/compare/$sha...$GITHUB_SHA" --jq .status || true)
    if [ "$EVENT" = push ] && { [ "$status" = ahead ] || [ "$status" = identical ]; }; then
      echo "sha=$sha" >> "$GITHUB_OUTPUT"
      echo "since the last green commit, ${sha:0:7}"
    else
      echo "all=true" >> "$GITHUB_OUTPUT"
      echo "everything: event $EVENT, last green ${sha:0:7}, compare '$status'"
    fi
    ;;
  *)
    echo "usage: changes_since.sh last-green" >&2
    exit 64
    ;;
esac
