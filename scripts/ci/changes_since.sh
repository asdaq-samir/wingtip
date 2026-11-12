#!/usr/bin/env bash
# What ci.yml's changes job diffs against, written to $GITHUB_OUTPUT for
# its paths filter (the job's opening comment says why):
#
#   changes_since.sh docs-only    a pull request (REPO, PR) whose files are
#                                 words only (docs, Markdown, skills,
#                                 notebooks): only=true, no browser suite
#   changes_since.sh last-green   a push since main's last green CI run
#                                 (REPO, EVENT): sha=<it>; anything else,
#                                 or a history it is not behind, all=true
#
# GH_TOKEN reads the API; nothing here writes to GitHub.
set -euo pipefail

case "${1:-}" in
  docs-only)
    files=$(gh api "repos/$REPO/pulls/$PR/files" --paginate --jq '.[].filename')
    if [ -n "$files" ] && ! printf '%s\n' "$files" | grep -qvE '^(docs/|ml/notebooks/|\.claude/)|\.md$|^LICENSE$'; then
      echo "only=true" >> "$GITHUB_OUTPUT"
      echo "docs only: the browser suite is skipped"
    fi
    ;;
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
    echo "usage: changes_since.sh docs-only|last-green" >&2
    exit 64
    ;;
esac
