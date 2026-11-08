#!/usr/bin/env bash
# Deletes the local branches the agents' worktrees leave behind
# (worktree-agent-*, the harness's names) once every commit on them is on
# origin/main, and lists the ones it keeps, with why. A branch checked out
# in any worktree (`git worktree list`) is kept whatever it holds, and so
# is worktree-agent-<id> while a worktree named agent-<id> is there (its
# agent moved it to a claude/ branch, and the harness may still clean up
# by the name): a running agent may still be at work. Nothing is pushed or deleted on
# GitHub, and no worktree is removed.
#
#   scripts/dev/tidy-branches.sh [--dry-run] [<pattern>]   (worktree-agent-* by default)
set -euo pipefail

dry=""
if [ "${1:-}" = "--dry-run" ]; then dry=1; shift; fi
pattern=${1:-worktree-agent-*}

git fetch -q origin main
# Every branch a worktree has checked out, one per line.
in_use=$(git worktree list --porcelain | sed -n 's#^branch refs/heads/##p')
# And each worktree's own folder name, as worktree-<name>.
in_use+=$'\n'$(git worktree list --porcelain | sed -n 's#^worktree .*/#worktree-#p')

deleted=0
kept=0
while IFS= read -r branch; do
  [ -n "$branch" ] || continue
  if grep -qxF "$branch" <<<"$in_use"; then
    echo "kept     $branch (its worktree is there)"
    kept=$((kept + 1))
  elif git merge-base --is-ancestor "$branch" origin/main; then
    if [ -n "$dry" ]; then
      echo "merged   $branch (would delete)"
    else
      # -D, not -d: -d asks whether it is merged into HEAD or its
      # upstream, and the check that matters, origin/main, is made above.
      git branch -q -D "$branch"
      echo "deleted  $branch"
    fi
    deleted=$((deleted + 1))
  else
    echo "kept     $branch ($(git rev-list --count "origin/main..$branch") commit(s) not on origin/main)"
    kept=$((kept + 1))
  fi
done < <(git for-each-ref --format='%(refname:short)' "refs/heads/$pattern")

echo "tidy-branches: ${dry:+would delete }$deleted merged, kept $kept"
